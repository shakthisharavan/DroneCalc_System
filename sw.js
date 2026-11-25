'use strict';
// Offline app shell for the website (GitHub Pages) install. Never registered under app:// (Electron) or file://.
// SHELL and CACHE_VERSION are generated: `node tests/pwa.test.mjs --bump` after any shipped file changes (the test fails until you do).
// A new version means new sw.js bytes, so the browser installs a fresh cache and the activate step drops the old one.
// SHELL maps every precached file to the SHA-256 (hex) of its bytes with CRLF folded to LF, i.e. what Pages serves.
// Cache Storage is shared by every page on *.github.io, so a cached body is only trusted while it still hashes to its SHELL digest.
const CACHE_VERSION = 'dronecalc-acb91e0f51';
const SHELL = {
  "css/main.css": "69d2d6993bf13d76175fdf0a38abe141f8fa72c46b302888b33194ff17b3cef6",
  "css/perf.css": "c17c8b116ee4efecf0fe28ecfb95038e8c3cdc0e51af197cf35d34cbaf1033f6",
  "fonts/OFL-Archivo.txt": "108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b",
  "fonts/OFL-AtkinsonHyperlegibleNext.txt": "aca6a428580965d2297d1b718042dd427c2a9443ece3b0d02d758e161e0c4030",
  "fonts/OFL-JetBrainsMono.txt": "b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d",
  "fonts/archivo-latin.woff2": "da8945f965c9a1420f2d56e7ce9aaca0947c174425ad86c32862c3ec248683e8",
  "fonts/atkinson-hyperlegible-next-latin.woff2": "18b2a1a39a2fa298b0ba5390aca68462669826c90925656f1c1f6796e0e1bbaf",
  "fonts/jetbrains-mono-latin.woff2": "83c005d49d8a6a50474c73a5a36ac0468076e9c4a29da7bdb14995d80560a5be",
  "icons/apple-touch-icon.png": "f48ee865633317632f17331c0ee956f3afc2ee7fa7a8bacd69733a9555693c68",
  "icons/icon-192.png": "508a75922c6ce118baf1efdf76a01e6223bd70e4bcdfc9ee6317f8818d74848b",
  "icons/icon-512.png": "8ef7c56b213db6f8587589d17329d1a4fe6c184e93c64ee598a422b85be93c0d",
  "icons/icon-maskable-512.png": "494151e2f0af2560e9867791251e68e7dc0193dfbd714184951be4c85ca7241e",
  "index.html": "ccff28739a5ecbbd9673bfa4b14f3e9e65d4e9307e025b22b80c86a1ad6eae0e",
  "js/app.js": "a6d866d97037c49c37b2b6fe8d96209dab85243322e3712bed8a19a19b1ea5ea",
  "js/catalog.js": "95370ff108e20b27690037d2567a48c8ae91332d83e69d60f851bc7c587c1f31",
  "js/checks.js": "c33884a837e1d1b2011683eb68d87e6bcfeb50ec8a5eb4702cf28465feba9019",
  "js/engine.js": "3606c360ea73be532b0a09926b2cd6ccbbe23dd63571150f026d21789f82421b",
  "js/i18n/en.js": "b333db9ca0b0e39de2490c7f1c28609cdbcfadba85edf45e7b717e031e66bf5f",
  "js/i18n/es.js": "83ab8cdce0c27ff26f259d5cc43868dd0e99878b41fea3bcc259f1254af31fec",
  "js/i18n/hi.js": "c9a93187009fc283e1a7d4782e8a086da1aded9f8dfc5e8342cf07fb29c3a38c",
  "js/i18n/i18n.js": "3101091b888321d11c8ba10404f7b08cdba8f640fb009c2d8e5110470ff957e6",
  "js/matcher.js": "2b12345501516128529d80fb3dacb6ebf2e7c979f527bead87f57035f370f306",
  "js/ui/charts.js": "826ebbdf4c9c319a21fa26e268f98214e76d0c46d8617fe8f98918ac08526cc4",
  "js/ui/custom.js": "401df0d90cab24cb78a08dad94417046fa96e12f5b3c7d8080a293d0303b1750",
  "js/ui/io.js": "58af7b7da032b08227ce90f9f51dec721ca360335b17c9ae256ff2a7093e9629",
  "js/ui/library.js": "2c24e9b796ec25aaa4b40a961b6e346981138bf91e7c8bac926d4faae3e19c91",
  "js/ui/measured.js": "b69b89b9673dd838c197e5bde9461e8542591f8cb6827a3e8b6904dd5dad4259",
  "js/ui/parts.js": "1c0ee521dbf758d93a824438d9f7835e385b722337ecbcd7e7c3332627968072",
  "js/ui/pdf.js": "c30b5be26891616027073f79fd23f0764c9915b1d9ffcbde883eb7ec9835a277",
  "js/ui/perf.js": "6032ff234a2707f8dd0060c2b5aa58622139c849b94aaa0e89d0cce78dc8ca2d",
  "js/ui/state.js": "91117a84bfd3e034f071a0db88e9f641dabdf8f5a11bb2ab4706bd608d18c423",
  "js/ui/units.js": "bf9b72c8bc51b2aca5037a4a1449be621c3a60c9b82ebbc9f94842c863443bdd",
  "js/ui/wiring.js": "2557cda7ed18a6bb1b6c71eeb1f9429336dd02d8aa1bde8716d28c67c16f659a",
  "manifest.webmanifest": "5e64f34914156d7160f87a2e23d40cc45b785cf5577f84717ea1e3eaabc9b30e"
};

const sum = async (r) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await r.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');

// The network copy of a shell file, verified. cache:'reload' skips the HTTP cache but not the Pages CDN (~10 min), which can serve the previous
// deploy's file under this version's label: retry once under a cache-busting query, else fail the install so the old version stays.
const fresh = async (u) => {
  for (const q of ['', '?v=' + SHELL[u].slice(0, 12)]) {
    const r = await fetch(new Request(u + q, { cache: 'reload' }));
    if (r.ok && (await sum(r.clone())) === SHELL[u]) return r;
  }
  throw new Error('digest mismatch: ' + u);
};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => Promise.all(Object.keys(SHELL).map((u) => fresh(u).then((r) => c.put(u, r))))));
});

self.addEventListener('activate', (e) => {
  // The prefix matters: *.github.io projects share one origin, so another site's caches are not ours to delete.
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('dronecalc-') && k !== CACHE_VERSION).map((k) => caches.delete(k)))));
});

// The page asks for this once the user agrees to reload, so a fix does not wait for every tab to close.
self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });

// A cache hit, only if its body still matches the digest. A mismatch (another page on this origin wrote to our cache) deletes the entry.
const cached = async (r) => {
  const c = await caches.open(CACHE_VERSION), nav = r.mode === 'navigate', k = nav ? 'index.html' : r;
  const hit = await c.match(k);
  if (!hit) return;
  const key = nav ? 'index.html' : new URL(r.url).pathname.slice(new URL('./', self.location.href).pathname.length);
  if (Object.hasOwn(SHELL, key) && (await sum(hit.clone())) === SHELL[key]) return hit;
  await c.delete(k);
};

self.addEventListener('fetch', (e) => {
  const r = e.request;
  // Cross-origin (retailer links, anything else) is left to the browser: never cached here.
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  // Any Cache Storage failure (quota, corruption) or digest mismatch goes to the network: a bad cache must never brick the app online.
  e.respondWith(cached(r).catch(() => {}).then((hit) => hit || fetch(r)));
});
