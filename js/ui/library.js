// Saved builds library and compare (SPEC-v4 7). Pure apart from the injected store, so node can test it with a Map-backed stub.
// Every stored entry is untrusted: names go through cleanName, hashes back through X.parse and are re-serialised by X.hashOf.
import { esc } from './parts.js';
import { cleanName, n, CHEM } from './state.js';

export const LIB_KEY = 'dronecalc:builds', LIB_MAX = 20;

// store = { getItem, setItem } (localStorage in the page). Storage throws in some private modes and on file://: every access is guarded.
export function createLibrary(X, store, now = () => Date.now()) {
  const clean = (b) => {
    if (!b || typeof b.hash !== 'string' || b.hash[0] !== '#') return null;
    const { S } = X.parse(b.hash);
    if (!S.mission) return null;
    const id = /^[a-z0-9]{1,24}$/.test(b.id) ? b.id : null;
    return id && { id, name: cleanName(b.name) || 'Untitled build', hash: X.hashOf(S, 3), savedAt: Number.isFinite(b.savedAt) ? b.savedAt : 0 };
  };
  const list = () => { try { const a = JSON.parse(store?.getItem(LIB_KEY) || '[]'); return Array.isArray(a) ? a.map(clean).filter(Boolean).slice(0, LIB_MAX) : []; } catch { return []; } };
  const write = (a) => { try { store.setItem(LIB_KEY, JSON.stringify(a.slice(0, LIB_MAX))); return true; } catch { return false; } };
  // Newest first; saving the same build again moves it to the top. Returns { ok, dropped } (dropped = the oldest fell off the list).
  function save(S, fallbackName) {
    const hash = X.hashOf(S, 3), old = list().filter((b) => b.hash !== hash);
    const id = now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const ok = write([{ id, name: cleanName(S.name) || cleanName(fallbackName) || 'Untitled build', hash, savedAt: now() }, ...old]);
    return { ok, id, dropped: ok && old.length >= LIB_MAX };
  }
  // Rename keeps the build and its drone name in step: the stored hash gets the new name too.
  const rename = (id, name) => write(list().map((b) => {
    if (b.id !== id) return b;
    const nm = cleanName(name) || b.name, { S } = X.parse(b.hash);
    return { ...b, name: nm, hash: X.hashOf({ ...S, name: nm }, 3) };
  }));
  const remove = (id) => write(list().filter((b) => b.id !== id));
  return { list, save, rename, remove };
}

// One compare column per build: recomputed from its hash, never from stored figures. CHK = checks module (weight class), may be {}.
export function compareRow(X, CHK, b) {
  const { S } = X.parse(b.hash), r = X.run(S);
  if (!r?.ok) return { name: b.name, bad: true };
  const R = X.results(S, r), rr = R.r, total = X.bomRows(R, S.sel).reduce((a, x) => a + x.line, 0), wc = CHK.weightClass?.(rr.auwKg, R.reg);
  const fc = X.fpvOf(S);
  return { name: b.name, mission: fc ? `FPV · ${fc.label}` : X.MISSIONS[S.mission]?.label || S.mission, config: X.cfgLabel(X.cfgOf(S)),
    auw: `${n(rr.auwKg * 1000)} g${rr.measuredG ? ' (measured)' : ''}`, flight: `${n(rr.estFlightMin, 1)} min`, twr: `${n(rr.twr, 2)} : 1`,
    hover: rr.fixedWing ? `${n(rr.hoverThrottlePct)} % cruise throttle` : `${n(100 / rr.twr)} % thrust (${n(rr.hoverThrottlePct)} % throttle)`, battery: `${rr.batteryCells}S ${n(rr.batteryMah)} mAh ${CHEM[rr.batteryChemistry] || ''}`.trim(),
    bom: total > 0 ? X.money(total, S.cur) : 'Nothing selected', wclass: wc?.label || '-' };
}
const CMP = [['mission', 'Mission'], ['config', 'Configuration'], ['auw', 'Takeoff mass'], ['flight', 'Flight time'], ['twr', 'Thrust : weight'],
  ['hover', 'Hover thrust'], ['battery', 'Battery'], ['bom', 'BOM total'], ['wclass', 'Weight class']];
export function cmpHtml(cols) {
  if (cols.length < 2) return '';
  return `<table class="cmpt"><caption class="sr">Saved builds side by side</caption><thead><tr><td></td>${cols.map((c) => `<th scope="col">${esc(c.name)}</th>`).join('')}</tr></thead>
<tbody>${CMP.map(([k, l]) => `<tr><th scope="row">${l}</th>${cols.map((c) => `<td>${c.bad ? (k === 'mission' ? 'Cannot calculate' : '-') : esc(c[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// Drawer body. ui = { cmp: Set of ids, confirm: id awaiting a second Delete press, edit: id being renamed }.
export function libHtml(items, ui, cols) {
  const date = (t) => (t ? new Date(t).toLocaleDateString('en-CA') : '');
  const full = ui.cmp.size >= 3;
  const li = (b) => `<li>${ui.edit === b.id
    ? `<label class="sr" for="lib-in">New name for ${esc(b.name)}</label><input class="lib-in" id="lib-in" name="lib-name" type="text" maxlength="40" value="${esc(b.name)}" data-id="${esc(b.id)}" spellcheck="false" autocomplete="off">`
    : `<a href="${esc(b.hash)}">${esc(b.name)}</a>`}<small>Saved ${esc(date(b.savedAt))}</small>
<button type="button" class="btn sm" data-lib="rename" data-id="${esc(b.id)}">${ui.edit === b.id ? 'Save name' : 'Rename'}</button>
<button type="button" class="btn sm" data-lib="delete" data-id="${esc(b.id)}">${ui.confirm === b.id ? 'Confirm delete' : 'Delete'}</button>
<button type="button" class="btn sm" data-lib="cmp" data-id="${esc(b.id)}" aria-pressed="${ui.cmp.has(b.id)}"${full && !ui.cmp.has(b.id) ? ' disabled' : ''}>Compare</button></li>`;
  const hint = !items.length ? '<p class="empty">No saved builds yet. Press <b>Save build</b> on a results page to keep it here.</p>'
    : ui.cmp.size < 2 ? '<p class="hint">Press Compare on 2 or 3 builds to see them side by side.</p>' : '';
  return `<div class="lib-top"><h2 id="lib-h" tabindex="-1">My builds</h2><button type="button" class="btn sm" data-lib="close">Close</button></div>
${items.length ? `<ul class="lib-list">${items.map(li).join('')}</ul>` : ''}${hint}<p class="live" role="status" id="lib-msg"></p><div class="cmp">${cmpHtml(cols)}</div>`;
}
