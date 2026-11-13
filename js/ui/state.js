// Pure shell logic: hash codec, field limits and validation, money and region, quantities, BOM rows and the PDF doc.
// No DOM access, so node can import it with the real engine, catalog and matcher. app.js does the DOM wiring.
import { ORDER, catLabel, sections, links, linkLabel, listed, pack } from './parts.js';
import { wiringRows, wiringTable } from './wiring.js';

export const APP = 'DroneCalc';
export const TAGLINE = 'Drone calculator and bill of materials';
// Drone name is untrusted (URL hash, input): strip control chars, cap at 40. Renderers still escape it.
export const NAME_MAX = 40;
export const cleanName = (v) => String(v ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim().slice(0, NAME_MAX);
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
  const p = Math.round(100 / twr), at = `${p}% of max thrust to hover`;
  if (minTwr > 0 && twr < minTwr) return ['bad', `${at}: thrust : weight ${twr} is under the mission minimum of ${minTwr}. Fit stronger motors or bigger props.`];
  if (p > 65) return ['bad', `${at}: little margin for wind. Add thrust or cut weight.`];
  if (minTwr >= 3) return ['good', `${at}: high thrust margin, as a racer or interceptor should have.`]; // TWR >= 3 here, so at most 33%
  if (p > 55) return ['warn', `${at}: less margin for wind and climbs than the 45-50% sweet spot.`];
  if (p >= 40) return ['good', `${at}: sweet spot is 45-50%, with room for wind and manoeuvres.`];
  return ['warn', `${at}: overpowered: lots of margin, but the extra motor and battery mass costs endurance.`];
}
// Measured takeoff weight in grams (hash key mw, SPEC-v4 1). Untrusted: plain decimals in range only, else null (no exponent, sign or markup).
export const MW = { min: 1, max: 200000 };
export const mwOf = (v) => { const s = String(v ?? '').trim(), x = Number(s); return /^\d{1,6}(\.\d{1,2})?$/.test(s) && x >= MW.min && x <= MW.max ? x : null; };
export const LAUNCH = { hand: 'Hand launch', bungee: 'Bungee launch', runway: 'Runway take-off' };
// Fallback field limits when the engine exports none. Flight time never above 180.
const FB = { targetFlightMin: [1, 180], payloadKg: [0, 50], altitudeM: [-400, 6000], tempC: [-40, 60], windMs: [0, 25], budgetUsd: [0, 1000000] };
const CFG_TXT = {
  quad: ['Quad', '4 motors. Light and simple, no motor-out redundancy.'],
  hex: ['Hex', '6 motors. More lift; can land after one motor fails.'],
  octo: ['Octo', '8 motors. Heavy lift with the most redundancy.'],
  vtol: ['VTOL quadplane', 'Quadplane: 4 lift motors, 1 pusher and a wing. Hovers up, cruises on the wing.'],
  tiltrotor: ['VTOL tiltrotor', 'Four rotors tilt from hover to cruise. No separate pusher; 4 tilt servos.'],
  fixedwing: ['Fixed wing', 'One motor, a wing and a tail. Longest endurance; launches by hand, bungee or runway.'],
};
// Family of each configuration when the engine does not say (SPEC-v3 1).
const FAM = { quad: 'multirotor', hex: 'multirotor', octo: 'multirotor', vtol: 'vtol', tiltrotor: 'vtol', fixedwing: 'wing' };
export const FAMILIES = [['multirotor', 'Multirotor'], ['vtol', 'VTOL: quadplane and tiltrotor'], ['wing', 'Fixed wing']];
// Mission fit per family: [level, why]. good | ok | poor. Advisory only; the engine's warnings carry the detail.
const FIT = {
  delivery: { multirotor: ['good', 'Hovers to drop or land on a pad.'], vtol: ['good', 'Long legs, lands vertically.'], wing: ['poor', 'Cannot hover to drop or land on a pad.'] },
  inspection: { multirotor: ['good', 'Hovers and orbits close in.'], vtol: ['ok', 'Hover time is short; cruise between sites.'], wing: ['poor', 'Inspection needs hover; a wing cannot hold station.'] },
  agriculture: { multirotor: ['good', 'Slow low passes with a heavy tank.'], vtol: ['poor', 'Wing mass hurts a heavy, slow spray pass.'], wing: ['poor', 'Too fast and high for spraying.'] },
  interceptor: { multirotor: ['good', 'Highest thrust to weight.'], vtol: ['poor', 'Wing and pusher add drag and mass.'], wing: ['ok', 'Allowed as a fast fixed wing; no hover.'] },
  mapping: { multirotor: ['ok', 'Simple, but short survey legs.'], vtol: ['good', 'Wing cruise covers the most area per pack.'], wing: ['good', 'Best area per pack; needs space to launch and land.'] },
};
// Why a configuration suits a mission: [level, sentence] per pair. The card shows the sentence under a short fit word.
const REASONS = {
  delivery: {
    quad: ['good', 'Quad for delivery: cheapest lift for 1-2 kg, simple to repair, but less redundancy than hex.'],
    hex: ['good', 'Hex for delivery: carries heavier drops and can land after a motor failure, for more cost and weight than quad.'],
    octo: ['ok', 'Octo for delivery: the most redundancy, but heavy and costly for a 1-2 kg drop.'],
    vtol: ['good', 'VTOL quadplane for delivery: hovers to drop, then cruises on the wing for more range per pack.'],
    tiltrotor: ['ok', 'VTOL tiltrotor for delivery: cruises like a quadplane, but four tilt mechanisms add weight and complexity.'],
    fixedwing: ['poor', 'Fixed wing for delivery: longest range, but it cannot hover over a drop point or land on a pad.'],
  },
  inspection: {
    quad: ['good', 'Quad for inspection: stable hover and tight orbits for a gimbal camera, at the lowest cost per flight.'],
    hex: ['good', 'Hex for inspection: steadier with a heavy zoom or thermal payload, and it still lands after one motor fails.'],
    octo: ['ok', 'Octo for inspection: the safest hover for a critical asset, but costly and bulky for routine checks.'],
    vtol: ['ok', 'VTOL quadplane for inspection: covers long pipelines between sites, but hover time at each stop is short.'],
    tiltrotor: ['ok', 'VTOL tiltrotor for inspection: hovers for close looks and cruises between sites, but it is the most complex build.'],
    fixedwing: ['poor', 'Fixed wing for inspection: cannot hold station over one spot, so it suits route surveys only.'],
  },
  agriculture: {
    quad: ['ok', 'Quad for agriculture: enough thrust for a small plot, but a 5 kg tank leaves little margin for wind and reserve.'],
    hex: ['good', 'Hex for agriculture: carries a 5 kg tank with thrust to spare, and keeps flying after a motor failure over crops.'],
    octo: ['good', 'Octo for agriculture: the most lift for a full tank and the most redundancy, at the highest cost.'],
    vtol: ['poor', 'VTOL quadplane for agriculture: the wing adds weight and speed that a slow low spray pass does not need.'],
    tiltrotor: ['poor', 'VTOL tiltrotor for agriculture: tilt mechanisms add weight and cost, and cruise speed wastes spray time.'],
    fixedwing: ['poor', 'Fixed wing for agriculture: too fast and high for a slow low spray pass, and it cannot hover.'],
  },
  interceptor: {
    quad: ['good', 'Quad for interceptor: highest thrust to weight for fast climbs and turns, with no wing to slow it down.'],
    hex: ['ok', 'Hex for interceptor: more thrust, but the extra mass and drag cost the speed and burst it needs.'],
    octo: ['poor', 'Octo for interceptor: mass and drag are too high for a short, fast sortie.'],
    vtol: ['poor', 'VTOL quadplane for interceptor: the wing and pusher add drag and mass, slowing the climb.'],
    tiltrotor: ['poor', 'VTOL tiltrotor for interceptor: tilt gear adds mass, and the hover phase wastes time.'],
    fixedwing: ['ok', 'Fixed wing for interceptor: fastest cruise to a target, but it cannot hover or wait for one.'],
  },
  mapping: {
    quad: ['ok', 'Quad for mapping: simple and accurate, but short survey legs cover less area per pack.'],
    hex: ['ok', 'Hex for mapping: steady with a heavy mapping camera, but it covers less area per pack than a wing.'],
    octo: ['poor', 'Octo for mapping: heavy and power-hungry, so it covers the least area per pack.'],
    vtol: ['good', 'VTOL quadplane for mapping: wing cruise covers the most area per pack, and it needs no runway.'],
    tiltrotor: ['ok', 'VTOL tiltrotor for mapping: cruises efficiently on the wing, but tilt gear adds weight and cost.'],
    fixedwing: ['good', 'Fixed wing for mapping: best area per pack, but it needs space to launch and land.'],
  },
  fpv: {
    quad: ['good', 'Quad for FPV: lightest and most agile build, with the thrust for freestyle and racing.'],
    hex: ['poor', 'Hex for FPV: extra motors add weight and drag that cost agility, with no gain for a racing quad.'],
    octo: ['poor', 'Octo for FPV: far too heavy to flip and dive like a freestyle quad.'],
    vtol: ['poor', 'VTOL quadplane for FPV: the wing and pusher make it slow to turn and unsuited to acrobatics.'],
    tiltrotor: ['poor', 'VTOL tiltrotor for FPV: tilt mechanisms add weight and do nothing for acrobatic flight.'],
    fixedwing: ['poor', 'Fixed wing for FPV: fast, but no hover and wide turns make it a cruiser, not an acrobat.'],
  },
};
// One-line note per frame material when the engine gives none. Keys are engine ids; unknown ids get a numbers-only line.
const MAT_NOTE = {
  carbon: 'Stiff and light: the default for racing and long-range frames; brittle on hard crashes.',
  glass: 'Cheap and tough with some flex: forgiving in crashes, but heavier and less stiff than carbon.',
  aluminum: 'Rigid, easy to drill and repair; heavy for the stiffness it gives.',
  plastic: 'Cheapest, easy to print or mould; flexes and wears under vibration.',
  foam: 'Very light and crash-tolerant for wings and VTOL airframes; too soft for a multirotor frame.',
  titanium: 'Strong and corrosion-proof, but costly and heavier than carbon for the same stiffness.',
  pacf: 'Carbon-filled nylon: printable, tough and stiff, between carbon and plastic.',
  petg: 'Printable and impact-tolerant for prototypes and light frames; softens in sun and heat.',
  balsa: 'Natural wood: light and easy to shape for fixed wings; absorbs moisture.',
};
// Text the engine's material warnings use for each material (lower case). Unknown ids match on their own name.
const MAT_KEY = { balsa: 'balsa', foam: 'foam', titanium: 'titanium', petg: 'petg', pacf: 'pa-cf', glass: 'glass', aluminum: 'alumin', plastic: 'plastic' };
// SPEC-v3 1.3 class table, used only when the engine has no FPV_CLASSES export.
const FPV_FB = {
  5: { label: '5 in freestyle / racing', propInch: 5, defaultFlightMin: 5, maxFlightMin: 10, minTWR: 7 },
  7: { label: '7 in long range', propInch: 7, defaultFlightMin: 12, maxFlightMin: 25, minTWR: 4 },
  10: { label: '10 in long range heavy', propInch: 10, defaultFlightMin: 15, maxFlightMin: 35, minTWR: 3 },
};
// Hash keys. b is the budget in the chosen currency; fc the FPV class (fpv only); sel is "category:id,..." for the BOM.
const KEYS = { m: 'mission', t: 'targetFlightMin', p: 'payloadKg', mat: 'frameMaterial', cfg: 'configuration', fc: 'fpvClass', alt: 'altitudeM', tmp: 'tempC', w: 'windMs', b: 'budget', cur: 'cur', reg: 'reg' };
export const NUM = new Set(['targetFlightMin', 'payloadKg', 'altitudeM', 'tempC', 'windMs', 'budget']);
const DEF = { name: '', mw: '', mission: '',targetFlightMin: 20, payloadKg: null, frameMaterial: 'carbon', configuration: 'quad', fpvClass: '5', altitudeM: 0, tempC: 20, windMs: 3, budget: '', cur: 'USD', reg: '' };

// E = engine module; C, M, PERF, CHK = catalog, matcher, perf and checks modules, or {} while their owners have not shipped them.
export function createState({ E, C = {}, M = {}, PERF = {}, CHK = {} }) {
  const { MISSIONS, MATERIALS, estimate } = E;
  const LIM = {};
  for (const [k, [a, b]] of Object.entries(FB)) { const l = E.LIMITS?.[k]; LIM[k] = Array.isArray(l) ? { min: l[0], max: l[1] } : { min: Number.isFinite(l?.min) ? l.min : a, max: Number.isFinite(l?.max) ? l.max : b }; }
  LIM.targetFlightMin.max = Math.min(180, LIM.targetFlightMin.max);

  // Money and region: catalog API when present, else USD only.
  const CUR = C.CURRENCIES || { USD: { name: 'US dollar' } };
  const REG = C.REGIONS || {};
  const toUsd = (a, c) => (C.toUsd ? C.toUsd(a, c) : a);
  const fromUsd = (u, c) => (C.fromUsd ? C.fromUsd(u, c) : u);
  const money = (usd, cur, o) => (C.formatMoney ? C.formatMoney(usd, cur, o) : '$' + Math.round(usd).toLocaleString('en-US'));
  const region = (S) => S.reg || (C.regionForCurrency ? C.regionForCurrency(S.cur) : 'US');
  const regName = (k) => REG[k]?.name || k;
  const where = (k) => (k === 'GLOBAL' ? 'internationally' : 'in ' + regName(k));
  // Budget keeps its value, not its number, when the currency changes.
  const convertBudget = (amount, from, to) => (Number.isFinite(amount) ? Math.round(fromUsd(toUsd(amount, from), to)) : amount);

  // Configurations: the engine's list when exported, else each known one the engine accepts (estimate is pure, so probing is safe).
  const CFG_X = E.CONFIGURATIONS || E.CONFIGS;
  const CFGS = CFG_X ? (Array.isArray(CFG_X) ? CFG_X : Object.keys(CFG_X)) : Object.keys(CFG_TXT).filter((c) => {
    const r = estimate({ mission: 'mapping', targetFlightMin: 20, payloadKg: 0.3, frameMaterial: Object.keys(MATERIALS)[0], configuration: c, environment: { altitudeM: 0, tempC: 20, windMs: 0 } });
    return r.ok || !(r.errors || []).some((x) => /configuration/i.test(x));
  });
  const cfgInfo = (c) => (CFG_X && !Array.isArray(CFG_X) && typeof CFG_X[c] === 'object' ? CFG_X[c] : {});
  const cfgLabel = (c) => cfgInfo(c).label || CFG_TXT[c]?.[0] || c;
  const cfgNote = (c) => cfgInfo(c).note || CFG_TXT[c]?.[1] || '';
  const cfgFamily = (c) => ({ wing: 'wing', fixedwing: 'wing' }[cfgInfo(c).family] || cfgInfo(c).family || FAM[c] || 'multirotor');
  const fit = (mission, fam) => FIT[mission]?.[fam] || null;
  // Card reason for one configuration and mission: the REASONS sentence, else the family's generic line (for a configuration the table lacks).
  const reason = (mission, c) => {
    const hit = REASONS[mission]?.[c];
    if (hit) return { level: hit[0], text: hit[1] };
    const f = fit(mission, cfgFamily(c));
    return f ? { level: f[0], text: f[1] } : null;
  };
  // Engine warnings that come from the chosen frame material: new against a carbon build and naming the material.
  const matWarns = (S, r) => {
    if (!r?.ok || S.frameMaterial === 'carbon') return [];
    const base = new Set(run({ ...S, frameMaterial: 'carbon' })?.warnings || []), key = (MAT_KEY[S.frameMaterial] || S.frameMaterial).toLowerCase();
    return (r.warnings || []).filter((w) => !base.has(w) && w.toLowerCase().includes(key));
  };
  // One-line note per material: the engine's note when it ships one, else the table, else the numbers.
  const matNote = (id) => {
    const m = MATERIALS[id];
    if (!m) return '';
    return m.note || MAT_NOTE[id] || `${m.densityGcc} g/cm³, stiffness ${m.stiffness}/10, cost x${m.costRel}.`;
  };

  // FPV classes (SPEC-v3 1.3): engine table merged over the fallback, so minTWR and labels always exist.
  const FPV = Object.fromEntries(Object.keys(E.FPV_CLASSES || FPV_FB).map((k) => [k, { ...FPV_FB[k], ...(E.FPV_CLASSES?.[k] || {}) }]));
  const isFpv = (S) => S.mission === 'fpv';
  const fpvOf = (S) => (isFpv(S) ? FPV[S.fpvClass] || FPV[5] : null);
  // fpv always flies a quad (SPEC-v3 1.3); the user's configuration is kept for other missions.
  const cfgOf = (S) => (isFpv(S) ? 'quad' : S.configuration);
  const kindOf = (r) => (r?.fixedWing ? 'fixedwing' : r?.vtol ? (r.vtol.type === 'tiltrotor' ? 'tiltrotor' : 'vtol') : 'multi');

  // FIELD: [label, unit ('' = the chosen currency), wizard step].
  const FIELD = { targetFlightMin: ['Flight time target', 'min', 1], payloadKg: ['Payload', 'kg', 2], budget: ['Budget', '', 2], altitudeM: ['Altitude', 'm', 2], tempC: ['Temperature', '°C', 2], windMs: ['Typical wind', 'm/s', 2] };
  const lim = (k, cur) => (k === 'budget' ? { min: 0, max: Math.round(fromUsd(LIM.budgetUsd.max, cur)) } : LIM[k]);
  const unit = (k, cur) => FIELD[k][1] || cur;
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
      if (v === '' || v == null) { if (k !== 'budget') o[k] = `${label} is required. Enter a number.`; continue; }
      const { min, max } = lim(k, S.cur);
      if (!Number.isFinite(v) || v < min || v > max) o[k] = `${label} must be between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')} ${unit(k, S.cur)}.`;
    }
    return o;
  }
  const stepErr = (e, st) => Object.keys(e).some((k) => FIELD[k][2] === st);

  // ---- state <-> URL hash
  const CATS = new Set([...ORDER, ...(C.CATALOG || []).map((i) => i.category)]); // known sel keys; a Set has no prototype keys
  const VALID = { mission: (v) => Object.hasOwn(MISSIONS, v), frameMaterial: (v) => Object.hasOwn(MATERIALS, v), configuration: (v) => CFGS.includes(v), fpvClass: (v) => Object.hasOwn(FPV, v), cur: (v) => Object.hasOwn(CUR, v), reg: (v) => Object.hasOwn(REG, v) };
  function parse(hash) {
    const h = new URLSearchParams(String(hash || '').replace(/^#/, '')), S = { ...DEF, sel: {} };
    for (const [k, name] of Object.entries(KEYS)) {
      if (!h.has(k)) continue;
      const v = h.get(k);
      if (NUM.has(name)) S[name] = v === '' ? '' : Number(v); // out-of-range or junk stays and shows a field error, never clamped silently
      else if (VALID[name](v)) S[name] = v;
    }
    S.name = cleanName(h.get('n'));
    S.mw = mwOf(h.get('mw')) ?? '';
    for (const p of (h.get('sel') || '').split(',')) { const i = p.indexOf(':'), k = p.slice(0, i); if (i > 0 && /^[a-z]{1,16}$/.test(k) && CATS.has(k)) S.sel[k] = p.slice(i + 1); }
    if (S.mission && !h.has('t')) S.targetFlightMin = defMin(S.mission, S.fpvClass);
    const step = S.mission ? Math.min(Math.max(parseInt(h.get('s'), 10) || 0, 0), 3) : 0;
    return { S, step };
  }
  function hashOf(S, step) {
    const h = new URLSearchParams({ s: step });
    for (const [k, name] of Object.entries(KEYS)) if (S[name] !== '' && S[name] != null && (name !== 'fpvClass' || isFpv(S))) h.set(k, S[name]);
    if (mwOf(S.mw) != null) h.set('mw', S.mw);
    const sel = Object.entries(S.sel).map(([c, id]) => `${c}:${id}`).join(',');
    if (sel) h.set('sel', sel);
    const nm = cleanName(S.name);
    return '#' + h + (nm ? '&n=' + encodeURIComponent(nm) : '');
  }

  // ---- engine and matcher calls
  const budgetUsd = (S) => (Number.isFinite(S.budget) && S.budget > 0 ? Math.min(toUsd(S.budget, S.cur), LIM.budgetUsd.max) : undefined);
  const input = (S) => ({
    mission: S.mission, targetFlightMin: S.targetFlightMin, payloadKg: payload(S), frameMaterial: S.frameMaterial, configuration: cfgOf(S),
    ...(isFpv(S) ? { fpvClass: S.fpvClass } : {}),
    environment: { altitudeM: S.altitudeM, tempC: S.tempC, windMs: S.windMs },
    ...(budgetUsd(S) != null ? { budgetUsd: budgetUsd(S) } : {}),
  });
  const run = (S) => { if (!S.mission || Object.keys(errs(S)).length) return null; try { return estimate(input(S)); } catch (e) { return { ok: false, errors: [String(e.message || e)] }; } };
  // Warnings the chosen configuration adds over a plain quad: shown inline under the picker (SPEC-v3 4). Never blocks.
  function cfgWarns(S, r) {
    if (!r?.ok || cfgOf(S) === 'quad') return [];
    const q = run({ ...S, configuration: 'quad' }), base = new Set(q?.warnings || []);
    return (r.warnings || []).filter((w) => !base.has(w));
  }
  // Measured weight (SPEC-v4 1): the same parts and pack at the weighed mass. A rerun with more payload would re-size the pack to the
  // target and hide the effect, so flight time comes from the engine's own payload sweep (hardware and pack fixed), extrapolated as
  // power ~ mass^1.5 outside it; TWR ~ 1/mass, throttle ~ sqrt(mass). Returns { r, est, err }: r = measured result (or est), err = field error.
  function runMeasured(S, est = run(S)) {
    if (!est?.ok || mwOf(S.mw) == null) return { r: est, est, err: '' };
    const auw = S.mw / 1000, p0 = payload(S), dry = est.auwKg - p0, p = auw - dry, k = auw / est.auwKg;
    // below half the estimate the parts differ too much from the sized build for a fixed-hardware rescale
    const lo = Math.ceil(est.auwKg * 500), hi = Math.floor((dry + LIM.payloadKg.max) * 1000);
    if (S.mw < lo || S.mw > hi) return { r: est, est, err: `Measured weight must be between ${lo.toLocaleString('en-US')} and ${hi.toLocaleString('en-US')} g for this build.` };
    const sw = (est.performance?.payload || []).filter((q) => Number.isFinite(q?.kg) && Number.isFinite(q?.flightMin)).sort((a, b) => a.kg - b.kg);
    const i = sw.findIndex((q) => q.kg >= p), a = sw[i - 1], b = sw[i];
    const e = i === 0 ? sw[0] : sw[sw.length - 1] || { kg: p0, flightMin: est.estFlightMin };
    const t = i > 0 ? a.flightMin + ((b.flightMin - a.flightMin) * (p - a.kg)) / (b.kg - a.kg) : e.flightMin * ((dry + e.kg) / auw) ** 1.5;
    const rd = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d, f = est.estFlightMin > 0 ? t / est.estFlightMin : 1, meets = t >= S.targetFlightMin * 0.99, mt = minTwr(S, est);
    // one measured T:W for tile, band, captions, caution and PDF: the sweep's full-throttle thrust (whole grams, density-corrected) over the measured grams, rounded once
    // (est.twr is already rounded to 2 places; dividing it again drifted a hundredth from the figures)
    const thr = est.performance?.throttle?.at?.(-1)?.thrustG, tn0 = est.twr * est.auwKg * 1000, twrM = rd((Number.isFinite(thr) && Math.abs(thr / tn0 - 1) < 0.015 ? thr : tn0) / S.mw, 2);
    const estG = Math.round(est.auwKg * 1000), extra = Math.round(S.mw - Object.values(est.weights || {}).reduce((a, g) => a + (Number.isFinite(g) && g > 0 ? g : 0), 0)); // vs the rounded breakdown, so Fig 6 sums to the measured mass
    // Mass-threshold warnings are re-derived from the measured mass (same thresholds as the engine); the rest stay.
    const warnings = [...(est.warnings || []).filter((w) => !/^AUW above/.test(w)),
      ...(auw > 25 ? ['AUW above 25 kg: heavy-UAS regulations apply in most countries.'] : auw > 0.25 ? ['AUW above 250 g: registration is required in most countries.'] : []),
      ...(!meets && est.meetsTarget ? [`At the measured ${S.mw.toLocaleString('en-US')} g the flight time drops to ${rd(t, 1)} min, under the ${S.targetFlightMin} min target.`] : []),
      ...(mt != null && twrM < mt ? [est.fixedWing ? `At the measured ${S.mw.toLocaleString('en-US')} g, static thrust : weight is ${twrM}, below ${mt}: the wing may not launch or climb. Fit a stronger motor or a bigger prop.`
        : `At the measured ${S.mw.toLocaleString('en-US')} g, thrust : weight is ${twrM}, below the ${fpvOf(S)?.label || MISSIONS[S.mission]?.label || 'mission'} minimum of ${mt}: fit stronger motors or bigger props.`] : [])];
    // Wing figures at the measured mass, same CL: loading ~ m, stall and cruise ~ sqrt(m). Launch type and VTOL phase times stay the estimate's (labelled).
    const range = rd(est.rangeKm * f, 2), wingOf = (w) => w && { ...w, wingLoadingGdm2: rd(w.wingLoadingGdm2 * k, 1), stallMs: rd(w.stallMs * Math.sqrt(k), 1), cruiseMs: rd(w.cruiseMs * Math.sqrt(k), 1),
      rangeKm: range, ...(Number.isFinite(w.endurance) ? { endurance: rd(t, 1) } : {}) };
    return { est, err: '', r: { ...est, auwKg: rd(auw, 3), estFlightMin: rd(t, 1), rangeKm: range, twr: twrM,
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
    const tw = r?.twrKind === 'static' || r?.fixedWing ? 'static T:W' : 'T:W', k = `${n(bp.mult, 1)}× this pack`, t = `${n(bp.flightMin, 1)} min`;
    if (bp.reason === 'rangeEnd') return { value: `${n(bp.wh)}+ Wh`, more: `still rising at ${k}`, line: `${n(bp.wh)}+ Wh, still rising at ${k}` };
    if (bp.reason === 'twrLimit' && Math.abs(bp.mult - 1) <= 0.05) { // the sized pack is already the feasible maximum
      const m = `This pack is already the largest that keeps ${tw} ≥ ${mt ?? '-'}. A bigger pack needs stronger motors or bigger props.`;
      return { value: `${n(bp.wh)} Wh`, more: `${t}. ${m}`, line: m.replace('≥', '>=') };
    }
    if (bp.reason === 'twrLimit') return { value: `${n(bp.wh)} Wh`, more: `${t} (${k}), the largest that keeps ${tw} ≥ ${mt ?? '-'}. Bigger needs stronger motors.`,
      line: `Largest pack that keeps ${tw} >= ${mt ?? '-'}: ${n(bp.wh)} Wh, ${t} (${k}). Bigger needs stronger motors.` };
    return { value: `${n(bp.wh)} Wh`, more: `${n(bp.mah)} mAh, ${t}. Bigger packs fly shorter.`, line: `Best pack: ${n(bp.wh)} Wh (${n(bp.mah)} mAh), ${t}. Bigger packs fly shorter.` };
  };
  // Requirements for the matcher, with the FPV class echoed (SPEC-v3 2).
  const reqOf = (S, r) => { const fc = r.fpvClass ?? (isFpv(S) ? S.fpvClass : null); return fc != null ? { ...r.requirements, fpvClass: String(fc) } : r.requirements; };
  // R = everything the results page shows for one engine result. Parts match the estimate; R.r is the measured result when mw applies.
  function results(S, r) {
    const m = runMeasured(S, r);
    const reg = region(S), notes = [];
    let rec = null, opts = null;
    try { rec = M.recommend ? M.recommend(reqOf(S, r), S.mission, budgetUsd(S), undefined, reg) : null; } catch (e) { notes.push('Parts matching failed: ' + e.message); }
    try { opts = M.listOptions ? M.listOptions(reg, S.mission) : null; } catch (e) { notes.push('Option list failed: ' + e.message); }
    if (!rec) notes.push('Recommendations are unavailable right now.');
    if (S.cur !== 'USD' && C.RATES_NOTE) notes.push(C.RATES_NOTE);
    return { r: m.r, est: r, mwErr: m.err, rec, opts, reg, sec: sections(rec, opts), note: notes.join(' ') };
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
  const compatOf = (R, rows) => (CHK.compat && rows.length ? CHK.compat(R.r, Object.fromEntries(rows.map((x) => [x.key, x.it]))) : []);
  const wclassOf = (R) => CHK.weightClass?.(R.r.auwKg, R.reg) || null;
  const massOf = (R, rows) => (CHK.partsMassG && rows.length ? CHK.partsMassG(rows, R.est || R.r) : null);
  const LVL = { pass: 'Pass', warn: 'Check', fail: 'Fail' };
  // The motor that decides whether an ESC is needed: the picked one, else the best pick. integratedEsc = ESC built into the motor.
  const motorOf = (R, S) => (S.sel.motor && pick(R, 'motor', S.sel.motor)) || R.rec?.motor?.[0] || null;
  const escFree = (R, S) => !!motorOf(R, S)?.specs?.integratedEsc;
  // Engine warnings for display: the budget line is rebuilt in the chosen currency (the engine writes it in USD).
  const warnsOf = (S, r) => (r?.warnings || []).map((w) => (/^Estimated core parts cost/.test(w) && Number.isFinite(r.estCostUsd) && budgetUsd(S) != null
    ? `Estimated core parts cost about ${money(r.estCostUsd, S.cur)} exceeds the budget of ${money(budgetUsd(S), S.cur)}.` : w));
  // Context for the parts.js builders.
  const ctx = (R, S) => ({ name: cleanName(S.name), rec: R.rec, req: R.r.requirements, opts: R.opts, sec: R.sec, sel: S.sel, money: (u) => money(u, S.cur), cur: S.cur,
    num: (u) => Number(fromUsd(u, S.cur).toFixed(CUR[S.cur]?.decimals ?? 2)), where: where(R.reg), kind: kindOf(R.r),
    qty: (k, it) => qty(R, k, it), optsFor: (k) => optsFor(R, k), budgetUsd: budgetUsd(S), note: R.note, motor: motorOf(R, S), escFree: escFree(R, S) });

  // ---- PDF doc (SPEC-v2 section 3): BOM when anything is selected, else every option in every category. Money in iso style.
  function pdfDoc(R, S, dateISO) {
    const { r, reg } = R, v = r.vtol, fw = r.fixedWing, tilt = v?.tilt, kind = kindOf(r), iso = (u) => money(u, S.cur, { iso: true }), rows = bomRows(R, S.sel), b = budgetUsd(S), at = where(reg);
    const lk = (it) => links(it.links, 3).map((l) => ({ label: linkLabel(l), url: l.url }));
    const total = rows.reduce((a, x) => a + x.line, 0);
    const all = R.opts || {};
    const cats = [...new Set([...ORDER.filter((k) => all[k]), ...Object.keys(all)])].filter((k) => all[k]?.length && !R.sec.off?.includes(k));
    const M_ = MISSIONS[S.mission], cfg = cfgLabel(cfgOf(S)), fc = fpvOf(S);
    const mot = (m) => `${m?.statorMm ?? '-'} ${n(m?.kv)} KV, ${n(m?.thrustG)} g, ${n(m?.propInch, 1)} in prop`;
    const wing = (w) => [['Wingspan', `${n(w.wingspanMm)} mm`], ['Wing area / loading', `${n(w.wingAreaDm2, 1)} dm2, ${n(w.wingLoadingGdm2)} g/dm2`], ['Aspect ratio / L:D', `${n(w.aspectRatio, 1)} / ${n(w.liftToDrag, 1)}`],
      ['Stall / cruise speed', `${n(w.stallMs, 1)} / ${n(w.cruiseMs, 1)} m/s`]];
    const hover = fw ? [['Cruise throttle', `${n(r.hoverThrottlePct)} %`], ['Cruise / average power', `${n(r.hoverPowerW)} W / ${n(r.avgPowerW)} W`]] // wing: engine hover fields hold level cruise
      : [['Hover thrust', `${n(100 / r.twr)} % of max (${n(r.hoverThrottlePct)} % throttle)`], ['Hover / average power', `${n(r.hoverPowerW)} W / ${n(r.avgPowerW)} W`]];
    const frame = fw ? [...wing(fw), ['Launch', `${LAUNCH[fw.launch] || fw.launch || '-'}${r.measuredG && Math.round(r.measuredG) !== Math.round(r.estG) ? ' (at estimated mass)' : ''}`], ['Main motor', mot(fw.motor)], ...(Number.isFinite(r.estFlightMin) ? [['Endurance', `${n(r.estFlightMin, 1)} min at cruise speed`]] : [])]
      : v ? [...wing(v), ...(v.pusher ? [['Pusher', mot(v.pusher)]] : []),
        ...(tilt ? [['Tilt mechanism', `${tilt.motorCount ?? 4} tilting motors, ${tilt.servoCount ?? 4} tilt servos`], ['Transition', `${n(tilt.tiltTimeS, 1)} s, rotors tilt ${n(tilt.transitionAngleDeg)} deg from vertical`]] : []),
        ['Hover / transition / cruise', `${n(v.hoverS)} s / ${n(v.transitionS)} s / ${n(v.cruiseMin, 1)} min${r.measuredG && Math.round(r.measuredG) !== Math.round(r.estG) ? ' (at estimated mass)' : ''}`]]
      : [['Frame', `${n(r.frameSizeMm)} mm`]];
    const nm = cleanName(S.name); // pdf.js escapes PDF string syntax and maps non-WinAnsi chars
    const est = R.est || r, ms = massOf(R, rows), wc = wclassOf(R), mt = minTwr(S, r), bp = bestPack(r, mt), chk = compatOf(R, rows), cl = CHK.checklist ? CHK.checklist(r, S) : [];
    const v4 = [...(r.measuredG ? [['Measured weight', `${n(r.measuredG)} g vs estimate ${n(r.estG)} g (figures use measured)`]] : []),
      ...(ms ? [['Parts mass', `${n(ms.partsG)} g + ${n(ms.allowanceG)} g wiring/hardware = ${n(ms.totalG)} g vs estimate ${n(est.auwKg * 1000)} g`]] : []),
      ...(wc ? [['Weight class', wc.label]] : []), ['C rating needed', `${r.batteryCRating}C, ${CHEM[r.batteryChemistry] || r.batteryChemistry || ''} ${r.batteryCells}S`],
      ...(bp ? [['Best pack size', packText(bp, mt, r).line]] : []),
      ...(Number.isFinite(r.estCostUsd) ? [['Typical build cost', `${iso(r.estCostUsd)} (engine estimate)${rows.length ? ` vs BOM ${iso(total)}` : ''}`]] : [])];
    const v4t = [chk.length ? { title: 'Compatibility checks', columns: ['Result', 'Check'], rows: chk.map((c) => [LVL[c.level] || c.level, c.text]) } : null,
      wc ? { title: 'Weight class', columns: ['Class', 'What it means'], rows: [[wc.label, wc.note]] } : null,
      cl.length ? { title: 'Build and first-flight checklist', columns: ['#', 'Step'], rows: cl.map((x, i) => [String(i + 1), x]) } : null];
    return {
      title: `${APP}: ${TAGLINE}`,
      subtitle: `${nm ? `${nm} · ` : ''}${fc ? `FPV · ${fc.label}` : M_.label} build, ${cfg}, ${S.targetFlightMin} min target`,
      dateISO,
      meta: [...(nm ? [['Drone name', nm]] : []), ['Mission', M_.label], ...(fc ? [['FPV class', fc.label]] : []), ['Configuration', cfg], ['Flight time target', `${S.targetFlightMin} min`], ['Payload', `${payload(S)} kg`],
        ['Frame material', MATERIALS[S.frameMaterial]?.label || S.frameMaterial], ['Conditions', `${S.altitudeM} m, ${S.tempC} °C, wind ${S.windMs} m/s`],
        ['Currency', `${S.cur} - ${CUR[S.cur]?.name || ''}`], ['Country', regName(reg)], ['Budget', b != null ? iso(b) : 'Not set']],
      specs: [['Takeoff mass', `${n(r.auwKg, 2)} kg`], ...(r.weights?.hardwareG > 0 ? [['Screws, wiring and hardware', `${n(r.weights.hardwareG)} g`]] : []),
        ['Flight time', `${n(r.estFlightMin, 1)} min (target ${S.targetFlightMin} min)`], ['Range', `${n(r.rangeKm, 1)} km at ${n(r.cruiseMs)} m/s`],
        ['Thrust to weight', `${n(r.twr, 2)} : 1${fw ? ' (static, cruise motor)' : ''}`], ...hover,
        ['Battery', `${r.batteryCells}S ${n(r.batteryMah)} mAh ${CHEM[r.batteryChemistry] || ''}, ${n(r.batteryWh)} Wh, ${r.batteryCRating}C`],
        ...(fw ? [] : [['Motors', `${r.motorCount} x ${r.motorStatorMm} ${n(r.motorKv)} KV, ${n(r.thrustPerMotorG)} g thrust each${kind === 'tiltrotor' ? ', tilting' : ''}`], ['Propeller', `${n(r.propInch, 1)} in`]]),
        ['ESC', `${n(r.escContinuousA)} A continuous, ${n(r.escBurstA)} A burst`], ['Peak current', `${n(r.peakCurrentA)} A`], ...frame, ...v4],
      bom: rows.length ? {
        rows: rows.map((x, i) => ({ n: String(i + 1), category: x.label, part: x.it.name, brand: x.it.brand, qty: x.pack ? `${x.qty} x ${x.it.packOf}` : String(x.qty), unit: iso(x.it.priceUsd), line: iso(x.line),
          note: `${x.pack ? `${x.qty} x ${x.pack.sets} (${x.pack.pcs}). ` : ''}${listed(x.it) ? 'Listed' : 'Search'} ${at}`, links: lk(x.it) })),
        total: iso(total), ...(b != null ? { budget: iso(b), budgetNote: `${total <= b ? 'Under' : 'Over'} budget by ${iso(Math.abs(b - total))}` } : {}),
      } : null,
      options: rows.length ? null : cats.map((k) => ({ category: catLabel(k, kind), items: all[k].map((it) => ({ part: it.name, brand: it.brand, price: iso(it.priceUsd), links: lk(it) })) })),
      tables: [...v4t, ...(() => { try { return PERF.perfTables?.(r) || []; } catch { return []; } })(), wiringTable(wiringRows(r, S.mission, rows.find((x) => x.key === 'battery')?.it))].filter(Boolean),
      notes: [C.RATES_NOTE || 'Prices are USD list prices.', 'Availability: prices, stock and links were checked on 2026-11-06 and change often. Confirm fit, voltage and shipping before ordering.'],
    };
  }

  return { MISSIONS, MATERIALS, LIM, CUR, REG, FIELD, CFGS, FPV, money, region, regName, convertBudget, cfgLabel, cfgNote, cfgFamily, fit, reason, matNote, matWarns, isFpv, fpvOf, cfgOf, kindOf, minTwr,
    lim, unit, defMin, payload, errs, stepErr, parse, hashOf, budgetUsd, run, runMeasured, bestPack, packText, cfgWarns, reqOf, results, pick, bomRows, ctx, pdfDoc,
    compatOf, wclassOf, massOf, LVL, motorOf, escFree, warnsOf };
}
