// DroneCalc: DOM wiring for the wizard, results, part selection, BOM dock and PDF export.
// State, hash, money and BOM logic live in ui/state.js (pure, node-testable).
import * as E from './engine.js';
import { esc, partsHtml, bomHtml, dockHtml, copyText, bomCsv, CHEV, gl, section } from './ui/parts.js';
import { APP, n, NUM, createState, FAMILIES, LAUNCH, NAME_MAX, cleanName, fileBase, pdfName, csvName, CHEM, MW, mwOf, hoverBand } from './ui/state.js';
import { wiringRows, wiringHtml } from './ui/wiring.js';

// Theme first, before the awaits below, so a stored choice paints as early as a module can (CSP: no inline script). Unset = CSS follows the OS.
const THEME = 'dronecalc:theme', root = document.documentElement;
try { const t = localStorage.getItem(THEME); if (t === 'dark' || t === 'light') root.dataset.theme = t; } catch { /* storage unavailable */ }
const isDark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

// Modules other owners write in parallel: a missing file or export must never break the page.
const opt = (p) => import(p).catch(() => ({}));
const [C, M, PERF, CHK, LIBM] = await Promise.all([opt('./catalog.js'), opt('./matcher.js'), opt('./ui/perf.js'), opt('./checks.js'), opt('./ui/library.js')]);
const PDF = opt('./ui/pdf.js'); // awaited on export
const X = createState({ E, C, M, PERF, CHK });
const { MISSIONS, MATERIALS, LIM, CUR, REG, FIELD, CFGS } = X;
// Saved builds (SPEC-v4 7); null when library.js is missing, which hides its buttons.
const LIB = LIBM.createLibrary ? LIBM.createLibrary(X, (() => { try { return localStorage; } catch { return null; } })()) : null;

const $ = (s, r = document) => r.querySelector(s);
const STEPS = ['Mission', 'Endurance', 'Details', 'Results'];
const RAIL = ['Mission', 'Time', 'Details', 'Build'];
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
const ROLE = { 5: 'freestyle / racing', 7: 'long range', 10: 'long range heavy' };
const FIT_TXT = { good: 'Good fit', ok: 'Workable', poor: 'Poor fit' };

let S, step, R = null; // S = answers, step = wizard step 0-3, R = results context (null off the results page)
const money = (u, o) => X.money(u, S.cur, o);
const lim = (k) => X.lim(k, S.cur);
const ctx = () => X.ctx(R, S);
const bomRows = () => X.bomRows(R, S.sel);
const today = () => new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd, local date
const label = () => MISSIONS[S.mission]?.label; // filename fallback when the drone has no name

// Last build, kept as its hash. localStorage throws in some private modes and on file://, so every access is guarded.
const LAST = 'dronecalc:last';
const store = (v) => { try { if (v) localStorage.setItem(LAST, v); else localStorage.removeItem(LAST); } catch { /* storage unavailable */ } };
function load() { ({ S, step } = X.parse(location.hash)); }
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
  return `<ol class="rail">${STEPS.map((s, i) => `<li><button type="button" data-go="${i}" ${i === step ? 'aria-current="step"' : ''} ${i > 0 && !S.mission ? 'disabled' : ''}><b>0${i + 1}</b><span>${RAIL[i]}</span></button></li>`).join('')}</ol>`;
}
const num = (id, label, val, st, hint = '') => `<div class="field" data-f="${id}"><label for="${id}">${label}</label><div class="inp"><input id="${id}" data-k="${id}" type="number" inputmode="decimal" min="${lim(id).min}" max="${lim(id).max}" step="${st}" value="${Number.isFinite(val) ? val : ''}" aria-describedby="e-${id}${hint ? ` h-${id}` : ''}"><span class="u">${esc(X.unit(id, S.cur))}</span></div>${hint ? `<span class="hint" id="h-${id}">${hint}</span>` : ''}<span class="err" id="e-${id}" role="alert"></span></div>`;
const sel = (id, label, opts, val, hint = '') => `<div class="field"><label for="${id}">${label}</label><div class="inp"><select id="${id}" data-k="${id}"${hint ? ` aria-describedby="h-${id}"` : ''}>${opts.map(([v, l]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>${hint ? `<span class="hint" id="h-${id}">${hint}</span>` : ''}</div>`;
const matHint = () => (MATERIALS[S.frameMaterial] ? X.matNote(S.frameMaterial) : '');
// Every material with its one-line note and numbers, so a new engine material appears here without UI changes.
const matList = () => `<details class="more mat-more"><summary>${CHEV}All ${Object.keys(MATERIALS).length} materials and notes</summary><ul class="mat-notes">${Object.entries(MATERIALS).map(([id, m]) =>
  `<li><b>${esc(m.label)}</b> ${esc(X.matNote(id))} <small>${esc(m.densityGcc)} g/cm³, stiffness ${esc(m.stiffness)}/10, cost x${esc(m.costRel)}</small></li>`).join('')}</ul></details>`;
const radio = (name, id, val, on, inner) => `<div class="choice"><input type="radio" name="${name}" id="${id}" value="${esc(val)}" ${on ? 'checked' : ''}><label for="${id}">${inner}</label></div>`;
// Configuration picker grouped by family. Each card carries a short fit word and the reason for this mission; engine warnings show inline below.
function cfgPicker() {
  const fams = FAMILIES.map(([f, name]) => [f, name, CFGS.filter((c) => X.cfgFamily(c) === f)]).filter(([, , cs]) => cs.length);
  return `<fieldset class="field cfg"><legend>Configuration</legend><div class="fams">${fams.map(([f, name, cs]) =>
    `<div class="fam"><p class="fam-h"><span class="fam-t">${esc(name)}</span></p>
      <div class="choices cfgs">${cs.map((c) => {
        const why = X.reason(S.mission, c);
        return radio('configuration', `c-${c}`, c, S.configuration === c, `<svg viewBox="0 0 48 48" aria-hidden="true">${SCHEM[c] || ''}</svg><span class="nm">${esc(X.cfgLabel(c))}</span><small>${esc(X.cfgNote(c))}</small>${why ? `<span class="fit ${why.level}">${FIT_TXT[why.level]}</span><span class="why">${esc(why.text)}</span>` : ''}`);
      }).join('')}</div></div>`).join('')}</div><ul class="cfg-warn" id="cfg-warn" aria-live="polite"></ul></fieldset>`;
}
// FPV size cards (SPEC-v3 4): only for the fpv mission, which always flies a quad.
function fpvPicker() {
  const F = X.FPV, g = (v, u) => (Number.isFinite(v) ? `${n(v)} ${u}` : '-');
  return `<fieldset class="field fpv"><legend>FPV size</legend><p class="hint" id="h-fpv">FPV builds are always quads. Picking a size sets the flight time to that class's default.</p>
    <div class="choices fpvs">${Object.entries(F).map(([k, c]) => radio('fpvClass', `fc-${k}`, k, S.fpvClass === k, `<span class="nm"><span>${esc(k)} in<em>${esc(ROLE[k] || c.label)}</em></span></span>
      <dl class="fpv-s"><div><dt>Typical weight</dt><dd>${g(c.typicalAuwG, 'g')}</dd></div><div><dt>Flight time</dt><dd>${g(c.defaultFlightMin, 'min')} <small>up to ${g(c.maxFlightMin, 'min')}</small></dd></div></dl>${c.note ? `<small>${esc(c.note)}</small>` : ''}`)).join('')}</div>
    <p class="live" role="status" id="fpv-msg"></p></fieldset>`;
}
function refresh() {
  const e = X.errs(S);
  stage.querySelectorAll('[data-f]').forEach((f) => { const m = e[f.dataset.f] || ''; f.classList.toggle('bad', !!m); f.querySelector('.err').textContent = m; f.querySelector('input').setAttribute('aria-invalid', m ? 'true' : 'false'); });
  const nx = $('[data-go="+1"]'); if (nx) nx.disabled = (step === 0 && !S.mission) || X.stepErr(e, step);
}

function view() {
  document.title = `${STEPS[step]}${S.name ? ` - ${S.name}` : ''} - ${APP}`;
  shell.classList.toggle('wide', step === 3);
  if (step === 3) return viewResults();
  R = null;
  let body = '';
  if (step === 0) {
    body = `<h2 tabindex="-1" id="h">What is it for?</h2><p class="lede">The mission sets reserve, cruise speed, minimum thrust-to-weight and the battery chemistry.</p>
    <div class="fields"><div class="field"><label for="dname">Drone name (optional)</label><div class="inp"><input id="dname" type="text" maxlength="${NAME_MAX}" placeholder="e.g. Survey-01" autocomplete="off" spellcheck="false" value="${esc(S.name)}" aria-describedby="h-dname"></div><span class="hint" id="h-dname">Shown on the results, the readout and the PDF. Up to ${NAME_MAX} characters.</span></div></div>
    <fieldset class="choices"><legend class="live">Mission</legend>${Object.entries(MISSIONS).map(([id, m]) =>
      `<div class="choice"><input type="radio" name="mission" id="m-${id}" value="${id}" ${S.mission === id ? 'checked' : ''}><label for="m-${id}"><span class="nm"><span>${esc(m.label).replace('/', '/<wbr>')}</span></span><small>${esc(m.note || '')}</small></label></div>`).join('')}</fieldset>`;
  } else if (step === 1) {
    const t = Number.isFinite(S.targetFlightMin) ? S.targetFlightMin : 20;
    body = `<h2 tabindex="-1" id="h">How long in the air?</h2><p class="lede">Target hover-and-fly time on one pack, after reserve. Longer means a bigger, heavier battery, and eventually a point of no return.</p>
    <div class="fields t-fields"><div class="field full"><label for="range">Flight time target</label>
    <input type="range" id="range" min="1" max="${LIM.targetFlightMin.max}" step="1" value="${Math.min(LIM.targetFlightMin.max, Math.max(1, t))}" data-sync="targetFlightMin"><div class="ticks" aria-hidden="true"><span>1</span><span>30</span><span>60</span><span>120</span><span>${LIM.targetFlightMin.max} min</span></div></div>
    ${num('targetFlightMin', 'Minutes (exact)', S.targetFlightMin, 1, `Between ${LIM.targetFlightMin.min} and ${LIM.targetFlightMin.max}`)}</div>`;
  } else {
    const src = C.CURRENCIES ? `${sel('cur', 'Currency', Object.entries(CUR).map(([k, c]) => [k, `${k} - ${c.name}`]), S.cur)}
      ${C.REGIONS ? sel('reg', 'Country', Object.entries(REG).map(([k, r]) => [k, r.name]), X.region(S), 'Picks local stores. Follows the currency until you change it.') : ''}` : '';
    body = `<h2 tabindex="-1" id="h">Airframe and conditions</h2><p class="lede">Defaults come from your mission. Change what differs. The readout updates as you type.</p>
    <fieldset class="grp"><legend>Airframe</legend>
      ${X.isFpv(S) ? fpvPicker() : cfgPicker()}
      <div class="fields">${num('payloadKg', 'Payload', X.payload(S), 0.05, 'Camera, sprayer tank, parcel')}
      ${sel('frameMaterial', 'Frame material', Object.entries(MATERIALS).map(([id, m]) => [id, m.label]), S.frameMaterial, matHint())}
      <ul class="cfg-warn mat-warn" id="mat-warn" aria-live="polite"></ul>
      <div class="field full">${matList()}</div></div>
    </fieldset>
    <fieldset class="grp"><legend>Sourcing and budget</legend><div class="fields">${src}
      ${num('budget', 'Budget (optional)', S.budget, 'any', 'Leave blank for no limit')}</div></fieldset>
    <fieldset class="grp env"><legend>Environment</legend><div class="fields">
      ${num('altitudeM', 'Altitude', S.altitudeM, 50, 'Thinner air at height: more throttle and power per gram.')}
      ${num('tempC', 'Temperature', S.tempC, 1, 'Hot air is thinner: a little less thrust, more current.')}
      ${num('windMs', 'Typical wind', S.windMs, 0.5, 'Headwind cuts ground speed and drains the pack on the way out.')}</div></fieldset>`;
  }
  const last = step === 2;
  stage.innerHTML = `${rail()}<div class="phase p${step}">${body}<div class="nav">${step > 0 ? '<button type="button" class="btn" data-go="-1">Back</button>' : ''}<button type="button" class="btn pri" data-go="+1" disabled>${last ? 'Calculate build' : 'Next'}</button></div></div>`;
  $('#h')?.focus({ preventScroll: true });
  refresh(); renderPanel();
}

function renderPanel() {
  const r = X.run(S), cw = $('#cfg-warn');
  if (cw) cw.innerHTML = X.cfgWarns(S, r).map((w) => `<li>${esc(w)}</li>`).join('');
  const mw = $('#mat-warn'); if (mw) mw.innerHTML = X.matWarns(S, r).map((w) => `<li>${esc(w)}</li>`).join('');
  const head = (x = '') => `<h2>Live readout${S.name ? ` <small>${esc(S.name)}</small>` : ''}${x}</h2>`;
  if (!r) { panel.innerHTML = `${head()}<p class="idle">${S.mission ? 'Fix the highlighted field to restart the instruments.' : 'Pick a mission to start the instruments.'}</p>`; return; }
  if (!r.ok) { panel.innerHTML = `${head()}<ul class="warns">${(r.errors || []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`; return; }
  const v = r.vtol, fw = r.fixedWing, kind = X.kindOf(r), min = X.minTwr(S, r), full = Math.max(4, (min || 0) * 1.5), twrPct = Math.min(100, (r.twr / full) * 100);
  const tp = Math.min(100, (r.estFlightMin / (S.targetFlightMin * 1.5)) * 100);
  const wm = fw?.motor || {}, span = fw || v;
  const motors = fw ? `<span>1x</span> <span>${esc(wm.statorMm ?? r.motorStatorMm)}</span> <small>${n(wm.kv ?? r.motorKv)} KV</small>`
    : `<span>${r.motorCount}x</span> <span>${esc(r.motorStatorMm)}</span> <small>${n(r.motorKv)} KV${kind === 'tiltrotor' ? ', tilting' : v?.pusher ? ' + pusher' : ''}</small>`;
  const fc = X.fpvOf(S);
  panel.innerHTML = `${head(fc ? ` <small>FPV &middot; ${esc(fc.label)}</small>` : '')}<dl class="rows">
    <div class="ro"><dt>Takeoff mass</dt><dd><span>${n(r.auwKg * 1000)}</span> <small>g</small></dd></div>
    ${span ? `<div class="ro"><dt>Span / prop</dt><dd><span>${n(span.wingspanMm)}</span> <small>mm</small> <span>/</span> <span>${n(wm.propInch ?? r.propInch, 1)}</span> <small>in</small></dd></div>`
      : `<div class="ro"><dt>Frame / prop</dt><dd><span>${n(r.frameSizeMm)}</span> <small>mm</small> <span>/</span> <span>${n(r.propInch, 1)}</span> <small>in</small></dd></div>`}
    <div class="ro"><dt>Motors</dt><dd>${motors}</dd></div>
    ${fw ? `<div class="ro lch"><dt>Launch</dt><dd><small>${esc(LAUNCH[fw.launch] || fw.launch || '-')}</small></dd></div>` : ''}
    <div class="ro"><dt>Battery</dt><dd><span>${r.batteryCells}S</span> <small>${n(r.batteryMah)} mAh</small></dd></div>
    <div class="ro"><dt>Flight time</dt><dd><span>${n(r.estFlightMin, 1)}</span> <small>min</small></dd></div></dl>
    <div class="gauge ${min == null ? '' : r.twr < min ? 'bad' : 'good'}"><div class="lbl"><span>${fw ? 'Static thrust : weight' : 'Thrust : weight'}</span><span>${n(r.twr, 2)}</span></div><div class="bar"><div class="fill" style="width:${twrPct}%"></div>${min != null ? `<div class="mark" style="left:${Math.min(98, (min / full) * 100)}%" title="Minimum ${min}"></div>` : ''}</div></div>
    <div class="gauge ${r.meetsTarget ? 'good' : 'bad'}"><div class="lbl"><span>vs target ${S.targetFlightMin} min</span><span>${r.meetsTarget ? 'MET' : 'SHORT'}</span></div><div class="bar"><div class="fill" style="width:${tp}%"></div><div class="mark" style="left:${100 / 1.5}%"></div></div></div>
    ${r.warnings?.length ? `<ul class="warns">${X.warnsOf(S, r).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
}

function perfHtml(r) {
  if (!PERF.renderPerformance) return '<p class="fx">Performance figures are not available in this build.</p>';
  // PERF adds the FPV class itself from result.fpvClass.
  try { return PERF.renderPerformance(r, { missionLabel: MISSIONS[S.mission].label }); } catch (e) { return `<p class="fx">Performance figures failed to render: ${esc(e.message)}</p>`; }
}

// Battery and current card (SPEC-v4 3); the C-rating flag comes from the compat batC check once a battery is picked.
function batHtml(r, chk) {
  const mt = X.minTwr(S, r), bp = X.bestPack(r, mt), pt = bp && X.packText(bp, mt, r), f = chk.find((c) => c.id === 'batC' && c.level !== 'pass');
  const d = (l, v, u, g, cls) => `<div${cls ? ` class="${cls}"` : ''}><dt>${l}${g ? gl(g) : ''}</dt><dd>${v}${u ? `<small>${u}</small>` : ''}</dd></div>`;
  return `<h3 id="h-bat"><em>PWR</em>Battery and current</h3><dl class="bat">
    ${d('Required current', n(r.peakCurrentA), 'A peak')}${d('C rating needed', `${esc(r.batteryCRating)}C`, 'or more', 'c')}
    ${d('ESC rating', `${n(r.escContinuousA)} A`, `/ ${n(r.escBurstA)} A burst`)}${d('Chemistry', `${esc(CHEM[r.batteryChemistry] || r.batteryChemistry || '-')} ${esc(r.batteryCells)}S`, '', 'cells')}
    ${d('Battery', `${n(r.batteryWh)} Wh`, `${n(r.batteryMah)} mAh`, 'wh')}
    ${pt ? d('Best pack size', esc(pt.value), esc(pt.more), '', 'bat-best') : ''}</dl>
    ${f ? `<p class="bat-flag" data-lvl="${f.level === 'fail' ? 'bad' : 'warn'}">${esc(f.text)}</p>` : ''}`;
}
// Measured weight field (SPEC-v4 1). Applied on change, so typing never re-renders the page under the cursor.
function mwHtml() {
  const on = !!R.r.measuredG, err = R.mwErr;
  return `<div class="field mw${err ? ' bad' : ''}"><label for="mw">Measured weight (optional)</label><div class="inp"><input id="mw" type="number" inputmode="decimal" min="${MW.min}" max="${MW.max}" step="1" value="${mwOf(S.mw) ?? ''}" aria-describedby="e-mw h-mw" aria-invalid="${!!err}"><span class="u">g</span></div>
    <span class="hint" id="h-mw">${on ? `Using measured weight: ${n(R.r.measuredG)} g vs estimate ${n(R.r.estG)} g. Flight time, thrust : weight and throttle are for the same parts and pack. <button type="button" class="btn sm" data-act="mwclear">Use estimate</button>`
      : 'Weigh the finished build with battery and payload, then enter it to recompute flight time.'}</span><span class="err" id="e-mw" role="alert">${esc(err)}</span></div>`;
}

function viewResults() {
  const r0 = X.run(S);
  if (!r0 || !r0.ok) {
    const r = r0;
    R = null;
    const fe = X.errs(S);
    const items = !S.mission ? ['<li>Pick a mission first. <button type="button" class="lnk" data-go="0">Go to Mission</button></li>']
      : Object.keys(fe).length ? Object.entries(fe).map(([k, m]) => `<li>${esc(m)} <button type="button" class="lnk" data-fix="${k}">Fix ${esc(FIELD[k][0])}</button></li>`)
      : ((r && r.errors) || []).map((x) => `<li>${esc(x)} <button type="button" class="lnk" data-go="2">Review details</button></li>`);
    stage.innerHTML = `${rail()}<div class="phase"><h2 tabindex="-1" id="h">Cannot calculate yet</h2><p class="lede">These inputs need fixing before we can size your build.</p><ul class="rwarns">${items.join('')}</ul><div class="nav"><button type="button" class="btn" data-go="-1">Back</button></div></div>`;
    $('#h').focus({ preventScroll: true }); return;
  }
  R = X.results(S, r0);
  const r = R.r; // the measured result when a valid measured weight is set (SPEC-v4 1), else the estimate
  const k = (l, v, u, o = {}) => `<div class="kpi"${o.band ? ` data-band="${o.band[0]}"` : ''}><dt>${l}${o.gl ? gl(o.gl) : ''}</dt><dd>${v}<small>${u}</small>${o.sub ? `<span class="kpi-2">${o.sub}</span>` : ''}${o.band ? `<span class="why">${o.band[1]}</span>` : ''}</dd></div>`;
  const fc = X.fpvOf(S), v = r.vtol, fw = r.fixedWing, w = fw || v, tl = v?.tilt, wc = X.wclassOf(R);
  const sub = [fc ? `FPV · ${fc.label}` : MISSIONS[S.mission].label, X.cfgLabel(X.cfgOf(S)), MATERIALS[S.frameMaterial]?.label, `${X.payload(S)} kg payload`, `${S.cur}, ${X.regName(R.reg)}`,
    r.measuredG ? `measured ${n(r.measuredG)} g` : ''].filter(Boolean);
  // KPIs by airframe kind: a wing shows cruise throttle and power, winged types add span and L:D, a tiltrotor its transition.
  const kpis = [k('Flight time', n(r.estFlightMin, 1), 'min'), k('Range', n(r.rangeKm, 1), 'km'), k(r.measuredG ? 'Takeoff mass, measured' : 'Takeoff mass', n(r.auwKg, 2), 'kg'),
    k('Thrust : weight', n(r.twr, 2), fw ? ':1 static' : ':1', { gl: 'twr' }),
    // A wing has no hover: the engine's hover fields hold level-cruise throttle and power there, so no hover band.
    // Hovering types lead with the thrust share (what the 45-50% advice means); the engine's throttle is the second line.
    fw ? k('Cruise throttle', n(r.hoverThrottlePct), '%') : k('Hover thrust', n(100 / r.twr), '%', { gl: 'hover', sub: `${n(r.hoverThrottlePct)}% throttle`, band: hoverBand(r.twr, X.minTwr(S, r)) }), k(fw ? 'Cruise power' : 'Hover power', n(r.hoverPowerW), 'W'),
    ...(w ? [k('Wingspan', n(w.wingspanMm / 1000, 2), 'm'), k('Lift : drag', n(w.liftToDrag, 1), ''), k('Stall / cruise', n(w.stallMs, 1), `/ ${n(w.cruiseMs, 1)} m/s`)] : []),
    ...(fw ? [k('Wing loading', n(fw.wingLoadingGdm2), 'g/dm²'), k('Launch', esc(String(fw.launch || '-').replace(/^./, (c) => c.toUpperCase())), r.measuredG && Math.round(r.measuredG) !== Math.round(r.estG) ? 'at estimated mass' : '')] : []),
    ...(tl ? [k('Transition', n(tl.tiltTimeS, 1), `s, ${n(tl.transitionAngleDeg)}° tilt`)] : []),
    k('Battery', n(r.batteryWh), `Wh ${r.batteryCells}S`, { gl: 'wh' }), k('Peak current', n(r.peakCurrentA), 'A')];
  stage.innerHTML = `${rail()}
  <div class="res-head"><div><h2 tabindex="-1" id="h">Your build${S.name ? `: ${esc(S.name)}` : ''}</h2><p class="res-sub">${sub.map(esc).join(' &middot; ')}</p></div>
  <div class="res-st"><span class="verdict ${r.meetsTarget ? 'ok' : 'no'}">${r.meetsTarget ? 'Meets' : 'Misses'} ${S.targetFlightMin} min target</span>
  ${wc ? ` <span class="wclass" data-lvl="${esc(wc.lvl)}">${esc(wc.label)}</span><small class="wclass-n">${esc(wc.note)}</small>` : ''}</div></div>
  <dl class="kpis">${kpis.join('')}</dl>
  ${r.warnings?.length ? `<ul class="rwarns">${X.warnsOf(S, r).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  <div class="res-grid">
    <section class="sec s-perf" aria-labelledby="h-perf"><h3 id="h-perf"><em>FIG</em>Performance</h3><div id="perf">${perfHtml(r)}</div></section>
    <div class="col-parts">
      <section class="sec s-bat" id="s-bat" aria-labelledby="h-bat"></section>
      <section class="sec s-parts" aria-labelledby="h-parts"><h3 id="h-parts"><em>PARTS</em>Components</h3>
        <div class="actions noprint"><button class="btn sm" type="button" data-act="copy">Copy list</button><button class="btn sm" type="button" data-act="print">Print list</button><button class="btn sm" type="button" data-act="link">Copy link</button>${LIB ? '<button class="btn sm" type="button" data-act="save">Save build</button>' : ''}<span class="live" role="status" id="cpmsg"></span></div>
        <div id="parts">${partsHtml(ctx())}</div>
        ${wiringHtml(wiringRows(r, S.mission))}</section>
      ${CHK.checklist ? `<details class="sec checklist"><summary>Build and first-flight checklist</summary><ol class="cl">${CHK.checklist(r, S).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>` : ''}
      <section class="sec s-bom" id="bom" tabindex="-1" aria-labelledby="h-bom"><h3 id="h-bom"><em>BOM</em>Bill of materials</h3>
        <div id="bom-body"></div>
        ${mwHtml()}
        <div class="actions noprint"><button type="button" class="btn sm pri" data-act="pdf">Export PDF</button><button type="button" class="btn sm" data-act="csv">Download CSV</button><button type="button" class="btn sm" data-act="clear">Clear</button><span class="pdf-msg" role="status"></span></div></section>
      ${CHK.compat ? '<section class="sec s-chk" aria-labelledby="h-chk"><h3 id="h-chk"><em>CHK</em>Compatibility</h3><div id="chk-body"></div></section>' : ''}
    </div>
    <aside class="dock" id="dock" aria-label="Bill of materials summary">
      <div class="dock-top"><button type="button" class="dock-tog" aria-expanded="false" aria-controls="dock-body"><span class="dock-t">BOM</span><span class="dock-n"></span><b class="dock-sum"></b>${CHEV}</button>
        <h3 class="dock-h">BOM summary</h3><button type="button" class="btn sm pri" data-act="pdf">Export PDF</button></div>
      <div class="dock-body" id="dock-body"><div class="dock-live"></div>
        <div class="dock-act"><a class="btn sm" href="#bom">Full BOM</a><button type="button" class="btn sm" data-act="clear">Clear</button></div>
        <p class="pdf-msg" role="status"></p><p class="live" role="status" id="sel-msg"></p></div>
    </aside>
  </div>
  <div class="nav"><button type="button" class="btn" data-go="-1">Edit answers</button><button type="button" class="btn" data-act="reset">Start over</button></div>`;
  renderBom();
  try { PERF.bindPerformance?.($('#perf')); } catch { /* figures stay static without interaction */ }
  $('#h').focus({ preventScroll: true });
}

function renderBom() {
  const rows = bomRows(), c = ctx(), chk = X.compatOf(R, rows), ms = X.massOf(R, rows), estG = R.est.auwKg * 1000, total = rows.reduce((a, x) => a + x.line, 0);
  // Parts mass vs the estimate (not the measured weight): >10% apart means a guess in the model or a part to recheck.
  // Categories this build needs: an ESC only when the picked (else best) motor has none built in.
  const need = R.sec.main.filter((k) => !(k === 'esc' && c.escFree)), got = need.filter((k) => rows.some((x) => x.key === k)).length;
  const mass = ms ? `<p class="mass" data-lvl="${Math.abs(ms.totalG - estG) > 0.1 * estG ? 'warn' : 'ok'}">Your parts: ${n(ms.partsG)} g + ${n(ms.allowanceG)} g wiring/hardware = ${n(ms.totalG)} g vs estimate ${n(estG)} g${got < need.length ? ` (${got} of ${need.length} categories picked)` : ''}</p>` : '';
  const cost = Number.isFinite(R.r.estCostUsd) ? `<p class="cost">Typical build cost about ${money(R.r.estCostUsd)} (engine estimate for the core parts)${rows.length ? ` vs your BOM ${money(total)}` : ''}</p>` : '';
  $('#bom-body').innerHTML = bomHtml(rows, c) + mass + cost;
  const cb = $('#chk-body');
  if (cb) cb.innerHTML = !rows.length ? '<p class="empty">Select parts to check they fit together.</p>'
    : chk.length ? `<ul class="checks">${chk.map((x) => `<li class="chk" data-lvl="${esc(x.level)}"><b>${X.LVL[x.level] || esc(x.level)}</b> ${esc(x.text)}</li>`).join('')}</ul>`
      : '<p class="empty">No checks apply yet. Pick a battery, ESC, flight controller, frame or props to check they fit together.</p>';
  $('#s-bat').innerHTML = batHtml(R.r, chk);
  const wi = $('#wiring'); if (wi) wi.outerHTML = wiringHtml(wiringRows(R.r, S.mission, rows.find((x) => x.key === 'battery')?.it));
  // The ESC section follows the picked motor: redraw it when its built-in-ESC state or motor changes.
  const ek = c.escFree ? c.motor.id : '', ce = $('#cat-esc');
  if (ce && R.escKey !== undefined && R.escKey !== ek) { ce.outerHTML = section('esc', c); paint('esc'); }
  R.escKey = ek;
  $('.dock-live').innerHTML = dockHtml(rows, c);
  $('.dock-n').textContent = `${rows.length} selected`;
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
  $('#sel-msg').textContent = `${on ? 'Selected' : 'Removed'} ${X.pick(R, cat, id)?.name || 'part'}. BOM total ${$('.dock-sum').textContent}.`;
}

const say = (m) => stage.querySelectorAll('.pdf-msg').forEach((x) => (x.textContent = m));
async function exportPdf() {
  const P = await PDF;
  if (!P.buildBomPdf) return say('PDF export is not available yet.');
  try {
    const name = pdfName(S, label());
    P.downloadPdf(P.buildBomPdf(X.pdfDoc(R, S, today())), name);
    say(`Saved ${name}`);
  } catch (e) { say('PDF export failed: ' + (e?.message || e)); }
}
// Same Blob + a[download] path as pdf.js downloadPdf.
function exportCsv() {
  try {
    const name = csvName(S, label()), url = URL.createObjectURL(new Blob([bomCsv(bomRows(), ctx())], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // revoke later: some browsers read the blob after click() returns
    say(`Saved ${name}`);
  } catch (e) { say('CSV export failed: ' + (e?.message || e)); }
}
// Print: the browser's Save-as-PDF suggests document.title, so name it after the build while on the results page (covers Ctrl+P too).
let preTitle = null;
addEventListener('beforeprint', () => { if (R) { preTitle = document.title; document.title = `${fileBase(S, label())}-Parts-List`; } });
addEventListener('afterprint', () => { if (preTitle != null) { document.title = preTitle; preTitle = null; } });

const clip = async (id, text, ok) => { const m = $('#cpmsg'), b = $(`[data-act="${id}"]`); try { await navigator.clipboard.writeText(text); m.textContent = b.textContent = ok; } catch { m.textContent = b.textContent = 'Copy failed'; } };
const ACT = {
  copy: () => clip('copy', copyText(bomRows(), ctx()), 'Copied'),
  link: () => clip('link', location.href, 'Link copied'), // the whole build lives in the URL hash
  print: () => print(),
  reset: () => { ({ S } = X.parse('')); go(0); },
  clear: () => { S.sel = {}; save(); paint(); renderBom(); closeDock(); $('#sel-msg').textContent = 'BOM cleared.'; },
  pdf: exportPdf,
  csv: exportCsv,
  save: () => {
    const s = LIB.save(S, label()), b = $('[data-act="save"]');
    $('#cpmsg').textContent = b.textContent = !s.ok ? 'Could not save: browser storage is unavailable.' : s.dropped ? 'Saved. Only the 20 newest are kept.' : 'Saved to My builds';
    if (!libEl.hidden) renderLib();
  },
  mwclear: () => { S.mw = ''; save(); view(); $('#mw')?.focus(); },
};

function go(i) {
  if (i > 0 && !S.mission) return;
  step = Math.max(0, Math.min(3, i)); save(true); view(); window.scrollTo(0, 0);
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
  if (NUM.has(k)) { if (raw === '') S[k] = ''; else { const v = Number(raw); if (!Number.isFinite(v)) return; S[k] = v; } } else S[k] = raw;
  save(); refresh(); renderPanel();
}
function setCur(c) {
  S.budget = X.convertBudget(S.budget, S.cur, c); S.cur = c;
  const b = $('#budget');
  if (b) { b.value = Number.isFinite(S.budget) ? S.budget : ''; b.max = lim('budget').max; b.closest('.inp').querySelector('.u').textContent = c; }
  if (!S.reg && $('#reg')) $('#reg').value = X.region(S);
  save(); refresh(); renderPanel();
}
stage.addEventListener('input', (e) => {
  const t = e.target;
  // A different airframe is a different build: its picks and measured weight no longer apply.
  if (t.name === 'mission') { S.mission = t.value; S.payloadKg = null; S.targetFlightMin = X.defMin(t.value, S.fpvClass); S.sel = {}; S.mw = ''; save(); railState(); refresh(); renderPanel(); return; }
  if (t.name === 'configuration') { S.sel = {}; S.mw = ''; return setVal('configuration', t.value); }
  if (t.name === 'fpvClass') {
    // A new size resets the flight time to its default (SPEC-v3 4); a default payload follows the class too.
    S.fpvClass = t.value; S.targetFlightMin = X.defMin('fpv', t.value); S.sel = {}; S.mw = '';
    const p = $('#payloadKg'); if (p && S.payloadKg == null) p.value = X.payload(S);
    $('#fpv-msg').textContent = `${X.FPV[t.value].label}: flight time set to ${S.targetFlightMin} min.`;
    save(); refresh(); renderPanel(); return;
  }
  if (t.id === 'dname') { S.name = cleanName(t.value); save(); renderPanel(); return; }
  if (t.id === 'cur') return setCur(t.value);
  if (t.id === 'reg') { S.reg = t.value; save(); return; }
  if (t.dataset.sync) { $('#targetFlightMin').value = t.value; setVal(t.dataset.sync, t.value); return; }
  if (t.dataset.k) {
    setVal(t.dataset.k, t.value);
    if (t.dataset.k === 'targetFlightMin' && $('#range')) $('#range').value = Math.min(LIM.targetFlightMin.max, Number(t.value) || 1);
    if (t.dataset.k === 'frameMaterial') $('#h-frameMaterial').textContent = matHint();
  }
});
// Measured weight applies on change (blur, Enter, spinner). Bad text shows the field error and leaves the applied value alone.
stage.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id !== 'mw') return;
  // More than 2 decimals is rounded, not refused: grams to 0.01 g is already finer than any scale.
  const raw = t.value.trim(), v = mwOf(/^\d{1,6}\.\d{3,}$/.test(raw) ? String(Math.round(Number(raw) * 100) / 100) : raw);
  if (raw && v == null) {
    t.closest('.field').classList.add('bad'); t.setAttribute('aria-invalid', 'true');
    $('#e-mw').textContent = `Measured weight must be between ${MW.min} and ${MW.max.toLocaleString('en-US')} g.`; return;
  }
  S.mw = raw ? v : ''; save(); view(); $('#mw')?.focus();
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
  libEl.innerHTML = LIBM.libHtml(items, lib, cols);
  if (focus) (libEl.querySelector(focus) || $('#lib-h'))?.focus();
}
function closeLib(back) { libEl.hidden = true; libTog.setAttribute('aria-expanded', 'false'); lib.edit = lib.confirm = null; if (back) libTog.focus(); }
const libSay = (m) => { const x = $('#lib-msg'); if (x) x.textContent = m; };
function commitRename(id) { LIB.rename(id, libEl.querySelector('.lib-in')?.value); lib.edit = null; renderLib(`[data-lib="rename"][data-id="${CSS.escape(id)}"]`); libSay('Renamed.'); }
if (!(LIB && libEl)) libTog?.remove(); // no library module: no dead button (CSS display beats the hidden attribute here)
else if (libTog) {
  libTog.addEventListener('click', () => {
    if (!libEl.hidden) return closeLib(true);
    libEl.hidden = false; libTog.setAttribute('aria-expanded', 'true'); renderLib('#lib-h');
  });
  libEl.addEventListener('click', (e) => {
    if (e.target.closest('.lib-list a')) return closeLib(false); // the link opens the build through its hash
    const b = e.target.closest('[data-lib]'); if (!b) return;
    const id = b.dataset.id, act = b.dataset.lib, me = `[data-lib="${act}"][data-id="${CSS.escape(id || '')}"]`;
    if (act === 'close') return closeLib(true);
    if (act !== 'delete') lib.confirm = null;
    if (act === 'rename') { if (lib.edit === id) return commitRename(id); lib.edit = id; return renderLib('.lib-in'); }
    if (act === 'delete') {
      if (lib.confirm !== id) { lib.confirm = id; renderLib(me); return libSay('Press Confirm delete to remove it.'); }
      LIB.remove(id); lib.confirm = null; lib.cmp.delete(id); renderLib('#lib-h'); return libSay('Build deleted.');
    }
    if (act === 'cmp') { if (lib.cmp.has(id)) lib.cmp.delete(id); else if (lib.cmp.size < 3) lib.cmp.add(id); renderLib(me); }
  });
  libEl.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('lib-in')) return;
    if (e.key === 'Enter') { e.preventDefault(); commitRename(e.target.dataset.id); }
    if (e.key === 'Escape') { e.stopPropagation(); const id = lib.edit; lib.edit = null; renderLib(`[data-lib="rename"][data-id="${CSS.escape(id)}"]`); }
  });
}

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
function railState() { stage.querySelectorAll('.rail button').forEach((b, i) => { if (i) b.disabled = !S.mission; }); }
addEventListener('hashchange', () => { load(); view(); });

load(); save(); view();
