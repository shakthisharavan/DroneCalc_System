// DroneCalc: DOM wiring for the wizard, results, part selection, BOM dock and PDF export.
// State, hash, money and BOM logic live in ui/state.js (pure, node-testable).
import * as E from './engine.js';
import { esc, partsHtml, bomHtml, dockHtml, copyText, bomCsv, CHEV, gl, section } from './ui/parts.js';
import { APP, n, NUM, createState, FAMILIES, LAUNCH, NAME_MAX, cleanName, fileBase, pdfName, csvName, CHEM, MW, mwOf, hoverBand, AGE, HA, haOf } from './ui/state.js';
import { wiringRows, wiringHtml } from './ui/wiring.js';
import { mountIO, ioHtml } from './ui/io.js';
import * as U from './ui/units.js';
import { t as tr, tf, lazyMap, init as initLang, setLang, save as saveLang, get as getLang, LANGS, LANG_NAMES } from './i18n/i18n.js';

// Theme first, before the awaits below, so a stored choice paints as early as a module can (CSP: no inline script). Unset = CSS follows the OS.
const THEME = 'dronecalc:theme', root = document.documentElement;
try { const t = localStorage.getItem(THEME); if (t === 'dark' || t === 'light') root.dataset.theme = t; } catch { /* storage unavailable */ }
// Display units (F6), stored under their own key and read before the first render so nothing flashes. Display only: state, hash and saved builds stay SI.
U.load();
// Language (i18n): stored or detected, loaded before the first render so nothing flashes in the wrong one. Display only: it is not in the share hash.
await initLang();
const isDark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

// Modules other owners write in parallel: a missing file or export must never break the page.
const opt = (p) => import(p).catch(() => ({}));
const [C, M, PERF, CHK, LIBM] = await Promise.all([opt('./catalog.js'), opt('./matcher.js'), opt('./ui/perf.js'), opt('./checks.js'), opt('./ui/library.js')]);
const PDF = opt('./ui/pdf.js'); // awaited on export
// Measured thrust curves (F8): saved on this device, named in a link by id only; null when measured.js is missing, which hides the card.
const MEASM = await opt('./ui/measured.js'), CRV = MEASM.createCurves ? MEASM.createCurves((() => { try { return localStorage; } catch { return null; } })()) : null;
let measApi = null; // the Measured data card of the results page showing now (null elsewhere)
const X = createState({ E, C, M, PERF, CHK, CURVES: CRV });
const { MISSIONS, MATERIALS, LIM, CUR, REG, FIELD, CFGS } = X;
// Saved builds (SPEC-v4 7); null when library.js is missing, which hides its buttons.
const LIB = LIBM.createLibrary ? LIBM.createLibrary(X, (() => { try { return localStorage; } catch { return null; } })()) : null;
// Custom parts (F7): the user's own parts, loaded into C.CUSTOM so the matcher sees them; null when custom.js is missing, which hides the form.
const CUSM = await opt('./ui/custom.js'), CUS = CUSM.createCustom ? CUSM.createCustom(C, (() => { try { return localStorage; } catch { return null; } })()) : null;
let missingCustom = 0; // custom picks the opened hash named that this device does not have (dropped, noted on the results page)

const $ = (s, r = document) => r.querySelector(s);
const STEPS = () => [tr('app.step.mission'), tr('app.step.endurance'), tr('app.step.details'), tr('app.step.results')];
const RAIL = () => [tr('app.rail.mission'), tr('app.rail.time'), tr('app.rail.details'), tr('app.rail.build')];
// Top-view schematics, 48x48: rotor discs (.rot) on arms around a hub.
const ring = (cnt, R_, r, a0) => {
  let arms = '', rot = '';
  for (let i = 0; i < cnt; i++) { const a = a0 + (i * 2 * Math.PI) / cnt, x = (24 + R_ * Math.cos(a)).toFixed(1), y = (24 + R_ * Math.sin(a)).toFixed(1); arms += `M24 24L${x} ${y}`; rot += `<circle cx="${x}" cy="${y}" r="${r}"/>`; }
  return `<path d="${arms}"/><circle cx="24" cy="24" r="3.5"/><g class="rot">${rot}</g>`;
};
// Winged types, nose up: wing, fuselage, tail; props seen edge-on are short lines; dashed .ax = tilt axis.
const SCHEM = {
  quad: ring(4, 14, 7, Math.PI / 4), hex: ring(6, 17, 5.2, -Math.PI / 2), octo: ring(8, 18, 4.2, 0),
  vtol: '<path d="M4 20h40v7H4zM24 5v37M13 9v28M35 9v28M18 41h12"/><g class="rot"><circle cx="13" cy="9" r="5"/><circle cx="35" cy="9" r="5"/><circle cx="13" cy="37" r="5"/><circle cx="35" cy="37" r="5"/><path d="M19 45h10"/></g>',
  tiltrotor: '<path d="M24 4v38M13 11h22v4H13zM5 26h38v5H5zM19 42h10"/><path class="ax" d="M2 13h44M1 28.5h46"/><g class="rot"><circle cx="11" cy="13" r="5"/><circle cx="37" cy="13" r="5"/><circle cx="5" cy="28.5" r="4.5"/><circle cx="43" cy="28.5" r="4.5"/></g>',
  fixedwing: '<path d="M24 7v34M3 18h42l-2 6H5zM16 37h16v4H16z"/><g class="rot"><path d="M17 5h14"/></g>',
};
const ROLE = { 5: () => tr('app.role.5'), 7: () => tr('app.role.7'), 10: () => tr('app.role.10') };
const FIT_TXT = lazyMap('app.fit.', ['good', 'ok', 'poor']);

let S, step, R = null; // S = answers, step = wizard step 0-3, R = results context (null off the results page)
const money = (u, o) => X.money(u, S.cur, o);
const lim = (k) => X.lim(k, S.cur);
const ctx = () => X.ctx(R, S);
const bomRows = () => X.bomRows(R, S.sel);
const today = () => new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd, local date (ISO: the same in every language, it goes in file names and the PDF)
const label = () => MISSIONS[S.mission]?.label; // filename fallback when the drone has no name

// Last build, kept as its hash. localStorage throws in some private modes and on file://, so every access is guarded.
const LAST = 'dronecalc:last';
const store = (v) => { try { if (v) localStorage.setItem(LAST, v); else localStorage.removeItem(LAST); } catch { /* storage unavailable */ } };
function load() { ({ S, step } = X.parse(location.hash)); missingCustom = CUS ? CUSM.pruneSel(S, C.CUSTOM) : 0; }
function save(push) {
  const u = X.hashOf(S, step);
  if (push && u !== location.hash) history.pushState(null, '', u); else history.replaceState(null, '', u);
  store(S.mission ? u : null); // no mission = nothing worth restoring (also clears it on Start over)
}
// First load without a build in the URL: restore the stored hash. Only a "#..." value, so it stays a same-page fragment; parse() validates it like any hash.
if (!X.parse(location.hash).S.mission) { try { const h = localStorage.getItem(LAST); if (h?.[0] === '#') history.replaceState(null, '', h); } catch { /* storage unavailable */ } }

// ---- rendering
const stage = $('#main'), panel = $('#panel'), shell = $('#shell');

function rail() {
  return `<nav aria-label="${esc(tr('app.stepsNav'))}"><ol class="rail">${RAIL().map((s, i) => `<li><button type="button" data-go="${i}" ${i === step ? 'aria-current="step"' : ''} ${i > 0 && !S.mission ? 'disabled' : ''}><b>0${i + 1}</b><span>${esc(s)}</span></button></li>`).join('')}</ol></nav>`;
}
// Step heading text for screen readers: "Step 2 of 4: " ahead of the visible title. The heading takes focus on a step change, so this is what gets read out.
const stepTag = () => `<span class="sr">${esc(tr('app.stepTag', { n: step + 1, total: STEPS().length }))}</span>`;
// One polite, always-present status region (index.html #sr-live) for messages that have no region of their own. Cleared first so the same text can repeat.
const live = $('#sr-live');
let liveTimer;
function announce(msg) { clearTimeout(liveTimer); live.textContent = ''; if (msg) liveTimer = setTimeout(() => { live.textContent = msg; }, 60); }
// Numeric fields in a display unit (X.QF) show and take that unit; setVal converts typed text to SI. An untouched field keeps its stored SI value.
const num = (id, label, val, st, hint = '') => { const q = X.QF[id], dl = X.dlim(id, S.cur); return `<div class="field" data-f="${id}"><label for="${id}">${esc(label)}</label><div class="inp"><input id="${id}" data-k="${id}" type="number" inputmode="decimal" min="${dl.min}" max="${dl.max}" step="${q ? U.step(q, st) : st}" value="${Number.isFinite(val) ? (q ? U.input(q, val) : val) : ''}" aria-describedby="u-${id} e-${id}${hint ? ` h-${id}` : ''}"><span class="u" id="u-${id}">${esc(X.unit(id, S.cur))}</span></div>${hint ? `<span class="hint" id="h-${id}">${esc(U.text(hint))}</span>` : ''}<span class="err" id="e-${id}" role="alert"></span></div>`; };
const sel = (id, label, opts, val, hint = '') => `<div class="field"><label for="${id}">${esc(label)}</label><div class="inp"><select id="${id}" data-k="${id}"${hint ? ` aria-describedby="h-${id}"` : ''}>${opts.map(([v, l]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>${hint ? `<span class="hint" id="h-${id}">${esc(U.text(hint))}</span>` : ''}</div>`;
const matHint = () => (MATERIALS[S.frameMaterial] ? X.matNote(S.frameMaterial) : '');
// Every material with its one-line note and numbers, so a new engine material appears here without UI changes.
const matList = () => `<details class="more mat-more"><summary>${CHEV}${esc(tr('app.matAll', { n: Object.keys(MATERIALS).length }))}</summary><ul class="mat-notes">${Object.entries(MATERIALS).map(([id, m]) =>
  `<li><b>${esc(m.label)}</b> ${esc(X.matNote(id))} <small>${esc(tr('app.matSpec', { density: U.text(`${m.densityGcc} g/cm³`), stiffness: m.stiffness, cost: m.costRel }))}</small></li>`).join('')}</ul></details>`;
const radio = (name, id, val, on, inner) => `<div class="choice"><input type="radio" name="${name}" id="${id}" value="${esc(val)}" ${on ? 'checked' : ''}><label for="${id}">${inner}</label></div>`;
// Configuration picker grouped by family. Each card carries a short fit word and the reason for this mission; engine warnings show inline below.
function cfgPicker() {
  const fams = FAMILIES.map(([f, name]) => [f, name, CFGS.filter((c) => X.cfgFamily(c) === f)]).filter(([, , cs]) => cs.length);
  return `<fieldset class="field cfg"><legend>${esc(tr('app.cfg.legend'))}</legend><div class="fams">${fams.map(([f, name, cs]) =>
    `<div class="fam"><p class="fam-h"><span class="fam-t">${esc(name)}</span></p>
      <div class="choices cfgs">${cs.map((c) => {
        const why = X.reason(S.mission, c);
        return radio('configuration', `c-${c}`, c, S.configuration === c, `<svg viewBox="0 0 48 48" aria-hidden="true">${SCHEM[c] || ''}</svg><span class="nm">${esc(X.cfgLabel(c))}</span><small>${esc(X.cfgNote(c))}</small>${why ? `<span class="fit ${why.level}">${esc(FIT_TXT[why.level])}</span><span class="why">${esc(why.text)}</span>` : ''}`);
      }).join('')}</div></div>`).join('')}</div><ul class="cfg-warn" id="cfg-warn" aria-live="polite"></ul></fieldset>`;
}
// FPV size cards (SPEC-v3 4): only for the fpv mission, which always flies a quad.
function fpvPicker() {
  const F = X.FPV, g = (v, u) => (Number.isFinite(v) ? (u === 'g' ? U.format('g', v) : `${n(v)} ${u}`) : '-');
  return `<fieldset class="field fpv"><legend>${esc(tr('app.fpv.legend'))}</legend><p class="hint" id="h-fpv">${esc(tr('app.fpv.hint'))}</p>
    <div class="choices fpvs">${Object.entries(F).map(([k, c]) => radio('fpvClass', `fc-${k}`, k, S.fpvClass === k, `<span class="nm"><span>${esc(tr('app.fpv.size', { size: k }))}<em>${esc(ROLE[k]?.() || c.label)}</em></span></span>
      <dl class="fpv-s"><div><dt>${esc(tr('app.fpv.weight'))}</dt><dd>${g(c.typicalAuwG, 'g')}</dd></div><div><dt>${esc(tr('app.fpv.time'))}</dt><dd>${g(c.defaultFlightMin, 'min')} <small>${esc(tr('app.fpv.upTo', { value: g(c.maxFlightMin, 'min') }))}</small></dd></div></dl>${c.note ? `<small>${esc(c.note)}</small>` : ''}`)).join('')}</div>
    <p class="live" role="status" id="fpv-msg"></p></fieldset>`;
}
function refresh() {
  const e = X.errs(S);
  stage.querySelectorAll('[data-f]').forEach((f) => { const m = e[f.dataset.f] || ''; f.classList.toggle('bad', !!m); f.querySelector('.err').textContent = m; f.querySelector('input').setAttribute('aria-invalid', m ? 'true' : 'false'); });
  const nx = $('[data-go="+1"]'); if (nx) nx.disabled = (step === 0 && !S.mission) || X.stepErr(e, step);
}

// Focus across a redraw. A step change (go, hash change: force) moves focus to the new step heading; a redraw of the same step puts focus back on the
// control that had it (same id, same caret and selection) so typing and sliding survive; the very first draw never takes focus (the skip link stays first in the tab order).
let shown = null; // the step the stage shows now (null before the first draw)
function focusSnap() {
  const a = document.activeElement;
  if (!a || a === document.body || !stage.contains(a)) return null;
  const s = { id: a.id };
  try { s.s = a.selectionStart; s.e = a.selectionEnd; } catch { /* number inputs have no selection */ }
  return s;
}
function settle(snap, force) {
  const first = shown === null; shown = step;
  const a = document.activeElement;
  if (!force && a !== document.body && stage.contains(a) && a !== stage) return; // something inside already took focus (the custom-part form)
  const el = !force && snap?.id && document.getElementById(snap.id);
  if (el && stage.contains(el)) { el.focus({ preventScroll: true }); if (snap.s != null) try { el.setSelectionRange(snap.s, snap.e); } catch { /* not a text field */ } return; }
  if (force || (snap && !first)) $('#h')?.focus({ preventScroll: true });
}
function view(force) {
  const snap = focusSnap();
  draw();
  settle(snap, force);
}
function draw() {
  document.title = `${STEPS()[step]}${S.name ? ` - ${S.name}` : ''} - ${APP}`;
  shell.classList.toggle('wide', step === 3);
  if (step === 3) return viewResults();
  R = null;
  let body = '';
  if (step === 0) {
    body = `<h2 tabindex="-1" id="h">${stepTag()}${esc(tr('app.s0.title'))}</h2><p class="lede">${esc(tr('app.s0.lede'))}</p>
    <div class="fields"><div class="field"><label for="dname">${esc(tr('app.s0.name'))}</label><div class="inp"><input id="dname" type="text" maxlength="${NAME_MAX}" placeholder="${esc(tr('app.s0.namePh'))}" autocomplete="off" spellcheck="false" value="${esc(S.name)}" aria-describedby="h-dname"></div><span class="hint" id="h-dname">${esc(tr('app.s0.nameHint', { max: NAME_MAX }))}</span></div></div>
    <fieldset class="choices"><legend class="live">${esc(tr('app.s0.legend'))}</legend>${Object.entries(MISSIONS).map(([id, m]) =>
      `<div class="choice"><input type="radio" name="mission" id="m-${id}" value="${id}" ${S.mission === id ? 'checked' : ''}><label for="m-${id}"><span class="nm"><span>${esc(m.label).replace('/', '/<wbr>')}</span></span><small>${esc(m.note || '')}</small></label></div>`).join('')}</fieldset>`;
  } else if (step === 1) {
    const t = Number.isFinite(S.targetFlightMin) ? S.targetFlightMin : 20;
    body = `<h2 tabindex="-1" id="h">${stepTag()}${esc(tr('app.s1.title'))}</h2><p class="lede">${esc(tr('app.s1.lede'))}</p>
    <div class="fields t-fields"><div class="field full"><label for="range">${esc(tr('app.s1.target'))}</label>
    <input type="range" id="range" min="1" max="${LIM.targetFlightMin.max}" step="1" value="${Math.min(LIM.targetFlightMin.max, Math.max(1, t))}" data-sync="targetFlightMin" data-unit="min" aria-valuetext="${Math.min(LIM.targetFlightMin.max, Math.max(1, t))} min"><div class="ticks" aria-hidden="true"><span>1</span><span>30</span><span>60</span><span>120</span><span>${LIM.targetFlightMin.max} min</span></div></div>
    ${num('targetFlightMin', tr('app.s1.minutes'), S.targetFlightMin, 1, tr('app.between', { min: LIM.targetFlightMin.min, max: LIM.targetFlightMin.max }))}</div>`;
  } else {
    const src = C.CURRENCIES ? `${sel('cur', tr('app.s2.currency'), Object.entries(CUR).map(([k, c]) => [k, `${k} - ${c.name}`]), S.cur)}
      ${C.REGIONS ? sel('reg', tr('app.s2.country'), Object.entries(REG).map(([k, r]) => [k, r.name]), X.region(S), tr('app.s2.countryHint')) : ''}` : '';
    body = `<h2 tabindex="-1" id="h">${stepTag()}${esc(tr('app.s2.title'))}</h2><p class="lede">${esc(tr('app.s2.lede'))}</p>
    <fieldset class="grp"><legend>${esc(tr('app.s2.airframe'))}</legend>
      ${X.isFpv(S) ? fpvPicker() : cfgPicker()}
      <div class="fields">${num('payloadKg', tr('app.s2.payload'), X.payload(S), 0.05, tr('app.s2.payloadHint'))}
      ${sel('frameMaterial', tr('app.s2.material'), Object.entries(MATERIALS).map(([id, m]) => [id, m.label]), S.frameMaterial, matHint())}
      <ul class="cfg-warn mat-warn" id="mat-warn" aria-live="polite"></ul>
      <div class="field full">${matList()}</div></div>
    </fieldset>
    <fieldset class="grp"><legend>${esc(tr('app.s2.sourcing'))}</legend><div class="fields">${src}
      ${num('budget', tr('app.s2.budget'), S.budget, 'any', tr('app.s2.budgetHint'))}</div></fieldset>
    <fieldset class="grp env"><legend>${esc(tr('app.s2.env'))}</legend><div class="fields">
      ${num('altitudeM', tr('app.s2.altitude'), S.altitudeM, 50, tr('app.s2.altitudeHint'))}
      ${num('tempC', tr('app.s2.temp'), S.tempC, 1, tr('app.s2.tempHint'))}
      ${num('windMs', tr('app.s2.wind'), S.windMs, 0.5, tr('app.s2.windHint'))}</div></fieldset>
    <fieldset class="grp"><legend>${esc(tr('app.s2.battery'))}</legend><div class="fields t-fields"><div class="field full"><label for="ageRange">${esc(tr('app.s2.age'))}</label>
      <input type="range" id="ageRange" min="${AGE.min}" max="${AGE.max}" step="1" value="${Number.isFinite(S.age) ? S.age : 0}" data-sync="age" data-unit="%" aria-valuetext="${Number.isFinite(S.age) ? S.age : 0} %"><div class="ticks" aria-hidden="true"><span>0</span><span>10</span><span>20</span><span>30</span><span>${AGE.max} %</span></div></div>
      ${num('age', tr('app.s2.agePct'), S.age === '' ? 0 : S.age, 0.5, tr('app.s2.ageHint'))}</div></fieldset>`;
  }
  const last = step === 2;
  stage.innerHTML = `${rail()}<div class="phase p${step}">${body}<div class="nav">${step > 0 ? `<button type="button" class="btn" data-go="-1">${esc(tr('app.back'))}</button>` : ''}<button type="button" class="btn pri" data-go="+1" disabled>${esc(tr(last ? 'app.calculate' : 'app.next'))}</button></div></div>`;
  refresh(); renderPanel();
}

// The readout panel is not a live region (it redraws on every keystroke). Input handlers call sayReadout(): one polite summary a moment after the last change.
let readText = '', readTimer;
function sayReadout() { clearTimeout(readTimer); readTimer = setTimeout(() => announce(readText), 900); }
function renderPanel() {
  const r = X.run(S), cw = $('#cfg-warn');
  readText = '';
  if (cw) cw.innerHTML = X.cfgWarns(S, r).map((w) => `<li>${esc(w)}</li>`).join('');
  const mw = $('#mat-warn'); if (mw) mw.innerHTML = X.matWarns(S, r).map((w) => `<li>${esc(w)}</li>`).join('');
  const head = (x = '') => `<h2>${esc(tr('app.liveReadout'))}${S.name ? ` <small>${esc(S.name)}</small>` : ''}${x}</h2>`;
  if (!r) { panel.innerHTML = `${head()}<p class="idle">${esc(tr(S.mission ? 'app.idle.fix' : 'app.idle.pick'))}</p>`; return; }
  if (!r.ok) { readText = (r.errors || [])[0] || ''; panel.innerHTML = `${head()}<ul class="warns">${(r.errors || []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`; return; }
  const v = r.vtol, fw = r.fixedWing, kind = X.kindOf(r), min = X.minTwr(S, r), full = Math.max(4, (min || 0) * 1.5), twrPct = Math.min(100, (r.twr / full) * 100);
  const tp = Math.min(100, (r.estFlightMin / (S.targetFlightMin * 1.5)) * 100);
  const wm = fw?.motor || {}, span = fw || v;
  const motors = fw ? `<span>1x</span> <span>${esc(wm.statorMm ?? r.motorStatorMm)}</span> <small>${n(wm.kv ?? r.motorKv)} KV</small>`
    : `<span>${r.motorCount}x</span> <span>${esc(r.motorStatorMm)}</span> <small>${n(r.motorKv)} KV${kind === 'tiltrotor' ? esc(tr('app.panel.tilting')) : v?.pusher ? esc(tr('app.panel.pusher')) : ''}</small>`;
  const fc = X.fpvOf(S);
  readText = tr(r.meetsTarget ? 'app.readout.meets' : 'app.readout.misses', { mass: U.format('g', r.auwKg * 1000), time: n(r.estFlightMin, 1), twr: n(r.twr, 2), target: S.targetFlightMin });
  panel.innerHTML = `${head(fc ? ` <small>${esc(tr('perf.fpvMission', { label: fc.label }))}</small>` : '')}<dl class="rows">
    <div class="ro"><dt>${esc(tr('app.panel.mass'))}</dt><dd><span>${U.num('g', r.auwKg * 1000)}</span> <small>${U.label('g')}</small></dd></div>
    ${span ? `<div class="ro"><dt>${esc(tr('app.panel.spanProp'))}</dt><dd><span>${U.num('mm', span.wingspanMm)}</span> <small>${U.label('mm')}</small> <span>/</span> <span>${n(wm.propInch ?? r.propInch, 1)}</span> <small>in</small></dd></div>`
      : `<div class="ro"><dt>${esc(tr('app.panel.frameProp'))}</dt><dd><span>${U.num('mm', r.frameSizeMm)}</span> <small>${U.label('mm')}</small> <span>/</span> <span>${n(r.propInch, 1)}</span> <small>in</small></dd></div>`}
    <div class="ro"><dt>${esc(tr('app.panel.motors'))}</dt><dd>${motors}</dd></div>
    ${fw ? `<div class="ro lch"><dt>${esc(tr('app.panel.launch'))}</dt><dd><small>${esc(LAUNCH[fw.launch] || fw.launch || '-')}</small></dd></div>` : ''}
    <div class="ro"><dt>${esc(tr('app.panel.battery'))}</dt><dd><span>${r.batteryCells}S</span> <small>${n(r.batteryMah)} mAh</small></dd></div>
    <div class="ro"><dt>${esc(tr('app.panel.flight'))}</dt><dd><span>${n(r.estFlightMin, 1)}</span> <small>min</small></dd></div></dl>
    <div class="gauge ${min == null ? '' : r.twr < min ? 'bad' : 'good'}"><div class="lbl"><span>${esc(tr(fw ? 'app.panel.twrStatic' : 'app.panel.twr'))}</span><span>${n(r.twr, 2)}</span></div><div class="bar"><div class="fill" style="width:${twrPct}%"></div>${min != null ? `<div class="mark" style="left:${Math.min(98, (min / full) * 100)}%" title="${esc(tr('app.panel.min', { min }))}"></div>` : ''}</div></div>
    <div class="gauge ${r.meetsTarget ? 'good' : 'bad'}"><div class="lbl"><span>${esc(tr('app.panel.vsTarget', { n: S.targetFlightMin }))}</span><span>${esc(tr(r.meetsTarget ? 'app.panel.met' : 'app.panel.short'))}</span></div><div class="bar"><div class="fill" style="width:${tp}%"></div><div class="mark" style="left:${100 / 1.5}%"></div></div></div>
    ${r.warnings?.length ? `<ul class="warns">${X.warnsOf(S, r).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
}

function perfHtml(r) {
  if (!PERF.renderPerformance) return `<p class="fx">${esc(tr('app.perf.na'))}</p>`;
  // PERF adds the FPV class itself from result.fpvClass.
  try { return PERF.renderPerformance(r, { missionLabel: MISSIONS[S.mission].label }); } catch (e) { return `<p class="fx">${esc(tr('app.perf.failed', { message: e.message }))}</p>`; }
}

// Battery and current card (SPEC-v4 3); the C-rating flag comes from the compat batC check once a battery is picked.
function batHtml(r, chk) {
  const mt = X.minTwr(S, r), bp = X.bestPack(r, mt), pt = bp && X.packText(bp, mt, r), f = chk.find((c) => c.id === 'batC' && c.level !== 'pass');
  const d = (l, v, u, g, cls) => `<div${cls ? ` class="${cls}"` : ''}><dt>${esc(l)}${g ? gl(g) : ''}</dt><dd>${v}${u ? `<small>${u}</small>` : ''}</dd></div>`, b = r.battery, fwg = !!r.fixedWing;
  return `<h3 id="h-bat"><em>PWR</em>${esc(tr('app.bat.title'))}</h3><dl class="bat">
    ${d(tr('app.bat.required'), n(r.peakCurrentA), esc(tr('app.bat.aPeak')))}${d(tr('app.bat.cRating'), `${esc(r.batteryCRating)}C`, esc(tr('app.bat.orMore')), 'c')}
    ${d(tr('app.bat.esc'), `${n(r.escContinuousA)} A`, esc(tr('app.bat.burst', { n: n(r.escBurstA) })))}${d(tr('app.bat.chem'), `${esc(CHEM[r.batteryChemistry] || r.batteryChemistry || '-')} ${esc(r.batteryCells)}S`, '', 'cells')}
    ${d(tr('app.bat.battery'), `${n(r.batteryWh)} Wh`, `${n(r.batteryMah)} mAh`, 'wh')}
    ${b ? `${d(tr(fwg ? 'app.bat.cruiseV' : 'app.bat.hoverV'), n(b.hoverCellV, 2), esc(tr('app.bat.vcell', { pack: n(b.hoverPackV, 1), amps: n(b.hoverA, 1) })))}${d(tr('app.bat.fullV'), n(b.maxCellV, 2), esc(tr('app.bat.vcell', { pack: n(b.maxPackV, 1), amps: n(b.maxA) })))}
    ${d(tr('app.bat.resistance'), n(b.packMOhm, 1), esc(tr('app.bat.estimate')))}${b.capacityFactor < 1 ? d(tr('app.bat.usable'), n(b.capacityFactor * 100), esc(tr('app.bat.derate'))) : ''}` : ''}
    ${pt ? d(tr('app.bat.best'), esc(pt.value), esc(pt.more), '', 'bat-best') : ''}</dl>
    ${f ? `<p class="bat-flag" data-lvl="${f.level === 'fail' ? 'bad' : 'warn'}">${esc(f.text)}</p>` : ''}
    ${(b?.warnings || []).map((w) => `<p class="bat-flag" data-lvl="warn">${esc(U.text(w))}</p>`).join('')}${b ? haHtml(b, fwg) : ''}`;
}
// Hover calibration (F2): measured hover current. Applied on change like the measured weight; the model's sag, resistance and cold figures are estimates.
function haHtml(b, fwg) {
  const c = b.calibration;
  return `<div class="field ha"><label for="ha">${esc(tr(fwg ? 'app.ha.labelCruise' : 'app.ha.labelHover'))}</label><div class="inp"><input id="ha" type="number" inputmode="decimal" min="${HA.min}" max="${HA.max}" step="0.1" value="${haOf(S.ha) ?? ''}" aria-describedby="u-ha e-ha h-ha"><span class="u" id="u-ha">A</span></div>
    <span class="hint" id="h-ha">${c?.source === 'curve' ? esc(tr('app.ha.curve', { measured: n(c.measuredA, 1), predicted: n(c.predictedA, 1), factor: n(c.factor, 2) })) : c ? tf('app.ha.cal', { predicted: n(c.predictedA, 1), measured: n(c.measuredA, 1), factor: n(c.factor, 2) }, { btn: `<button type="button" class="btn sm" data-act="haclear">${esc(tr('app.clear'))}</button>` })
      : esc(tr(fwg ? 'app.ha.hintCruise' : 'app.ha.hintHover'))}</span><span class="err" id="e-ha" role="alert"></span></div>`;
}
// Measured weight field (SPEC-v4 1). Applied on change, so typing never re-renders the page under the cursor.
function mwHtml() {
  const on = !!R.r.measuredG, err = R.mwErr;
  return `<div class="field mw${err ? ' bad' : ''}"><label for="mw">${esc(tr('app.mw.label'))}</label><div class="inp"><input id="mw" type="number" inputmode="decimal" min="${U.input('g', MW.min)}" max="${U.input('g', MW.max)}" step="${U.step('g', 1)}" value="${U.input('g', mwOf(S.mw)) ?? ''}" aria-describedby="u-mw e-mw h-mw" aria-invalid="${!!err}"><span class="u" id="u-mw">${U.label('g')}</span></div>
    <span class="hint" id="h-mw">${on ? tf('app.mw.using', { measured: U.format('g', R.r.measuredG), estimate: U.format('g', R.r.estG) }, { btn: `<button type="button" class="btn sm" data-act="mwclear">${esc(tr('app.mw.useEstimate'))}</button>` })
      : esc(tr('app.mw.hint'))}</span><span class="err" id="e-mw" role="alert">${esc(err)}</span></div>`;
}

function viewResults() {
  const r0 = X.run(S);
  if (!r0 || !r0.ok) {
    const r = r0;
    R = null;
    const fe = X.errs(S);
    const items = !S.mission ? [`<li>${esc(tr('app.res.pickFirst'))} <button type="button" class="lnk" data-go="0">${esc(tr('app.res.goMission'))}</button></li>`]
      : Object.keys(fe).length ? Object.entries(fe).map(([k, m]) => `<li>${esc(m)} <button type="button" class="lnk" data-fix="${k}">${esc(tr('app.res.fix', { field: FIELD[k][0] }))}</button></li>`)
      : ((r && r.errors) || []).map((x) => `<li>${esc(x)} <button type="button" class="lnk" data-go="2">${esc(tr('app.res.review'))}</button></li>`);
    stage.innerHTML = `${rail()}<div class="phase"><h2 tabindex="-1" id="h">${stepTag()}${esc(tr('app.res.cannot'))}</h2><p class="lede">${esc(tr('app.res.cannotLede'))}</p><ul class="rwarns">${items.join('')}</ul><div class="nav"><button type="button" class="btn" data-go="-1">${esc(tr('app.back'))}</button></div></div>`;
    return;
  }
  R = X.results(S, r0);
  if (missingCustom) R.note = [R.note, CUSM.missingNote(missingCustom)].filter(Boolean).join(' '); // shown by partsHtml, escaped there
  const r = R.r; // the measured result when a valid measured weight is set (SPEC-v4 1), else the estimate
  const k = (l, v, u, o = {}) => `<div class="kpi"${o.band ? ` data-band="${o.band[0]}"` : ''}><dt>${esc(l)}${o.gl ? gl(o.gl) : ''}</dt><dd>${v}<small>${esc(u)}</small>${o.sub ? `<span class="kpi-2">${esc(o.sub)}</span>` : ''}${o.band ? `<span class="why">${esc(o.band[1])}</span>` : ''}</dd></div>`;
  const fc = X.fpvOf(S), v = r.vtol, fw = r.fixedWing, w = fw || v, tl = v?.tilt, wc = X.wclassOf(R);
  const sub = [fc ? tr('perf.fpvMission', { label: fc.label }) : MISSIONS[S.mission].label, X.cfgLabel(X.cfgOf(S)), MATERIALS[S.frameMaterial]?.label, tr('app.res.payload', { value: U.show('kg', X.payload(S)) }), `${S.cur}, ${X.regName(R.reg)}`,
    r.measuredG ? tr('app.res.measured', { value: U.format('g', r.measuredG) }) : ''].filter(Boolean);
  // KPIs by airframe kind: a wing shows cruise throttle and power, winged types add span and L:D, a tiltrotor its transition.
  const kpis = [k(tr('app.kpi.flight'), n(r.estFlightMin, 1), 'min'), k(tr('app.kpi.range'), U.num('km', r.rangeKm, 1), U.label('km')), k(tr(r.measuredG ? 'app.kpi.massMeasured' : 'app.kpi.mass'), U.num('kg', r.auwKg, 2), U.label('kg')),
    k(tr('app.kpi.twr'), n(r.twr, 2), fw ? tr('app.kpi.static') : ':1', { gl: 'twr', sub: tr(r.measuredCurve ? 'app.kpi.measuredCurve' : 'app.kpi.modelled') }),
    // A wing has no hover: the engine's hover fields hold level-cruise throttle and power there, so no hover band.
    // Hovering types lead with the thrust share (what the 45-50% advice means); the engine's throttle is the second line.
    fw ? k(tr('app.kpi.cruiseThrottle'), n(r.hoverThrottlePct), '%') : k(tr('app.kpi.hoverThrust'), n(100 / r.twr), '%', { gl: 'hover', sub: tr('app.kpi.throttle', { n: n(r.hoverThrottlePct) }), band: hoverBand(r.twr, X.minTwr(S, r)) }), k(tr(fw ? 'app.kpi.cruisePower' : 'app.kpi.hoverPower'), n(r.hoverPowerW), 'W'),
    ...(w ? [k(tr('app.kpi.wingspan'), U.num('m', w.wingspanMm / 1000, 2), U.label('m')), k(tr('app.kpi.liftDrag'), n(w.liftToDrag, 1), ''), k(tr('app.kpi.stall'), U.num('ms', w.stallMs, 1), `/ ${U.num('ms', w.cruiseMs, 1)} ${U.label('ms')}`)] : []),
    ...(fw ? [k(tr('app.kpi.wingLoading'), U.num('gdm2', fw.wingLoadingGdm2), U.label('gdm2')), k(tr('app.kpi.launch'), launchWord(fw.launch), r.measuredG && Math.round(r.measuredG) !== Math.round(r.estG) ? tr('app.kpi.atEst') : '')] : []),
    ...(tl ? [k(tr('app.kpi.transition'), n(tl.tiltTimeS, 1), tr('app.kpi.tilt', { n: n(tl.transitionAngleDeg) }))] : []),
    k(tr('app.kpi.battery'), n(r.batteryWh), `Wh ${r.batteryCells}S`, { gl: 'wh' }), k(tr('app.kpi.peak'), n(r.peakCurrentA), 'A')];
  stage.innerHTML = `${rail()}
  <div class="res-head"><div><h2 tabindex="-1" id="h">${stepTag()}${esc(S.name ? tr('app.res.titleNamed', { name: S.name }) : tr('app.res.title'))}</h2><p class="res-sub">${sub.map(esc).join(' &middot; ')}</p></div>
  <div class="res-st"><span class="verdict ${r.meetsTarget ? 'ok' : 'no'}">${esc(tr(r.meetsTarget ? 'app.res.meets' : 'app.res.misses', { n: S.targetFlightMin }))}</span>
  ${wc ? ` <span class="wclass" data-lvl="${esc(wc.lvl)}">${esc(wc.label)}</span><small class="wclass-n">${esc(wc.note)}</small>` : ''}</div></div>
  <dl class="kpis">${kpis.join('')}</dl>
  ${r.warnings?.length ? `<ul class="rwarns">${X.warnsOf(S, r).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  <div class="res-grid">
    <section class="sec s-perf" aria-labelledby="h-perf"><h3 id="h-perf"><em>FIG</em>${esc(tr('app.sec.performance'))}</h3><div id="perf">${perfHtml(r)}</div></section>
    <div class="col-parts">
      <section class="sec s-bat" id="s-bat" aria-labelledby="h-bat"></section>
      ${MEASM.mountMeasured ?'<section class="sec s-meas noprint" id="s-meas" aria-labelledby="h-meas"></section>' : ''}
      <section class="sec s-parts" aria-labelledby="h-parts"><h3 id="h-parts"><em>PARTS</em>${esc(tr('app.sec.components'))}</h3>
        <div class="actions noprint"><button class="btn sm" type="button" data-act="copy">${esc(tr('app.act.copy'))}</button><button class="btn sm" type="button" data-act="print">${esc(tr('app.act.print'))}</button><button class="btn sm" type="button" data-act="link">${esc(tr('app.act.link'))}</button>${LIB ? `<button class="btn sm" type="button" data-act="save">${esc(tr('app.act.save'))}</button>` : ''}<button class="btn sm" type="button" data-act="export">${esc(tr('app.act.export'))}</button><span class="live" role="status" id="cpmsg"></span></div>
        <div id="parts">${partsHtml(ctx())}</div>
        ${CUS ? '<div id="custom" class="noprint"></div>' : ''}
        ${wiringHtml(wiringRows(r, S.mission))}</section>
      ${CHK.checklist ? `<details class="sec checklist"><summary>${esc(tr('app.sec.checklist'))}</summary><ol class="cl">${CHK.checklist(r, S).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>` : ''}
      <section class="sec s-bom" id="bom" tabindex="-1" aria-labelledby="h-bom"><h3 id="h-bom"><em>BOM</em>${esc(tr('app.sec.bom'))}</h3>
        <div id="bom-body"></div>
        ${mwHtml()}
        <div class="actions noprint"><button type="button" class="btn sm pri" data-act="pdf">${esc(tr('app.act.pdf'))}</button><button type="button" class="btn sm" data-act="csv">${esc(tr('app.act.csv'))}</button><button type="button" class="btn sm" data-act="clear">${esc(tr('app.clear'))}</button><span class="pdf-msg" role="status"></span></div></section>
      ${CHK.compat ? `<section class="sec s-chk" aria-labelledby="h-chk"><h3 id="h-chk"><em>CHK</em>${esc(tr('app.sec.compat'))}</h3><div id="chk-body"></div></section>` : ''}
    </div>
    <aside class="dock" id="dock" aria-label="${esc(tr('app.dock.aria'))}">
      <div class="dock-top"><button type="button" class="dock-tog" aria-expanded="false" aria-controls="dock-body"><span class="dock-t">BOM</span><span class="dock-n"></span><b class="dock-sum"></b>${CHEV}</button>
        <h3 class="dock-h">${esc(tr('app.dock.title'))}</h3><button type="button" class="btn sm pri" data-act="pdf">${esc(tr('app.act.pdf'))}</button></div>
      <div class="dock-body" id="dock-body"><div class="dock-live"></div>
        <div class="dock-act"><a class="btn sm" href="#bom">${esc(tr('app.dock.full'))}</a><button type="button" class="btn sm" data-act="clear">${esc(tr('app.clear'))}</button></div>
        <p class="pdf-msg"></p></div>
    </aside>
  </div>
  <div class="nav"><button type="button" class="btn" data-go="-1">${esc(tr('app.editAnswers'))}</button><button type="button" class="btn" data-act="reset">${esc(tr('app.startOver'))}</button></div>`;
  renderBom();
  measApi = MEASM.mountMeasured?.($('#s-meas'), { say: announce, CRV, state: () => S, result: () => R?.r, setCurve: (id) => { S.mc = id; save(); view(); }, setHa: (a) => { S.ha = a; save(); view(); } }) || null;
  try { PERF.bindPerformance?.($('#perf')); } catch { /* figures stay static without interaction */ }
  if (CUS) CUSM.mountCustom($('#custom'), CUS, { onChange: customChanged, money }); // last: it may move focus to its own message
}

function renderBom() {
  const rows = bomRows(), c = ctx(), chk = X.compatOf(R, rows), ms = X.massOf(R, rows), estG = R.est.auwKg * 1000, total = rows.reduce((a, x) => a + x.line, 0);
  // Parts mass vs the estimate (not the measured weight): >10% apart means a guess in the model or a part to recheck.
  // Categories this build needs: an ESC only when the picked (else best) motor has none built in.
  const need = R.sec.main.filter((k) => !(k === 'esc' && c.escFree)), got = need.filter((k) => rows.some((x) => x.key === k)).length;
  const mass = ms ? `<p class="mass" data-lvl="${Math.abs(ms.totalG - estG) > 0.1 * estG ? 'warn' : 'ok'}">${esc(tr('app.bom.mass', { parts: U.format('g', ms.partsG), allowance: U.format('g', ms.allowanceG), total: U.format('g', ms.totalG), est: U.format('g', estG) }))}${got < need.length ? esc(tr('app.bom.picked', { got, need: need.length })) : ''}</p>` : '';
  const cost = Number.isFinite(R.r.estCostUsd) ? `<p class="cost">${esc(rows.length ? tr('app.bom.costVs', { cost: money(R.r.estCostUsd), bom: money(total) }) : tr('app.bom.cost', { cost: money(R.r.estCostUsd) }))}</p>` : '';
  $('#bom-body').innerHTML = bomHtml(rows, c) + mass + cost;
  const cb = $('#chk-body');
  if (cb) cb.innerHTML = !rows.length ? `<p class="empty">${esc(tr('app.chk.select'))}</p>`
    : chk.length ? `<ul class="checks">${chk.map((x) => `<li class="chk" data-lvl="${esc(x.level)}"><b>${esc(X.LVL[x.level] || x.level)}</b> ${esc(x.text)}</li>`).join('')}</ul>`
      : `<p class="empty">${esc(tr('app.chk.none'))}</p>`;
  $('#s-bat').innerHTML = batHtml(R.r, chk);
  const wi = $('#wiring'); if (wi) wi.outerHTML = wiringHtml(wiringRows(R.r, S.mission, rows.find((x) => x.key === 'battery')?.it));
  // The ESC section follows the picked motor: redraw it when its built-in-ESC state or motor changes.
  const ek = c.escFree ? c.motor.id : '', ce = $('#cat-esc');
  if (ce && R.escKey !== undefined && R.escKey !== ek) { ce.outerHTML = section('esc', c); paint('esc'); }
  R.escKey = ek;
  $('.dock-live').innerHTML = dockHtml(rows, c);
  $('.dock-n').textContent = tr('app.dock.selected', { n: rows.length });
  $('.dock-sum').textContent = money(total);
}
function paint(cat) {
  stage.querySelectorAll('.sel').forEach((b) => {
    if (cat && b.dataset.cat !== cat) return;
    const on = S.sel[b.dataset.cat] === b.dataset.id;
    b.setAttribute('aria-pressed', on); b.closest('.it,.opt')?.classList.toggle('on', on);
  });
}
// Collapse the mobile drawer so the picked card stays visible.
function closeDock() { $('#dock')?.classList.remove('open'); $('.dock-tog')?.setAttribute('aria-expanded', 'false'); }
// One part per category; pressing the selected one again deselects it.
function toggleSel(cat, id) {
  const on = S.sel[cat] !== id;
  if (on) S.sel[cat] = id; else delete S.sel[cat];
  save(); paint(cat); renderBom(); closeDock();
  announce(tr(on ? 'app.sel.selected' : 'app.sel.removed', { name: X.pick(R, cat, id)?.name || tr('app.sel.part'), total: $('.dock-sum').textContent }));
}

// Custom parts changed (added, edited, deleted): drop picks of parts that are gone, re-match with the new list, redraw.
const customChanged = () => { CUSM.pruneSel(S, C.CUSTOM); save(); view(); };
const say = (m) => stage.querySelectorAll('.pdf-msg').forEach((x) => (x.textContent = m));
async function exportPdf() {
  const P = await PDF;
  if (!P.buildBomPdf) return say(tr('app.pdf.na'));
  try {
    const name = pdfName(S, label());
    P.downloadPdf(P.buildBomPdf(X.pdfDoc(R, S, today())), name);
    say(tr('io.saved', { name }));
  } catch (e) { say(tr('app.pdf.failed', { message: e?.message || e })); }
}
// Same Blob + a[download] path as pdf.js downloadPdf.
function exportCsv() {
  try {
    const name = csvName(S, label()), url = URL.createObjectURL(new Blob([bomCsv(bomRows(), ctx())], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // revoke later: some browsers read the blob after click() returns
    say(tr('io.saved', { name }));
  } catch (e) { say(tr('app.csv.failed', { message: e?.message || e })); }
}
// Print: the browser's Save-as-PDF suggests document.title, so name it after the build while on the results page (covers Ctrl+P too).
let preTitle = null;
addEventListener('beforeprint', () => { if (R) { preTitle = document.title; document.title = `${fileBase(S, label())}-Parts-List`; } });
addEventListener('afterprint', () => { if (preTitle != null) { document.title = preTitle; preTitle = null; } });

const clip = async (id, text, ok) => { const m = $('#cpmsg'), b = $(`[data-act="${id}"]`); try { await navigator.clipboard.writeText(text); m.textContent = b.textContent = ok; } catch { m.textContent = b.textContent = tr('app.copyFailed'); } };
const SHARE_BASE = 'https://shakthisharavan.github.io/DroneCalc_System/';
const ACT = {
  copy: () => clip('copy', copyText(bomRows(), ctx()), tr('app.copied')),
  // The desktop app serves app://dronecalc/, which nobody else can open, so share the public site with the same hash.
  link: () => clip('link', /^https?:$/.test(location.protocol) ? location.href : SHARE_BASE + location.hash, tr('app.linkCopied')), // the whole build lives in the URL hash
  print: () => print(),
  reset: () => { ({ S } = X.parse('')); go(0); },
  clear: () => { S.sel = {}; save(); paint(); renderBom(); closeDock(); announce(tr('app.bomCleared')); },
  pdf: exportPdf,
  csv: exportCsv,
  save: () => {
    const s = LIB.save(S, label()), b = $('[data-act="save"]');
    $('#cpmsg').textContent = b.textContent = !s.ok ? tr('io.storage') : s.dropped ? tr('app.saved.dropped', { max: LIBM.LIB_MAX ?? 20 }) : tr('app.saved.ok');
    if (!libEl.hidden) renderLib();
  },
  mwclear: () => { S.mw = ''; save(); view(); $('#mw')?.focus(); },
  haclear: () => { S.ha = ''; save(); view(); $('#ha')?.focus(); },
  export: () => IOA.exportCurrent(),
};

function go(i) {
  if (i > 0 && !S.mission) return;
  step = Math.max(0, Math.min(3, i)); save(true); view(true); window.scrollTo(0, 0);
}

// ---- events (delegated; step content is re-rendered, panel updates in place)
stage.addEventListener('click', (e) => {
  const t = e.target;
  const fx = t.closest('[data-fix]');
  if (fx) { go(FIELD[fx.dataset.fix][2]); $('#' + fx.dataset.fix)?.focus(); return; }
  const s = t.closest('.sel'); if (s) return toggleSel(s.dataset.cat, s.dataset.id);
  const a = t.closest('[data-act]'); if (a) return ACT[a.dataset.act]?.();
  const tg = t.closest('.dock-tog');
  if (tg) { const open = tg.getAttribute('aria-expanded') !== 'true'; tg.setAttribute('aria-expanded', open); $('#dock').classList.toggle('open', open); return; }
  const b = t.closest('[data-go]'); if (!b || b.disabled) return;
  const d = b.dataset.go; go(d[0] === '+' || d[0] === '-' ? step + Number(d) : Number(d));
});
// In-page anchors (skip link, dock jumps) would overwrite the state hash: scroll and focus instead.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]'), el = a && document.getElementById(a.getAttribute('href').slice(1));
  if (!el) return;
  e.preventDefault(); el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true });
  if (a.closest('.dock')) { $('#dock').classList.remove('open'); $('.dock-tog').setAttribute('aria-expanded', 'false'); }
});
function setVal(k, raw) {
  if (NUM.has(k)) { if (raw === '') S[k] = ''; else { const v = X.QF[k] ? U.parse(X.QF[k], raw) : Number(raw); if (!Number.isFinite(v)) return; S[k] = k === 'age' ? Math.round(v * 10) / 10 : v; } } else S[k] = raw; // age fade: one decimal, like its hash codec
  save(); refresh(); renderPanel(); sayReadout();
}
function setCur(c) {
  S.budget = X.convertBudget(S.budget, S.cur, c); S.cur = c;
  const b = $('#budget');
  if (b) { b.value = Number.isFinite(S.budget) ? S.budget : ''; b.max = lim('budget').max; b.closest('.inp').querySelector('.u').textContent = c; }
  if (!S.reg && $('#reg')) $('#reg').value = X.region(S);
  save(); refresh(); renderPanel(); sayReadout();
}
// A slider reads "24 min", not "24": aria-valuetext follows the value.
const vtext = (el) => el.setAttribute('aria-valuetext', `${el.value} ${el.dataset.unit}`);
stage.addEventListener('input', (e) => {
  const t = e.target;
  // A different airframe is a different build: its picks, measured weight and hover calibration no longer apply.
  if (t.name === 'mission') { S.mission = t.value; S.payloadKg = null; S.targetFlightMin = X.defMin(t.value, S.fpvClass); S.sel = {}; S.mw = ''; S.ha = ''; S.mc = ''; save(); railState(); refresh(); renderPanel(); sayReadout(); return; }
  if (t.name === 'configuration') { S.sel = {}; S.mw = ''; S.ha = ''; S.mc = ''; return setVal('configuration', t.value); }
  if (t.name === 'fpvClass') {
    // A new size resets the flight time to its default (SPEC-v3 4); a default payload follows the class too.
    S.fpvClass = t.value; S.targetFlightMin = X.defMin('fpv', t.value); S.sel = {}; S.mw = ''; S.ha = ''; S.mc = '';
    const p = $('#payloadKg'); if (p && S.payloadKg == null) p.value = U.input('kg', X.payload(S));
    $('#fpv-msg').textContent = tr('app.fpv.set', { label: X.FPV[t.value].label, n: S.targetFlightMin });
    save(); refresh(); renderPanel(); sayReadout(); return;
  }
  if (t.id === 'dname') { S.name = cleanName(t.value); save(); renderPanel(); return; }
  if (t.id === 'cur') return setCur(t.value);
  if (t.id === 'reg') { S.reg = t.value; save(); return; }
  if (t.dataset.sync) { $('#' + t.dataset.sync).value = t.value; setVal(t.dataset.sync, t.value); vtext(t); return; }
  if (t.dataset.k) {
    setVal(t.dataset.k, t.value);
    if (t.dataset.k === 'age' && $('#ageRange')) { $('#ageRange').value = Math.min(AGE.max, Math.max(AGE.min, Number(t.value) || 0)); vtext($('#ageRange')); }
    if (t.dataset.k === 'targetFlightMin' && $('#range')) { $('#range').value = Math.min(LIM.targetFlightMin.max, Number(t.value) || 1); vtext($('#range')); }
    if (t.dataset.k === 'frameMaterial') $('#h-frameMaterial').textContent = matHint();
  }
});
// Measured weight applies on change (blur, Enter, spinner). Bad text shows the field error and leaves the applied value alone.
stage.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id !== 'mw') return;
  // More than 2 decimals is rounded, not refused: grams to 0.01 g is already finer than any scale.
  // Typed in the display unit: convert to grams first (to 2 decimals, the stored precision), then the same checks as before.
  const typed = t.value.trim(), raw = typed && U.isImperial() && Number.isFinite(Number(typed)) ? String(Math.round(U.parse('g', typed) * 100) / 100) : typed;
  const v = mwOf(/^\d{1,6}\.\d{3,}$/.test(raw) ? String(Math.round(Number(raw) * 100) / 100) : raw);
  if (raw && v == null) {
    t.closest('.field').classList.add('bad'); t.setAttribute('aria-invalid', 'true');
    $('#e-mw').textContent = tr('app.mw.range', { min: U.input('g', MW.min).toLocaleString('en-US'), max: U.input('g', MW.max).toLocaleString('en-US'), unit: U.label('g') }); return;
  }
  S.mw = raw ? v : ''; save(); view(); $('#mw')?.focus();
});
// Measured hover current (F2), same pattern: bad text shows the field error and leaves the applied value alone; more than 2 decimals is rounded.
stage.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id !== 'ha') return;
  const raw = t.value.trim(), v = haOf(/^\d{1,3}\.\d{3,}$/.test(raw) ? String(Math.round(Number(raw) * 100) / 100) : raw);
  if (raw && v == null) { t.setAttribute('aria-invalid', 'true'); $('#e-ha').textContent = tr('app.ha.range', { min: HA.min, max: HA.max }); return; }
  S.ha = raw ? v : ''; save(); view(); $('#ha')?.focus();
});
// Escape closes the open drawer (My builds first, then the BOM dock) and returns focus to its toggle.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const g = document.querySelector('details.gl[open]');
  if (g) { g.open = false; g.querySelector('summary').focus(); return; } // the innermost layer first: a glossary note
  if (libEl && !libEl.hidden) return closeLib(true);
  if (!$('#dock')?.classList.contains('open')) return;
  closeDock(); $('.dock-tog').focus();
});

// One glossary note open at a time ('toggle' does not bubble: capture it).
document.addEventListener('toggle', (e) => {
  if (e.target.matches?.('details.gl') && e.target.open) document.querySelectorAll('details.gl[open]').forEach((d) => d !== e.target && (d.open = false));
}, true);

// ---- My builds drawer (SPEC-v4 7)
const libEl = $('#lib'), libTog = $('.lib-tog'), lib = { cmp: new Set(), confirm: null, edit: null };
function renderLib(focus) {
  const items = LIB.list(), ids = new Set(items.map((b) => b.id));
  lib.cmp.forEach((id) => ids.has(id) || lib.cmp.delete(id));
  const cols = items.filter((b) => lib.cmp.has(b.id)).map((b) => { try { return LIBM.compareRow(X, CHK, b); } catch { return { name: b.name, bad: true }; } });
  libEl.innerHTML = LIBM.libHtml(items, lib, cols) + ioHtml(items.length);
  if (focus) (libEl.querySelector(focus) || $('#lib-h'))?.focus();
}
// The drawer is a modal dialog (role and aria-modal in index.html): while it is open the page behind is inert, Tab stays inside, Escape and Close return focus to My builds.
const BEHIND = ['.mast', '#shell', '.foot'];
const setBehind = (on) => BEHIND.forEach((s) => { const el = $(s); if (el) el.inert = on; });
function closeLib(back) { libEl.hidden = true; setBehind(false); libTog.setAttribute('aria-expanded', 'false'); lib.edit = lib.confirm = null; if (back) libTog.focus(); }
const libSay = announce; // the drawer's messages go through the one polite region (no second one to double up)
const tabbable = () => [...libEl.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([hidden]),select,textarea,[tabindex="0"]')].filter((el) => el.offsetParent !== null || el === document.activeElement);
function trapTab(e) {
  if (e.key !== 'Tab') return;
  const t = tabbable(), a = document.activeElement;
  if (!t.length) { e.preventDefault(); return $('#lib-h').focus(); }
  if (e.shiftKey && (a === t[0] || a === $('#lib-h'))) { e.preventDefault(); t[t.length - 1].focus(); }
  else if (!e.shiftKey && a === t[t.length - 1]) { e.preventDefault(); t[0].focus(); }
}
function commitRename(id) { LIB.rename(id, libEl.querySelector('.lib-in')?.value); lib.edit = null; renderLib(`[data-lib="rename"][data-id="${CSS.escape(id)}"]`); libSay(tr('app.lib.renamed')); }
if (!(LIB && libEl)) libTog?.remove(); // no library module: no dead button (CSS display beats the hidden attribute here)
else if (libTog) {
  libTog.addEventListener('click', () => {
    if (!libEl.hidden) return closeLib(true);
    libEl.hidden = false; setBehind(true); libTog.setAttribute('aria-expanded', 'true'); renderLib('#lib-h');
  });
  libEl.addEventListener('keydown', trapTab);
  libEl.addEventListener('click', (e) => {
    if (e.target.closest('.lib-list a')) return closeLib(false); // the link opens the build through its hash
    const b = e.target.closest('[data-lib]'); if (!b) return;
    const id = b.dataset.id, act = b.dataset.lib, me = `[data-lib="${act}"][data-id="${CSS.escape(id || '')}"]`;
    if (act === 'close') return closeLib(true);
    if (act !== 'delete') lib.confirm = null;
    if (act === 'rename') { if (lib.edit === id) return commitRename(id); lib.edit = id; return renderLib('.lib-in'); }
    if (act === 'delete') {
      if (lib.confirm !== id) { lib.confirm = id; renderLib(me); return libSay(tr('app.lib.confirm')); }
      LIB.remove(id); lib.confirm = null; lib.cmp.delete(id); renderLib('#lib-h'); return libSay(tr('app.lib.deleted'));
    }
    if (act === 'cmp') {
      if (lib.cmp.has(id)) lib.cmp.delete(id); else if (lib.cmp.size < 3) lib.cmp.add(id);
      renderLib(me); libSay(lib.cmp.size > 1 ? tr('app.lib.comparing', { n: lib.cmp.size }) : lib.cmp.size ? tr('app.lib.chosen') : tr('app.lib.cleared'));
    }
  });
  libEl.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('lib-in')) return;
    if (e.key === 'Enter') { e.preventDefault(); commitRename(e.target.dataset.id); }
    if (e.key === 'Escape') { e.stopPropagation(); const id = lib.edit; lib.edit = null; renderLib(`[data-lib="rename"][data-id="${CSS.escape(id)}"]`); }
  });
}

// ---- build files (F3): export the build as .json; import by button in My builds or by dropping a file. A single build opens, several join My builds.
const IOA = mountIO({ X, LIB, libEl, state: () => S, label, date: today, csv: async (f) => { if (!R || !measApi) return IOA.say(tr('app.csvNeedsResults')); IOA.say(await measApi.importCsv(f)); }, open: (h) => { closeLib(false); location.hash = h; }, changed: () => { if (!libEl.hidden) renderLib('[data-io="import"]'); } });

// ---- theme toggle (SPEC-v4 11): aria-pressed = dark is showing
const themeTog = $('.theme-tog');
const paintTheme = () => themeTog?.setAttribute('aria-pressed', String(isDark()));
themeTog?.addEventListener('click', () => {
  const t = isDark() ? 'light' : 'dark';
  root.dataset.theme = t; paintTheme();
  try { localStorage.setItem(THEME, t); } catch { /* storage unavailable: the choice lasts this visit */ }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', paintTheme);
paintTheme();
// ---- units toggle: a pair of buttons (aria-pressed), metric | imperial. Re-renders from the unchanged SI state; focus stays on the pressed button.
const unitBtns = [...document.querySelectorAll('.unit-tog [data-u]')];
const paintUnits = () => unitBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.u === U.get())));
unitBtns.forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.u === U.get()) return;
  U.set(b.dataset.u); U.save(b.dataset.u); paintUnits();
  view(); // every figure, field and hint is built from the display units
  if (!libEl.hidden) renderLib();
  b.focus();
}));
paintUnits();
// ---- language: static page text (data-i18n = text, data-i18n-attr = "attr:key;attr:key"), the CSS warning words, and the selector (option labels in their own language)
const langSel = $('#lang');
function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => el.dataset.i18nAttr.split(';').forEach((p) => { const [at, key] = p.split(':'); if (at && key) el.setAttribute(at, tr(key)); }));
  root.style.setProperty('--w-caution', JSON.stringify(`${tr('app.caution')} `)); root.style.setProperty('--w-check', JSON.stringify(`${tr('app.check')} `)); // ::before words in main.css
  if (langSel) langSel.value = getLang();
}
if (langSel) {
  langSel.replaceChildren(...LANGS.map((c) => Object.assign(document.createElement('option'), { value: c, lang: c, textContent: LANG_NAMES[c] })));
  langSel.addEventListener('change', async () => {
    const c = langSel.value;
    await setLang(c); saveLang(c); applyStatic();
    view(); // the whole page is built from the unchanged state through t(), so nothing is lost
    if (!libEl.hidden) renderLib();
  });
}
applyStatic();
function launchWord(id) { return ['hand', 'bungee', 'runway'].includes(id) ? tr(`perf.launch.${id}`) : String(id || '-').replace(/^./, (c) => c.toUpperCase()); }
function railState() { stage.querySelectorAll('.rail button').forEach((b, i) => { if (i) b.disabled = !S.mission; }); }
addEventListener('hashchange', () => { load(); view(true); });

load(); save(); view();

// Update prompt: a new worker waits while the old one controls this page. Reload only when asked (an edit may be in progress; the build lives in the URL hash and storage),
// then tell the worker to skip waiting so a fix lands now instead of after every tab has closed. No controller = first install, not an update.
function offerUpdate(w) {
  if (!navigator.serviceWorker.controller || $('#upd')) return;
  const box = Object.assign(document.createElement('div'), { id: 'upd', className: 'noprint' }), b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn sm pri', textContent: tr('app.update') });
  box.setAttribute('role', 'status'); $('.mast').append(box);
  b.addEventListener('click', () => { b.disabled = true; navigator.serviceWorker.addEventListener('controllerchange', () => location.reload()); w.postMessage({ type: 'SKIP_WAITING' }); });
  setTimeout(() => box.append(b), 100); // a live region announces content added after it exists
}
const watchUpdates = (reg) => {
  if (reg.waiting) offerUpdate(reg.waiting);
  reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed') offerUpdate(w); }); });
};

// Offline PWA (sw.js): https, or localhost/127.0.0.1/[::1] only with ?sw=1 (the cache-first worker would serve contributors stale JS); app:// (Electron) and file:// never register, the desktop build ships its files locally.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || (location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('sw') === '1'))) navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(() => {});
