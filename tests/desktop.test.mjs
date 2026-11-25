// Desktop shell helpers (electron/util.js): pure, no Electron needed.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
const { resolveAppPath, resolveRealFile, isNewer, isExternalAllowed, isReleaseUrl } = createRequire(import.meta.url)('../electron/util.js');

const root = path.resolve('/tmp/dc-root');
const inside = (p) => path.join(root, ...p);

// resolveAppPath
assert.equal(resolveAppPath(root, '/'), inside(['index.html']));
assert.equal(resolveAppPath(root, ''), inside(['index.html']));
assert.equal(resolveAppPath(root, '/index.html'), inside(['index.html']));
assert.equal(resolveAppPath(root, '/css/main.css'), inside(['css', 'main.css']));
assert.equal(resolveAppPath(root, '/js/ui/pdf.js'), inside(['js', 'ui', 'pdf.js']));
assert.equal(resolveAppPath(root, '/css/'), inside(['css', 'index.html']));
for (const bad of [
  '/../secret', '/..', '/css/../../secret', '/%2e%2e/secret', '/%2E%2E/secret', '/css/%2e%2e/%2e%2e/x',
  '/..%2fsecret', '/%2e%2e%5csecret', '/..\\secret', '/css\\..\\..\\x', '/a\0b', '/a%00b', '/%zz', '/..;/x',
]) {
  const r = resolveAppPath(root, bad);
  assert.ok(r === null || path.relative(root, r).split(path.sep)[0] !== '..', `escaped: ${bad}`);
  if (!bad.includes('..;')) assert.equal(r, null, `not rejected: ${bad}`);
}
assert.equal(resolveAppPath(root, '//etc/passwd'), null, 'double slash is not an escape');
assert.equal(resolveAppPath(root, '//css/main.css'), inside(['css', 'main.css']));
assert.equal(resolveAppPath(root, '/C:\\Windows\\win.ini'), null);

// only index.html, css/, js/, fonts/ are served
for (const p of ['/package.json', '/electron/main.js', '/.git/config', '/node_modules/x', '/tests/ui.test.mjs', '/dist/x']) assert.equal(resolveAppPath(root, p), null, p);
assert.equal(resolveAppPath(root, '/fonts/a.woff2'), inside(['fonts', 'a.woff2']));

// resolveRealFile: symlinks/junctions must not lead out of root (or into unserved dirs)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-real-'));
try {
  const rr = path.join(tmp, 'root'), outside = path.join(tmp, 'outside');
  for (const d of ['js', 'css', 'electron', 'outside']) fs.mkdirSync(path.join(d === 'outside' ? tmp : rr, d), { recursive: true });
  fs.writeFileSync(path.join(rr, 'index.html'), 'x');
  fs.writeFileSync(path.join(rr, 'js', 'a.js'), 'x');
  fs.writeFileSync(path.join(rr, 'electron', 'main.js'), 'x');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
  fs.symlinkSync(outside, path.join(rr, 'js', 'evil'), 'junction');
  fs.symlinkSync(path.join(rr, 'electron'), path.join(rr, 'css', 'unserved'), 'junction');
  fs.symlinkSync(path.join(rr, 'js'), path.join(rr, 'css', 'ok'), 'junction');
  const real = fs.realpathSync(rr);
  assert.equal(await resolveRealFile(real, '/js/a.js'), path.join(real, 'js', 'a.js'));
  assert.equal(await resolveRealFile(real, '/'), path.join(real, 'index.html'));
  assert.equal(await resolveRealFile(real, '/js/evil/secret.txt'), null, 'junction escape');
  assert.equal(await resolveRealFile(real, '/css/unserved/main.js'), null, 'junction into unserved dir');
  assert.equal(await resolveRealFile(real, '/css/ok/a.js'), path.join(real, 'js', 'a.js'), 'junction staying in served dirs');
  assert.equal(await resolveRealFile(real, '/js/missing.js'), null);
  assert.equal(await resolveRealFile(real, '/../outside/secret.txt'), null);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// isNewer
assert.equal(isNewer('v1.0.1', '1.0.0'), true);
assert.equal(isNewer('1.1.0', '1.0.9'), true);
assert.equal(isNewer('v2.0.0', 'v1.9.9'), true);
assert.equal(isNewer('1.10.0', '1.9.0'), true, 'numeric, not string, compare');
assert.equal(isNewer('v1.0.0', '1.0.0'), false);
assert.equal(isNewer('v0.9.9', '1.0.0'), false);
assert.equal(isNewer('1.0.0', '1.0.1'), false);
for (const g of ['', 'latest', 'v', 'v1', 'v1.0', 'x.y.z', null, undefined, 42, {}, 'v1.0.0.0', 'v1..0']) {
  assert.equal(isNewer(g, '1.0.0'), false, `garbage latest: ${String(g)}`);
  assert.equal(isNewer('v9.9.9', g), false, `garbage current: ${String(g)}`);
}
assert.equal(isNewer('v1.0.1-beta.1', '1.0.0'), true, 'prerelease suffix ignored');

// isExternalAllowed
assert.equal(isExternalAllowed('https://github.com/shakthisharavan/DroneCalc_System'), true);
for (const u of ['http://example.com', 'javascript:alert(1)', 'file:///etc/passwd', 'app://dronecalc/index.html', 'data:text/html,x', 'ftp://x', '', 'not a url', null, undefined]) {
  assert.equal(isExternalAllowed(u), false, `allowed: ${u}`);
}

// isReleaseUrl
assert.equal(isReleaseUrl('https://github.com/shakthisharavan/DroneCalc_System/releases/tag/v1.0.1'), true);
for (const u of ['https://github.com/evil/repo/releases', 'https://github.com/shakthisharavan/DroneCalc_System-evil/releases', 'https://github.com/shakthisharavan/DroneCalc_System', 'https://github.com/shakthisharavan/DroneCalc_System/../../evil/x', 'https://github.com//shakthisharavan/DroneCalc_System/x', 'http://github.com/x', 'https://evil.com/github.com', 'https://github.com.evil.com/x', 'https://api.github.com/x', 'javascript:1', '', null, undefined]) assert.equal(isReleaseUrl(u), false, String(u));

// packaging config (package.json "build"): guards the Linux/Windows install fixes
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const { build } = pkg;
// depends REPLACES electron-builder's defaults, so they must stay listed next to the alsa entry
for (const d of ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0', 'libuuid1', 'libsecret-1-0', 'libasound2t64 | libasound2']) assert.ok(build.deb.depends.includes(d), `deb depends: ${d}`);
for (const d of ['gtk3', 'nss', 'xdg-utils', 'alsa-lib']) assert.ok(build.rpm.depends.includes(d), `rpm depends: ${d}`);
assert.equal(build.deb.packageCategory, 'science');
assert.ok(build.linux.synopsis && build.linux.description, 'linux synopsis + description');
// WM_CLASS / StartupWMClass / .desktop name must all come from desktopName
assert.equal(build.linux.syncDesktopName, true);
assert.equal(pkg.desktopName, `${pkg.name}.desktop`);
// the desktop app must not ship the PWA worker or manifest (electron/util.js does not serve them)
for (const f of ['sw.js', 'manifest.webmanifest', 'icons/**']) assert.ok(!build.files.includes(f), `build.files must not include ${f}`);
// NSIS copies the installer into %LOCALAPPDATA%\dronecalc-updater; build/installer.nsh deletes it
const nsh = fs.readFileSync(new URL('../build/installer.nsh', import.meta.url), 'utf8');
assert.match(nsh, /!macro customInstall[\s\S]*Delete "\$LOCALAPPDATA\\dronecalc-updater\\installer\.exe"/);
assert.equal(`${pkg.name}-updater`, 'dronecalc-updater', 'updater cache dir name is derived from package name');
// mac: ad-hoc signing with hardened runtime off (no library-validation entitlement needed)
assert.equal(build.mac.identity, '-');
assert.equal(build.mac.hardenedRuntime, false);

console.log('desktop tests passed');
