'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');

const SERVED = new Set(['index.html', 'css', 'js', 'fonts']);

// Map a URL pathname to a file inside rootDir, or null if it would escape or is malformed.
function resolveAppPath(rootDir, urlPathname) {
  let p;
  try { p = decodeURIComponent(urlPathname || '/'); } catch { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  if (p === '' || p.endsWith('/')) p += 'index.html';
  if (p.split('/').includes('..')) return null;
  const root = path.resolve(rootDir);
  const file = path.resolve(root, '.' + (p[0] === '/' ? p : '/' + p));
  return isServed(root, file) ? file : null;
}

function isServed(root, file) {
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return SERVED.has(rel.split(path.sep)[0]); // not .git, node_modules, tests, electron...
}

// Like resolveAppPath, but follows symlinks/junctions and re-checks the real target.
// realRoot must already be fs.realpath'd. Returns the real file path, or null.
async function resolveRealFile(realRoot, urlPathname) {
  const file = resolveAppPath(realRoot, urlPathname);
  if (!file) return null;
  try {
    const real = await fs.realpath(file);
    return isServed(realRoot, real) ? real : null;
  } catch { return null; }
}

// shortcut: a -prerelease/+build suffix is ignored, not ranked (1.0.1-beta counts as 1.0.1).
function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.+-]*)?$/.exec(String(v ?? '').trim());
  return m ? m.slice(1).map(Number) : null;
}
function isNewer(latestTag, currentVersion) {
  const a = parse(latestTag), b = parse(currentVersion);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

function isExternalAllowed(url) {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

function isReleaseUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith('/shakthisharavan/DroneCalc_System/');
  } catch { return false; }
}

module.exports = { resolveAppPath, resolveRealFile, isNewer, isExternalAllowed, isReleaseUrl };
