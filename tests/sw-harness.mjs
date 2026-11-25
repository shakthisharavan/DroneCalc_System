// Stub ServiceWorkerGlobalScope for sw.js, shared by pwa.test.mjs and hardening.test.mjs (not a test itself: the npm glob is tests/*.test.mjs).
// Map-backed Cache Storage, a scripted fetch, real WebCrypto and real Response objects, so the digest code runs for real.
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';

export const ORIGIN = 'https://someone.github.io', BASE = `${ORIGIN}/DroneCalc/`;
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// stores: name -> Map(absolute url -> Response). fail = true makes every call reject, like a full or corrupt Cache Storage.
export function memCaches() {
  const stores = new Map(), c = { stores, fail: false };
  const url = (k) => new URL(typeof k === 'string' ? k : k.url, BASE + 'sw.js').href;
  const guard = (f) => async (...a) => { if (c.fail) throw new Error('QuotaExceededError'); return f(...a); };
  const cache = (m) => ({
    put: guard(async (k, r) => { m.set(url(k), r); }),
    match: guard(async (k) => m.get(url(k))?.clone()),
    delete: guard(async (k) => m.delete(url(k))),
  });
  return Object.assign(c, {
    open: guard(async (n) => { if (!stores.has(n)) stores.set(n, new Map()); return cache(stores.get(n)); }),
    keys: guard(async () => [...stores.keys()]),
    delete: guard(async (n) => stores.delete(n)),
  });
}

// sw.js source with SHELL replaced by { path: digest of the given bytes }: a small shell for the attack scenarios.
export const withShell = (src, files) => src.replace(/const SHELL = \{[\s\S]*?\n?\};/, () => `const SHELL = ${JSON.stringify(Object.fromEntries(Object.entries(files).map(([f, b]) => [f, sha256(b)])))};`);

export function loadSw(src, { fetch, caches = memCaches() }) {
  const on = {}, sw = { location: { origin: ORIGIN, href: BASE + 'sw.js' }, addEventListener: (t, f) => { on[t] = f; }, skipped: 0, skipWaiting() { sw.skipped++; } };
  vm.runInNewContext(src, { self: sw, caches, fetch, crypto: webcrypto, URL, Request: class { constructor(u, o = {}) { this.url = new URL(u, BASE + 'sw.js').href; this.cache = o.cache; } } });
  // Fires an event the way the browser does; resolves to what the worker handed to waitUntil / respondWith (undefined when it did neither).
  const fire = (t, ev = {}) => { let p; on[t]({ ...ev, waitUntil: (x) => { p = x; }, respondWith: (x) => { p = x; } }); return Promise.resolve(p); };
  const get = (path, o = {}) => fire('fetch', { request: { method: 'GET', mode: 'cors', url: /^https?:/.test(path) ? path : BASE + path, ...o } });
  return { sw, caches, fire, get };
}
