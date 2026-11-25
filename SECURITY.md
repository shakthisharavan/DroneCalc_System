# Security policy

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue or pull request for them.

Use GitHub's private vulnerability reporting. On the repository page, open **Security**, then **Report a vulnerability**. Include the version, the platform (web, Windows, macOS or Linux), the steps to reproduce, and what you expected and what happened.

## Supported versions

Only the latest release receives fixes. The web version on GitHub Pages always runs the latest `main`.

## Scope

In scope:

- The web app and its installed (offline) form: `index.html`, `js/`, `css/`, `sw.js` and `manifest.webmanifest`.
- The desktop app: the Electron shell in `electron/` and the build settings in `package.json`, including the installers it produces.
- The GitHub Actions workflows in `.github/`.

Out of scope: the parts catalog (prices, store links and specifications, see the README), third-party sites that links open, and bugs in Electron, Chromium or electron-builder themselves. Report those to their projects.

## Hardening in place

- **Content Security Policy.** The page has a strict CSP meta tag: `default-src 'none'`, scripts, workers and manifest from `'self'` only, `object-src 'none'`, `base-uri 'none'` and `form-action 'none'`. The desktop app sends the same policy as a response header. `electron/main.js` notes that the two copies must stay identical.
- **Desktop shell.** The renderer runs with the Electron sandbox on, `contextIsolation` on and `nodeIntegration` off. There is no preload script and no IPC channel. The page loads from a private `app://dronecalc` scheme that serves only `index.html`, `css/`, `js/` and `fonts/`. It resolves real paths, so links and symlinks cannot leave the app folder, and it sends `X-Content-Type-Options: nosniff`.
- **Electron fuses** (in `package.json`): `RunAsNode`, `NodeOptions` and `NodeCliInspect` are disabled. `OnlyLoadAppFromAsar` and embedded ASAR integrity validation are enabled.
- **Navigation and external links.** The app blocks navigation away from itself and denies new windows. External links open in the browser only when they use `https`. The update check opens only a release page of this repository on github.com.
- **No data leaves the app.** The web app's CSP allows connections to its own origin only. The desktop app contacts GitHub only to check for a newer release.
- **Untrusted input.** Share links, imported build files and browser-stored data are treated as untrusted. They are size-capped, parsed inside `try`/`catch`, and checked field by field. Names are cleaned and cut, and unknown or out-of-range values are dropped. Rendered text is escaped. The checks are covered by `tests/security.test.mjs` and `tests/hardening.test.mjs`.
- **Service worker.** It registers only on `https`, or on `localhost` with a developer flag, and never in the desktop app. It serves a cached file only if its bytes still match the SHA-256 digest in `sw.js`.
- **Build and release.** Every GitHub Action is pinned to a full commit SHA. Each workflow grants only the permissions its jobs need, and checkouts do not keep credentials. Each release includes `SHA256SUMS.txt`.

## Known limitations

- **Installers are unsigned.** Windows SmartScreen and macOS Gatekeeper warn on first run. macOS builds use ad-hoc signing. Check downloads against `SHA256SUMS.txt`, as described in the README.
- **`style-src` allows `'unsafe-inline'`.** The app uses inline style attributes. Removing this needs a CSS refactor.
- **GitHub Pages cannot send HTTP security headers.** It cannot set `frame-ancestors` or `X-Frame-Options`, and a meta tag cannot set `frame-ancestors`. Other sites can frame the web app.
- **Electron fuse `GrantFileProtocolExtraPrivileges`** is left at its default.
- **Build tooling advisory.** A moderate advisory for `minimatch` affects the build tooling. It is not part of the shipped app.
- **Update check.** The desktop app only tells you that a newer version exists. It does not download or install updates.
