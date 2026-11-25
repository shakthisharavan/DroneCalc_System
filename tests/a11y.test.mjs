// Accessibility (WCAG 2.2 AA): static checks through the same render functions the other tests use, plus a contrast check over the CSS tokens.
// Deterministic and fast: no browser, no axe. The live audit (axe-core in a real browser) is a manual step and is not a project dependency.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderPerformance } from '../js/ui/perf.js';
import { bomHtml } from '../js/ui/parts.js';
import { libHtml, cmpHtml } from '../js/ui/library.js';
import { ioHtml } from '../js/ui/io.js';
import { wiringHtml } from '../js/ui/wiring.js';
import { measuredHtml, logChart } from '../js/ui/measured.js';
import { customHtml } from '../js/ui/custom.js';
import en from '../js/i18n/en.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const css = read('css/main.css') + '\n' + read('css/perf.css');
const html = read('index.html');
const app = read('js/app.js');

// ---- colour maths (WCAG 2.x relative luminance) -------------------------------------------------------------------------------------
function parse(s) {
  s = s.trim();
  let m;
  if (s === 'transparent') return [0, 0, 0, 0];
  if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1);
  if ((m = /^#([0-9a-f]{6})$/i.exec(s))) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  if ((m = /^rgba?\(([^)]+)\)$/.exec(s))) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error('cannot parse colour: ' + s);
}
const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1); };
const mix = (a, pct, b) => { const p = pct / 100; return [0, 1, 2].map((i) => a[i] * p + b[i] * (1 - p)).concat(1); }; // color-mix(in srgb, a pct%, b) with an opaque b
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---- tokens: custom properties of the :root block (light-dark(light, dark) split into both themes) --------------------------------------
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
function splitTop(s, sep) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === sep && d === 0) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }
function block(src, head) { // body of the first `head{...}` (balanced)
  const i = src.indexOf(head + '{'); assert.ok(i >= 0, head + ' block');
  let d = 0, j = i + head.length;
  for (; j < src.length; j++) { if (src[j] === '{') d++; if (src[j] === '}' && --d === 0) break; }
  return src.slice(i + head.length + 1, j);
}
const mainCss = noComments(read('css/main.css'));
const decls = (body) => Object.fromEntries(splitTop(body, ';').map((d) => d.trim()).filter((d) => d.startsWith('--')).map((d) => { const k = d.indexOf(':'); return [d.slice(0, k), d.slice(k + 1).trim()]; }));
const RAW = decls(block(mainCss.slice(mainCss.search(/:root\{\s*--paper/)), ':root')); // the :root block with the tokens: the first only sets color-scheme
const FALLBACK = decls(block(block(mainCss, '@supports not (color:light-dark(#000,#fff))'), ':root'));
const LD = /^light-dark\((.*)\)$/s;
const TOK = { light: {}, dark: {} };
for (const [k, v] of Object.entries(RAW)) { const m = LD.exec(v), [l, d] = m ? splitTop(m[1], ',').map((x) => x.trim()) : [v, v]; TOK.light[k] = l; TOK.dark[k] = d; }

// A colour expression: a token, a literal, or `mix(token pct literal-bg)` written as [tokenOrLiteral, pct, bg].
const col = (theme, x) => (Array.isArray(x) ? mix(col(theme, x[0]), x[1], col(theme, x[2])) : x.startsWith('--') ? parse(TOK[theme][x]) : parse(x));
const solid = (theme, fg, bg) => { const b = col(theme, bg); return over(col(theme, fg), b); };

// [foreground, background, minimum ratio, what]. 4.5 = text, 3 = UI component or graphic (WCAG 1.4.3, 1.4.11).
const PAIRS = [
  // body text on the three light surfaces (and the dark equivalents)
  ...['--paper', '--sheet', '--paper-2'].flatMap((b) => [['--ink', b, 4.5, 'ink'], ['--ink-2', b, 4.5, 'ink-2 (hints, captions)'], ['--accent', b, 4.5, 'accent text (.tag, .rk, links, fx)'], ['--ok', b, 4.5, 'ok text'], ['--bad', b, 4.5, 'bad text and errors']]),
  ['--mustard-ink', '--sheet', 4.5, 'mustard-ink text'], ['--mustard-ink', '--paper', 4.5, 'mustard-ink text'], ['--blue-ink', '--sheet', 4.5, 'blue-ink text'], ['--teal-ink', '--sheet', 4.5, 'teal-ink text'], ['--slate-ink', '--sheet', 4.5, 'slate-ink text'],
  // badges: .badge.cust is mustard-ink on a 12% mustard wash over the card surface
  ['--mustard-ink', [['--mustard', 12, '--sheet']], 4.5, '.badge.cust on sheet'],
  ['--mustard-ink', [['--mustard', 12, '--paper']], 4.5, '.badge.cust on paper'],
  // tinted washes under text: warning boxes, selected table row, KPI bands, category headings
  ['--ink', [['--bad', 12, '--sheet']], 4.5, '.cfg-warn li'], ['--ink', [['--bad', 16, '--paper']], 4.5, '.rwarns li'], ['--bad', [['--bad', 16, '--paper']], 4.5, '.rwarns CAUTION word'],
  ['--accent', [['--accent', 10, '--sheet']], 4.5, '.pf-tbl tr.hi'], ['--ok', [['--ok', 10, '--sheet']], 4.5, '.kpi[data-band=good]'], ['--mustard-ink', [['--mustard', 10, '--sheet']], 4.5, '.kpi[data-band=warn]'], ['--bad', [['--bad', 10, '--sheet']], 4.5, '.kpi[data-band=bad]'],
  ['--mustard-ink', [['--mustard', 12, '--sheet']], 4.5, '.bat-flag CHECK word'], ['--bad', [['--bad', 9, '--sheet']], 4.5, '.chk[data-lvl=fail]'], ['--bad', [['--bad', 8, '--sheet']], 4.5, '.field.bad error text'],
  ['--ink', [['--blue', 16, '--sheet']], 4.5, 'category heading (blue)'], ['--ink', [['--teal', 16, '--sheet']], 4.5, 'category heading (teal)'], ['--ink', [['--mustard', 16, '--sheet']], 4.5, 'category heading (mustard)'], ['--ink', [['--accent', 16, '--sheet']], 4.5, 'category heading (accent)'], ['--ink', [['--slate', 16, '--sheet']], 4.5, 'category heading (slate)'], ['--ink', [['--ink-2', 16, '--sheet']], 4.5, 'category heading (ink)'],
  // inverted surface: section bands, checked choices, selected parts
  ['--inv-ink', '--inv', 4.5, 'text on the inverted surface'], ['--ink-on', '--inv', 4.5, 'secondary text on the inverted surface'], ['--ok-lite', '--inv', 4.5, 'ok on inverted'], ['--bad-lite', '--inv', 4.5, 'bad on inverted'], ['--mustard-lite', '--inv', 4.5, 'mustard on inverted (.badge.cust, selected)'], ['--amber', '--inv', 4.5, 'amber on inverted (.rk, .tag)'],
  ['--on-accent', '--accent', 4.5, 'text on accent fills (primary button)'], ['--on-amber', '--amber', 4.5, 'text on amber fills (selected button)'], ['--paper', '--ink', 4.5, 'hover/pressed inversion'], ['--on-amber', '--amber', 4.5, 'selection'],
  // dark instrument panel (the same in both themes) and the dock
  ['--panel-ink', '--panel', 4.5, 'panel text'], ['--panel-dim', '--panel', 4.5, 'panel secondary text'], ['--amber', '--panel', 4.5, 'panel numerals'], ['--panel-dim', '--panel-2', 4.5, 'panel secondary on tinted'], ['--panel-ink', '--panel-2', 4.5, 'panel text on tinted'],
  ['#9a9787', '--panel', 4.5, '.d-list span (unselected part)'], ['#f1c9c0', '--panel-2', 4.5, '.warns li'], ['#ff6a4d', '--panel-2', 4.5, '.warns CAUTION word'], ['--ok-lite', '--panel', 4.5, '.d-bud.ok'], ['--bad-lite', '--panel', 4.5, '.d-bud.bad'],
  ['--on-accent', '--accent', 4.5, 'dock primary button'], ['--panel-ink', '--panel', 4.5, 'dock buttons'], ['--panel', '--panel-ink', 4.5, 'dock button hover'],
  // chart text (haloed in the figure surface) and legend text
  ['--ink-2', '--sheet', 4.5, 'chart axis and tick text'], ['--accent', '--sheet', 4.5, 'chart build-point label'], ['--bad', '--sheet', 4.5, 'chart limit label'], ['--amber', '--panel', 4.5, 'chart tooltip values'], ['--on-accent', '--blue', 4.5, 'chart segment label on blue'], ['--on-accent', '--teal', 4.5, 'chart segment label on teal'], ['--on-accent', '--mustard', 4.5, 'chart segment label on mustard'],
  // UI components and graphics, 3:1 (1.4.11): input borders, focus rings, chart series, state glyphs
  ['--ink', '--sheet', 3, 'input border'], ['--ink', '--paper', 3, 'button border'], ['--accent', '--paper', 3, 'focus ring on paper'], ['--accent', '--sheet', 3, 'focus ring on sheet'], ['--amber', '--inv', 3, 'focus ring on inverted'], ['--amber', '--panel', 3, 'focus ring on panel'],
  ['--blue', '--sheet', 3, 'series blue'], ['--teal', '--sheet', 3, 'series teal'], ['--mustard', '--sheet', 3, 'series mustard'], ['--accent', '--sheet', 3, 'build-point marker'], ['--bad', '--sheet', 3, 'limit line'], ['--ink-2', '--sheet', 3, 'reference line'], ['--ok', '--sheet', 3, 'ok glyph'], ['--bad', '--sheet', 3, 'fail glyph'],
  ['--ink-2', '--paper', 3, 'glossary ring'], ['--ink', '--paper', 3, 'toggle border'], ['--panel-ink', '--panel', 3, 'panel gauge mark'], ['--amber', '--panel', 3, 'gauge fill'], ['#ff6a4d', '--panel', 3, 'gauge fill bad'], ['#6bd68f', '--panel', 3, 'gauge fill good'],
];
// Disabled controls are exempt from 1.4.3 (inactive components); they still keep the 40% opacity text readable enough to find, which is not asserted.

test('tokens: light-dark() fallback block repeats the light values', () => {
  for (const [k, v] of Object.entries(FALLBACK)) assert.equal(v, TOK.light[k], `fallback ${k}`);
  for (const [k, v] of Object.entries(RAW)) if (LD.test(v)) assert.ok(k in FALLBACK, `${k} has a light-dark() value but no fallback`);
});

for (const theme of ['light', 'dark']) {
  test(`contrast (${theme}): text 4.5:1, UI components and graphics 3:1`, () => {
    const bad = [];
    for (const [fg, bg, min, what] of PAIRS) {
      const b = Array.isArray(bg) ? col(theme, bg[0]) : col(theme, bg);
      const r = ratio(solid(theme, fg, Array.isArray(bg) ? bg[0] : bg), b);
      if (r < min) bad.push(`${what}: ${(Array.isArray(fg) ? fg[0] : fg)} on ${Array.isArray(bg) ? JSON.stringify(bg[0]) : bg} = ${r.toFixed(2)} < ${min}`);
    }
    assert.deepEqual(bad, []);
  });
}

// ---- structure, dialogs, forms, charts, tables ---------------------------------------------------------------------------------------
const ids = (s) => new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));

test('page shell: lang, one h1, landmarks, skip link, polite status region, no zoom lock', () => {
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  for (const t of ['<header', '<main', '<footer']) assert.ok(html.includes(t), t);
  assert.match(html, /<a class="skip" href="#main"[^>]*>Skip to main content<\/a>/);
  assert.match(html, /<main id="main"[^>]*tabindex="-1"/);
  assert.match(html, /id="sr-live" role="status"/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale/);
  assert.match(app, /<nav aria-label="\$\{esc\(tr\('app\.stepsNav'\)\)\}"><ol class="rail">/); // step indicator inside a nav landmark (labelled "Steps" in en.js)
  assert.match(en['app.stepsNav'], /^Steps$/); assert.match(en['app.stepTag'], /^Step \{n\} of \{total\}: $/);
  assert.match(app, /aria-current="step"/);
  assert.match(app, /tr\('app\.stepTag', \{ n: step \+ 1, total: STEPS\(\)\.length \}\)/); // heading text carries the step number
});

test('My builds drawer: modal dialog, labelled, background inert, Tab trapped, Escape and Close return focus', () => {
  assert.match(html, /<div class="lib" id="lib" role="dialog" aria-modal="true" aria-labelledby="lib-h" hidden>/);
  assert.match(libHtml([], { cmp: new Set() }, []), /<h2 id="lib-h" tabindex="-1">My builds<\/h2>/);
  assert.match(app, /BEHIND = \['\.mast', '#shell', '\.foot'\]/);
  assert.match(app, /el\.inert = on/);
  assert.match(app, /libEl\.addEventListener\('keydown', trapTab\)/);
  assert.match(app, /if \(libEl && !libEl\.hidden\) return closeLib\(true\)/); // Escape
  assert.match(app, /if \(back\) libTog\.focus\(\)/);
});

test('library list: per-build button names, compare region and caption', () => {
  const items = [{ id: 'a1', name: 'Alpha', hash: '#s=3&m=mapping', savedAt: 0 }, { id: 'b2', name: 'Beta', hash: '#s=3&m=fpv', savedAt: 0 }];
  const cols = items.map((b) => ({ name: b.name, mission: 'M', config: 'C', auw: '1', flight: '2', twr: '3', hover: '4', battery: '5', bom: '6', wclass: '7' }));
  const h = libHtml(items, { cmp: new Set(['a1', 'b2']), confirm: null, edit: null }, cols);
  for (const v of ['Rename Alpha', 'Delete Beta', 'Compare Alpha']) assert.ok(h.includes('aria-label="' + v + '"'), v);
  assert.match(h, /<div class="cmp" tabindex="0" role="region" aria-label="Compared builds">/);
  assert.match(cmpHtml(cols), /<caption class="sr">[^<]+<\/caption>[\s\S]*<th scope="col">Alpha<\/th>[\s\S]*<th scope="row">Mission<\/th>/);
  assert.doesNotMatch(cmpHtml(cols), /<td><\/td>/); // no empty header cell
  assert.match(ioHtml(1), /role="group" aria-label="Build files"[\s\S]*type="file"[^>]*aria-label="[^"]+"/);
});

test('tables: BOM and wiring have names, header cells have scope', () => {
  const row = { key: 'motor', label: 'Motors', it: { id: 'm', name: 'MN3508', brand: 'T-Motor', priceUsd: 10, links: [] }, qty: 4, line: 40 };
  const b = bomHtml([row], { money: (x) => '$' + x, where: 'in US', budgetUsd: null });
  assert.match(b, /<table class="bomt"><caption class="sr">[^<]+<\/caption>/);
  assert.ok((b.match(/<th scope="col"/g) || []).length >= 5);
  const w = wiringHtml({ rows: [{ name: 'Battery lead', connector: 'XT60', count: 1, lengthMm: 150 }], derived: true });
  assert.match(w, /<table class="wt" aria-labelledby="h-wiring">/);
  assert.ok(ids(w).has('h-wiring'));
});

test('charts: every figure is role=img with a label, a visible long description and a data table', () => {
  const page = read('tests/perf-preview.html');
  new Function(page.match(/<script id="fx">([\s\S]*?)<\/script>/)[1])();
  const { quad, fixedwing } = globalThis.PERF_FIXTURES;
  for (const r of [quad, fixedwing]) {
    const out = renderPerformance(r, { missionLabel: 'Mapping / survey' }), have = ids(out);
    const svgs = [...out.matchAll(/<svg class="pf-svg"([^>]*)>/g)].map((x) => x[1]);
    assert.ok(svgs.length >= 6);
    for (const a of svgs) {
      assert.match(a, /role="img"/); assert.match(a, /tabindex="0"/); assert.match(a, /aria-label="Figure \d, [^"]+"/);
      const d = /aria-describedby="([^"]+)"/.exec(a)?.[1];
      assert.ok(d && have.has(d), 'aria-describedby points at an element on the page: ' + d);
    }
    for (const id of out.matchAll(/data-pf="table" aria-expanded="false" aria-controls="([^"]+)"/g)) assert.ok(have.has(id[1]), 'table toggle target ' + id[1]);
    assert.ok((out.match(/<caption class="pf-sr">/g) || []).length >= 6);
    assert.ok((out.match(/<th scope="col">/g) || []).length >= 12);
    assert.ok((out.match(/class="pf-sr" aria-live="polite"/g) || []).length >= 6); // arrow-key values are spoken
  }
  const log = { t: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], v: Array(10).fill(22), i: Array(10).fill(10) };
  assert.match(logChart(log, 10), /role="img" aria-label="[^"]+" aria-describedby="fl-cap"/);
  assert.match(measuredHtml({ curves: [], attached: '', missing: false, mc: null, msg: '', logMsg: '', log: { stats: { warn: [], flightS: 60 }, rows: [], chart: '<svg></svg>', canCal: false, calA: 0 }, confirm: false }), /<figcaption id="fl-cap">/);
  assert.match(css, /\.pf-svg:focus-visible\{outline:3px/);
});

test('forms: every control has a label, units and errors are tied with aria-describedby, sliders have valuetext', () => {
  const f = customHtml([], undefined, (x) => '$' + x), have = ids(f);
  const controls = [...f.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"[^>]*>/g)].map((x) => ({ id: x[1], tag: x[0] }));
  assert.ok(controls.length > 6);
  for (const c of controls) {
    assert.ok(new RegExp('<label for="' + c.id + '"').test(f), 'label for ' + c.id);
    const dby = /aria-describedby="([^"]+)"/.exec(c.tag)?.[1] ?? '';
    for (const d of dby.split(' ').filter(Boolean)) assert.ok(have.has(d), c.id + ' describes ' + d);
  }
  assert.match(f, /class="err" id="e-[^"]+" role="alert"/);
  // app.js numeric fields, measured weight and hover current: the unit comes first in the description
  for (const s of ['u-${id} e-${id}', 'u-mw e-mw h-mw', 'u-ha e-ha h-ha']) assert.ok(app.includes(s), s);
  assert.match(app, /data-sync="targetFlightMin" data-unit="min" aria-valuetext=/);
  assert.match(app, /data-sync="age" data-unit="%" aria-valuetext=/);
  assert.match(app, /setAttribute\('aria-valuetext'/);
  assert.match(css, /::placeholder\{color:var\(--ink-2\)/);
});

test('focus: step changes focus the heading, redraws keep focus and caret, the first draw does not take focus', () => {
  assert.match(app, /view\(true\); window\.scrollTo/);
  assert.match(app, /addEventListener\('hashchange', \(\) => \{ load\(\); view\(true\); \}\)/);
  assert.match(app, /setSelectionRange\(snap\.s, snap\.e\)/);
  assert.match(app, /const first = shown === null/);
  assert.equal((app.match(/id="h">\$\{stepTag\(\)\}/g) || []).length, 5); // every step heading is focusable (tabindex=-1) and carries the step
});

test('live regions: one polite region per message, none inside display:none', () => {
  assert.match(app, /function announce\(msg\)/);
  assert.doesNotMatch(app, /id="sel-msg"/); // the dock body is display:none when closed
  assert.match(app, /<p class="pdf-msg"><\/p><\/div>/); // the dock copy of the PDF message is not a second live region
  assert.match(app, /box\.setAttribute\('role', 'status'\)/); // update prompt
});

test('css: focus ring >= 2px, reduced motion, more contrast, print keeps the custom-part mark, targets >= 24px', () => {
  assert.match(css, /:focus-visible\{outline:3px solid var\(--accent\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\*,::before,::after\{transition:none!important;animation:none!important;scroll-behavior:auto!important\}\}/);
  assert.match(css, /@media \(prefers-contrast:more\)/);
  assert.match(css, /\.badge:not\(\.cust\)\{display:none!important\}/);
  assert.match(css, /\.gl>summary\{[^}]*width:24px;height:24px/);
  assert.match(css, /\.btn\.sm\{[^}]*min-height:44px/);
  assert.doesNotMatch(css, /overflow-x:hidden/); // reflow: nothing is clipped to hide a horizontal scroll
});
