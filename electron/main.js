'use strict';
const { app, BrowserWindow, Menu, protocol, net, shell, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { resolveRealFile, isNewer, isExternalAllowed, isReleaseUrl } = require('./util');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'app://dronecalc';
// keep in sync with the <meta http-equiv="Content-Security-Policy"> in index.html
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; worker-src 'self'; manifest-src 'self'";
const REPO = 'https://github.com/shakthisharavan/DroneCalc_System';
const SMOKE = process.argv.includes('--smoke');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win = null;
let updateChecked = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!app.isReady()) return; // whenReady creates the window
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

function serve() {
  const notFound = () => new Response('Not found', { status: 404 });
  let realRoot; // realpath of ROOT, resolved once
  protocol.handle('app', async (req) => {
    try {
      realRoot ??= await fs.realpath(ROOT);
      const file = await resolveRealFile(realRoot, new URL(req.url).pathname);
      if (!file || !(await fs.stat(file)).isFile()) return notFound();
      const res = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(res.headers);
      headers.set('Content-Security-Policy', CSP);
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(res.body, { status: res.status, headers });
    } catch { return notFound(); }
  });
}

function open(url) { if (isExternalAllowed(url)) shell.openExternal(new URL(url).href).catch(() => {}); }

// win can be null on macOS (all windows closed, app still running)
const box = (opts) => (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts));

function buildMenu() {
  const about = () => box({
    type: 'info', title: 'About DroneCalc', message: `DroneCalc ${app.getVersion()}`,
    detail: `Drone calculator and bill of materials.\n${REPO}`,
  });
  const help = { label: 'Help', submenu: [
    { label: 'About DroneCalc', click: about },
    { label: 'Releases page', click: () => open(`${REPO}/releases`) },
    { label: 'Report a problem', click: () => open(`${REPO}/issues`) },
  ] };
  const view = { label: 'View', submenu: [
    { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
    { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
    ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
    { role: 'togglefullscreen' },
  ] };
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    ...(isMac ? [] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    { role: 'editMenu' },
    view,
    help,
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

async function checkForUpdate() {
  try {
    const res = await net.fetch('https://api.github.com/repos/shakthisharavan/DroneCalc_System/releases/latest', { headers: { 'User-Agent': 'DroneCalc' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const rel = await res.json();
    if (!isNewer(rel.tag_name, app.getVersion())) return;
    const { response } = await box({
      type: 'info', message: `DroneCalc ${String(rel.tag_name).replace(/^v/, '')} is available`,
      detail: `You have ${app.getVersion()}.`, buttons: ['Download', 'Later'], defaultId: 0, cancelId: 1,
    });
    if (response === 0 && isReleaseUrl(rel.html_url)) open(rel.html_url);
  } catch { /* offline or rate-limited: stay silent */ }
}

function start() {
  serve();
  buildMenu();

  const ses = session.defaultSession;
  const allow = (p) => p === 'clipboard-sanitized-write';
  ses.setPermissionRequestHandler((_wc, p, cb) => cb(allow(p)));
  ses.setPermissionCheckHandler((_wc, p) => allow(p));
  createWindow();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600, title: 'DroneCalc',
    backgroundColor: '#e9e4d4', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const wc = win.webContents;
  win.on('closed', () => { win = null; });
  wc.setWindowOpenHandler(({ url }) => { open(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    e.preventDefault();
    open(url);
  });
  win.once('ready-to-show', () => {
    // smoke shows the window too: navigator.clipboard needs a focused document
    win.show();
    if (SMOKE || updateChecked) return;
    updateChecked = true;
    checkForUpdate();
  });

  if (SMOKE) return smoke(wc);
  win.loadURL(`${ORIGIN}/index.html`);
}

function smoke(wc) {
  const problems = [];
  const done = (code, msg) => { console.log(msg); app.exit(code); };
  const timer = setTimeout(() => done(1, `SMOKE FAIL: timeout after 30s ${problems.join('; ')}`), 30000);
  const fail = (m) => { clearTimeout(timer); done(1, `SMOKE FAIL: ${[m, ...problems].filter(Boolean).join('; ')}`); };

  wc.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') problems.push(`console ${e.level}: ${e.message}`);
  });
  wc.on('did-fail-load', (_e, code, desc, url) => problems.push(`did-fail-load ${code} ${desc} ${url}`));
  wc.on('render-process-gone', (_e, d) => fail(`render-process-gone ${d.reason}`));

  wc.once('did-finish-load', async () => {
    try {
      const has = `!!document.querySelector('[data-act="pdf"]')`;
      for (let i = 0; i < 100 && !(await wc.executeJavaScript(has)); i++) await new Promise((r) => setTimeout(r, 200));
      if (!(await wc.executeJavaScript(has))) return fail('results page not rendered (no [data-act="pdf"])');
      wc.focus();
      const clip = await wc.executeJavaScript(`navigator.clipboard.writeText('dronecalc').then(() => 'ok', (e) => String(e))`, true);
      if (clip !== 'ok') {
        // CI (xvfb, no window manager) may never focus the document
        if (process.env.CI) console.warn(`smoke: warning: clipboard.writeText failed: ${clip}`);
        else problems.push(`clipboard.writeText failed: ${clip}`);
      }
      const st = await wc.executeJavaScript(`Promise.all(['/.git/config', '/nope.js', '/package.json'].map((p) => fetch(p).then((r) => r.status)))`);
      if (st.join() !== '404,404,404') problems.push(`app:// should 404 for .git/config, nope.js, package.json, got ${st}`);
      const fonts = await wc.executeJavaScript(`document.fonts.check('16px Archivo')`);
      if (!fonts) console.warn('smoke: warning: font Archivo not loaded');
      await new Promise((r) => setTimeout(r, 300)); // let late console errors arrive
      clearTimeout(timer);
      if (problems.length) done(1, `SMOKE FAIL: ${problems.join('; ')}`);
      else done(0, 'SMOKE OK');
    } catch (err) { fail(String(err)); }
  });
  wc.loadURL(`${ORIGIN}/index.html#s=3&m=mapping`);
}
