// Offline PWA (F9): sw.js precache list and version match the files on disk, the worker never touches cross-origin
// requests, the desktop app:// server still ignores sw.js and the manifest, and the CSP copies stay identical.
// After changing any shipped file run `node tests/pwa.test.mjs --bump` to regenerate SHELL (file -> SHA-256) and CACHE_VERSION in sw.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { BASE, loadSw } from './sw-harness.mjs';
const { resolveAppPath } = createRequire(import.meta.url)('../electron/util.js');

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function walk(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
}
const onDisk = () => ['index.html', 'manifest.webmanifest', ...['css', 'js', 'fonts', 'icons'].flatMap(walk)].sort();
// CRLF checkouts (Windows autocrlf) must hash like the LF files CI deploys.
const bytes = (f) => (/\.(html|css|js|webmanifest|txt)$/.test(f) ? Buffer.from(read(f).replace(/\r\n/g, '\n')) : fs.readFileSync(path.join(ROOT, f)));
const versionOf = (files) => 'dronecalc-' + files.reduce((h, f) => h.update(f + '\0').update(bytes(f)), crypto.createHash('sha256')).digest('hex').slice(0, 10);

// SHA-256 per file over the same bytes the version hashes: what Pages serves (LF), which the worker compares each cached body against.
const digestsOf = (files) => Object.fromEntries(files.map((f) => [f, crypto.createHash('sha256').update(bytes(f)).digest('hex')]));

const swSrc = read('sw.js');
const SHELL_RE = /const SHELL = (\{[\s\S]*?\});/, VER_RE = /const CACHE_VERSION = '([^']+)';/;

if (process.argv.includes('--bump')) {
  const files = onDisk();
  fs.writeFileSync(path.join(ROOT, 'sw.js'), swSrc
    .replace(SHELL_RE, () => `const SHELL = ${JSON.stringify(digestsOf(files), null, 2)};`)
    .replace(VER_RE, () => `const CACHE_VERSION = '${versionOf(files)}';`));
  console.log(`sw.js: ${files.length} files, ${versionOf(files)}`);
  process.exit(0);
}

// precache list == files on disk, digests and version == their content hash, so a stale sw.js cannot ship.
const DIGESTS = JSON.parse(SHELL_RE.exec(swSrc)[1]), SHELL = Object.keys(DIGESTS);
const version = VER_RE.exec(swSrc)?.[1];
assert.ok(version, 'CACHE_VERSION constant exists');
assert.deepEqual(SHELL, onDisk(), 'SHELL differs from the files on disk: run node tests/pwa.test.mjs --bump');
assert.deepEqual(DIGESTS, digestsOf(SHELL), 'SHELL digests are stale: run node tests/pwa.test.mjs --bump');
assert.ok(Object.values(DIGESTS).every((d) => /^[0-9a-f]{64}$/.test(d)), 'SHA-256 hex digests');
assert.equal(version, versionOf(SHELL), 'CACHE_VERSION is stale: run node tests/pwa.test.mjs --bump');
for (const must of ['index.html', 'css/main.css', 'js/app.js', 'js/ui/state.js', 'icons/icon-192.png']) assert.ok(SHELL.includes(must), must);
assert.ok(SHELL.some((f) => f.startsWith('fonts/') && f.endsWith('.woff2')), 'fonts precached');
assert.ok(!SHELL.includes('sw.js') && !SHELL.some((f) => /^(tests|electron|node_modules)\//.test(f)));

// worker behaviour, run in a vm with stub caches/fetch (the attack scenarios are in hardening.test.mjs)
{
  const net = [], served = (r) => { const rel = r.url.slice(BASE.length).split('?')[0]; return SHELL.includes(rel) ? new Response(bytes(rel)) : new Response('NET ' + r.url); };
  const { caches, fire, get } = loadSw(swSrc, { fetch: async (r) => { net.push(r); return served(r); } });
  caches.stores.set('dronecalc-old', new Map()); caches.stores.set('other-site-v1', new Map());

  await fire('install');
  assert.equal(net.length, SHELL.length);
  assert.ok(net.every((r) => r.cache === 'reload'), 'precache bypasses the HTTP cache');
  assert.equal(caches.stores.get(version).size, SHELL.length, 'every shell file cached under the version');

  await fire('activate');
  assert.deepEqual([...caches.stores.keys()].sort(), [version, 'other-site-v1'].sort(), 'only our own stale caches are deleted');

  net.length = 0;
  const lf = (f) => read(f).replace(/\r\n/g, '\n');
  assert.equal(await (await get('css/main.css')).text(), lf('css/main.css'), 'shell is cache-first');
  assert.equal(await (await get('?x=1', { mode: 'navigate' })).text(), lf('index.html'), 'navigation falls back to index.html');
  assert.equal(net.length, 0, 'shell hits never touch the network');
  assert.equal(await (await get('other.json')).text(), `NET ${BASE}other.json`, 'non-shell goes to the network');
  assert.equal(await get('https://www.amazon.in/dp/X'), undefined, 'cross-origin is not intercepted');
  assert.equal(await get('css/main.css', { method: 'POST' }), undefined, 'non-GET is not intercepted');
}

// manifest: relative so it works under /DroneCalc/, installable icons that exist
{
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.ok(m.name && m.short_name);
  assert.equal(m.start_url, './'); assert.equal(m.scope, './'); assert.equal(m.display, 'standalone');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i); assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  for (const i of m.icons) {
    assert.ok(!i.src.startsWith('/') && !/^[a-z]+:/.test(i.src), `relative icon ${i.src}`);
    const png = fs.readFileSync(path.join(ROOT, i.src));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, i.sizes, i.src);
  }
  for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) assert.ok(m.icons.some((i) => i.sizes === size && i.purpose === purpose), `${size} ${purpose}`);
}

// index.html wires the manifest; CSP gains only worker-src and manifest-src, and stays identical in electron/main.js
{
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}"/i);
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.equal(csp, /const CSP = "([^"]+)"/.exec(read('electron/main.js'))[1], 'CSP differs between index.html and electron/main.js');
  assert.ok(csp.includes("worker-src 'self'") && csp.includes("manifest-src 'self'"));
  assert.ok(csp.includes("default-src 'none'") && !/script-src[^;]*unsafe/.test(csp));
}

// registration is gated: https, or localhost only with ?sw=1; never app:// or file://
{
  const reg = read('js/app.js').split('\n').find((l) => l.includes('serviceWorker.register'));
  assert.ok(reg, 'app.js registers sw.js');
  const cond = /^if \((.*)\) navigator\.serviceWorker\.register\('sw\.js'\)/.exec(reg.trim())?.[1];
  assert.ok(cond, 'the registration line is: if (<gate>) navigator.serviceWorker.register(\'sw.js\')...');
  const gate = (loc, nav = { serviceWorker: {} }) => new Function('navigator', 'location', `return (${cond});`)(nav, { search: '', ...loc });
  for (const [protocol, hostname, search, want] of [['https:', 'x.github.io', '', true], ['https:', 'x.github.io', '?sw=1', true], ['http:', 'localhost', '?sw=1', true], ['http:', '127.0.0.1', '?sw=1', true], ['http:', '[::1]', '?sw=1', true],
    ['http:', 'localhost', '', false], ['http:', 'localhost', '?sw=0', false], ['app:', 'dronecalc', '?sw=1', false], ['file:', '', '?sw=1', false], ['http:', 'example.com', '?sw=1', false]]) {
    assert.equal(gate({ protocol, hostname, search }), want, `${protocol}//${hostname}${search}`);
  }
  assert.equal(gate({ protocol: 'https:', hostname: 'x.github.io' }, {}), false, 'no serviceWorker support: no registration');
}

// desktop: the app:// allow-list serves neither the worker nor the manifest (and does not need to)
for (const p of ['/sw.js', '/manifest.webmanifest']) assert.equal(resolveAppPath(path.resolve('/tmp/dc-root'), p), null, p);
assert.ok(resolveAppPath(path.resolve('/tmp/dc-root'), '/icons/icon-192.png') === null, 'icons are not served to the desktop app either');

// deploy: Pages copies and watches every PWA file
{
  const y = read('.github/workflows/pages.yml');
  for (const f of ['sw.js', 'manifest.webmanifest', 'icons']) assert.ok(new RegExp(`cp -r [^\\n]*\\b${f}\\b`).test(y), `pages.yml copies ${f}`);
}
console.log('pwa ok');
