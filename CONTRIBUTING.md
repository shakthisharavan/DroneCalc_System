# Contributing to DroneCalc

DroneCalc is open source under the [MIT License](LICENSE). Contributions are welcome.

The repository is managed by its maintainer, [shakthisharavan](https://github.com/shakthisharavan). Only the maintainer commits to `main` and manages versions and releases. Everyone else contributes through pull requests, and the maintainer reviews and merges them.

## Set up

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install      # install Electron and the build tool
npm start        # run the desktop app
npm test         # run all test suites
npm run smoke    # start the app, run a build to a result, print SMOKE OK, exit
```

The site itself is plain HTML, CSS and JavaScript modules, so you can also run it without Electron. See "Run from source" in the [README](README.md).

## How to contribute

1. Fork the repository on GitHub.
2. Create a branch in your fork, for example `git switch -c fix-battery-check`.
3. Make your change and run `npm test`. All suites must pass.
4. Push the branch to your fork and open a pull request against `main`.
5. The `test` check runs on your pull request (tests plus the app smoke test). It must pass before the maintainer can merge.
6. The maintainer will review it, may ask for changes, and merges it when it is ready. You do not need, and will not get, direct push access to `main`.

## What makes a good pull request

- One change per pull request, with a short description of what changed and why.
- The `test` check passes. If you change behaviour, add or update a test in `tests/`.
- Catalog changes (parts, prices, specs, links) include a link to the manufacturer or store page that backs them up.
- Physics or rule changes (for example weight classes) say where the numbers come from.
- No new dependencies or build tools without asking first. Electron and electron-builder are the only ones, and they are for the desktop app. The website code has no build step.

## Changing shipped files

Shipped files are `index.html`, `manifest.webmanifest`, and everything under `css/`, `js/`, `fonts/` and `icons/`. After changing any of them, run:

```bash
node tests/pwa.test.mjs --bump
```

This regenerates the `SHELL` digests and `CACHE_VERSION` in `sw.js`, which the offline cache depends on. `npm test` and the Pages deploy fail while `sw.js` is stale.

Two branches that both change shipped files conflict on `CACHE_VERSION` and `SHELL` in `sw.js`. Resolve the conflict by taking either side, then run `--bump` again and commit the result.

New files under `css/`, `js/`, `fonts/` and `icons/` are already covered by the path list in `.github/workflows/pages.yml`. A new top-level shipped file must be added in three places: the `paths:` list and the `cp -r` line in `pages.yml`, and the file list in `tests/pwa.test.mjs`.

## Testing the service worker locally

The worker caches the site, so a stale copy can hide your changes. Serve the folder on `http://localhost` (or `127.0.0.1`) and open the page with `?sw=1` added, for example `http://localhost:8000/?sw=1`. The worker registers on localhost only with that flag. After each change, run `--bump` and reload. If the old version still shows, unregister the worker in DevTools (**Application > Service workers**) and reload. Drop the flag when you are done.

## Translations

Interface text lives in `js/i18n/`. `en.js` is the source. `es.js` and `hi.js` translate it. Add a new key to `en.js` first, then to `es.js` and `hi.js`. To see what is still untranslated, run:

```bash
node tests/i18n.test.mjs --missing
```

Add `--json` for a fill-in skeleton. The command never fails the build, and a missing key falls back to English. Spanish and Hindi are machine-translated, so corrections from native speakers are welcome.

## Forks and generated files

Contributions come through forks and pull requests. Do not commit installers, `dist/` output or other generated binaries. The maintainer does not accept pull requests that add them. Release builds come from the **Release** workflow, and those installers are unsigned.

## Bugs and ideas

Open a GitHub issue. For a bug, include the link from the **Copy link** button so the maintainer can reopen the same build, and say what you expected to see.

## Releasing (maintainer only)

Releases are built by GitHub Actions from a version tag. The result is a draft release that you check before it goes public.

1. Set the new `version` in `package.json`, for example `1.0.1`.
2. Commit it:

   ```bash
   git add package.json package-lock.json
   git commit -m "Release 1.0.1"
   ```

3. Tag the commit. The tag must be `v` plus the exact `package.json` version, or the workflow stops with an error:

   ```bash
   git tag v1.0.1
   git push origin main --tags
   ```

4. Wait for the **Release** workflow in the Actions tab. It runs the tests and builds the Windows, macOS and Linux installers (about 10 to 15 minutes).
5. Open **Releases** on GitHub and open the new draft release. Check that the files are there: the Windows `.exe`, the macOS `.dmg`, and the Linux `.AppImage`, `.deb` and `.rpm` files.
6. Click **Publish release**. Installed apps then offer the update to users.

To try the build without releasing, open **Actions > Release > Run workflow**. A manual run builds all installers and keeps them as workflow artifacts for 7 days. It does not create a release.

The website at <https://shakthisharavan.github.io/DroneCalc_System/> is published by the **Pages** workflow whenever `index.html`, `css/`, `js/`, `fonts/`, `icons/`, `sw.js` or `manifest.webmanifest` change on `main`.

## Licensing of contributions

By opening a pull request you agree that your contribution is released under the project's MIT License.
