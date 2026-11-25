// F7 custom parts: validation bounds, hostile strings, poisoned storage, missing ids in share links, matcher and rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as C from '../js/catalog.js';
import * as M from '../js/matcher.js';
import * as PERF from '../js/ui/perf.js';
import * as CHK from '../js/checks.js';
import { createState, cleanName } from '../js/ui/state.js';
import { esc, partsHtml, bomCsv, copyText, listed } from '../js/ui/parts.js';
import { buildBomPdf } from '../js/ui/pdf.js';
import { SCHEMA, validate, text, createCustom, pruneSel, missingNote, customHtml, ui, newDraft, CUSTOM_KEY, CUSTOM_MAX } from '../js/ui/custom.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i, EVIL = '<img src=x onerror=alert(1)>"\'&';
const u = (...c) => String.fromCharCode(...c); // invisible, bidi and lone-surrogate characters built from code units, so the source stays readable
const RLO = u(0x202e), LRE = u(0x202a), ZW = u(0x200b), RLM = u(0x200f), LRI = u(0x2066), PDI = u(0x2069), BOM = u(0xfeff), LS = u(0x2028), PS = u(0x2029), WJ = u(0x2060), EMOJI = String.fromCodePoint(0x1f600);
const motor = (o = {}) => ({ category: 'motor', name: 'Test 2306', brand: 'Me', priceUsd: 0.01, weightG: 30, specs: { statorMm: '2306', kv: 1800, maxThrustG: 1500, maxCurrentA: 40, minCells: 4, maxCells: 6 }, ...o });
// A raw part with every required field set to a mid-range value, so each category can be validated.
const mid = (f) => (f.t === 'n' ? (f.int ? Math.ceil((f.min + f.max) / 2) : (f.min + f.max) / 2) : f.t === 'e' ? f.opts[0] : f.t === 'b' ? false : '2306');
const minimal = (cat) => ({ category: cat, name: 'N', priceUsd: 10, weightG: 10, specs: Object.fromEntries(SCHEMA[cat].filter((f) => f.req).map((f) => [f.k, mid(f)])) });
const fresh = () => { C.CUSTOM.length = 0; const st = mem(); return { st, CUS: createCustom(C, st) }; };
test.afterEach(() => { C.CUSTOM.length = 0; });

test('schema: every category, spec keys come from the catalog schema', () => {
  assert.deepEqual(Object.keys(SCHEMA).sort(), [...new Set(C.CATALOG.map((i) => i.category))].sort(), 'same categories as the catalog');
  for (const [cat, fields] of Object.entries(SCHEMA)) {
    const known = new Set(C.CATALOG.filter((i) => i.category === cat).flatMap((i) => Object.keys(i.specs)));
    for (const f of fields.filter((x) => !x.tag)) assert.ok(known.has(f.k), `${cat}.${f.k} is a catalog spec key`);
    const r = validate(minimal(cat));
    assert.ok(r.part, `${cat} minimal part valid: ${JSON.stringify(r.errors)}`);
    assert.equal(r.part.custom, true); assert.deepEqual(r.part.links, []); assert.deepEqual(r.part.regions, []);
    assert.ok(r.part.tags.every((t) => ['delivery', 'inspection', 'agriculture', 'interceptor', 'mapping', 'fpv', 'pusher'].includes(t)));
  }
});

test('validation bounds: each number accepts min and max, rejects just outside, junk and non-integers', () => {
  let n = 0;
  for (const [cat, fields] of Object.entries(SCHEMA)) for (const f of fields.filter((x) => x.t === 'n')) {
    // the cross-field partner (burst vs continuous, min vs max cells) is set out of the way, so only this field's own bounds are probed
    const part = (v) => { const raw = minimal(cat); raw.specs[f.k] = v; if (f.k === 'burstA') raw.specs.continuousA = 1; if (f.k === 'minCells') raw.specs.maxCells = 14; if (f.k === 'maxCells') raw.specs.minCells = 1; return validate(raw); };
    assert.ok(part(f.min).part, `${cat}.${f.k} min`); assert.ok(part(f.max).part, `${cat}.${f.k} max`);
    for (const bad of [f.min - 1e-6 * Math.max(1, f.min), f.max + 1, f.max * 10, -f.max, NaN, Infinity, -Infinity, '5', '1e3', {}, [], true]) { assert.ok(part(bad).errors[f.k], `${cat}.${f.k} rejects ${String(bad)}`); n++; }
    if (f.int) assert.ok(part(f.min + 0.5).errors[f.k], `${cat}.${f.k} whole numbers only`);
  }
  assert.ok(n > 300, 'many bounds probed: ' + n);
  const top = (o) => validate({ ...motor(), ...o });
  for (const [k, lo, hi] of [['priceUsd', 0, 100000], ['weightG', 0.1, 50000]]) {
    assert.ok(top({ [k]: lo }).part && top({ [k]: hi }).part, k + ' edges');
    for (const bad of [lo - 0.01, hi + 1, NaN, Infinity, '5', null, undefined, -1]) assert.ok(top({ [k]: bad }).errors[k], `${k} rejects ${String(bad)}`);
  }
  assert.equal(top({ priceUsd: 1.239 }).part.priceUsd, 1.24, 'price kept to cents');
  // cross-field rules and enums
  const esc0 = { ...minimal('esc'), specs: { continuousA: 40, burstA: 30, minCells: 3, maxCells: 6, protocol: 'DShot600' } };
  assert.ok(validate(esc0).errors.burstA, 'burst below continuous'); assert.ok(validate({ ...esc0, specs: { ...esc0.specs, burstA: 50, minCells: 7 } }).errors.minCells, 'min cells above max');
  assert.ok(validate({ ...esc0, specs: { ...esc0.specs, burstA: 50, protocol: 'FakeProto' } }).errors.protocol, 'enum');
  assert.ok(validate({ ...esc0, specs: { ...esc0.specs, burstA: 50, connector: 'banana' } }).errors.connector, 'optional enum, bad value');
  assert.ok(validate(motor({ specs: { ...motor().specs, statorMm: '23' } })).errors.statorMm, 'stator format');
  assert.ok(validate({ ...minimal('servo'), specs: { torqueKgCm: 3, maxVoltage: 6, tilt: 'yes' } }).errors.tilt, 'bool must be a boolean');
  assert.ok(validate({ ...minimal('frame'), name: '' }).errors.name); assert.ok(validate({ ...minimal('frame'), name: undefined }).errors.name);
});

test('hostile strings: stripped like cleanName, capped, never executable data', () => {
  const same = ['ab' + RLO + 'cd' + ZW + 'ef' + RLM + 'g' + LRI + 'h' + PDI + BOM + 'i' + LRE, 'x' + u(0xd83d), 'ab' + u(0xd83d) + 'cd' + u(0xde00) + 'e', 'a' + u(0) + 'b' + u(0x1f) + 'c' + u(0x7f) + 'd' + u(0x9f) + 'e', EMOJI.repeat(60), ' padded '];
  for (const s of same) assert.equal(text(s, 40), cleanName(s), JSON.stringify(s));
  assert.equal(text('a' + LS + 'b' + PS + 'c' + WJ + 'd', 40), 'abcd', 'line separators and word joiners go too');
  assert.equal([...text(EMOJI.repeat(100), 60)].length, 60, 'capped by code points, pair never split');
  const p = validate(motor({ name: '=cmd|' + RLO + ZW + EVIL + 'x'.repeat(500), brand: ZW + ZW })).part;
  assert.equal(p.name.length, 60); assert.ok(p.name.startsWith('=cmd|<img'), 'markup kept as text, escaped at render'); assert.equal(p.brand, 'Custom', 'blank brand falls back');
  assert.ok(!(p.name.includes(ZW) || p.name.includes(RLO)));
  for (const bad of [{}, [], 5, true, null, ['x'], { toString: () => 'x' }]) assert.ok(validate(motor({ name: bad })).errors.name, 'non-string name ' + JSON.stringify(bad));
  assert.ok(validate(motor({ name: ZW + RLO + ' ' + u(7) })).errors.name, 'only invisible characters = empty');
  for (const c of ['__proto__', 'constructor', 'toString', ['motor'], { toString: () => 'motor' }, 'MOTOR', null, 5]) assert.ok(validate({ ...motor(), category: c }).errors.category, 'category ' + String(c));
  const fw = validate({ ...minimal('fc'), specs: { motorOutputs: 6, firmware: 'Ardu' + RLO + '<b>/INAV', mcu: 'x'.repeat(99) } }).part;
  assert.equal(fw.specs.firmware, 'Ardu<b>/INAV'); assert.equal(fw.specs.mcu.length, 24);
  assert.ok(validate({ ...minimal('radio'), specs: { protocol: 42 } }).errors.protocol, 'text field needs a string');
  // rebuilt, never copied: tags, links, regions, ids, extra keys
  const w = validate({ ...motor(), id: 'custom-ok1', tags: ['evil', 'pusher'], links: [{ store: 'x', url: 'https://evil.example', kind: 'product', region: 'US' }], regions: ['US'], custom: false, __proto__x: 1, specs: { ...motor().specs, extra: 1, __proto__: { kv: 5 } } }).part;
  assert.deepEqual(w.links, []); assert.deepEqual(w.regions, []); assert.equal(w.custom, true); assert.equal(w.id, 'custom-ok1');
  assert.ok(w.tags.includes('pusher') && !w.tags.includes('evil'), 'only known tags'); assert.equal(w.specs.extra, undefined); assert.equal(w.specs.kv, 1800);
  assert.equal(validate({ ...motor(), id: '../../x' }).part.id, undefined, 'bad id dropped'); assert.equal(validate({ ...motor(), id: 'motor-1' }).part.id, undefined, 'no custom- prefix');
  assert.equal(validate({ ...minimal('frame'), tags: ['pusher'] }).part.tags.includes('pusher'), false, 'pusher only on motors');
});

test('storage: add / update / remove, ids, cap, registry follows storage', () => {
  const { st, CUS } = fresh();
  const a = CUS.add(motor()), b = CUS.add(motor({ name: 'Second' }));
  assert.ok(a.ok && b.ok && a.id !== b.id);
  for (const id of [a.id, b.id]) { assert.match(id, /^custom-[a-z0-9]+$/); assert.match(id, ID); }
  assert.deepEqual(C.CUSTOM.map((p) => p.name), ['Test 2306', 'Second']);
  assert.equal(JSON.parse(st.getItem(CUSTOM_KEY)).length, 2);
  assert.ok(CUS.update(a.id, motor({ name: 'Renamed' })).ok); assert.equal(C.CUSTOM[0].name, 'Renamed'); assert.equal(C.CUSTOM[0].id, a.id, 'update keeps the id');
  assert.ok(!CUS.update('custom-nope', motor()).ok, 'update of a missing id fails');
  assert.ok(!CUS.update(a.id, motor({ priceUsd: -5 })).ok); assert.equal(C.CUSTOM[0].name, 'Renamed', 'a bad edit changes nothing');
  assert.ok(CUS.remove(a.id).ok); assert.deepEqual(C.CUSTOM.map((p) => p.id), [b.id]);
  const bad = CUS.add({ ...motor(), weightG: -1 }); assert.ok(!bad.ok && bad.errors.weightG && C.CUSTOM.length === 1, 'invalid add is refused');
  for (let i = C.CUSTOM.length; i < CUSTOM_MAX; i++) assert.ok(CUS.add(motor({ name: 'p' + i })).ok);
  assert.equal(C.CUSTOM.length, CUSTOM_MAX); const over = CUS.add(motor()); assert.ok(!over.ok && over.errors._, 'cap of ' + CUSTOM_MAX);
  assert.equal(new Set(C.CUSTOM.map((p) => p.id)).size, CUSTOM_MAX, 'unique ids');
  // a second instance over the same storage (page reload) sees the same parts
  C.CUSTOM.length = 0; createCustom(C, st); assert.equal(C.CUSTOM.length, CUSTOM_MAX);
  // storage that throws: refused with a message, nothing half-saved
  C.CUSTOM.length = 0;
  const broken = createCustom(C, { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } });
  const r = broken.add(motor()); assert.ok(!r.ok && /storage/.test(r.errors._) && C.CUSTOM.length === 0);
  assert.deepEqual(createCustom(C, null).list(), []);
});

test('poisoned storage: every entry re-validated, bad ones dropped, never throws', () => {
  const good = validate({ ...motor(), id: 'custom-good1' }).part, good2 = validate({ ...motor({ name: 'Two' }), id: 'custom-good2' }).part;
  const load = (v) => { C.CUSTOM.length = 0; const st = mem({ [CUSTOM_KEY]: typeof v === 'string' ? v : JSON.stringify(v) }); const CUS = createCustom(C, st); return { CUS, st, ids: C.CUSTOM.map((p) => p.id) }; };
  for (const junk of ['', 'not json', '{', 'null', '7', '"str"', '{"a":1}', '[1,"x",null,[],{}]', '[null]', 'x'.repeat(500000), '[' + '{"category":"motor"},'.repeat(5000) + '{}]']) assert.deepEqual(load(junk).ids, [], 'junk: ' + junk.slice(0, 20));
  const poison = [
    { ...good, id: 'motor-nope' }, { ...good, id: 'custom-' + 'a'.repeat(41) }, { ...good, id: 'custom-../x' }, { ...good, id: undefined }, { ...good, id: 'CUSTOM-UP' },
    { ...good, id: 'custom-badprice', priceUsd: '5' }, { ...good, id: 'custom-badnum', specs: { ...good.specs, kv: '1800' } }, { ...good, id: 'custom-bigkv', specs: { ...good.specs, kv: 1e9 } },
    { ...good, id: 'custom-badcat', category: 'weapon' }, { ...good, id: 'custom-proto', category: '__proto__' }, { ...good, id: 'custom-noname', name: ZW },
    { ...good, id: 'custom-nan', weightG: null }, { ...good, id: 'custom-obj', specs: 'kv=1800' }, { ...good, id: 'custom-arr', specs: [1800] }, 'str', 5, null, [], good2, good2, good,
  ];
  const r = load(poison);
  assert.deepEqual(r.ids, ['custom-good2', 'custom-good1'], 'only valid entries survive, duplicates once, order kept');
  const loaded = C.CUSTOM[1]; assert.deepEqual(loaded, good, 'a valid entry round-trips unchanged');
  // hostile payload inside a valid-looking record: rebuilt, so no links, no foreign tags
  const sneaky = load([{ ...good, id: 'custom-sneak', links: [{ url: 'javascript:alert(1)' }], tags: ['x'], regions: ['US'], evil: '<script>' }]);
  assert.deepEqual(C.CUSTOM[0].links, []); assert.ok(!('evil' in C.CUSTOM[0])); assert.ok(!C.CUSTOM[0].tags.includes('x')); assert.equal(sneaky.ids.length, 1);
  // JSON.parse of a __proto__ key gives an own property, not a prototype swap
  const pj = load('[{"id":"custom-pp","category":"motor","name":"n","priceUsd":1,"weightG":1,"specs":{"statorMm":"2306","kv":1800,"maxThrustG":1500,"maxCurrentA":40,"__proto__":{"kv":1}},"__proto__":{"custom":false}}]');
  assert.equal(pj.ids.length, 1); assert.equal(C.CUSTOM[0].specs.kv, 1800); assert.equal({}.kv, undefined); assert.equal({}.custom, undefined);
  // more than the cap in storage: only the first CUSTOM_MAX valid ones are used
  const many = Array.from({ length: 80 }, (_, i) => ({ ...good, id: 'custom-m' + i }));
  assert.equal(load(many).ids.length, CUSTOM_MAX);
});

test('matcher and listOptions include custom parts; no links; local everywhere', () => {
  const { CUS } = fresh();
  const fpv = { frame: { minSizeMm: 200, maxSizeMm: 250, material: 'carbon', configuration: 'quad' }, motor: { statorMm: '2306', kvMin: 1600, kvMax: 2000, minThrustG: 1200, count: 4 }, esc: { minContinuousA: 40, minCells: 6, maxCells: 6, protocol: 'DShot600' },
    battery: { cells: 6, minMah: 1200, maxMah: 1600, minC: 75, chemistry: 'lipo' }, prop: { inch: 5 }, fc: { minMotorOutputs: 4, needsGps: false } };
  const before = M.recommend(fpv, 'fpv'), baseOpts = M.listOptions('US', 'fpv'), baseRec = Object.fromEntries(['US', 'IN', 'GLOBAL'].map((r) => [r, M.recommend(fpv, 'fpv', undefined, undefined, r)]));
  assert.ok(!before.motor.some((i) => i.custom));
  const { id } = CUS.add(motor());
  for (const region of ['US', 'IN', 'GLOBAL']) {
    const rec = M.recommend(fpv, 'fpv', undefined, undefined, region), got = rec.motor.find((i) => i.id === id);
    assert.ok(got, 'recommended in ' + region); assert.equal(rec.motor[0].id, id, 'cheapest fit ranks first');
    assert.deepEqual(got.links, [], 'never any store link'); assert.equal(got.custom, true); assert.equal(got.qty, 4); assert.ok(Math.abs(got.lineUsd - 0.04) < 1e-9);
    // a custom part is not a store listing: the catalog fits and the no-local-listing note are the same with or without it
    assert.equal(rec.regionFallback.includes('motor'), baseRec[region].regionFallback.includes('motor'), 'region note unchanged in ' + region);
    assert.ok(baseRec[region].motor.every((b) => rec.motor.some((i) => i.id === b.id) || rec.motor.length === 3), 'catalog fits kept beside the custom part in ' + region);
  }
  const opt = M.listOptions('US', 'fpv').motor.find((i) => i.id === id);
  assert.ok(opt && opt.custom && opt.links.length === 0 && opt.localListing === true, 'in the options list');
  assert.equal(M.listOptions('US', 'fpv').motor.length, baseOpts.motor.length + 1);
  assert.deepEqual(C.localLinks(C.CUSTOM[0], 'US'), []);
  assert.ok(!M.recommend(fpv, 'fpv', undefined, C.CATALOG).motor.some((i) => i.id === id), 'an explicit catalog stays catalog only');
  // a custom part that fails the spec is not recommended but is still listed
  const weak = CUS.add(motor({ name: 'Weak', specs: { ...motor().specs, maxThrustG: 100 } })).id;
  assert.ok(!M.recommend(fpv, 'fpv').motor.some((i) => i.id === weak)); assert.ok(M.listOptions('US', 'fpv').motor.some((i) => i.id === weak));
  CUS.remove(id); CUS.remove(weak);
  assert.deepEqual(M.recommend(fpv, 'fpv').motor.map((i) => i.id), before.motor.map((i) => i.id), 'removed: back to the catalog result');
  // a pusher motor lands in the pusher pool only
  const pu = CUS.add(motor({ name: 'Pusher', pusher: undefined, specs: { ...motor().specs, pusher: true } }));
  assert.ok(M.listOptions('US', 'fpv').motor.find((i) => i.id === pu.id).tags.includes('pusher'));
});

test('share link naming a custom id this device lacks: dropped with a note, never a crash', () => {
  const { CUS } = fresh();
  const X = createState({ E, C, M, PERF, CHK });
  const bat = C.CATALOG.find((i) => i.category === 'battery').id;
  const link = `#s=3&m=mapping&sel=motor:custom-gone,battery:${bat},esc:CUSTOM-GONE,fc:custom-also`;
  const { S } = X.parse(link);
  assert.equal(S.sel.motor, 'custom-gone', 'the id parses (it is a valid id)');
  // without pruning the state layer still survives an unknown id: that pick just has no BOM row
  const r0 = X.run(S), R0 = X.results(S, r0);
  assert.doesNotThrow(() => X.bomRows(R0, S.sel)); assert.ok(!X.bomRows(R0, S.sel).some((x) => x.key === 'motor'));
  assert.equal(pruneSel(S, C.CUSTOM), 3, 'three custom picks missing');
  assert.deepEqual(S.sel, { battery: bat }, 'the catalog pick stays');
  assert.ok(!X.hashOf(S, 3).includes('custom'), 'the rewritten hash is clean');
  assert.match(missingNote(1), /1 custom part in this link is not on this device/); assert.match(missingNote(3), /3 custom parts .* are not .* matched parts are shown/);
  assert.equal(pruneSel({ sel: {} }, []), 0); assert.equal(pruneSel({}, []), 0); assert.equal(pruneSel(null, []), 0); assert.equal(pruneSel({ sel: { motor: 'abc' } }, C.CUSTOM), 0, 'catalog ids untouched');
  // a part this device has stays picked
  const id = CUS.add(motor()).id, S2 = X.parse(`#s=3&m=mapping&sel=motor:${id}`).S;
  assert.equal(pruneSel(S2, C.CUSTOM), 0); assert.equal(S2.sel.motor, id);
  // deleting a picked part, then pruning, falls back
  CUS.remove(id); assert.equal(pruneSel(S2, C.CUSTOM), 1); assert.deepEqual(S2.sel, {});
});

test('a picked custom part flows through BOM rows, checks, PDF, copy and CSV safely', () => {
  const { CUS } = fresh();
  const X = createState({ E, C, M, PERF, CHK });
  const evil = '=HYPERLINK("http://evil.example","x")';
  const id = CUS.add(motor({ name: evil, brand: '+cmd' })).id;
  const S = { ...X.parse(`#s=3&m=mapping&sel=motor:${id}`).S, name: 'T' };
  const R = X.results(S, X.run(S)), rows = X.bomRows(R, S.sel), row = rows.find((x) => x.key === 'motor');
  assert.ok(row && row.it.custom && row.it.name === evil && row.it.links.length === 0);
  assert.doesNotThrow(() => X.compatOf(R, rows));
  const doc = X.pdfDoc(R, S, '2026-11-14'); const pr = doc.bom.rows.find((x) => x.part === evil + ' (custom, unverified)'); assert.deepEqual(pr.links, [], 'no links in the PDF'); assert.equal(pr.note, 'Custom part (unverified), no store link', 'the PDF note says unverified, not Search'); assert.doesNotThrow(() => buildBomPdf(doc));
  assert.equal(listed(row.it), false, 'a custom part is never "listed"');
  const ctx = X.ctx(R, S);
  const csv = bomCsv(rows, ctx); assert.ok(csv.includes(`"'${evil.replace(/"/g, '""')} (custom, unverified)"`), 'CSV formula guard on the name'); assert.ok(csv.includes('"\'+cmd"'), 'and on the brand');
  for (const lead of ['=', '+', '-', '@']) assert.ok(bomCsv([{ ...row, it: { ...row.it, name: lead + 'SUM(1)' } }], ctx).includes(`"'${lead}SUM(1) (custom, unverified)"`), 'guard ' + lead);
  assert.ok(!bomCsv(rows, ctx).split('\r\n').some((l) => l.endsWith(',"http' + '"')), 'no link cell for a custom part');
  assert.ok(copyText(rows, ctx).includes('(custom, unverified)'));
  const html = partsHtml(ctx);
  assert.ok(html.includes('Custom (unverified)')); assert.ok(!html.includes(evil), 'raw quote characters of the name are escaped'); assert.ok(html.includes(esc(evil)));
  for (const li of html.split('<li ').filter((b) => b.includes(esc(evil)))) assert.ok(!/href=/.test(li.split('</li>')[0]) && !li.split('</li>')[0].includes('Buy:'), 'custom card or option has no store link');
});

test('form html: hostile values are escaped, errors shown, no handlers', () => {
  const { CUS } = fresh();
  const id = CUS.add(motor({ name: EVIL, brand: EVIL })).id;
  ui.draft = newDraft('motor'); ui.draft.name = EVIL; ui.draft.v.statorMm = EVIL; ui.errors = { name: EVIL, kv: 'Required.', _: EVIL }; ui.msg = EVIL; ui.editId = null; ui.confirm = id;
  const h = customHtml(CUS.list(), ui, (u) => '$' + u);
  assert.ok(!/<img|onerror=\w|<script/i.test(h.replace(/&lt;img[^&]*&gt;/g, '')), 'no live markup');
  assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;'), 'escaped text present');
  // escaped values hold no < > or ", so every tag matches this and, with its quoted values blanked, must carry no on* attribute
  for (const tag of h.match(/<[a-z][^<>]*>/g)) assert.ok(!/\son\w+=/i.test(tag.replace(/"[^"]*"/g, '""')), 'no inline handler: ' + tag.slice(0, 60));
  assert.ok(h.includes('Custom (unverified)') && h.includes('Confirm delete') && h.includes('aria-invalid="true"'));
  for (const cat of Object.keys(SCHEMA)) { ui.draft = newDraft(cat); ui.errors = {}; const f = customHtml(CUS.list(), ui); for (const x of SCHEMA[cat]) assert.ok(f.includes(`id="cu-s-${x.k}"`), `${cat} form has ${x.k}`); }
  Object.assign(ui, { draft: null, errors: {}, msg: '', confirm: null });
});
