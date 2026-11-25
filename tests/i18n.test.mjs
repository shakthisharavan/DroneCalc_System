// i18n (js/i18n): the catalogs are well formed, every key the code asks for exists, translations can never inject markup, the language choice is validated,
// a missing translation falls back to English, and the language never touches the share hash.
// Translators: `node tests/i18n.test.mjs --missing` lists what is left per language (add --json for a ready-to-fill skeleton). It never fails the build.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../js/engine.js';
import * as C from '../js/catalog.js';
import * as M from '../js/matcher.js';
import * as PERF from '../js/ui/perf.js';
import * as CHK from '../js/checks.js';
import * as U from '../js/ui/units.js';
import { createState } from '../js/ui/state.js';
import { partsHtml, bomHtml, dockHtml } from '../js/ui/parts.js';
import { wiringRows, wiringHtml } from '../js/ui/wiring.js';
import { libHtml, cmpHtml, compareRow } from '../js/ui/library.js';
import { ioHtml } from '../js/ui/io.js';
import { measuredHtml } from '../js/ui/measured.js';
import { customHtml } from '../js/ui/custom.js';
import { buildBomPdf } from '../js/ui/pdf.js';
import en from '../js/i18n/en.js';
import es from '../js/i18n/es.js';
import hi from '../js/i18n/hi.js';
import * as I from '../js/i18n/i18n.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATS = { es, hi };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- the `missing` report (never fails): English keys a language has not translated yet, plural forms included.
export function missing(base, cat) { return Object.keys(base).filter((k) => !Object.hasOwn(cat, k)); }
if (process.argv.includes('--missing')) {
  const json = process.argv.includes('--json');
  for (const [code, cat] of Object.entries(CATS)) {
    const miss = missing(en, cat), done = Object.keys(en).length - miss.length;
    if (json) { console.log(JSON.stringify({ [code]: Object.fromEntries(miss.map((k) => [k, en[k]])) }, null, 1)); continue; }
    console.log(`${code} (${I.LANG_NAMES[code]}): ${done} of ${Object.keys(en).length} keys translated, ${miss.length} missing`);
    for (const k of miss) console.log(`  ${k}`);
  }
  process.exit(0);
}

// ---- helpers
const KEY_RE = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$/; // <screen>.<section>.<name>, dashes allowed inside a segment (weight-class codes)
const PLURAL = /\.(zero|one|two|few|many|other)$/;
const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];
const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((p) => p !== 'b').sort().join(',');
const bcount = (s) => [(String(s).match(/\{b\}/g) || []).length, (String(s).match(/\{\/b\}/g) || []).length];
const baseOf = (k) => k.replace(PLURAL, '');
const jsFiles = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsFiles(`${d}/${e.name}`) : /\.js$/.test(e.name) ? [`${d}/${e.name}`] : []));
const CODE = jsFiles('js').filter((f) => !/^js\/i18n\/(en|es|hi)\.js$/.test(f)).map((f) => [f, read(f)]);

// Keys the code builds at run time (template literals and `prefix + id`): the code is scanned for these, and each prefix is listed here so a stale key cannot hide behind it.
// Every prefix below is a family keyed by a data id (a part category, a mission, a unit, ...), so the key itself never appears as a literal.
const DYNAMIC = ['cat.', 'cat.kind.', 'parts.noun.', 'glossary.', 'custom.f.', 'perf.phase.', 'perf.w.', 'perf.launch.', 'fit.', 'reason.', 'matnote.', 'cfg.', 'mission.', 'fpv.', 'mat.', 'cur.', 'region.',
  'wclass.', 'warn.', 'launch.', 'family.', 'field.', 'lvl.', 'lib.cmp.', 'wire.', 'meas.req.', 'meas.field.', 'meas.col.', 'meas.what.', 'meas.tu.', 'app.fit.'];
// Keys that are assembled in a way the scan cannot see and are listed explicitly instead (none today).
const ALLOW_UNUSED = new Set([]);

const LIT = /(['"`])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+\.?)\1/g; // a quoted string that looks like a key (or a key prefix ending in a dot)
const TPL = /`([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+)*\.)\$\{/g; // `meas.req.${k}`
const groups = new Set(Object.keys(en).map((k) => k.split('.')[0]));
const refs = new Set(), prefixes = new Set(DYNAMIC), tplPrefixes = new Set();
for (const [, src] of CODE) {
  for (const m of src.matchAll(LIT)) { if (groups.has(m[2].split('.')[0])) (m[2].endsWith('.') ? prefixes : refs).add(m[2]); }
  for (const m of src.matchAll(TPL)) { if (groups.has(m[1].split('.')[0])) { prefixes.add(m[1]); tplPrefixes.add(m[1]); } }
}
// index.html names its static strings with data-i18n / data-i18n-attr: those are uses too.
const HTML = read('index.html');
for (const m of HTML.matchAll(/data-i18n="([^"]+)"/g)) refs.add(m[1]);
for (const m of HTML.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(';')) refs.add(p.split(':')[1]);
const exists = (k) => Object.hasOwn(en, k) || Object.hasOwn(en, `${k}.other`);

test('en.js: keys follow the naming rule, values are plain text, plural forms and {b} are well formed', () => {
  const keys = Object.keys(en);
  assert.ok(keys.length > 800, `catalog looks too small (${keys.length})`);
  const bad = keys.filter((k) => !KEY_RE.test(k));
  assert.deepEqual(bad, [], 'keys that break the naming rule');
  for (const [k, v] of Object.entries(en)) {
    assert.equal(typeof v, 'string', k);
    assert.doesNotMatch(v, /<\/?[a-z!]|&(?:[a-z]+|#\d+);/i, `${k}: markup or an entity in a value (write the character itself)`);
    const [o, c] = bcount(v);
    assert.equal(o, c, `${k}: unbalanced {b}`);
  }
  // plural groups: key.one and key.other both exist and carry the same placeholders; a plural base is never also a plain key
  const bases = new Map();
  for (const k of keys) if (PLURAL.test(k)) (bases.get(baseOf(k)) || bases.set(baseOf(k), []).get(baseOf(k))).push(k);
  for (const [b, ks] of bases) {
    assert.ok(Object.hasOwn(en, `${b}.one`) && Object.hasOwn(en, `${b}.other`), `${b}: needs .one and .other`);
    assert.ok(!Object.hasOwn(en, b), `${b}: is both a plain key and a plural group`);
    assert.equal(new Set(ks.map((k) => ph(en[k]))).size, 1, `${b}: plural forms use different placeholders`);
  }
});

test('a placeholder is never named b: it collides with the {b} bold marker and would be stripped', () => {
  for (const [f, src] of CODE) assert.doesNotMatch(src, /\b(?:t|tr|tf)\(\s*['"`][^'"`]+['"`]\s*,\s*\{[^}]*(?:[{,]\s*b\s*[:,}])/, `${f}: a t() param named b`);
});

test('every key the code asks for exists in en.js (calls, ternaries, tables); runtime prefixes match real keys', () => {
  const calls = [];
  for (const [f, src] of CODE) for (const m of src.matchAll(/(?<![\w.$])(?:t|tr|tf)\(\s*(['"])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+)\1/g)) calls.push([f, m[2]]);
  assert.ok(calls.length > 500, `only ${calls.length} t() call sites found: the scan is broken`);
  const lost = [...calls, ...[...refs].map((k) => ['(literal)', k])].filter(([, k]) => !exists(k)).map(([f, k]) => `${k} (${f})`);
  assert.deepEqual([...new Set(lost)], [], 'keys used in js/ but missing from en.js');
  for (const p of prefixes) assert.ok(Object.keys(en).some((k) => k.startsWith(p)), `dynamic prefix ${p} matches no key`);
});

test('no unused keys in en.js (the dynamic prefixes above and ALLOW_UNUSED are the documented exceptions)', () => {
  const unused = Object.keys(en).filter((k) => {
    const b = baseOf(k);
    return !(refs.has(k) || refs.has(b) || ALLOW_UNUSED.has(k) || ALLOW_UNUSED.has(b) || [...prefixes].some((p) => k.startsWith(p)));
  });
  assert.deepEqual(unused, [], 'keys in en.js that no code uses: delete them or list them in ALLOW_UNUSED');
});

test('es.js and hi.js: only English keys, matching placeholders, {b} and plural structure', () => {
  for (const [code, cat] of Object.entries(CATS)) {
    assert.equal(typeof cat, 'object', code); assert.ok(cat && !Array.isArray(cat), code);
    for (const [k, v] of Object.entries(cat)) {
      assert.equal(typeof v, 'string', `${code} ${k}`);
      const enKey = Object.hasOwn(en, k) ? k : PLURAL.test(k) && Object.hasOwn(en, `${baseOf(k)}.other`) ? `${baseOf(k)}.other` : null;
      assert.ok(enKey, `${code}: ${k} is not an English key`);
      if (PLURAL.test(k)) { assert.ok(FORMS.includes(k.match(PLURAL)[1]), `${code} ${k}`); assert.ok(Object.hasOwn(en, `${baseOf(k)}.one`), `${code}: ${k} translates a key that is not plural`); }
      else assert.ok(!Object.hasOwn(en, `${k}.one`), `${code}: ${k} is plural in English: use ${k}.one and ${k}.other`);
      assert.equal(ph(v), ph(en[enKey]), `${code} ${k}: placeholders differ from English`);
      assert.deepEqual(bcount(v), bcount(en[enKey]), `${code} ${k}: {b} markers differ from English`);
      assert.doesNotMatch(v, /<\/?[a-z!]|&(?:[a-z]+|#\d+);/i, `${code} ${k}: markup in a translation`);
    }
    // a plural group is all or nothing for the forms the language needs: at least .other when any form is given
    for (const b of new Set(Object.keys(cat).filter((k) => PLURAL.test(k)).map(baseOf))) assert.ok(Object.hasOwn(cat, `${b}.other`), `${code}: ${b} needs .other`);
  }
});

test('missing(): lists the untranslated keys per language and never throws', () => {
  assert.equal(missing(en, {}).length, Object.keys(en).length);
  assert.deepEqual(missing({ a: 1, 'b.one': 1, 'b.other': 1 }, { a: 'x', 'b.one': 'y' }), ['b.other']);
  for (const cat of Object.values(CATS)) assert.ok(missing(en, cat).length <= Object.keys(en).length);
  assert.ok(Object.keys(en).length > 0);
});

// ---- language preference: strictly validated
test('language choice: only en, es, hi are accepted; hostile stored values fall back', () => {
  const store = (v) => ({ getItem: () => v });
  for (const ok of ['en', 'es', 'hi']) assert.equal(I.initial(store(ok), []), ok);
  const hostile = ['EN', 'Es', 'es-MX', 'es ', ' es', 'es\n', 'fr', '', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '<script>alert(1)</script>', '../es', 'es.js', 'es\u0000', 'e'.repeat(100000), 'null', 'undefined', '[object Object]', '["es"]'];
  for (const h of hostile) { assert.equal(I.initial(store(h), []), 'en', JSON.stringify(h).slice(0, 30)); assert.equal(I.valid(h), false); }
  for (const h of [null, undefined, 5, ['es'], { toString: () => 'es' }, true]) { assert.equal(I.initial(store(h), []), 'en'); assert.equal(I.valid(h), false); }
  // hostile stored value: the browser language still applies, never the stored text
  assert.equal(I.initial(store('__proto__'), ['hi-IN']), 'hi');
  assert.equal(I.initial({ getItem() { throw new Error('storage blocked'); } }, ['es']), 'es');
  assert.equal(I.initial(null, undefined), 'en');
  // default from navigator.languages: the first supported primary subtag; junk entries are ignored
  assert.equal(I.initial(store(null), ['fr-FR', 'es-MX', 'hi']), 'es');
  assert.equal(I.initial(store(null), ['hi-IN', 'en-US']), 'hi');
  assert.equal(I.initial(store(null), ['de', 'xx']), 'en');
  assert.equal(I.initial(store(null), [null, 5, {}, '__proto__', 'EN-us']), 'en');
  assert.equal(I.initial(store(null), 'es-AR'), 'es');
  // a stored valid choice beats the browser's
  assert.equal(I.initial(store('en'), ['es']), 'en');
  // save() writes only what it is given and survives a blocked storage
  const w = {}; I.save('es', { setItem: (k, v) => { w[k] = v; } }); assert.deepEqual(w, { 'dronecalc:lang': 'es' });
  assert.doesNotThrow(() => I.save('es', { setItem() { throw new Error('quota'); } }));
  assert.doesNotThrow(() => I.save('es', null));
});

test('setLang: an unknown code lands on English, a known one loads its catalog; <html lang> follows', async () => {
  const had = globalThis.document;
  globalThis.document = { documentElement: { lang: 'en' } };
  try {
    for (const h of ['__proto__', 'fr', '../x', undefined, null, 5]) { assert.equal(await I.setLang(h), 'en'); assert.equal(I.get(), 'en'); }
    assert.equal(await I.setLang('es'), 'es'); assert.equal(document.documentElement.lang, 'es'); assert.equal(I.get(), 'es');
    assert.equal(await I.setLang('hi'), 'hi'); assert.equal(document.documentElement.lang, 'hi');
    assert.equal(await I.setLang('en'), 'en'); assert.equal(document.documentElement.lang, 'en');
  } finally { await I.setLang('en'); if (had === undefined) delete globalThis.document; else globalThis.document = had; }
});

// ---- t(): fallback, placeholders, plurals, escaping
test('t(): the active catalog, then English, then the key itself', async () => {
  try {
    I.registerCatalog('es', { 'app.back': 'Atrás', 'app.stepTag': 'Paso {n} de {total}: ' });
    await I.setLang('es');
    assert.equal(I.t('app.back'), 'Atrás');
    assert.equal(I.t('app.stepTag', { n: 2, total: 4 }), 'Paso 2 de 4: ');
    assert.equal(I.t('app.next'), en['app.next'], 'a key es lacks falls back to English');
    assert.equal(I.t('no.such.key'), 'no.such.key', 'a key nobody has is shown as itself');
    assert.equal(I.t('app.back', undefined, 'en'), en['app.back'], 'a language override reads that catalog');
    await I.setLang('en');
    assert.equal(I.t('app.back'), en['app.back']);
  } finally { I.registerCatalog('es', es); await I.setLang('en'); }
});

test('t(): {name} placeholders, one pass, a missing param stays visible', () => {
  assert.equal(I.t('app.stepTag', { n: 1, total: 4 }), 'Step 1 of 4: ');
  assert.equal(I.t('app.stepTag', { n: '{total}', total: 4 }), 'Step {total} of 4: ', 'a param value is never expanded again');
  assert.equal(I.t('app.stepTag', { n: 1 }), 'Step 1 of {total}: ', 'a missing param is left as written, not blank');
  assert.equal(I.t('app.stepTag', { n: null, total: undefined }), 'Step {n} of {total}: ');
  assert.equal(I.t('app.stepTag', { n: 0, total: 0 }), 'Step 0 of 0: ', 'zero is a value');
});

test('plurals: key.one / key.other through Intl.PluralRules, in the language of the catalog', async () => {
  assert.equal(I.t('io.summary', { count: 1, added: 1, skipped: 0 }), 'Imported 1 build, skipped 0.');
  assert.equal(I.t('io.summary', { count: 2, added: 2, skipped: 1 }), 'Imported 2 builds, skipped 1.');
  assert.equal(I.t('io.summary', { count: 0, added: 0, skipped: 3 }), 'Imported 0 builds, skipped 3.');
  assert.equal(I.t('pdfx.parts', { count: 1 }), '1 part'); assert.equal(I.t('pdfx.cats', { count: 3 }), '3 categories');
  try {
    // Hindi counts 0 and 1 as "one": the catalog's own language decides, not English
    I.registerCatalog('hi', { 'io.summary.one': 'ONE {added} {skipped}', 'io.summary.other': 'OTHER {added} {skipped}' });
    await I.setLang('hi');
    assert.equal(I.t('io.summary', { count: 0, added: 0, skipped: 0 }), 'ONE 0 0');
    assert.equal(I.t('io.summary', { count: 1, added: 1, skipped: 0 }), 'ONE 1 0');
    assert.equal(I.t('io.summary', { count: 2, added: 2, skipped: 0 }), 'OTHER 2 0');
    // a form the catalog lacks falls back to English for that form
    I.registerCatalog('hi', { 'io.summary.other': 'OTHER {added} {skipped}' });
    assert.equal(I.t('io.summary', { count: 1, added: 1, skipped: 0 }), 'Imported 1 build, skipped 0.');
  } finally { I.registerCatalog('hi', hi); await I.setLang('en'); }
});

test('numbers and dates use Intl with Latin digits in every language', async () => {
  try {
    assert.equal(I.fmtNum(1234567.5), '1,234,567.5');
    await I.setLang('es'); const e = I.fmtNum(1234567.5); assert.match(e, /^[\d.,  ]+$/); assert.notEqual(e, '1,234,567.5', 'Spanish separators');
    await I.setLang('hi'); const h = I.fmtNum(1234567.5); assert.match(h, /^[\d.,]+$/, 'Latin digits, not Devanagari'); assert.doesNotMatch(h, /[०-९]/);
    const d = I.fmtDate(new Date(Date.UTC(2026, 10, 15, 12)), { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    assert.match(d, /2026/); assert.doesNotMatch(d, /[०-९]/);
    assert.equal(I.fmtDate('not a date'), '');
  } finally { await I.setLang('en'); }
});

test('t() returns plain text; tf() escapes catalog text and params and allows only {b}', async () => {
  const hostile = '<img src=x onerror=alert(1)>"\'&';
  // t(): the param comes back verbatim as TEXT (the caller escapes it), {b} in the catalog is stripped, {b} in a param is not interpreted
  assert.equal(I.t('app.stepTag', { n: hostile, total: 1 }), `Step ${hostile} of 1: `);
  assert.equal(I.t('lib.empty'), 'No saved builds yet. Press Save build on a results page to keep it here.');
  assert.equal(I.t('app.stepTag', { n: '{b}x{/b}', total: 1 }), 'Step {b}x{/b} of 1: ');
  // tf(): escaped params, <b> only from the catalog's own {b}
  const h = I.tf('meas.chartCap', { secs: hostile });
  assert.doesNotMatch(h, /<img/); assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;&quot;&#39;&amp;/); assert.match(h, /^<b>Flight log\.<\/b> /);
  assert.equal(I.tf('lib.empty'), 'No saved builds yet. Press <b>Save build</b> on a results page to keep it here.');
  assert.equal(I.tf('meas.chartCap', { secs: '{b}x{/b}' }).match(/<b>/g).length, 1, 'a param cannot add bold');
  assert.equal(I.tf('no.such.key'), 'no.such.key', 'an unknown key is shown as itself, escaped');
  // slots take pre-built safe fragments, and only for the names the caller gives
  assert.equal(I.tf('app.ha.cal', { predicted: 1, measured: 2, factor: 3 }, { btn: '<button>x</button>' }).endsWith('<button>x</button>'), true);
  assert.doesNotMatch(I.tf('app.ha.cal', { predicted: 1, measured: 2, factor: 3, btn: '<button>x</button>' }), /<button/, 'a param is never a slot');
  // an untrusted catalog: tags and entities in a translation are text, never HTML
  try {
    I.registerCatalog('es', { 'meas.chartCap': '<script>alert(1)</script>{b}ok{/b} {secs} <img src=x onerror=1> &amp; {b}', 'app.stepTag': '<b onmouseover=x>{n}</b>' });
    await I.setLang('es');
    const f = I.tf('meas.chartCap', { secs: 5 });
    assert.doesNotMatch(f, /<script|<img/); assert.match(f, /&lt;script&gt;/); assert.match(f, /&amp;amp;/);
    assert.equal(I.t('app.stepTag', { n: 1, total: 2 }), '<b onmouseover=x>1</b>', 't() is plain text: the caller escapes it');
    assert.equal(I.tf('app.stepTag', { n: 1, total: 2 }), '&lt;b onmouseover=x&gt;1&lt;/b&gt;');
  } finally { I.registerCatalog('es', es); await I.setLang('en'); }
});

// A hostile language file (every string is markup) rendered through every render function that has no DOM: nothing may come out as an element.
const BUILDS = ['#s=3&m=inspection&n=Inspect&cfg=hex&ha=20&age=10&b=5000&cur=INR', '#s=3&m=fpv&fc=7&mw=900', '#s=3&m=mapping&cfg=fixedwing&n=Wing%20One', '#s=3&m=delivery&cfg=vtol&mw=3500'];
const X = createState({ E, C, M, PERF, CHK });
const money = (x) => `$${x}`;
function screens(hash) {
  const { S } = X.parse(hash), est = X.run(S), R = X.results(S, est), r = R.r;
  const picks = {}; let i = 0; for (const k of R.sec.main) if (R.rec?.[k]?.[0] && i++ % 2 === 0) picks[k] = R.rec[k][0].id;
  const rows = X.bomRows(R, picks), cs = X.ctx(R, { ...S, sel: picks });
  const items = [{ id: 'a1', name: 'Alpha', hash, savedAt: 1 }, { id: 'b2', name: 'Beta', hash: BUILDS[1], savedAt: 2 }];
  const cols = items.map((b) => compareRow(X, CHK, b));
  return {
    parts: partsHtml(cs), bom: bomHtml(rows, cs), dock: dockHtml(rows, cs), wiring: wiringHtml(wiringRows(r, S.mission)),
    perf: PERF.renderPerformance(r, { missionLabel: X.MISSIONS[S.mission].label }), lib: libHtml(items, { cmp: new Set(['a1', 'b2']), confirm: 'a1', edit: null }, cols), cmp: cmpHtml(cols), io: ioHtml(2),
    meas: measuredHtml({ curves: [{ id: 'abcd1234', name: 'Curve' }], attached: 'abcd1234', missing: true, mc: { name: 'Curve', points: 9, motors: 4, maxThrustG: 1500, hoverA: 8 }, msg: '', logMsg: '', log: null, confirm: true }),
    custom: customHtml([], undefined, money),
  };
}
test('an untrusted language file cannot inject markup into any rendered screen', async () => {
  const evil = Object.fromEntries(Object.keys(en).map((k) => [k, `<img src=x onerror=alert(1)><script>x</script>{b}b{/b} ${ph(en[k]).split(',').filter(Boolean).map((p) => `{${p}}`).join(' ')}`]));
  try {
    I.registerCatalog('es', evil); await I.setLang('es');
    for (const h of BUILDS) for (const [name, html] of Object.entries(screens(h))) { assert.doesNotMatch(html, /<img|<script/i, `${name} (${h}) rendered a translation as markup`); assert.ok(html.length > 20, name); }
  } finally { I.registerCatalog('es', es); await I.setLang('en'); }
});

test('the language never changes the share hash, and the numbers do not move with it', async () => {
  const tr = Object.fromEntries(Object.keys(en).filter((k) => /^(mission|cfg|mat|region|cur)\./.test(k)).map((k) => [k, `XX ${en[k]}`]));
  const out = {};
  try {
    for (const code of ['en', 'es', 'hi']) {
      I.registerCatalog('es', code === 'es' ? tr : es); I.registerCatalog('hi', code === 'hi' ? tr : hi); await I.setLang(code);
      out[code] = BUILDS.map((h) => {
        const { S, step } = X.parse(h), est = X.run(S), R = X.results(S, est);
        return { hash: X.hashOf(S, 3), again: X.hashOf(X.parse(X.hashOf(S, 3)).S, 3), step, S, auw: R.r.auwKg, min: R.r.estFlightMin, twr: R.r.twr, ids: est.warningIds, mission: X.MISSIONS[S.mission].label };
      });
    }
  } finally { I.registerCatalog('es', es); I.registerCatalog('hi', hi); await I.setLang('en'); }
  for (const code of ['es', 'hi']) out[code].forEach((o, i) => {
    const b = out.en[i];
    assert.equal(o.hash, b.hash, `${code}: hash changed`); assert.equal(o.again, b.again); assert.deepEqual(o.S, b.S, `${code}: parsed state changed`);
    assert.equal(o.auw, b.auw); assert.equal(o.min, b.min); assert.equal(o.twr, b.twr); assert.deepEqual(o.ids, b.ids, `${code}: warning ids changed`);
    assert.notEqual(o.mission, b.mission, `${code}: the test catalog did not apply`);
  });
  for (const o of out.en) assert.doesNotMatch(o.hash, /lang|%C3|[ऀ-ॿ]/, 'no language in the hash');
  assert.doesNotMatch(read('js/ui/state.js').match(/function hashOf[\s\S]*?\n  }\n/)?.[0] ?? '', /lang/i, 'hashOf does not read the language');
});

// ---- PDF: Spanish uses its Latin letters, Hindi falls back to English with a stated note
test('PDF: es labels are written in WinAnsi, hi falls back to an English PDF that says so', async () => {
  const hash = BUILDS[0], { S } = X.parse(hash), R = X.results(S, X.run(S));
  const picks = {}; let i = 0; for (const k of R.sec.main) if (R.rec?.[k]?.[0] && i++ % 2 === 0) picks[k] = R.rec[k][0].id;
  const Ss = { ...S, sel: picks };
  const text = (b) => Buffer.from(b).toString('latin1');
  try {
    const docEn = X.pdfDoc(R, Ss, '2026-11-08'), pdfEn = buildBomPdf(docEn);
    assert.ok(!docEn.notes.some((n) => n === en['pdf.fallbackNote'].replace('{language}', 'Hindi')));
    // Hindi: translated Devanagari everywhere, but the PDF is the English doc plus one note
    I.registerCatalog('hi', { 'pdf.mission': 'मिशन', 'pdfx.col.part': 'पुर्ज़ा', 'pdfx.keyFigures': 'मुख्य आँकड़े', 'pdf.fallbackNote': 'हिन्दी PDF: {language}' });
    await I.setLang('hi');
    const docHi = X.pdfDoc(R, Ss, '2026-11-08'), pdfHi = buildBomPdf(docHi);
    assert.equal(docHi.notes[0], en['pdf.fallbackNote'].replace('{language}', 'Hindi'), 'the note is English, names the language, and comes first');
    assert.deepEqual({ ...docHi, notes: docHi.notes.slice(1) }, docEn, 'the Hindi PDF body is the English body');
    assert.doesNotMatch(JSON.stringify(docHi), /[ऀ-ॿ]/, 'no Devanagari reaches the PDF writer');
    assert.doesNotMatch(text(pdfHi).replace(/\/(Title|Subject) <FEFF[0-9a-f]*>/g, ''), /\?{3}/, 'no question-mark mangling');
    assert.match(text(pdfHi), /KEY FIGURES/); assert.match(text(pdfHi), /BILL OF MATERIALS/);
    // Spanish: chrome and body in Spanish, accents survive as WinAnsi bytes
    I.registerCatalog('es', { 'pdfx.keyFigures': 'Cifras clave', 'pdfx.bom': 'Lista de materiales', 'pdfx.col.part': 'Pieza', 'pdfx.page': 'Página {n} de {total}', 'pdfx.total': 'Total', 'pdf.endurance': 'Autonomía' });
    await I.setLang('es');
    const docEs = X.pdfDoc(R, Ss, '2026-11-08'), pdfEs = buildBomPdf(docEs), t = text(pdfEs);
    assert.ok(!docEs.notes.some((n) => /Hindi|English/.test(n) && /PDF format/.test(n)), 'no fallback note for Spanish');
    assert.match(t, /CIFRAS CLAVE/); assert.match(t, /LISTA DE MATERIALES/); assert.match(t, /P\xe1gina 1 de \d/); assert.match(t, /PIEZA/);
    assert.notEqual(text(pdfEs), text(pdfEn));
    // the on-screen language is restored after a PDF is built
    assert.equal(I.get(), 'es'); assert.equal(I.t('pdfx.keyFigures'), 'Cifras clave');
    await I.setLang('hi'); buildBomPdf(docEn); assert.equal(I.get(), 'hi', 'building the PDF does not switch the page language');
  } finally { I.registerCatalog('es', es); I.registerCatalog('hi', hi); await I.setLang('en'); U.set('metric'); }
});

// ---- the page wiring (static: app.js and index.html are DOM code, checked here and run for real in the headless test)
test('page: labelled language selector, applied before the first render, kept out of the hash', () => {
  const html = read('index.html'), app = read('js/app.js');
  assert.match(html, /<label for="lang"[^>]*>[^<]+<\/label><select id="lang"/);
  for (const c of I.LANGS) assert.ok(html.includes(`<option value="${c}" lang="${c}">${I.LANG_NAMES[c]}</option>`), `option ${c} labelled in its own language`);
  assert.ok(html.indexOf('class="unit-tog"') < html.indexOf('class="lang-tog"'), 'selector sits next to the unit toggle');
  assert.match(html, /<html lang="en">/);
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(exists(m[1]), `index.html: ${m[1]}`);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(';')) assert.ok(exists(p.split(':')[1]), `index.html: ${p}`);
  assert.ok(app.indexOf('await initLang()') > 0 && app.indexOf('await initLang()') < app.indexOf('createState('), 'the language is loaded before anything renders');
  assert.ok(app.indexOf('await initLang()') < app.indexOf('view();'), 'before the first view()');
  assert.match(app, /await setLang\(c\); saveLang\(c\); applyStatic\(\);\s*view\(\);/, 'a change re-renders from the unchanged state');
  assert.match(app, /document\.title = `\$\{STEPS\(\)\[step\]\}/, 'the title follows the language on every draw');
  assert.doesNotMatch(read('js/ui/state.js').match(/function hashOf[\s\S]*?\n  }\n/)?.[0] ?? '', /lang/i);
  assert.match(read('js/i18n/i18n.js'), /document\.documentElement\.lang = lang/, '<html lang> follows');
});

test('css: Devanagari system fonts, taller lines, no uppercase or tracking under :lang(hi), warning words from the catalog', () => {
  const css = read('css/main.css').replace(/\r\n/g, '\n');
  for (const f of ['Nirmala UI', 'Kohinoor Devanagari', 'Noto Sans Devanagari', 'Mangal']) for (const v of ['--head', '--body', '--mono']) assert.match(css, new RegExp(`${v}:[^;]*"${f}"`), `${v} lists ${f}`);
  assert.doesNotMatch(css, /@font-face[^}]*Devanagari/i, 'no Devanagari font is bundled');
  const hi = css.slice(css.indexOf(':lang(hi)'));
  assert.match(hi, /text-transform:none/); assert.match(hi, /letter-spacing:normal/); assert.match(hi, /line-height:1\.[4-9]/);
  assert.doesNotMatch(css, /content:"(CAUTION|CHECK) "/, 'warning words live in the catalog (--w-caution, --w-check)');
  assert.match(read('js/app.js'), /--w-caution/);
});

test('the shipped es.js and hi.js are valid, empty and load', async () => {
  assert.deepEqual(Object.keys(es).filter((k) => !Object.hasOwn(en, k) && !PLURAL.test(k)), []);
  for (const c of ['es', 'hi']) assert.equal(typeof (await import(`../js/i18n/${c}.js`)).default, 'object');
  assert.deepEqual(I.LANGS, ['en', 'es', 'hi']);
  for (const c of I.LANGS) assert.ok(I.LANG_NAMES[c].length > 0);
  assert.equal(I.LANG_NAMES.es, 'Español'); assert.equal(I.LANG_NAMES.hi, 'हिन्दी');
});
