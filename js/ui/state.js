// Pure shell logic: hash codec, field limits and validation, money and region, quantities, BOM rows and the PDF doc.
// No DOM access, so node can import it with the real engine, catalog and matcher. app.js does the DOM wiring.
import { ORDER, catLabel, sections, links, linkLabel, listed, pack } from './parts.js';
import { wiringRows, wiringTable } from './wiring.js';
import * as U from './units.js';
import { t, fmtNum, lazyMap, withLang, pdfLang, get as langGet } from '../i18n/i18n.js';

export const APP = 'DroneCalc';
export const tagline = () => t('app.tagline');
// Drone name is untrusted (URL hash, input): strip control, format (bidi, zero-width, soft hyphen, tag), line/paragraph separator and lone-surrogate chars (\p{Cs} with u matches only those, and encodeURIComponent throws on them) plus the blank-looking fillers (U+034F, Hangul fillers, U+3164, U+FFA0), cap at 40 code points so a pair is never split. Renderers still escape it.
export const NAME_MAX = 40;
export const cleanName = (v) => [...String(v ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\u034F\u115F\u1160\u3164\uFFA0]/gu, '').trim()].slice(0, NAME_MAX).join('');
const safe = (s) => String(s ?? '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
// File base name: the drone name as typed (case kept), else the mission label's first word, else the app name.
// Only Unicode letters, digits, _ and - survive, so no path or reserved filename chars. label = MISSIONS[m].label; without it the id, capitalised.
export const fileBase = (S, label) => safe(cleanName(S.name)) || safe(String(label ?? String(S.mission || '').replace(/^./, (c) => c.toUpperCase())).split(/[\s/]/)[0]) || APP;
export const pdfName = (S, label) => `${fileBase(S, label)}-Build.pdf`;
export const csvName = (S, label) => `${fileBase(S, label)}-BOM.csv`;
export const n = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '-');
export const CHEM = { lipo: 'LiPo', liion: 'Li-ion' };
// Hover band (SPEC-v4 2) on the hover THRUST share, 100 / TWR: the "45-50% hover" builders quote is ArduPilot's thrust-linearised
// MOT_THST_HOVER, not the engine's sqrt-law throttle (a healthy TWR 2 build hovers at 50% thrust but ~71% throttle).
// Bad above 65% (no margin) or below the mission's minimum TWR. minTwr = the mission's minimum TWR (X.minTwr): at 3 or more (racers, interceptors) any share that meets it is good; otherwise 40-55% good, 55-65% warn, under 40% warn (overpowered, never bad). Returns [band, why] or null.
export function hoverBand(twr, minTwr) {
  if (!(twr > 0)) return null;
  const p = Math.round(100 / twr);
  if (minTwr > 0 && twr < minTwr) return ['bad', t('hover.minTwr', { p, twr, min: minTwr })];
  if (p > 65) return ['bad', t('hover.noMargin', { p })];
  if (minTwr >= 3) return ['good', t('hover.racer', { p })]; // TWR >= 3 here, so at most 33%
  if (p > 55) return ['warn', t('hover.less', { p })];
  if (p >= 40) return ['good', t('hover.sweet', { p })];
  return ['warn', t('hover.over', { p })];
}
// Measured takeoff weight in grams (hash key mw, SPEC-v4 1). Untrusted: plain decimals in range only, else null (no exponent, sign or markup).
export const MW = { min: 1, max: 200000 };
export const mwOf = (v) => { const s = String(v ?? '').trim(), x = Number(s); return /^\d{1,6}(\.\d{1,2})?$/.test(s) && x >= MW.min && x <= MW.max ? x : null; };
// Battery age fade in % of capacity (hash key age, 0-40, one decimal) and hover current measured on the real build in A (hash key ha, 0.1-500, two decimals).
// Both untrusted: plain decimals in range only, else null. Unset = '' in S and absent from the hash, so a link without them is unchanged.
export const AGE = { min: 0, max: 40 }, HA = { min: 0.1, max: 500 };
export const ageOf = (v) => { const s = String(v ?? '').trim(), x = Number(s); return /^\d{1,2}(\.\d)?$/.test(s) && x >= AGE.min && x <= AGE.max ? x : null; };
export const haOf = (v) => { const s = String(v ?? '').trim(), x = Number(s); return /^\d{1,3}(\.\d{1,2})?$/.test(s) && x >= HA.min && x <= HA.max ? x : null; };
// Measured thrust curve (F8) id in hash key mc: a short local id only (4-12 lowercase letters or digits), never the curve itself. Unset = '' in S and absent from the hash.
export const MC = /^[a-z0-9]{4,12}$/;
export const mcOf = (v) => (typeof v === 'string' && MC.test(v) ? v : null);
export const LAUNCH = lazyMap('launch.', ['hand', 'bungee', 'runway']);
// Fallback field limits when the engine exports none. Flight time never above 180.
const FB = { targetFlightMin: [1, 180], payloadKg: [0, 50], altitudeM: [-400, 6000], tempC: [-40, 60], windMs: [0, 25], budgetUsd: [0, 1000000] };
const CFG_IDS = ['quad', 'hex', 'octo', 'vtol', 'tiltrotor', 'fixedwing']; // fallback text when the engine exports no table: cfg.<id>.label and .note, the keys the engine's own table reads
// Family of each configuration when the engine does not say (SPEC-v3 1).
const FAM = { quad: 'multirotor', hex: 'multirotor', octo: 'multirotor', vtol: 'vtol', tiltrotor: 'vtol', fixedwing: 'wing' };
// [id, name]: the name is read through a getter so it follows the language.
export const FAMILIES = ['multirotor', 'vtol', 'wing'].map((id) => Object.defineProperty([id, null], 1, { enumerable: true, get: () => t(`family.${id}`) }));
// Mission fit per family: [level, why]. good | ok | poor. Advisory only; the engine's warnings carry the detail.
const FIT = { // levels only; the sentence is text key fit.<mission>.<family>
  delivery: { multirotor: 'good', vtol: 'good', wing: 'poor' },
  inspection: { multirotor: 'good', vtol: 'ok', wing: 'poor' },
  agriculture: { multirotor: 'good', vtol: 'poor', wing: 'poor' },
  interceptor: { multirotor: 'good', vtol: 'poor', wing: 'ok' },
  mapping: { multirotor: 'ok', vtol: 'good', wing: 'good' },
};
// Why a configuration suits a mission: [level, sentence] per pair. The card shows the sentence under a short fit word.
const REASONS = { // levels only; the sentence is text key reason.<mission>.<configuration>
  delivery: { quad: 'good', hex: 'good', octo: 'ok', vtol: 'good', tiltrotor: 'ok', fixedwing: 'poor' },
  inspection: { quad: 'good', hex: 'good', octo: 'ok', vtol: 'ok', tiltrotor: 'ok', fixedwing: 'poor' },
  agriculture: { quad: 'ok', hex: 'good', octo: 'good', vtol: 'poor', tiltrotor: 'poor', fixedwing: 'poor' },
  interceptor: { quad: 'good', hex: 'ok', octo: 'poor', vtol: 'poor', tiltrotor: 'poor', fixedwing: 'ok' },
  mapping: { quad: 'ok', hex: 'ok', octo: 'poor', vtol: 'good', tiltrotor: 'ok', fixedwing: 'good' },
  fpv: { quad: 'good', hex: 'poor', octo: 'poor', vtol: 'poor', tiltrotor: 'poor', fixedwing: 'poor' },
};
// One-line note per frame material when the engine gives none. Keys are engine ids; unknown ids get a numbers-only line.
const MAT_NOTE = new Set(['carbon', 'glass', 'aluminum', 'plastic', 'foam', 'titanium', 'pacf', 'petg', 'balsa']); // text: matnote.<id>
// The engine's warning id for each material that has one (result.warningIds), so the page needs no text matching.
const MAT_WARN = { foam: 'matFoam', balsa: 'matBalsa', titanium: 'matTitanium', petg: 'matPetg' };
// SPEC-v3 1.3 class table, used only when the engine has no FPV_CLASSES export.
const FPV_FB = {
  5: { get label() { return t('fpv.5.label'); }, propInch: 5, defaultFlightMin: 5, maxFlightMin: 10, minTWR: 7 },
  7: { get label() { return t('fpv.7.label'); }, propInch: 7, defaultFlightMin: 12, maxFlightMin: 25, minTWR: 4 },
  10: { get label() { return t('fpv.10.label'); }, propInch: 10, defaultFlightMin: 15, maxFlightMin: 35, minTWR: 3 },
};
// Hash keys. b is the budget in the chosen currency; fc the FPV class (fpv only); sel is "category:id,..." for the BOM.
const KEYS = { m: 'mission', t: 'targetFlightMin', p: 'payloadKg', mat: 'frameMaterial', cfg: 'configuration', fc: 'fpvClass', alt: 'altitudeM', tmp: 'tempC', w: 'windMs', b: 'budget', cur: 'cur', reg: 'reg' };
export const NUM = new Set(['targetFlightMin', 'payloadKg', 'altitudeM', 'tempC', 'windMs', 'budget', 'age']); // age: not in the hash KEYS (own codec above)
const DEF = { name: '', mw: '', mission: '',targetFlightMin: 20, payloadKg: null, frameMaterial: 'carbon', configuration: 'quad', fpvClass: '5', altitudeM: 0, tempC: 20, windMs: 3, budget: '', cur: 'USD', reg: '', age: '', ha: '', mc: '' };

// E = engine module; C, M, PERF, CHK = catalog, matcher, perf and checks modules, or {} while their owners have not shipped them.
// CURVES = the saved thrust curves ({ get(id) -> { name, points } | null }, ui/measured.js), or none.
export function createState({ E, C = {}, M = {}, PERF = {}, CHK = {}, CURVES = null }) {
  const { MISSIONS, MATERIALS, estimate } = E;
  const LIM = {};
  for (const [k, [a, b]] of Object.entries(FB)) { const l = E.LIMITS?.[k]; LIM[k] = Array.isArray(l) ? { min: l[0], max: l[1] } : { min: Number.isFinite(l?.min) ? l.min : a, max: Number.isFinite(l?.max) ? l.max : b }; }
  LIM.targetFlightMin.max = Math.min(180, LIM.targetFlightMin.max);
  LIM.age = { ...AGE };

  // Money and region: catalog API when present, else USD only.
  const CUR = C.CURRENCIES || { USD: { get name() { return t('cur.USD'); } } };
  const REG = C.REGIONS || {};
  const toUsd = (a, c) => (C.toUsd ? C.toUsd(a, c) : a);
  const fromUsd = (u, c) => (C.fromUsd ? C.fromUsd(u, c) : u);
  const money = (usd, cur, o) => (C.formatMoney ? C.formatMoney(usd, cur, o) : '$' + Math.round(usd).toLocaleString('en-US')); // money keeps en-US grouping in every language, like the PDF and CSV
  const region = (S) => S.reg || (C.regionForCurrency ? C.regionForCurrency(S.cur) : 'US');
  const regName = (k) => REG[k]?.name || k;
  const where = (k) => (k === 'GLOBAL' ? t('where.global') : t('where.in', { region: regName(k) }));
  // Budget keeps its value, not its number, when the currency changes.
  const convertBudget = (amount, from, to) => (Number.isFinite(amount) ? Math.round(fromUsd(toUsd(amount, from), to)) : amount);

  // Configurations: the engine's list when exported, else each known one the engine accepts (estimate is pure, so probing is safe).
  const CFG_X = E.CONFIGURATIONS || E.CONFIGS;
  const CFGS = CFG_X ? (Array.isArray(CFG_X) ? CFG_X : Object.keys(CFG_X)) : CFG_IDS.filter((c) => {
    const r = estimate({ mission: 'mapping', targetFlightMin: 20, payloadKg: 0.3, frameMaterial: Object.keys(MATERIALS)[0], configuration: c, environment: { altitudeM: 0, tempC: 20, windMs: 0 } });
    return r.ok || !(r.errors || []).some((x) => /configuration/i.test(x));
  });
  const cfgInfo = (c) => (CFG_X && !Array.isArray(CFG_X) && typeof CFG_X[c] === 'object' ? CFG_X[c] : {});
  const cfgLabel = (c) => cfgInfo(c).label || (CFG_IDS.includes(c) && t(`cfg.${c}.label`)) || c;
  const cfgNote = (c) => cfgInfo(c).note || (CFG_IDS.includes(c) && t(`cfg.${c}.note`)) || '';
  const cfgFamily = (c) => ({ wing: 'wing', fixedwing: 'wing' }[cfgInfo(c).family] || cfgInfo(c).family || FAM[c] || 'multirotor');
  const fit = (mission, fam) => (FIT[mission]?.[fam] ? [FIT[mission][fam], t(`fit.${mission}.${fam}`)] : null);
  // Card reason for one configuration and mission: the REASONS sentence, else the family's generic line (for a configuration the table lacks).
  const reason = (mission, c) => {
    const hit = REASONS[mission]?.[c];
    if (hit) return { level: hit, text: U.text(t(`reason.${mission}.${c}`)) };
    const f = fit(mission, cfgFamily(c));
    return f ? { level: f[0], text: U.text(f[1]) } : null;
  };
  // Engine warnings that come from the chosen frame material: new against a carbon build and naming the material.
  const matWarns = (S, r) => {
    const id = MAT_WARN[S.frameMaterial];
    if (!r?.ok || !id) return [];
    return (r.warnings || []).filter((w, i) => r.warningIds?.[i] === id).map((w) => U.text(w));
  };
  // One-line note per material: the engine's note when it ships one, else the table, else the numbers.
  const matNote = (id) => {
    const m = MATERIALS[id];
    if (!m) return '';
    return U.text(m.note || (MAT_NOTE.has(id) && t(`matnote.${id}`)) || t('matnote.numbers', { density: m.densityGcc, stiff: m.stiffness, cost: m.costRel }));
  };

  // FPV classes (SPEC-v3 1.3): engine table merged over the fallback, so minTWR and labels always exist.
  // label and note stay getters on the engine's row (a spread would freeze the language of the moment).
  const FPV = Object.fromEntries(Object.keys(E.FPV_CLASSES || FPV_FB).map((k) => {
    const o = { ...FPV_FB[k], ...(E.FPV_CLASSES?.[k] || {}) }, sx = E.FPV_CLASSES?.[k];
    for (const f of ['label', 'note']) if (sx && f in sx) Object.defineProperty(o, f, { enumerable: true, get: () => sx[f] });
    return [k, o];
  }));
  const isFpv = (S) => S.mission === 'fpv';
  const fpvOf = (S) => (isFpv(S) ? FPV[S.fpvClass] || FPV[5] : null);
  // fpv always flies a quad (SPEC-v3 1.3); the user's configuration is kept for other missions.
  const cfgOf = (S) => (isFpv(S) ? 'quad' : S.configuration);
  const kindOf = (r) => (r?.fixedWing ? 'fixedwing' : r?.vtol ? (r.vtol.type === 'tiltrotor' ? 'tiltrotor' : 'vtol') : 'multi');

  // FIELD: [label, unit ('' = the chosen currency), wizard step].
  // QF: the fields shown in display units (units.js quantity); state, hash and engine keep the SI value.
  const QF = { payloadKg: 'kg', altitudeM: 'm', tempC: 'c', windMs: 'ms' };
  const fld = (id, unit, step) => Object.defineProperty([null, unit, step], 0, { enumerable: true, get: () => t(`field.${id}`) }); // the label follows the language
  const FIELD = { targetFlightMin: fld('targetFlightMin', 'min', 1), payloadKg: fld('payloadKg', 'kg', 2), budget: fld('budget', '', 2), altitudeM: fld('altitudeM', 'm', 2), tempC: fld('tempC', '°C', 2), windMs: fld('windMs', 'm/s', 2), age: fld('age', '%', 2) };
  const lim = (k, cur) => (k === 'budget' ? { min: 0, max: Math.round(fromUsd(LIM.budgetUsd.max, cur)) } : LIM[k]);
  const unit = (k, cur) => (QF[k] ? U.label(QF[k]) : FIELD[k][1] || cur);
  // Field bounds as the input shows them (display units); lim() stays SI for validation.
  const dlim = (k, cur) => { const l = lim(k, cur), q = QF[k]; return q ? { min: U.input(q, l.min), max: U.input(q, l.max) } : l; };
  const defMin = (m, fc) => { const v = (m === 'fpv' && FPV[fc]?.defaultFlightMin) || MISSIONS[m]?.defaultFlightMin; return Number.isFinite(v) ? Math.min(v, LIM.targetFlightMin.max) : 20; };
  const payload = (S) => (S.payloadKg == null ? (fpvOf(S)?.defaultPayloadKg ?? MISSIONS[S.mission]?.defaultPayloadKg ?? 0) : S.payloadKg);
  // Minimum thrust to weight for the gauge: the FPV class, else the mission; none for a wing (it does not hover).
  // The engine's r.minTwr when it ships one (wings: static T:W to launch and climb); before that a wing takes the T:W limit of its battery sweep.
  const minTwr = (S, r) => (Number.isFinite(r?.minTwr) ? r.minTwr : r?.fixedWing ? (r.performance?.batteryBest?.reason === 'twrLimit' && Number.isFinite(r.performance.batteryBest.twr) ? r.performance.batteryBest.twr : null)
    : fpvOf(S)?.minTWR ?? MISSIONS[S.mission]?.minTWR ?? null);
  // Field-level validation. Returns { field: message }.
  function errs(S) {
    const o = {};
    for (const [k, [label]] of Object.entries(FIELD)) {
      const v = k === 'payloadKg' ? payload(S) : S[k];
      if (v === '' || v == null) { if (!['budget', 'age'].includes(k)) o[k] = t('err.required', { label }); continue; } // budget and age fade are optional
      const { min, max } = lim(k, S.cur);
      if (!Number.isFinite(v) || v < min || v > max) o[k] = QF[k] && U.isImperial() ? t('err.rangeUnit', { label, range: U.range(QF[k], min, max) }) : t('err.range', { label, lo: fmtNum(min), hi: fmtNum(max), unit: unit(k, S.cur) });
      else if (k === 'age' && ageOf(v) == null) o[k] = t('err.ageDecimal', { label }); // the hash and the engine input take one decimal only: a value they would silently drop is an error
    }
    return o;
  }
  const stepErr = (e, st) => Object.keys(e).some((k) => FIELD[k][2] === st);

  // ---- state <-> URL hash
  const CATS = new Set([...ORDER, ...(C.CATALOG || []).map((i) => i.category)]); // known sel keys; a Set has no prototype keys
  const VALID = { mission: (v) => Object.hasOwn(MISSIONS, v), frameMaterial: (v) => Object.hasOwn(MATERIALS, v), configuration: (v) => CFGS.includes(v), fpvClass: (v) => Object.hasOwn(FPV, v), cur: (v) => Object.hasOwn(CUR, v), reg: (v) => Object.hasOwn(REG, v) };
  const HASH_MAX = 4096, SEL_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i; // a real share link is well under 1 KB; every catalog id fits SEL_ID
  function parse(hash) {
    const raw = String(hash || ''), h = new URLSearchParams(raw.length > HASH_MAX ? '' : raw.replace(/^#/, '')), S = { ...DEF, sel: {} }; // oversized hash: defaults, like an invalid one
    for (const [k, name] of Object.entries(KEYS)) {
      if (!h.has(k)) continue;
      const v = h.get(k);
      if (NUM.has(name)) S[name] = v === '' ? '' : Number(v); // out-of-range or junk stays and shows a field error, never clamped silently
      else if (VALID[name](v)) S[name] = v;
    }
    S.name = cleanName(h.get('n'));
    S.mw = mwOf(h.get('mw')) ?? '';
    S.age = ageOf(h.get('age')) ?? '';
    S.ha = haOf(h.get('ha')) ?? '';
    S.mc = mcOf(h.get('mc')) ?? '';
    for (const p of (h.get('sel') || '').split(',')) { const i = p.indexOf(':'), k = p.slice(0, i); if (i > 0 && /^[a-z]{1,16}$/.test(k) && CATS.has(k) && SEL_ID.test(p.slice(i + 1))) S.sel[k] = p.slice(i + 1); }
    if (S.mission && !h.has('t')) S.targetFlightMin = defMin(S.mission, S.fpvClass);
    const step = S.mission ? Math.min(Math.max(parseInt(h.get('s'), 10) || 0, 0), 3) : 0;
    return { S, step };
  }
  function hashOf(S, step) {
    const h = new URLSearchParams({ s: step });
    for (const [k, name] of Object.entries(KEYS)) if (S[name] !== '' && S[name] != null && (name !== 'fpvClass' || isFpv(S))) h.set(k, S[name]);
    if (mwOf(S.mw) != null) h.set('mw', S.mw);
    if (ageOf(S.age) > 0) h.set('age', S.age); // 0 = new pack = absent
    if (haOf(S.ha) != null) h.set('ha', S.ha);
    if (mcOf(S.mc) != null) h.set('mc', S.mc);
    const sel = Object.entries(S.sel).map(([c, id]) => `${c}:${id}`).join(',');
    if (sel) h.set('sel', sel);
    const nm = cleanName(S.name);
    return '#' + h + (nm ? '&n=' + encodeURIComponent(nm) : '');
  }

  // ---- engine and matcher calls
  const budgetUsd = (S) => (Number.isFinite(S.budget) && S.budget > 0 ? Math.min(toUsd(S.budget, S.cur), LIM.budgetUsd.max) : undefined);
  // The saved thrust curve this build names, or null (no id, or not on this device: the model is used, see results()).
  const curveOf = (S) => (mcOf(S.mc) != null ? CURVES?.get?.(S.mc) || null : null);
  const input = (S) => ({
    mission: S.mission, targetFlightMin: S.targetFlightMin, payloadKg: payload(S), frameMaterial: S.frameMaterial, configuration: cfgOf(S),
    ...(isFpv(S) ? { fpvClass: S.fpvClass } : {}),
    environment: { altitudeM: S.altitudeM, tempC: S.tempC, windMs: S.windMs },
    ...(budgetUsd(S) != null ? { budgetUsd: budgetUsd(S) } : {}),
    ...(curveOf(S) ? { thrustCurve: { name: curveOf(S).name, points: curveOf(S).points } } : {}),
    ...(ageOf(S.age) > 0 || haOf(S.ha) != null ? { battery: { ...(ageOf(S.age) > 0 ? { ageFadePct: S.age } : {}), ...(haOf(S.ha) != null ? { measuredHoverA: S.ha } : {}) } } : {}),
  });
  const run = (S) => { if (!S.mission || Object.keys(errs(S)).length) return null; try { return estimate(input(S)); } catch (e) { return { ok: false, errors: [String(e.message || e)] }; } };
  // Warnings the chosen configuration adds over a plain quad: shown inline under the picker (SPEC-v3 4). Never blocks.
  function cfgWarns(S, r) {
    if (!r?.ok || cfgOf(S) === 'quad') return [];
    const q = run({ ...S, configuration: 'quad' }), base = new Set(q?.warnings || []);
    return (r.warnings || []).filter((w) => !base.has(w)).map((w) => U.text(w));
  }
  // Measured weight (SPEC-v4 1): the same parts and pack at the weighed mass. A rerun with more payload would re-size the pack to the
  // target and hide the effect, so flight time comes from the engine's own payload sweep (hardware and pack fixed), extrapolated as
  // power ~ mass^1.5 outside it; TWR ~ 1/mass, throttle ~ sqrt(mass). Returns { r, est, err }: r = measured result (or est), err = field error.
  function runMeasured(S, est = run(S)) {
    if (!est?.ok || mwOf(S.mw) == null) return { r: est, est, err: '' };
    const auw = S.mw / 1000, p0 = payload(S), dry = est.auwKg - p0, p = auw - dry, k = auw / est.auwKg;
    // below half the estimate the parts differ too much from the sized build for a fixed-hardware rescale
    const lo = Math.ceil(est.auwKg * 500), hi = Math.floor((dry + LIM.payloadKg.max) * 1000);
    if (S.mw < lo || S.mw > hi) return { r: est, est, err: t('err.mwRange', { lo: fmtNum(lo), hi: fmtNum(hi) }) };
    const sw = (est.performance?.payload || []).filter((q) => Number.isFinite(q?.kg) && Number.isFinite(q?.flightMin)).sort((a, b) => a.kg - b.kg);
    const i = sw.findIndex((q) => q.kg >= p), a = sw[i - 1], b = sw[i];
    const e = i === 0 ? sw[0] : sw[sw.length - 1] || { kg: p0, flightMin: est.estFlightMin };
    const ft = i > 0 ? a.flightMin + ((b.flightMin - a.flightMin) * (p - a.kg)) / (b.kg - a.kg) : e.flightMin * ((dry + e.kg) / auw) ** 1.5;
    const rd = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d, f = est.estFlightMin > 0 ? ft / est.estFlightMin : 1, meets = ft >= S.targetFlightMin * 0.99, mt = minTwr(S, est);
    // one measured T:W for tile, band, captions, caution and PDF: the sweep's full-throttle thrust (whole grams, density-corrected) over the measured grams, rounded once
    // (est.twr is already rounded to 2 places; dividing it again drifted a hundredth from the figures)
    const thr = est.performance?.throttle?.at?.(-1)?.thrustG, tn0 = est.twr * est.auwKg * 1000, twrM = rd((Number.isFinite(thr) && Math.abs(thr / tn0 - 1) < 0.015 ? thr : tn0) / S.mw, 2);
    const estG = Math.round(est.auwKg * 1000), extra = Math.round(S.mw - Object.values(est.weights || {}).reduce((a, g) => a + (Number.isFinite(g) && g > 0 ? g : 0), 0)); // vs the rounded breakdown, so Fig 6 sums to the measured mass
    // Mass-threshold warnings are re-derived from the measured mass (same thresholds as the engine); the rest stay.
    const mg = fmtNum(S.mw), warnings = [...(est.warnings || []).filter((w, i) => !['auwHeavy', 'auwReg'].includes(est.warningIds?.[i])),
      ...(auw > 25 ? [t('warn.auwHeavy')] : auw > 0.25 ? [t('warn.auwReg')] : []),
      ...(!meets && est.meetsTarget ? [t('mw.drop', { g: mg, min: rd(ft, 1), target: S.targetFlightMin })] : []),
      ...(mt != null && twrM < mt ? [est.fixedWing ? t('mw.twrStatic', { g: mg, twr: twrM, min: mt })
        : t('mw.twr', { g: mg, twr: twrM, min: mt, mission: fpvOf(S)?.label || MISSIONS[S.mission]?.label || t('mw.missionWord') })] : [])];
    // Wing figures at the measured mass, same CL: loading ~ m, stall and cruise ~ sqrt(m). Launch type and VTOL phase times stay the estimate's (labelled).
    const range = rd(est.rangeKm * f, 2), wingOf = (w) => w && { ...w, wingLoadingGdm2: rd(w.wingLoadingGdm2 * k, 1), stallMs: rd(w.stallMs * Math.sqrt(k), 1), cruiseMs: rd(w.cruiseMs * Math.sqrt(k), 1),
      rangeKm: range, ...(Number.isFinite(w.endurance) ? { endurance: rd(ft, 1) } : {}) };
    return { est, err: '', r: { ...est, auwKg: rd(auw, 3), estFlightMin: rd(ft, 1), rangeKm: range, twr: twrM,
      fixedWing: wingOf(est.fixedWing), vtol: wingOf(est.vtol), estAir: est.fixedWing || est.vtol ? { stallMs: (est.fixedWing || est.vtol).stallMs, cruiseMs: (est.fixedWing || est.vtol).cruiseMs } : undefined, // the sweeps' own mass (perf Fig 1)
      cruiseMs: est.fixedWing || est.vtol ? rd(est.cruiseMs * Math.sqrt(k), 1) : est.cruiseMs,
      hoverThrottlePct: rd(Math.min(100, est.hoverThrottlePct * Math.sqrt(k)), 1), hoverPowerW: rd(est.hoverPowerW * k ** 1.5), avgPowerW: rd(est.avgPowerW * k ** 1.5),
      meetsTarget: meets, warnings, measuredG: S.mw, estG, measuredPayloadKg: rd(p, 3), // payload-sweep x of the measured mass (perf Fig 2 marker)
      weights: extra > 0 ? { ...est.weights, measuredExtraG: extra } : est.weights } }; // Fig 6 sums to the measured mass when heavier
  }
  // Best pack (SPEC-v4 3, round 2): the engine's performance.batteryBest when it ships one, else the longest flight among sweep packs that
  // still fly (T:W >= the mission minimum; thrust is fixed, so T:W scales with 1 / takeoff mass). reason: peak | twrLimit | rangeEnd.
  const bestPack = (r, mt) => {
    const B = r?.performance?.batteryBest, k = (wh) => wh / r.batteryWh, mahOf = (wh) => Math.round((r.batteryMah * wh) / r.batteryWh);
    if (B && Number.isFinite(B.wh) && Number.isFinite(B.flightMin)) {
      const m = B.mult ?? k(B.wh); // about 1x: the limit is the sized pack, so show its own figures (the sweep point lands just under it)
      return Math.abs(m - 1) <= 0.05 ? { ...B, wh: r.batteryWh, mah: r.batteryMah, flightMin: r.estFlightMin, mult: 1 } : { ...B, mah: B.mah ?? mahOf(B.wh), mult: m };
    }
    const sw = (r?.performance?.battery || []).filter((q) => Number.isFinite(q?.wh) && Number.isFinite(q?.flightMin)).sort((a, b) => a.wh - b.wh);
    const twrOf = (q) => (Number.isFinite(q.twr) ? q.twr : q.auwKg > 0 ? (r.twr * r.auwKg) / q.auwKg : NaN);
    const ok = sw.filter((q) => q.feasible !== false && !(mt > 0 && twrOf(q) < mt));
    if (!ok.length) return null;
    const q = ok.reduce((b, x) => (x.flightMin > b.flightMin ? x : b)), last = q === ok[ok.length - 1];
    return { wh: q.wh, mah: mahOf(q.wh), flightMin: q.flightMin, mult: k(q.wh), twr: twrOf(q), reason: !last ? 'peak' : ok.length < sw.length ? 'twrLimit' : 'rangeEnd' };
  };
  // Card and PDF wording for bestPack: { value, more, line }. r = the result, for a wing's static T:W.
  const packText = (bp, mt, r) => {
    const tw = t(r?.twrKind === 'static' || r?.fixedWing ? 'pack.twStatic' : 'pack.tw'), x = t('pack.times', { n: n(bp.mult, 1) }), tm = `${n(bp.flightMin, 1)} min`, lim = mt ?? '-';
    if (bp.reason === 'rangeEnd') return { value: `${n(bp.wh)}+ Wh`, more: t('pack.rising', { x }), line: t('pack.risingLine', { wh: n(bp.wh), x }) };
    if (bp.reason === 'twrLimit' && Math.abs(bp.mult - 1) <= 0.05) // the sized pack is already the feasible maximum
      return { value: `${n(bp.wh)} Wh`, more: t('pack.nowMore', { time: tm, tw, lim }), line: t('pack.nowLine', { tw, lim }) };
    if (bp.reason === 'twrLimit') return { value: `${n(bp.wh)} Wh`, more: t('pack.limitMore', { time: tm, x, tw, lim }), line: t('pack.limitLine', { tw, lim, wh: n(bp.wh), time: tm, x }) };
    return { value: `${n(bp.wh)} Wh`, more: t('pack.bestMore', { mah: n(bp.mah), time: tm }), line: t('pack.bestLine', { wh: n(bp.wh), mah: n(bp.mah), time: tm }) };
  };
  // Requirements for the matcher, with the FPV class echoed (SPEC-v3 2).
  const reqOf = (S, r) => { const fc = r.fpvClass ?? (isFpv(S) ? S.fpvClass : null); return fc != null ? { ...r.requirements, fpvClass: String(fc) } : r.requirements; };
  // R = everything the results page shows for one engine result. Parts match the estimate; R.r is the measured result when mw applies.
  function results(S, r) {
    const m = runMeasured(S, r);
    const reg = region(S), notes = [];
    let rec = null, opts = null;
    try { rec = M.recommend ? M.recommend(reqOf(S, r), S.mission, budgetUsd(S), undefined, reg) : null; } catch (e) { notes.push(t('res.matchFail', { message: e.message })); }
    try { opts = M.listOptions ? M.listOptions(reg, S.mission) : null; } catch (e) { notes.push(t('res.optsFail', { message: e.message })); }
    if (!rec) notes.push(t('res.noRec'));
    if (mcOf(S.mc) != null && !curveOf(S)) notes.push(t('res.noCurve'));
    if (S.cur !== 'USD' && C.ratesNote) notes.push(C.ratesNote());
    return { r: m.r, est: r, mwErr: U.text(m.err), rec, opts, reg, sec: sections(rec, opts), note: notes.join(' ') };
  }

  // ---- quantities and BOM
  const optsFor = (R, key) => (key === 'pusher' ? (R.opts?.motor || []).filter((i) => i.tags?.includes('pusher')) : R.opts?.[key] || []);
  // Quantity rule mirrors matcher.recommend; used for parts picked from the full options list. Pack-sold parts count packs.
  const qty = (R, key, it) => (it.packOf > 1 ? Math.ceil(pieces(R, key, it) / it.packOf) : pieces(R, key, it));
  function pieces(R, key, it) {
    const q = R.r.requirements, cnt = q?.motor?.count ?? R.r.motorCount ?? 4;
    if (key === 'motor' || key === 'prop') return cnt;
    if (key === 'esc') return it.specs?.fourInOne || /4\s*-?\s*in\s*-?\s*1/i.test(it.name) ? Math.ceil(cnt / 4) : cnt;
    if (key === 'servo') return q?.servo?.count ?? q?.vtol?.servoCount ?? R.r.vtol?.servoCount ?? 1;
    // A tilt kit is one set; loose tilt servos count per servo (matcher rule: tilt servos = servoCount).
    if (key === 'tilt') return it.category === 'servo' || it.specs?.tilt === true ? q?.tilt?.servoCount ?? R.r.vtol?.tilt?.servoCount ?? 4 : 1;
    return 1;
  }
  // A part fills only its own category; tilt servos go under tilt and pusher motors under pusher.
  const fits = (key, it) => it.category === key || (key === 'tilt' && it.category === 'servo') || (key === 'pusher' && it.category === 'motor');
  function pick(R, key, id) {
    const ok = (i) => i.id === id && fits(key, i);
    for (const p of [R.rec?.[key], R.rec?.extras, R.rec?.closest?.[key], optsFor(R, key)]) { const it = Array.isArray(p) && p.find(ok); if (it) return it; }
    const it = (C.CATALOG || []).find(ok);
    return it && { ...it, links: C.localLinks ? C.localLinks(it, R.reg) : it.links };
  }
  function bomRows(R, sel) {
    return [...new Set([...R.sec.all, ...Object.keys(sel)])].filter((k) => sel[k] && !R.sec.off?.includes(k)).map((k) => {
      const it = pick(R, k, sel[k]); if (!it) return null;
      const q = it.qty ?? qty(R, k, it);
      return { key: k, label: catLabel(k, kindOf(R.r)), it, qty: q, pack: pack(it, q, k), line: q * it.priceUsd };
    }).filter(Boolean);
  }
  // SPEC-v4 checks on the selected rows; empty or null while checks.js is missing.
  const compatOf = (R, rows) => (CHK.compat && rows.length ? CHK.compat(R.r, Object.fromEntries(rows.map((x) => [x.key, x.it]))).map((c) => ({ ...c, text: U.text(c.text) })) : []);
  const wclassOf = (R) => { const w = CHK.weightClass?.(R.r.auwKg, R.reg); return w ? { ...w, label: U.text(w.label), note: U.text(w.note) } : null; };
  const massOf = (R, rows) => (CHK.partsMassG && rows.length ? CHK.partsMassG(rows, R.est || R.r) : null);
  const LVL = lazyMap('lvl.', ['pass', 'warn', 'fail']);
  // The motor that decides whether an ESC is needed: the picked one, else the best pick. integratedEsc = ESC built into the motor.
  const motorOf = (R, S) => (S.sel.motor && pick(R, 'motor', S.sel.motor)) || R.rec?.motor?.[0] || null;
  const escFree = (R, S) => !!motorOf(R, S)?.specs?.integratedEsc;
  // Engine warnings for display: the budget line is rebuilt in the chosen currency (the engine writes it in USD).
  const warnsOf = (S, r) => (r?.warnings || []).map((w, i) => (r.warningIds?.[i] === 'budget' && Number.isFinite(r.estCostUsd) && budgetUsd(S) != null
    ? t('warn.budgetCur', { cost: money(r.estCostUsd, S.cur), budget: money(budgetUsd(S), S.cur) }) : U.text(w)));
  // Context for the parts.js builders.
  const ctx = (R, S) => ({ name: cleanName(S.name), rec: R.rec, req: R.r.requirements, opts: R.opts, sec: R.sec, sel: S.sel, money: (u) => money(u, S.cur), cur: S.cur,
    num: (u) => Number(fromUsd(u, S.cur).toFixed(CUR[S.cur]?.decimals ?? 2)), where: where(R.reg), kind: kindOf(R.r),
    qty: (k, it) => qty(R, k, it), optsFor: (k) => optsFor(R, k), budgetUsd: budgetUsd(S), note: R.note, motor: motorOf(R, S), escFree: escFree(R, S) });

  // ---- PDF doc (SPEC-v2 section 3): BOM when anything is selected, else every option in every category. Money in iso style.
  // A custom part is the user's own entry: its name carries the same (custom, unverified) suffix as the CSV, so a name like "X (verified)" cannot pass for a catalog part.
  const pName = (it) => (it.custom ? `${it.name} ${t('copy.customTag')}` : it.name);
  // The PDF writer has no font for every script (WinAnsi only): a PDF_FALLBACK language gets an English PDF that says so (pdfLang). Spanish keeps its accents.
  const LANG_EN = { hi: 'Hindi', es: 'Spanish' };
  function pdfDoc(R, S, dateISO) {
    const fell = langGet() !== pdfLang(), from = langGet();
    return withLang(pdfLang(), () => { const d = pdfBody(R, S, dateISO); if (fell) d.notes.unshift(t('pdf.fallbackNote', { language: LANG_EN[from] || from })); return d; });
  }
  function pdfBody(R, S, dateISO) {
    const { r, reg } = R, v = r.vtol, fw = r.fixedWing, tilt = v?.tilt, kind = kindOf(r), iso = (u) => money(u, S.cur, { iso: true }), rows = bomRows(R, S.sel), b = budgetUsd(S), at = where(reg);
    const lk = (it) => links(it.links, 3).map((l) => ({ label: linkLabel(l), url: l.url }));
    const total = rows.reduce((a, x) => a + x.line, 0);
    const all = R.opts || {};
    const cats = [...new Set([...ORDER.filter((k) => all[k]), ...Object.keys(all)])].filter((k) => all[k]?.length && !R.sec.off?.includes(k));
    const M_ = MISSIONS[S.mission], cfg = cfgLabel(cfgOf(S)), fc = fpvOf(S);
    // PDF text is WinAnsi with ASCII stand-ins: the squared units are written dm2, in2, oz/ft2.
    const pf = (q, v, d) => `${U.num(q, v, d)} ${U.label(q).replace('²', '2')}`, ps = (q, v) => U.show(q, v).replace('²', '2');
    const mot = (m) => t('pdf.mot', { stator: m?.statorMm ?? '-', kv: n(m?.kv), thrust: pf('g', m?.thrustG), inch: n(m?.propInch, 1) });
    const wing = (w) => [[t('pdf.wingspan'), pf('mm', w.wingspanMm)], [t('pdf.wingArea'), `${pf('dm2', w.wingAreaDm2, 1)}, ${pf('gdm2', w.wingLoadingGdm2)}`], [t('pdf.aspect'), `${n(w.aspectRatio, 1)} / ${n(w.liftToDrag, 1)}`],
      [t('pdf.stall'), `${U.num('ms', w.stallMs, 1)} / ${pf('ms', w.cruiseMs, 1)}`]];
    const atEst = r.measuredG && Math.round(r.measuredG) !== Math.round(r.estG) ? ' ' + t('pdf.atEstMass') : '';
    const hover = fw ? [[t('pdf.cruiseThrottle'), `${n(r.hoverThrottlePct)} %`], [t('pdf.cruiseAvgPower'), `${n(r.hoverPowerW)} W / ${n(r.avgPowerW)} W`]] // wing: engine hover fields hold level cruise
      : [[t('pdf.hoverThrust'), t('pdf.hoverThrust.value', { pct: n(100 / r.twr), throttle: n(r.hoverThrottlePct) })], [t('pdf.hoverAvgPower'), `${n(r.hoverPowerW)} W / ${n(r.avgPowerW)} W`]];
    const frame = fw ? [...wing(fw), [t('pdf.launch'), `${LAUNCH[fw.launch] || fw.launch || '-'}${atEst}`], [t('pdf.mainMotor'), mot(fw.motor)], ...(Number.isFinite(r.estFlightMin) ? [[t('pdf.endurance'), t('pdf.endurance.value', { n: n(r.estFlightMin, 1) })]] : [])]
      : v ? [...wing(v), ...(v.pusher ? [[t('pdf.pusher'), mot(v.pusher)]] : []),
        ...(tilt ? [[t('pdf.tilt'), t('pdf.tilt.value', { motors: tilt.motorCount ?? 4, servos: tilt.servoCount ?? 4 })], [t('pdf.transition'), t('pdf.transition.value', { s: n(tilt.tiltTimeS, 1), deg: n(tilt.transitionAngleDeg) })]] : []),
        [t('pdf.phases'), `${n(v.hoverS)} s / ${n(v.transitionS)} s / ${n(v.cruiseMin, 1)} min${atEst}`]]
      : [[t('pdf.frame'), pf('mm', r.frameSizeMm)]];
    const nm = cleanName(S.name); // pdf.js escapes PDF string syntax and maps non-WinAnsi chars
    const bt = r.battery, est = R.est || r, ms = massOf(R, rows), wc = wclassOf(R), mt = minTwr(S, r), bp = bestPack(r, mt), chk = compatOf(R, rows), cl = CHK.checklist ? CHK.checklist(r, S) : [];
    const mc = r.measuredCurve;
    const v4 = [...(r.measuredG ? [[t('pdf.measuredWeight'), t('pdf.measuredWeight.value', { measured: pf('g', r.measuredG), est: pf('g', r.estG) })]] : []),
      ...(ms ? [[t('pdf.partsMass'), t('pdf.partsMass.value', { parts: pf('g', ms.partsG), allowance: pf('g', ms.allowanceG), total: pf('g', ms.totalG), est: pf('g', est.auwKg * 1000) })]] : []),
      ...(wc ? [[t('pdf.weightClass'), wc.label]] : []), [t('pdf.cRating'), `${r.batteryCRating}C, ${CHEM[r.batteryChemistry] || r.batteryChemistry || ''} ${r.batteryCells}S`],
      ...(bp ? [[t('pdf.bestPack'), packText(bp, mt, r).line]] : []),
      ...(bt ? [[t('pdf.sag'), t('pdf.sag.value', { phase: t(fw ? 'pdf.phase.cruise' : 'pdf.phase.hover'), hv: n(bt.hoverCellV, 2), ha: n(bt.hoverA, 1), mv: n(bt.maxCellV, 2), ma: n(bt.maxA), floor: n(bt.floorV, 1) })]] : []),
      ...(bt && (bt.capacityFactor < 1 || bt.resistanceFactor > 1) ? [[t('pdf.derate'), t('pdf.derate.value', { temp: pf('c', bt.tempC), age: n(bt.ageFadePct), cap: n(bt.capacityFactor * 100), res: n(bt.resistanceFactor, 2) })]] : []),
      ...(mc ? [[t('pdf.thrustData'), t('pdf.thrustData.measured', { count: mc.motors, name: mc.name || t('pdf.thrustCurve'), points: mc.points, max: pf('g', mc.maxThrustG) })]] : [[t('pdf.thrustData'), t('pdf.modelled')]]),
      ...(bt?.calibration ? [[t('pdf.calibration'), t('pdf.calibration.value', { meas: n(bt.calibration.measuredA, 1), pred: n(bt.calibration.predictedA, 1), factor: n(bt.calibration.factor, 2) })]] : []),
      ...(Number.isFinite(r.estCostUsd) ? [[t('pdf.cost'), t('pdf.cost.value', { cost: iso(r.estCostUsd) }) + (rows.length ? ' ' + t('pdf.cost.vsBom', { bom: iso(total) }) : '')]] : [])];
    const v4t = [chk.length ? { title: t('pdf.checks'), columns: [t('pdf.col.result'), t('pdf.col.check')], rows: chk.map((c) => [LVL[c.level] || c.level, c.text]) } : null,
      wc ? { title: t('pdf.weightClass'), columns: [t('pdf.col.class'), t('pdf.col.means')], rows: [[wc.label, wc.note]] } : null,
      cl.length ? { title: t('pdf.checklist'), columns: ['#', t('pdf.col.step')], rows: cl.map((x, i) => [String(i + 1), x]) } : null];
    return {
      title: `${APP}: ${tagline()}`,
      subtitle: `${nm ? `${nm} · ` : ''}${t('pdf.subtitle', { mission: fc ? t('pdf.fpvMission', { label: fc.label }) : M_.label, cfg, target: S.targetFlightMin })}`,
      dateISO,
      meta: [...(nm ? [[t('pdf.droneName'), nm]] : []), [t('pdf.mission'), M_.label], ...(fc ? [[t('pdf.fpvClass'), fc.label]] : []), [t('pdf.configuration'), cfg], [t('field.targetFlightMin'), `${S.targetFlightMin} min`], [t('field.payloadKg'), ps('kg', payload(S))],
        [t('pdf.material'), MATERIALS[S.frameMaterial]?.label || S.frameMaterial], [t('pdf.conditions'), t('pdf.conditions.value', { alt: ps('m', S.altitudeM), temp: ps('c', S.tempC), wind: ps('ms', S.windMs) })], [t('pdf.units'), t(U.get() === 'imperial' ? 'pdf.units.imperial' : 'pdf.units.metric')],
        [t('pdf.currency'), `${S.cur} - ${CUR[S.cur]?.name || ''}`], [t('pdf.country'), regName(reg)], [t('field.budget'), b != null ? iso(b) : t('pdf.notSet')]],
      specs: [[t('pdf.takeoffMass'), pf('kg', r.auwKg, 2)], ...(r.weights?.hardwareG > 0 ? [[t('pdf.hardware'), pf('g', r.weights.hardwareG)]] : []),
        [t('pdf.flightTime'), t('pdf.flightTime.value', { n: n(r.estFlightMin, 1), target: S.targetFlightMin })], [t('pdf.range'), t('pdf.range.value', { range: pf('km', r.rangeKm, 1), speed: pf('ms', r.cruiseMs) })],
        [t('pdf.twr'), `${n(r.twr, 2)} : 1${fw ? ' ' + t('pdf.twr.static') : ''}`], ...hover,
        [t('pdf.battery'), `${r.batteryCells}S ${n(r.batteryMah)} mAh ${CHEM[r.batteryChemistry] || ''}, ${n(r.batteryWh)} Wh, ${r.batteryCRating}C`],
        ...(fw ? [] : [[t('pdf.motors'), t('pdf.motors.value', { n: r.motorCount, stator: r.motorStatorMm, kv: n(r.motorKv), thrust: pf('g', r.thrustPerMotorG) }) + (kind === 'tiltrotor' ? ', ' + t('pdf.tilting') : '')], [t('pdf.propeller'), `${n(r.propInch, 1)} in`]]),
        [t('pdf.esc'), t('pdf.esc.value', { cont: n(r.escContinuousA), burst: n(r.escBurstA) })], [t('pdf.peakCurrent'), `${n(r.peakCurrentA)} A`], ...frame, ...v4],
      bom: rows.length ? {
        rows: rows.map((x, i) => ({ n: String(i + 1), category: x.label, part: pName(x.it), brand: x.it.brand, qty: x.pack ? `${x.qty} x ${x.it.packOf}` : String(x.qty), unit: iso(x.it.priceUsd), line: iso(x.line),
          note: `${x.pack ? `${x.qty} x ${x.pack.sets} (${x.pack.pcs}). ` : ''}${x.it.custom ? t('pdf.customNote') : t(listed(x.it) ? 'parts.listed' : 'parts.search', { where: at })}`, links: lk(x.it) })),
        total: iso(total), ...(b != null ? { budget: iso(b), budgetNote: t(total <= b ? 'bom.under' : 'bom.over', { amount: iso(Math.abs(b - total)) }) } : {}),
      } : null,
      options: rows.length ? null : cats.map((k) => ({ category: catLabel(k, kind), items: all[k].map((it) => ({ part: pName(it), brand: it.brand, price: iso(it.priceUsd), links: lk(it), ...(it.custom ? { note: t('pdf.customNote') } : {}) })) })),
      tables: [...v4t, ...(() => { try { return PERF.perfTables?.(r) || []; } catch { return []; } })(), wiringTable(wiringRows(r, S.mission, rows.find((x) => x.key === 'battery')?.it))].filter(Boolean),
      notes: [C.ratesNote?.() || t('pdf.usdNote'), t('pdf.availability')],
    };
  }

  return { MISSIONS, MATERIALS, LIM, CUR, REG, FIELD, CFGS, FPV, money, region, regName, convertBudget, cfgLabel, cfgNote, cfgFamily, fit, reason, matNote, matWarns, isFpv, fpvOf, cfgOf, kindOf, minTwr,
    lim, dlim, QF, unit, defMin, payload, errs, stepErr, parse, hashOf, budgetUsd, run, runMeasured, bestPack, packText, cfgWarns, reqOf, results, pick, bomRows, ctx, pdfDoc,
    compatOf, wclassOf, massOf, LVL, motorOf, escFree, warnsOf, curveOf };
}
