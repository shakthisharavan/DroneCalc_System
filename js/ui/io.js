// Build file import/export (F3): a .json file <-> builds. The file is untrusted: size-capped, parsed in try/catch, shape-checked, and every
// hash goes back through X.parse and out through X.hashOf, so the raw string is never kept. Pure apart from downloadJson() and mountIO().
import { APP, cleanName, fileBase } from './state.js';
import { esc } from './parts.js';
import { LIB_MAX } from './library.js';
import { t } from '../i18n/i18n.js';

export const FILE_FORMAT = 1, FILE_MAX_BYTES = 256 * 1024, FILE_MAX_BUILDS = 20;
const TOO_BIG = () => t('io.tooBig', { kb: FILE_MAX_BYTES / 1024 });
const NOT_JSON = () => t('io.notJson');
const NOT_OURS = () => t('io.notOurs', { format: FILE_FORMAT });

// ---- export
export const exportDoc = (builds) => ({ app: APP, format: FILE_FORMAT, builds: builds.map(({ name, hash, savedAt }) => ({ name, hash, savedAt })) });
// dronecalc-<name>-<date>.json: fileBase keeps only letters, digits, _ and -, so no path or reserved characters get through.
export const exportName = (S, label, date) => `dronecalc-${fileBase(S, label)}-${date}.json`;
// Same Blob + a[download] path as the CSV and PDF downloads.
export function downloadJson(doc, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // revoke later: some browsers read the blob after click() returns
}

// ---- import
const BAD_KEY = new Set(['__proto__', 'constructor', 'prototype']);
const reviver = (k, v) => (BAD_KEY.has(k) ? undefined : v);
const own = (o, k) => (o && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined);
// text -> { builds: [{ name, hash, savedAt }], skipped } or { error }. Invalid entries are dropped and counted, never repaired.
export function parseBuildFile(X, text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > FILE_MAX_BYTES) return { error: TOO_BIG() };
  let doc;
  try { doc = JSON.parse(text, reviver); } catch { return { error: NOT_JSON() }; }
  const list = own(doc, 'builds');
  if (own(doc, 'app') !== APP || own(doc, 'format') !== FILE_FORMAT || !Array.isArray(list)) return { error: NOT_OURS() };
  const seen = new Set(), builds = [];
  let skipped = Math.max(0, list.length - FILE_MAX_BUILDS);
  for (const e of list.slice(0, FILE_MAX_BUILDS)) {
    const h = own(e, 'hash'), { S } = X.parse(typeof h === 'string' ? h : ''); // junk or oversized -> defaults -> no mission
    const nm = own(e, 'name'), sv = own(e, 'savedAt');
    if (!S.mission || Object.keys(X.errs(S)).length) { skipped++; continue; }
    const hash = X.hashOf(S, 3); // the drone name stays whatever the hash says: a list name is only a label (the library does the same)
    if (seen.has(hash)) { skipped++; continue; }
    seen.add(hash);
    builds.push({ name: (typeof nm === 'string' && cleanName(nm)) || S.name || t('lib.untitled'), hash, savedAt: Number.isFinite(sv) && sv >= 0 && sv <= 8.64e15 ? sv : 0 });
  }
  return { builds, skipped };
}
// file (File or any { size, text() }) -> parseBuildFile result. The size is checked before the file is read.
export async function readBuildFile(X, file) {
  if (!(file?.size <= FILE_MAX_BYTES)) return { error: TOO_BIG() };
  let text;
  try { text = await file.text(); } catch { return { error: t('io.unreadable') }; }
  return parseBuildFile(X, text);
}
// Add builds to the saved list without evicting anything: builds already saved, or beyond what the list can still hold, are skipped.
// LIB.save puts each one on top, so they go in reverse to keep file order top-down. Returns { added, skipped, failed }.
export function addToLibrary(X, LIB, builds) {
  const have = LIB.list(), seen = new Set(have.map((b) => b.hash));
  const fresh = builds.filter((b) => !seen.has(b.hash)).slice(0, Math.max(0, LIB_MAX - have.length));
  let added = 0;
  for (const b of [...fresh].reverse()) if (LIB.save(X.parse(b.hash).S, b.name).ok) added++;
  return { added, skipped: builds.length - added, failed: added < fresh.length };
}
export const summary = (added, skipped) => t('io.summary', { count: added, added, skipped });

// ---- DOM glue
// Drawer controls; the file input is hidden and driven by the button, so the button is the one labelled, keyboard-reachable control.
export const ioHtml = (count) => `<div class="lib-io" role="group" aria-label="${esc(t('io.group'))}" style="display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 6px">
<button type="button" class="btn sm" data-io="import">${esc(t('io.import'))}</button><input type="file" id="io-file" accept=".json,application/json" hidden aria-label="${esc(t('io.fileAria'))}">
<button type="button" class="btn sm" data-io="export-all"${count ? '' : ' disabled'}>${esc(t('io.exportAll'))}</button></div>
<p class="hint">${esc(t('io.hint'))}</p>`;

const SHOW = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:20;max-width:min(560px,92vw);padding:10px 16px;border:2px solid var(--ink);background:var(--paper);color:var(--ink);font:600 var(--t-small) var(--mono)';
// A dropped file with one of these extensions is a thrust-stand or flight-log CSV (or a binary log, which csv() turns away with a message), not a build file.
export const CSV_EXT = /\.(csv|tsv|txt|bbl|bfl|bin|ulg|ulog|tlog|log)$/i;
// Opening one build replaces the one in progress: ask first (window.confirm: native, keyboard and screen reader friendly). Nothing to lose when there is no mission yet or it is the same build.
export const replaceMsg = (name) => t('io.replace', { name });
const askNative = (m) => (typeof globalThis.confirm === 'function' ? globalThis.confirm(m) : true);
// env: X, LIB (or null), libEl (the My builds drawer), state() = current S, label() = mission label, date() = yyyy-mm-dd,
// open(hash) = load a build, changed() = the saved list changed, ask(message) = yes/no for a replace (default: window.confirm),
// csv(file) = takes dropped CSV files (thrust curve or flight log, ui/measured.js). Returns { exportCurrent, say }.
export function mountIO({ X, LIB, libEl, state, label, date, open, changed, ask = askNative, csv }) {
  // One polite status region, created now so later text is announced. Hidden off-screen (the .live class) until a message shows.
  const toast = Object.assign(document.createElement('p'), { className: 'live noprint' });
  toast.setAttribute('role', 'status'); document.body.appendChild(toast);
  let timer;
  const say = (m) => {
    clearTimeout(timer); toast.textContent = m; toast.classList.remove('live'); toast.style.cssText = SHOW;
    timer = setTimeout(() => { toast.textContent = ''; toast.classList.add('live'); toast.style.cssText = ''; }, 8000);
  };
  const save = (doc, name) => { try { downloadJson(doc, name); say(t('io.saved', { name })); } catch (e) { say(t('io.exportFailed', { message: e?.message || e })); } };
  function exportCurrent() {
    const S = state();
    if (!S.mission) return say(t('io.nothing'));
    save(exportDoc([{ name: cleanName(S.name) || cleanName(label()) || t('lib.untitled'), hash: X.hashOf(S, 3), savedAt: Date.now() }]), exportName(S, label(), date()));
  }
  function exportAll() {
    const all = LIB?.list() || [];
    if (!all.length) return say(t('io.noSaved'));
    save(exportDoc(all), exportName({ name: 'all-builds' }, '', date()));
  }
  async function importFile(file) {
    const res = await readBuildFile(X, file);
    if (res.error) return say(res.error);
    if (!res.builds.length) return say(t('io.noValid', { skipped: res.skipped }));
    if (res.builds.length === 1) {
      const b = res.builds[0], S = state();
      if (S?.mission && X.hashOf(S, 3) !== b.hash && !ask(replaceMsg(b.name))) return say(t('io.cancelled'));
      open(b.hash); return say(summary(1, res.skipped));
    }
    if (!LIB) return say(t('io.noLib'));
    const r = addToLibrary(X, LIB, res.builds); changed();
    say(r.failed ? t('io.storage')
      : summary(r.added, res.skipped + r.skipped) + (r.skipped ? ' ' + t('io.skippedNote', { max: LIB_MAX }) : ''));
  }
  const run = (f) => f && (csv && CSV_EXT.test(f.name || '') ? csv(f) : importFile(f)).catch((e) => say(t('io.importFailed', { message: e?.message || e })));
  if (LIB && libEl) {
    libEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-io]');
      if (b) b.dataset.io === 'import' ? libEl.querySelector('#io-file').click() : exportAll();
    });
    libEl.addEventListener('change', (e) => { const t = e.target, f = t.id === 'io-file' && t.files[0]; if (f) { t.value = ''; run(f); } }); // reset so the same file can be picked again
  }
  // A dropped file must never navigate the window to it (the desktop app would leave the page): always cancel file drags.
  const files = (e) => e.dataTransfer?.types?.includes('Files');
  document.addEventListener('dragover', (e) => { if (files(e)) e.preventDefault(); });
  document.addEventListener('drop', (e) => { if (files(e)) { e.preventDefault(); run(e.dataTransfer.files[0]); } });
  return { exportCurrent, say };
}
