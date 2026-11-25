// Custom parts (F7): the user's own motor, prop, ESC, ... entered by hand and kept in localStorage on this device only.
// Every field is validated and bounded on entry and again on load (storage is untrusted: it can be poisoned). Valid parts fill
// catalog.js CUSTOM, so the matcher and pickers see them next to catalog parts; they are always badged "Custom (unverified)" and never get store links.
// A share link only names a custom id: a device without that part drops the pick and shows the matched part instead (pruneSel).
import { esc, catLabel, customTxt, CHEV } from './parts.js';
import * as U from './units.js';
import { t } from '../i18n/i18n.js';

export const CUSTOM_KEY = 'dronecalc:custom', CUSTOM_MAX = 50;
const ID_RE = /^custom-[a-z0-9]{1,40}$/; // also fits the share-link id rule /^[a-z0-9][a-z0-9._-]{0,63}$/i
const RAW_MAX = 400000; // chars: a real list of 50 parts is ~25 KB, anything past this is not ours
const NAME_LEN = 60, BRAND_LEN = 30;
// Custom parts suit every mission; the matcher's spec rules (not tags) decide whether one fits.
const MISSIONS = ['delivery', 'inspection', 'agriculture', 'interceptor', 'mapping', 'fpv'];
const MATERIALS = ['carbon', 'glass', 'plastic', 'aluminum', 'foam', 'titanium', 'pacf', 'petg', 'balsa'];
const CONNECTORS = ['XT30', 'XT60', 'XT90', 'XT90-S', 'XT150', 'AS150', 'EC5', 'JST', 'pads'];
const PROTOCOLS = ['DShot1200', 'DShot600', 'DShot300', 'PWM'];

// Field kinds: n number (min, max, int, dp decimals, unit), e one of opts, b yes/no, s text (max, re). req = must be given. tag = a mission-style tag, not a spec.
// The label is read through a getter, key custom.f.<lk or k>, so it follows the active language; hintKey is the text key of a format hint.
const lbl = (k, o) => t(`custom.f.${o?.lk || k}`);
const N = (k, min, max, o) => ({ k, get label() { return lbl(k, o); }, t: 'n', min, max, ...o });
const E = (k, opts, o) => ({ k, get label() { return lbl(k, o); }, t: 'e', opts, ...o });
const B = (k, o) => ({ k, get label() { return lbl(k, o); }, t: 'b', ...o });
const T = (k, max, o) => ({ k, get label() { return lbl(k, o); }, t: 's', max, ...o });
const REQ = { req: true }, INT = { int: true };
const FPV = () => E('fpvClass', ['5', '7', '10']);
// Same spec keys as the catalog items of each category (js/catalog.js). Optional ones may stay blank.
export const SCHEMA = {
  frame: [N('sizeMm', 30, 3000, { ...REQ, unit: 'mm' }), E('material', MATERIALS, REQ), E('configuration', ['quad', 'hex', 'octo'], REQ),
    N('maxPropInch', 0.5, 40, { ...REQ, unit: 'in' }), FPV()],
  motor: [T('statorMm', 6, { ...REQ, re: /^\d{4}(\.\d)?$/, hintKey: 'custom.hint.stator' }), N('kv', 10, 50000, { ...REQ, ...INT }), N('maxThrustG', 5, 100000, { ...REQ, unit: 'g' }),
    N('maxCurrentA', 0.5, 500, { ...REQ, unit: 'A' }), N('minCells', 1, 14, { ...INT, unit: 'S' }), N('maxCells', 1, 14, { ...INT, unit: 'S' }),
    N('packOf', 1, 8, { ...INT, lk: 'packOfMotor' }), B('pusher', { tag: true }), FPV()],
  esc: [N('continuousA', 1, 500, { ...REQ, unit: 'A' }), N('burstA', 1, 1000, { ...REQ, unit: 'A' }), N('minCells', 1, 14, { ...REQ, ...INT, unit: 'S' }),
    N('maxCells', 1, 14, { ...REQ, ...INT, unit: 'S' }), E('protocol', PROTOCOLS, REQ), E('connector', CONNECTORS), B('fourInOne'), FPV()],
  fc: [N('motorOutputs', 1, 32, { ...REQ, ...INT }), B('hasGps'), T('mcu', 24), T('firmware', 60), E('connector', CONNECTORS), FPV()],
  battery: [N('cells', 1, 14, { ...REQ, ...INT, unit: 'S' }), N('mah', 50, 100000, { ...REQ, unit: 'mAh' }), N('cRating', 1, 300, { ...REQ, unit: 'C' }),
    E('chemistry', ['lipo', 'liion'], REQ), E('connector', CONNECTORS, { lk: 'connectorBatt' }), FPV()],
  prop: [N('inch', 0.5, 60, { ...REQ, unit: 'in' }), N('blades', 1, 8, INT), N('packOf', 1, 8, { ...INT, lk: 'packOfProp' }), FPV()],
  camera: [E('kind', ['fpv', 'gimbal4k', 'zoom', 'thermal', 'survey', 'action'], REQ), T('resolution', 60)],
  vtx: [E('type', ['digital', 'analog'], REQ)],
  gps: [N('constellations', 1, 8, INT)],
  radio: [T('protocol', 24)],
  payload: [N('maxKg', 0.01, 500, { ...REQ, unit: 'kg' })],
  vtol: [N('wingspanMm', 100, 10000, { ...REQ, unit: 'mm' }), N('wingAreaDm2', 1, 2000, { ...REQ, unit: 'dm²' }), N('maxAuwKg', 0.05, 200, { ...REQ, unit: 'kg' }),
    E('material', MATERIALS, REQ), E('type', ['tiltrotor'])],
  fixedwing: [N('wingspanMm', 100, 10000, { ...REQ, unit: 'mm' }), N('wingAreaDm2', 1, 2000, { ...REQ, unit: 'dm²' }), N('maxAuwKg', 0.05, 200, { ...REQ, unit: 'kg' }),
    E('material', MATERIALS, REQ), E('launch', ['hand', 'bungee', 'runway'], REQ), E('tail', ['flying wing', 'T-tail', 'twin-boom', 'conventional', 'V-tail'])],
  tilt: [N('tiltAxes', 1, 2, { ...REQ, ...INT }), B('includesServos'), N('torqueKgCm', 0.05, 200, { unit: 'kg·cm', lk: 'torqueKgCmTilt' }), N('maxAuwKg', 0.05, 200, { ...REQ, unit: 'kg' })],
  servo: [N('torqueKgCm', 0.05, 200, { ...REQ, unit: 'kg·cm' }), N('maxVoltage', 1, 30, { ...REQ, unit: 'V' }), B('tilt')],
  sensor: [T('type', 24), T('interface', 16)],
};
const TOP = { priceUsd: { t: 'n', min: 0, max: 100000, dp: 2, req: true, unit: 'USD' }, weightG: { t: 'n', min: 0.1, max: 50000, req: true, unit: 'g' } };

// Same strip as state.js cleanName (control, bidi, zero-width, lone surrogates; plus line/paragraph separators and word joiners), with its own cap, by code points.
const SPAN = [[0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]].map(([a, b]) => String.fromCharCode(a, 45, b)).join(''); // zero-width, bidi, line separators, joiners, BOM
const STRIP = new RegExp('[\\x00-\\x1f\\x7f-\\x9f' + SPAN + '\\p{Cs}]', 'gu');
export const text = (v, max) => (typeof v === 'string' ? [...v.replace(STRIP, '').trim()].slice(0, max).join('') : '');

// -> [value, error]; a blank is fine unless the field is required. Numbers must already be numbers (the form converts; a stored string is poison).
function check(v, f) {
  const e = (m) => [undefined, m];
  if (v === undefined || v === null || v === '') return f.req ? e(t('custom.err.required')) : [];
  if (f.t === 'n') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return e(t('custom.err.number'));
    if (v < f.min || v > f.max) {
      const q = U.isImperial() && f.unit && U.QOF[f.unit]; // the bounds in the units the form shows (the value itself is SI by now)
      return e(q ? t('custom.err.between', { lo: U.input(q, f.min), hi: U.input(q, f.max), unit: U.label(q) }) : f.unit ? t('custom.err.between', { lo: f.min, hi: f.max, unit: f.unit }) : t('custom.err.betweenPlain', { lo: f.min, hi: f.max }));
    }
    if (f.int && !Number.isInteger(v)) return e(t('custom.err.whole'));
    const k = 10 ** (f.dp ?? 3);
    return [Math.round(v * k) / k];
  }
  if (f.t === 'e') return typeof v === 'string' && f.opts.includes(v) ? [v] : e(t('custom.err.option'));
  if (f.t === 'b') return typeof v === 'boolean' ? [v] : e(t('custom.err.bool'));
  if (typeof v !== 'string') return e(t('custom.err.text'));
  const s = text(v, f.max);
  if (!s) return f.req ? e(t('custom.err.required')) : [];
  return f.re && !f.re.test(s) ? e(f.hintKey ? t(f.hintKey) : t('custom.err.format')) : [s];
}

// Validate and rebuild one part from anything (form values or a stored record). Never trusts raw.tags, links or regions: they are rebuilt.
// -> { part, errors }: part is null when anything is wrong; errors maps field key -> message (category, name, priceUsd, weightG, spec keys, _ general).
export function validate(raw) {
  if (!raw || typeof raw !== 'object') return { part: null, errors: { _: t('custom.err.invalid') } };
  const category = typeof raw.category === 'string' && Object.hasOwn(SCHEMA, raw.category) ? raw.category : null;
  if (!category) return { part: null, errors: { category: t('custom.err.category') } };
  const errors = {}, name = text(raw.name, NAME_LEN), brand = text(raw.brand, BRAND_LEN) || 'Custom';
  if (!name) errors.name = t('custom.err.name');
  const top = {};
  for (const [k, f] of Object.entries(TOP)) { const [v, m] = check(Object.hasOwn(raw, k) ? raw[k] : undefined, f); if (m) errors[k] = m; else top[k] = v; }
  const s = raw.specs && typeof raw.specs === 'object' ? raw.specs : {}, specs = {}, tags = [...MISSIONS];
  for (const f of SCHEMA[category]) {
    if (f.tag) { if ((Array.isArray(raw.tags) && raw.tags.includes(f.k)) || (Object.hasOwn(s, f.k) && s[f.k] === true)) tags.push(f.k); continue; }
    const [v, m] = check(Object.hasOwn(s, f.k) ? s[f.k] : undefined, f);
    if (m) errors[f.k] = m; else if (v !== undefined) specs[f.k] = v;
  }
  if (specs.minCells > specs.maxCells) errors.minCells = t('custom.err.minCells');
  if (specs.burstA < specs.continuousA) errors.burstA = t('custom.err.burstA');
  if (Object.keys(errors).length) return { part: null, errors };
  const id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : undefined;
  return { part: { id, category, name, brand, priceUsd: top.priceUsd, weightG: top.weightG, specs, tags, links: [], regions: [], custom: true }, errors };
}

// C = catalog module ({ CUSTOM } is filled in place), store = { getItem, setItem } (localStorage; every access is guarded, it throws in some private modes).
export function createCustom(C, store, now = () => Date.now()) {
  const target = Array.isArray(C?.CUSTOM) ? C.CUSTOM : [];
  // Stored list, every entry re-validated: bad ones, duplicate ids and anything past the cap are dropped.
  const list = () => {
    try {
      const s = store?.getItem(CUSTOM_KEY), a = s && s.length <= RAW_MAX ? JSON.parse(s) : [], seen = new Set(), out = [];
      if (!Array.isArray(a)) return [];
      for (const raw of a.slice(0, CUSTOM_MAX * 4)) {
        const { part } = validate(raw);
        if (part?.id && !seen.has(part.id) && out.length < CUSTOM_MAX) { seen.add(part.id); out.push(part); }
      }
      return out;
    } catch { return []; }
  };
  const sync = () => { const l = list(); target.splice(0, Infinity, ...l); return l; };
  const write = (a) => { try { store.setItem(CUSTOM_KEY, JSON.stringify(a)); return true; } catch { return false; } };
  const save = (a) => (write(a) ? (sync(), { ok: true }) : { ok: false, errors: { _: t('custom.err.save') } });
  const freshId = (cur) => { let id; do id = 'custom-' + now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); while (cur.some((p) => p.id === id)); return id; };
  // add / update -> { ok, id } or { ok: false, errors }
  function add(raw) {
    const cur = list(), v = validate(raw);
    if (cur.length >= CUSTOM_MAX) return { ok: false, errors: { _: t('custom.err.limit', { max: CUSTOM_MAX }) } };
    if (!v.part) return { ok: false, errors: v.errors };
    const id = freshId(cur);
    return { ...save([...cur, { ...v.part, id }]), id };
  }
  function update(id, raw) {
    const cur = list(), v = validate(raw);
    if (!cur.some((p) => p.id === id)) return { ok: false, errors: { _: t('custom.err.gone') } };
    if (!v.part) return { ok: false, errors: v.errors };
    return { ...save(cur.map((p) => (p.id === id ? { ...v.part, id } : p))), id };
  }
  const remove = (id) => save(list().filter((p) => p.id !== id));
  sync();
  return { list, add, update, remove, sync };
}

// A hash can name a custom part this device does not have (shared link, deleted part): drop those picks from S.sel so the matched part
// shows instead. have = the CUSTOM registry. Returns how many were dropped.
export function pruneSel(S, have) {
  const ids = new Set((have || []).map((p) => p.id));
  let n = 0;
  for (const [k, id] of Object.entries(S?.sel || {})) if (/^custom-/i.test(id) && !ids.has(id)) { delete S.sel[k]; n++; }
  return n;
}
export const missingNote = (n) => t('custom.missing', { count: n });

// ---- form (pure string builders, then a DOM mount). Drafts hold the raw field strings; only validate() decides what is stored.
const TOP_KEYS = ['name', 'brand', 'priceUsd', 'weightG'];
export const ui = { open: false, editId: null, confirm: null, draft: null, errors: {}, msg: '', focus: null, money: null };
// Required selects start on their first option and yes/no on "no", so what the form shows is what gets validated.
const fill = (d) => {
  for (const f of SCHEMA[d.category]) if (d.v[f.k] === undefined || d.v[f.k] === '') d.v[f.k] = f.t === 'b' ? 'no' : f.t === 'e' && f.req ? f.opts[0] : '';
  return d;
};
export const newDraft = (category = 'motor') => fill({ category, name: '', brand: '', priceUsd: '', weightG: '', v: {} });
// Switching category keeps name, brand, price and weight; spec fields start fresh (the same key can mean another thing, like type).
const withCategory = (d, category) => (Object.hasOwn(SCHEMA, category) ? fill({ ...d, category, v: {} }) : d);
const fromPart = (p) => fill({ category: p.category, name: p.name, brand: p.brand, priceUsd: String(p.priceUsd), weightG: String(p.weightG),
  v: Object.fromEntries(SCHEMA[p.category].map((f) => [f.k, f.tag ? (p.tags.includes(f.k) ? 'yes' : 'no') : f.t === 'b' ? (p.specs[f.k] ? 'yes' : 'no') : p.specs[f.k] == null ? '' : String(p.specs[f.k])])) });
export function toRaw(d) {
  const n = (s) => (s == null || String(s).trim() === '' ? undefined : Number(s)), specs = {};
  for (const f of SCHEMA[d.category]) { const v = d.v[f.k]; specs[f.k] = f.t === 'n' ? n(v) : f.t === 'b' ? v === 'yes' : v; }
  return { category: d.category, name: d.name, brand: d.brand, priceUsd: n(d.priceUsd), weightG: n(d.weightG), specs };
}

// Quantity of a number field when the form shows display units (null for A, S, C, KV, in, ...).
const dq = (f) => (f.unit && U.isImperial() ? U.QOF[f.unit] || null : null);
function fieldHtml(f, v, err, key, id) {
  const bad = err ? ' aria-invalid="true"' : '', desc = ` aria-describedby="${f.t === 'n' && f.unit ? `u-${id} ` : ''}e-${id}"`; // the unit is read with the field
  let ctl;
  if (f.t === 'e' || f.t === 'b') {
    const opts = f.t === 'b' ? [['no', t('custom.no')], ['yes', t('custom.yes')]] : [...(f.req ? [] : [['', '-']]), ...f.opts.map((o) => [o, o])];
    ctl = `<select id="${id}" ${key}${bad}${desc}>${opts.map(([o, l]) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else if (f.t === 'n') {
    // The draft holds SI text; an imperial form shows and takes display units (see dq), so an untouched field is never re-converted.
    const q = dq(f), sh = q && v !== '' && Number.isFinite(Number(v)) ? U.input(q, Number(v)) : v;
    ctl = `<input id="${id}" ${key} type="number" inputmode="decimal" min="${q ? U.input(q, f.min) : f.min}" max="${q ? U.input(q, f.max) : f.max}" step="${f.int ? 1 : 'any'}" value="${esc(sh)}" autocomplete="off"${bad}${desc}>${f.unit ? `<span class="u" id="u-${id}">${esc(q ? U.label(q) : f.unit)}</span>` : ''}`;
  } else ctl = `<input id="${id}" ${key} type="text" maxlength="${f.max}" value="${esc(v)}" autocomplete="off" spellcheck="false"${bad}${desc}>`;
  return `<div class="field${err ? ' bad' : ''}"><label for="${id}">${esc(f.label)}${f.req ? ' *' : ''}</label><div class="inp">${ctl}</div><span class="err" id="e-${id}" role="alert">${esc(U.text(err || ''))}</span></div>`;
}

// items = validated parts (createCustom().list()), u = ui state above, money(usd) formats a price.
export function customHtml(items, u = ui, money = (x) => '$' + x) {
  const d = u.draft || (u.draft = newDraft()), e = u.errors || {}, edit = items.find((p) => p.id === u.editId);
  const top = [['name', t('custom.f.name'), { t: 's', max: NAME_LEN, req: true }], ['brand', t('custom.f.brand'), { t: 's', max: BRAND_LEN }], ['priceUsd', t('custom.f.price'), { ...TOP.priceUsd }], ['weightG', t('custom.f.weight'), { ...TOP.weightG }]];
  const row = (p) => `<li><b>${esc(p.name)}</b><small>${esc(catLabel(p.category))} &middot; ${esc(p.brand)} &middot; ${esc(U.show('g', p.weightG))} &middot; ${esc(money(p.priceUsd))} &middot; ${esc(customTxt())}</small>
<button type="button" class="btn sm" data-cu="edit" data-id="${esc(p.id)}">${esc(t('custom.edit'))}</button>
<button type="button" class="btn sm" data-cu="delete" data-id="${esc(p.id)}">${esc(t(u.confirm === p.id ? 'custom.confirmDelete' : 'custom.delete'))}</button></li>`;
  return `<details class="more" id="cu-more"${u.open || edit ? ' open' : ''}><summary>${CHEV}${esc(t('custom.summary', { n: items.length, max: CUSTOM_MAX }))}</summary>
<p class="hint">${esc(t('custom.intro', { tag: customTxt() }))}</p>
${items.length ? `<ul class="lib-list">${items.map(row).join('')}</ul>` : ''}
<form class="cu-form" id="cu-form" novalidate><h4 id="cu-fh">${esc(edit ? t('custom.editTitle', { name: edit.name }) : t('custom.addTitle'))}</h4><div class="fields">
<div class="field"><label for="cu-cat">${esc(t('custom.category'))}</label><div class="inp"><select id="cu-cat">${Object.keys(SCHEMA).map((k) => `<option value="${k}"${k === d.category ? ' selected' : ''}>${esc(catLabel(k))}</option>`).join('')}</select></div></div>
${top.map(([k, label, f]) => fieldHtml({ ...f, label }, d[k], e[k], `data-cu-top="${k}"`, `cu-${k}`)).join('')}
${SCHEMA[d.category].map((f) => fieldHtml(f, d.v[f.k], e[f.k], `data-cu-k="${f.k}"`, `cu-s-${f.k}`)).join('')}</div>
<p class="hint">${esc(t('custom.note'))}</p>
${e._ ? `<p class="field bad"><span class="err" role="alert">${esc(e._)}</span></p>` : ''}
<div class="actions"><button type="submit" class="btn sm pri">${esc(t(edit ? 'custom.save' : 'custom.add'))}</button>${edit ? `<button type="button" class="btn sm" data-cu="cancel">${esc(t('custom.cancel'))}</button>` : ''}</div></form>
<p class="live" role="status" id="cu-msg" tabindex="-1">${esc(u.msg)}</p></details>`;
}

// el = the container, CUS = createCustom(...), onChange = called after the stored list changed (the page re-matches and redraws; this mounts again).
export function mountCustom(el, CUS, { onChange, money } = {}) {
  if (!el || !CUS) return;
  ui.money = money || ui.money;
  const draw = (focus) => { if (focus) ui.focus = focus; el.innerHTML = customHtml(CUS.list(), ui, ui.money || undefined); const f = ui.focus && el.querySelector(ui.focus); ui.focus = null; f?.focus(); };
  const changed = () => (onChange ? onChange() : draw());
  el.addEventListener('toggle', (e) => { if (e.target.id === 'cu-more') ui.open = e.target.open; }, true);
  el.addEventListener('input', (e) => {
    const t = e.target, d = ui.draft;
    if (t.id === 'cu-cat') { ui.draft = withCategory(d, t.value); ui.errors = {}; return draw('#cu-cat'); }
    const si = (f) => { const q = dq(f); return q && t.value.trim() !== '' && Number.isFinite(Number(t.value)) ? String(U.parse(q, t.value)) : t.value; };
    if (TOP_KEYS.includes(t.dataset.cuTop)) d[t.dataset.cuTop] = si(TOP[t.dataset.cuTop] || {});
    else { const f = SCHEMA[d.category].find((x) => x.k === t.dataset.cuK); if (f) d.v[f.k] = si(f); }
  });
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = ui.editId ? CUS.update(ui.editId, toRaw(ui.draft)) : CUS.add(toRaw(ui.draft));
    if (!r.ok) { ui.errors = r.errors; ui.msg = ''; return draw('.field.bad input, .field.bad select'); }
    ui.msg = t(ui.editId ? 'custom.msg.saved' : 'custom.msg.added');
    ui.editId = null; ui.errors = {}; ui.draft = newDraft(ui.draft.category); ui.focus = '#cu-msg'; ui.open = true;
    changed();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cu]'); if (!b) return;
    const id = b.dataset.id, a = b.dataset.cu;
    if (a !== 'delete') ui.confirm = null;
    if (a === 'edit') { const p = CUS.list().find((x) => x.id === id); if (!p) return; ui.editId = id; ui.draft = fromPart(p); ui.errors = {}; ui.msg = ''; return draw('#cu-name'); }
    if (a === 'cancel') { ui.editId = null; ui.errors = {}; ui.draft = newDraft(ui.draft.category); ui.msg = ''; return draw('#cu-more summary'); }
    if (a === 'delete') {
      if (ui.confirm !== id) { ui.confirm = id; ui.msg = t('custom.msg.confirm'); return draw(`[data-cu="delete"][data-id="${id}"]`); }
      CUS.remove(id); ui.confirm = null; if (ui.editId === id) { ui.editId = null; ui.draft = newDraft(); }
      ui.msg = t('custom.msg.deleted'); ui.focus = '#cu-msg'; changed();
    }
  });
  draw();
}
