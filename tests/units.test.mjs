// F6 display units: conversions, hash invariance, input round trip, hostile storage, and no metric unit left in the imperial render of a sample build.
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as C from '../js/catalog.js';
import * as M from '../js/matcher.js';
import * as PERF from '../js/ui/perf.js';
import * as CHK from '../js/checks.js';
import * as U from '../js/ui/units.js';
import { createState } from '../js/ui/state.js';
import { partsHtml, bomHtml, bomCsv, copyText, dockHtml } from '../js/ui/parts.js';
import { wiringRows, wiringHtml } from '../js/ui/wiring.js';
import { buildBomPdf } from '../js/ui/pdf.js';
import { compareRow } from '../js/ui/library.js';
import { validate, newDraft, toRaw, customHtml, ui as cui } from '../js/ui/custom.js';

const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const X = createState({ E, C, M, PERF, CHK });

// ---- known values and round trips (every quantity, both ways)
U.set('imperial');
near(U.toDisplay('kg', 1), 2.20462, 1e-5); near(U.toDisplay('mm', 25.4), 1); near(U.toDisplay('c', 0), 32); near(U.toDisplay('kmh', 100), 62.1371, 1e-4);
near(U.toDisplay('g', 1000), 35.274, 1e-3); near(U.toDisplay('m', 1000), 3280.84, 1e-2); near(U.toDisplay('ms', 10), 22.3694, 1e-4); near(U.toDisplay('km', 10), 6.21371, 1e-4);
near(U.toDisplay('c', 100), 212); near(U.toDisplay('gdm2', 45), 14.746, 1e-2); near(U.toDisplay('kgcm', 1), 13.887, 1e-3);
for (const q of ['g', 'kg', 'mm', 'cm', 'm', 'ms', 'kmh', 'km', 'c', 'gw', 'dm2', 'gdm2', 'gcc', 'kgcm']) for (const v of [-40, 0, 0.35, 1, 123.456, 6000]) near(U.fromDisplay(q, U.toDisplay(q, v)), v, 1e-9);
assert.equal(U.format('kg', 1, 2), '2.20 lb'); assert.equal(U.num('g', 250), '8.8'); assert.equal(U.label('c'), '°F'); assert.equal(U.label('ms'), 'mph');
U.set('metric');
assert.equal(U.toDisplay('kg', 1), 1); assert.equal(U.format('g', 250), '250 g'); assert.equal(U.text('250 g, 5 kg, 3 m/s'), '250 g, 5 kg, 3 m/s', 'metric text is untouched');

// ---- free text: ranges, signs, commas; units without a number and non-units are left alone
U.set('imperial');
assert.equal(U.text('AUW above 25 kg'), 'AUW above 55.1 lb');
assert.equal(U.text('300-450 mm frame, 20 °C, -10 °C'), '11.8-17.7 in frame, 68 °F, 14 °F');
assert.equal(U.text('12 mΩ, 3 min, 2 mAh, 5 in props, 40 mm/s'), '12 mΩ, 3 min, 2 mAh, 5 in props, 40 mm/s');
assert.equal(U.text('1,500 g thrust'), '52.9 oz thrust');
U.set('metric');

// ---- preference: strict storage, en-US default
const st = (v) => ({ getItem: (k) => (k === U.KEY ? v : null) });
assert.equal(U.KEY, 'dronecalc:units');
assert.equal(U.initial(st('imperial'), 'de-DE'), 'imperial'); assert.equal(U.initial(st('metric'), 'en-US'), 'metric');
assert.equal(U.initial(st(null), 'en-US'), 'imperial'); assert.equal(U.initial(st(null), 'en-GB'), 'metric'); assert.equal(U.initial(st(null), undefined), 'metric'); assert.equal(U.initial(st(null), 'en-us'), 'metric');
for (const bad of ['Imperial', 'IMPERIAL', ' imperial', 'imperial ', '<script>', '{"a":1}', '', '1', 'true', '__proto__', 'metric\u0000', 'x'.repeat(10000), 'toString']) assert.equal(U.initial(st(bad), 'de-DE'), 'metric', JSON.stringify(bad).slice(0, 30) + ' falls back to the default');
assert.equal(U.initial(st('Imperial'), 'en-US'), 'imperial', 'a hostile value falls back to the language default');
assert.equal(U.initial({ getItem() { throw new Error('denied'); } }, 'de-DE'), 'metric'); assert.equal(U.initial(null, 'en-US'), 'imperial');
assert.equal(U.set('furlongs'), 'metric', 'set() ignores anything but the two codes');
let saved; U.save('imperial', { setItem: (k, v) => { saved = [k, v]; } }); assert.deepEqual(saved, ['dronecalc:units', 'imperial']); U.save('metric', { setItem() { throw new Error('full'); } });

// ---- hash and saved builds never see the unit: byte-identical either way, and a link opened in imperial re-serialises unchanged
const links = ['#s=3&m=delivery&t=25&p=1.25&mat=carbon&cfg=hex&alt=1200&tmp=-5&w=7.5&mw=2100.55', '#s=3&m=fpv&fc=7&alt=0&tmp=35&w=0', '#s=3&m=mapping&cfg=fixedwing&t=60&alt=3000&tmp=12&w=4&age=12.5&ha=14.2&sel=battery:x&n=Scout-01'];
for (const h of links) {
  U.set('metric'); const a = X.hashOf(X.parse(h).S, 3), runA = JSON.stringify(X.run(X.parse(h).S));
  U.set('imperial'); const b = X.hashOf(X.parse(h).S, 3), runB = JSON.stringify(X.run(X.parse(h).S));
  assert.equal(b, a, 'hashOf does not depend on the unit'); assert.equal(runB, runA, 'the engine result does not depend on the unit');
  assert.equal(X.hashOf(X.parse(a).S, 3), a, 'round trip');
}
U.set('metric');

// ---- inputs: SI -> display -> SI never drifts unless the user edits; an edit lands on a clean SI number
U.set('imperial');
for (const [q, vs] of [['kg', [0.35, 1.25, 12, 0.05]], ['m', [0, 50, 1200, 6000, -400]], ['c', [-40, -5, 20, 35, 60]], ['ms', [0, 0.5, 3, 7.5, 25]], ['g', [1, 2100.55, 250, 200000]]]) {
  for (const v of vs) near(U.parse(q, String(U.input(q, v))), v, q === 'kg' ? 1e-3 : q === 'g' ? 0.02 : 0.01); // retyping the shown text unchanged
}
assert.equal(U.parse('c', '68'), 20); assert.equal(U.parse('c', '23'), -5); assert.equal(U.parse('m', '3281'), 1000.0488); assert.ok(Number.isNaN(U.parse('kg', 'abc')), 'junk stays NaN');
// state holds SI: the page converts only when the user types, so a stored value is the same number after any number of toggles
{
  const S = X.parse('#s=2&m=inspection&alt=1234.5&tmp=21.7&w=3.3&p=0.77').S, before = JSON.stringify(S);
  for (let i = 0; i < 5; i++) { U.set(i % 2 ? 'metric' : 'imperial'); X.errs(S); X.dlim('altitudeM', 'USD'); U.input('m', S.altitudeM); }
  assert.equal(JSON.stringify(S), before); assert.equal(X.hashOf(S, 2), X.hashOf(X.parse(X.hashOf(S, 2)).S, 2));
  U.set('imperial'); near(X.dlim('altitudeM', 'USD').max, 19685.039, 1e-3); assert.equal(X.unit('tempC', 'USD'), '°F'); assert.equal(X.unit('budget', 'EUR'), 'EUR');
  assert.match(X.errs({ ...S, altitudeM: 99999 }).altitudeM, /^Altitude must be between 0 and 19,685 ft\.$/);
  U.set('metric'); assert.match(X.errs({ ...S, altitudeM: 99999 }).altitudeM, /between 0 and 6,000 m\.$/);
}
U.set('metric');

// ---- custom part form: the draft stays SI, the form shows and takes display units
{
  U.set('imperial');
  const d = newDraft('frame'); d.name = 'F'; d.priceUsd = '10'; d.weightG = '100'; d.v = { ...d.v, sizeMm: '450', maxPropInch: '10', material: 'carbon', configuration: 'quad' };
  const html = customHtml([], { ...cui, draft: d, errors: {}, open: true });
  assert.match(html, /value="17\.717"[^>]*>\s*<span class="u"[^>]*>in<\/span>/); assert.match(html, /value="3\.527"[^>]*>\s*<span class="u"[^>]*>oz<\/span>/);
  const r = validate(toRaw(d)); assert.ok(r.part, JSON.stringify(r.errors)); assert.equal(r.part.specs.sizeMm, 450); assert.equal(r.part.weightG, 100);
  U.set('metric');
}

// ---- no raw metric unit in the imperial render of a sample build (neutral units W V A Wh mAh Ah are allowed)
const LEAK = /(?<![\w.])\d[\d,.]*(?:\s?[-–]\s?\d[\d,.]*)?\s?(?:kg·cm|kg|km\/h|km|m\/s|mm|cm|dm²|dm2|°C|g\/dm²|g\/dm2|g\/W|g\/cm³|kgf|g|m)(?![\p{L}\p{N}²]|\/[A-Za-z])/u;
const bare = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&middot;|&times;|&ndash;/g, ' ');
function leaks(name, str, ok = []) { // product and part names are the maker's own text: strip them before looking
  let t = bare(String(str)); for (const o of ok) t = t.split(o).join(' ');
  const m = LEAK.exec(t); assert.ok(!m, `${name} leaks "${m?.[0]}" in: ...${t.slice(Math.max(0, m?.index - 40), (m?.index ?? 0) + 40)}...`);
}
const PICK = ['motor', 'esc', 'battery', 'prop', 'frame', 'fc', 'fixedwing', 'vtol', 'pusher'];
const build = (hash) => {
  const S = X.parse(hash).S, r = X.run(S); assert.ok(r?.ok, hash); const R = X.results(S, r);
  S.sel = Object.fromEntries(Object.entries(R.rec).filter(([k, v]) => PICK.includes(k) && Array.isArray(v) && v[0]?.id).map(([k, v]) => [k, v[0].id]));
  const rows = X.bomRows(R, S.sel);
  return { S, R, rows, c: X.ctx(R, S) };
};
const names = (R, rows) => [...rows.map((x) => x.it.name), ...Object.values(R.opts || {}).flat().map((i) => i.name), ...Object.values(R.rec || {}).flat().filter((i) => i?.name).map((i) => i.name)].filter(Boolean).sort((a, b) => b.length - a.length);
const SAMPLES = ['#s=3&m=inspection&t=22&p=1&alt=1500&tmp=-5&w=6&mw=2600', '#s=3&m=mapping&cfg=fixedwing&t=60&alt=300&tmp=25&w=4', '#s=3&m=mapping&cfg=vtol&t=45&p=0.8&w=3', '#s=3&m=mapping&cfg=tiltrotor&t=40&p=0.8', '#s=3&m=fpv&fc=7&alt=100&tmp=30'];
for (const h of SAMPLES) {
  U.set('metric'); const m = build(h), mpdf = JSON.stringify(X.pdfDoc(m.R, m.S, '2026-11-14'));
  U.set('imperial'); const b = build(h), nm = names(b.R, b.rows);
  const doc = X.pdfDoc(b.R, b.S, '2026-11-14'), pdfText = JSON.stringify(doc);
  leaks('BOM ' + h, bomHtml(b.rows, b.c), nm); leaks('dock ' + h, dockHtml(b.rows, b.c), nm); leaks('csv ' + h, bomCsv(b.rows, b.c), nm); leaks('copy ' + h, copyText(b.rows, b.c), nm);
  leaks('parts ' + h, partsHtml(b.c), nm); leaks('wiring ' + h, wiringHtml(wiringRows(b.R.r, b.S.mission)));
  leaks('perf ' + h, PERF.renderPerformance(b.R.r, { missionLabel: X.MISSIONS[b.S.mission].label }), nm);
  leaks('pdf doc ' + h, pdfText, nm); leaks('warnings ' + h, X.warnsOf(b.S, b.R.r).join(' | '));
  leaks('compat ' + h, X.compatOf(b.R, b.rows).map((c) => c.text).join(' | '), nm); leaks('wclass ' + h, JSON.stringify(X.wclassOf(b.R)));
  leaks('cfg ' + h, [...X.CFGS].map((c) => X.reason(b.S.mission, c)?.text || '').join(' | ')); leaks('mat ' + h, Object.keys(X.MATERIALS).map((k) => X.matNote(k)).join(' | '));
  leaks('library ' + h, JSON.stringify(compareRow(X, CHK, { name: 'x', hash: h })));
  const bytes = buildBomPdf(doc); assert.ok(bytes.length > 500 && /Imperial/.test(Buffer.from(bytes).toString('latin1')), 'the PDF says which units it uses');
  assert.notEqual(pdfText, mpdf, 'the PDF follows the display unit');
  assert.ok(doc.meta.some(([k, v]) => k === 'Display units' && /Imperial/.test(v)));
}
U.set('metric');
const m1 = build(SAMPLES[0]); assert.ok(X.pdfDoc(m1.R, m1.S, '2026-11-14').meta.some(([k, v]) => k === 'Display units' && /Metric/.test(v)));
console.log('units tests passed');
