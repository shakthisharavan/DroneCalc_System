// DroneCalc i18n: t(key, params), tf(key, params, html), fmtNum, fmtDate, language choice. Pure apart from setLang(), which loads a catalog.
// Catalogs are flat ES modules (js/i18n/<code>.js, default export { key: text }). English is always loaded (static import) and is the fallback
// for every key a language lacks, then the key itself, so a half-translated language never shows a blank.
//
// ESCAPING CONTRACT. Catalogs are UNTRUSTED data (a translator's file), params may be user text (a drone name).
//  - t(key, params) returns PLAIN TEXT: {name} placeholders are replaced by the raw param, nothing is escaped, no markup is ever produced.
//    Callers put the result through esc() exactly as they did with the English literals before (aria-labels, textContent, attributes, copy text).
//  - tf(key, params, html) returns HTML-SAFE markup for the few strings that carry emphasis: the catalog text and every param are escaped, and only
//    the whitelist {b}...{/b} becomes <b>...</b>. `html` holds already-safe fragments (a button the caller built) that a {slot} may take verbatim.
import en from './en.js';

export const LANGS = ['en', 'es', 'hi'];
// Option labels are always written in their own language, whatever the active one is.
export const LANG_NAMES = { en: 'English', es: 'Español', hi: 'हिन्दी' };
export const KEY = 'dronecalc:lang';
// Numbers keep Latin digits in every language (the charts and the PDF do): es and hi ask for the latn numbering system explicitly.
const LOCALE = { en: 'en-US', es: 'es-u-nu-latn', hi: 'hi-u-nu-latn' };
// Languages whose script the PDF writer (WinAnsi, no embedded font) cannot draw: their PDF is written in English (state.pdfDoc, pdf.js).
export const PDF_FALLBACK = new Set(['hi']);

const cats = { en };
let lang = 'en', cat = en;

export const valid = (c) => typeof c === 'string' && LANGS.includes(c); // strict: the exact codes only, never a prefix or a case variant
export const get = () => lang;
export const pdfLang = (l = lang) => (PDF_FALLBACK.has(l) ? 'en' : l);

// Stored choice (strict), else the first browser language whose primary subtag is supported, else English.
export function initial(storage, languages) {
  let s = null;
  try { s = storage?.getItem(KEY); } catch { /* storage unavailable */ }
  if (valid(s)) return s;
  const list = Array.isArray(languages) ? languages : typeof languages === 'string' ? [languages] : [];
  for (const l of list) { const p = typeof l === 'string' ? l.toLowerCase().split(/[-_]/)[0] : ''; if (valid(p)) return p; }
  return 'en';
}
const store = () => { try { return localStorage; } catch { return null; } };
const nav = () => (typeof navigator === 'object' && navigator ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []);
export const save = (c, storage = store()) => { try { storage?.setItem(KEY, c); } catch { /* the choice lasts this visit */ } };

// Load a catalog by code; English is already there. A missing or broken file leaves the language on English keys (returns false).
export async function load(code) {
  if (!valid(code)) return false;
  if (!cats[code]) {
    try { const m = await import(`./${code}.js`); cats[code] = m.default && typeof m.default === 'object' ? m.default : {}; } catch { return false; }
  }
  return true;
}
// Make a catalog active (loading it first). Also updates <html lang> when there is a document.
export async function setLang(code) {
  const c = valid(code) ? code : 'en';
  if (!(await load(c))) { lang = 'en'; cat = en; } else { lang = c; cat = cats[c]; }
  if (typeof document === 'object' && document?.documentElement) document.documentElement.lang = lang;
  return lang;
}
// Startup: stored or detected language, applied before the first render.
export const init = (storage = store(), languages = nav()) => setLang(initial(storage, languages));
// Test and tool hook: install a catalog object without loading a file.
export function registerCatalog(code, obj) { if (valid(code) && code !== 'en') cats[code] = obj; }
// Run fn with another language active (synchronously), then restore: the PDF is built this way so every string in it is the PDF's language.
export function withLang(code, fn) {
  const sl = lang, sc = cat;
  if (valid(code) && cats[code]) { lang = code; cat = cats[code]; }
  try { return fn(); } finally { lang = sl; cat = sc; }
}

const rules = {};
const form = (n, code) => { try { return (rules[code] ||= new Intl.PluralRules(LOCALE[code] || 'en-US')).select(n); } catch { return n === 1 ? 'one' : 'other'; } };
// Template for a key: the exact key, else (when params.count is a number) key.<plural form>, in the active catalog then English; null when none has it.
function pick(key, params, l, c) {
  const exact = (k) => (Object.hasOwn(c, k) ? c[k] : Object.hasOwn(en, k) ? en[k] : undefined);
  const cnt = params && typeof params.count === 'number' ? params.count : null;
  if (cnt === null) return exact(key) ?? null;
  const f = form(cnt, l);
  return exact(`${key}.${f}`) ?? exact(key) ?? exact(`${key}.other`) ?? null;
}
const slot = (s, params) => s.replace(/\{(\w+)\}/g, (m, k) => (params && Object.hasOwn(params, k) && params[k] != null ? String(params[k]) : m));
const B = /\{\/?b\}/g;
// l = optional language override for this one call (the PDF passes pdfLang()).
export function t(key, params, l) {
  const code = valid(l) && cats[l] ? l : lang, s = pick(key, params, code, cats[code] || en);
  return s == null ? String(key) : slot(s.replace(B, ''), params);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function tf(key, params, html) {
  const s = pick(key, params, lang, cat);
  if (s == null) return esc(key);
  return s.split(/(\{\/?b\}|\{\w+\})/).map((p) => {
    if (p === '{b}') return '<b>'; if (p === '{/b}') return '</b>';
    const k = /^\{(\w+)\}$/.exec(p)?.[1];
    if (k && html && Object.hasOwn(html, k)) return String(html[k]);
    if (k && params && Object.hasOwn(params, k) && params[k] != null) return esc(params[k]);
    return esc(p);
  }).join('');
}

// Numbers and dates in the active locale (Latin digits). opts as Intl.NumberFormat / DateTimeFormat.
const nf = {}, df = {};
export function fmtNum(n, opts) {
  const k = lang + JSON.stringify(opts || 0);
  try { return (nf[k] ||= new Intl.NumberFormat(LOCALE[lang], opts)).format(n); } catch { return String(n); }
}
export function fmtDate(d, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
  const k = lang + JSON.stringify(opts), v = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(+v)) return '';
  try { return (df[k] ||= new Intl.DateTimeFormat(LOCALE[lang], opts)).format(v); } catch { return ''; }
}

// An object whose properties read their text from the active catalog at access time: { hand: 'Hand launch', ... } for tables the code exports as data.
export const lazyMap = (prefix, ids) => Object.defineProperties({}, Object.fromEntries(ids.map((id) => [id, { enumerable: true, get: () => t(prefix + id) }])));
