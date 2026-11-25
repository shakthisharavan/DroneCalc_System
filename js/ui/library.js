// Saved builds library and compare (SPEC-v4 7). Pure apart from the injected store, so node can test it with a Map-backed stub.
// Every stored entry is untrusted: names go through cleanName, hashes back through X.parse and are re-serialised by X.hashOf.
import { esc } from './parts.js';
import { t, tf } from '../i18n/i18n.js';
import { cleanName, n, CHEM } from './state.js';
import * as U from './units.js';

export const LIB_KEY = 'dronecalc:builds', LIB_MAX = 20;

// store = { getItem, setItem } (localStorage in the page). Storage throws in some private modes and on file://: every access is guarded.
export function createLibrary(X, store, now = () => Date.now()) {
  // One poisoned entry is dropped on its own (a throwing name, an id that is not a plain string), never the whole list: the next save would write the survivors back.
  const clean = (b) => {
    try {
      if (!b || typeof b.hash !== 'string' || b.hash[0] !== '#' || typeof b.id !== 'string' || !/^[a-z0-9]{1,24}$/.test(b.id)) return null;
      const { S } = X.parse(b.hash);
      if (!S.mission) return null;
      return { id: b.id, name: (typeof b.name === 'string' && cleanName(b.name)) || t('lib.untitled'), hash: X.hashOf(S, 3), savedAt: Number.isFinite(b.savedAt) ? b.savedAt : 0 };
    } catch { return null; }
  };
  // Slice first: storage is untrusted, and validating tens of thousands of entries to keep 20 costs seconds.
  const list = () => { try { const a = JSON.parse(store?.getItem(LIB_KEY) || '[]'); return Array.isArray(a) ? a.slice(0, LIB_MAX).map(clean).filter(Boolean) : []; } catch { return []; } };
  const write = (a) => { try { store.setItem(LIB_KEY, JSON.stringify(a.slice(0, LIB_MAX))); return true; } catch { return false; } };
  // Newest first; saving the same build again moves it to the top. Returns { ok, dropped } (dropped = the oldest fell off the list).
  function save(S, fallbackName) {
    const hash = X.hashOf(S, 3), old = list().filter((b) => b.hash !== hash);
    const id = now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const ok = write([{ id, name: cleanName(S.name) || cleanName(fallbackName) || t('lib.untitled'), hash, savedAt: now() }, ...old]);
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
  return { name: b.name, mission: fc ? t('perf.fpvMission', { label: fc.label }) : X.MISSIONS[S.mission]?.label || S.mission, config: X.cfgLabel(X.cfgOf(S)),
    auw: `${U.format('g', rr.auwKg * 1000)}${rr.measuredG ? ' ' + t('lib.measured') : ''}`, flight: `${n(rr.estFlightMin, 1)} min`, twr: `${n(rr.twr, 2)} : 1`,
    hover: rr.fixedWing ? t('lib.cruiseThrottle', { n: n(rr.hoverThrottlePct) }) : t('lib.hoverThrust', { pct: n(100 / rr.twr), throttle: n(rr.hoverThrottlePct) }), battery: `${rr.batteryCells}S ${n(rr.batteryMah)} mAh ${CHEM[rr.batteryChemistry] || ''}`.trim(),
    bom: total > 0 ? X.money(total, S.cur) : t('lib.nothing'), wclass: U.text(wc?.label) || '-' };
}
const CMP = ['mission', 'config', 'auw', 'flight', 'twr', 'hover', 'battery', 'bom', 'wclass']; // row labels: lib.cmp.<id>
export function cmpHtml(cols) {
  if (cols.length < 2) return '';
  return `<table class="cmpt"><caption class="sr">${esc(t('lib.cmpCaption'))}</caption><thead><tr><td><span class="sr">${esc(t('lib.measure'))}</span></td>${cols.map((c) => `<th scope="col">${esc(c.name)}</th>`).join('')}</tr></thead>
<tbody>${CMP.map((k) => `<tr><th scope="row">${esc(t(`lib.cmp.${k}`))}</th>${cols.map((c) => `<td>${c.bad ? (k === 'mission' ? esc(t('lib.cannot')) : '-') : esc(c[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// Drawer body. ui = { cmp: Set of ids, confirm: id awaiting a second Delete press, edit: id being renamed }.
export function libHtml(items, ui, cols) {
  const date = (t) => (t ? new Date(t).toLocaleDateString('en-CA') : '');
  const full = ui.cmp.size >= 3;
  const li = (b) => `<li>${ui.edit === b.id
    ? `<label class="sr" for="lib-in">${esc(t('lib.newName', { name: b.name }))}</label><input class="lib-in" id="lib-in" name="lib-name" type="text" maxlength="40" value="${esc(b.name)}" data-id="${esc(b.id)}" spellcheck="false" autocomplete="off">`
    : `<a href="${esc(b.hash)}">${esc(b.name)}</a>`}<small>${esc(t('lib.saved', { date: date(b.savedAt) }))}</small>
<button type="button" class="btn sm" data-lib="rename" data-id="${esc(b.id)}" aria-label="${esc(t(ui.edit === b.id ? 'lib.aria.saveName' : 'lib.aria.rename', { name: b.name }))}">${esc(t(ui.edit === b.id ? 'lib.saveName' : 'lib.rename'))}</button>
<button type="button" class="btn sm" data-lib="delete" data-id="${esc(b.id)}" aria-label="${esc(t(ui.confirm === b.id ? 'lib.aria.confirmDelete' : 'lib.aria.delete', { name: b.name }))}">${esc(t(ui.confirm === b.id ? 'custom.confirmDelete' : 'custom.delete'))}</button>
<button type="button" class="btn sm" data-lib="cmp" data-id="${esc(b.id)}" aria-label="${esc(t('lib.aria.compare', { name: b.name }))}" aria-pressed="${ui.cmp.has(b.id)}"${full && !ui.cmp.has(b.id) ? ' disabled' : ''}>${esc(t('lib.compare'))}</button></li>`;
  const hint = !items.length ? `<p class="empty">${tf('lib.empty')}</p>`
    : ui.cmp.size < 2 ? `<p class="hint">${esc(t('lib.hint'))}</p>` : '';
  return `<div class="lib-top"><h2 id="lib-h" tabindex="-1">${esc(t('lib.title'))}</h2><button type="button" class="btn sm" data-lib="close">${esc(t('lib.close'))}</button></div>
${items.length ? `<ul class="lib-list">${items.map(li).join('')}</ul>` : ''}${hint}<div class="cmp"${cols.length > 1 ? ` tabindex="0" role="region" aria-label="${esc(t('lib.compared'))}"` : ''}>${cmpHtml(cols)}</div>`;
}
