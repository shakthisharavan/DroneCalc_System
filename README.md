# DroneCalc

DroneCalc turns "I want a drone that does X" into a sized design and a shopping list. You pick a mission and a flight time. It works out what motors, props, battery and frame the build needs, picks real parts from a catalog, checks that they fit together, and gives you a bill of materials (BOM) you can print or open in a spreadsheet.

DroneCalc System is the desktop (system) edition: a native app for Windows, macOS and Linux that installs like any other program and runs fully offline. The same calculator also runs in your browser. There is no backend and no account. Your builds stay on your computer. The app only contacts GitHub to check for a new version; no build data is sent.

DroneCalc is free, open-source software under the [MIT License](LICENSE).

## Quick start

1. Download the installer for your system from the [Releases page](https://github.com/shakthisharavan/DroneCalc_System/releases/latest) (details in [Download and install](#download-and-install)).
2. Install it and open **DroneCalc** from the Start menu, Applications folder or app launcher.
3. Pick a mission, set a flight time, fill in the details and press **Calculate build**.
4. Select parts, check the compatibility results, then export a PDF report or a CSV parts list.

No release published yet? Run it from source in three commands (needs [Node.js](https://nodejs.org/) 22 or newer):

```bash
git clone https://github.com/shakthisharavan/DroneCalc_System.git
cd DroneCalc_System
npm install && npm start
```

## Why DroneCalc

- **Drone sizing is a loop, not a formula.** Battery, weight, motors and current all depend on each other. Doing this by hand or in a spreadsheet is slow and easy to get wrong. DroneCalc runs the loop until the numbers agree.
- **Mistakes cost money.** A battery that cannot supply the current, an ESC that is too small or props that do not fit the frame are usually found after the parts arrive. DroneCalc checks for them before you buy.
- **One tool instead of five.** Sizing, part selection, compatibility checks, cost, wiring and a first-flight checklist sit in one place, with a report you can hand to a team, a teacher or a competition jury.
- **Private and offline.** No sign-up, no cloud, no tracking. It works in a lab, a workshop or a field with no internet.
- **Free and open.** MIT-licensed, so you can use it, study it, change it and share it.

## How it works

1. **You describe the mission.** Mission type, target flight time, airframe (quad, hex, octo, VTOL, tilt-rotor, fixed-wing), payload, frame material, budget and region.
2. **The engine sizes the drone.** `js/engine.js` estimates the all-up weight, then the thrust, motor size, prop size, battery capacity and current needed. Because a bigger battery adds weight, it repeats the calculation until weight and power settle on one consistent answer.
3. **The matcher picks real parts.** `js/matcher.js` searches the built-in catalog (`js/catalog.js`) for motors, props, ESCs, batteries and frames that fit the sized design, priced in your currency with store links for your country.
4. **The checks test the combination.** `js/checks.js` gives a pass, warn or fail for battery current, ESC rating, motor and prop match, connectors and frame limits, and shows the weight class for your region.
5. **You get the results.** Flight time, thrust-to-weight, hover throttle, performance charts, a bill of materials, a wiring table and a build checklist. Export it as PDF or CSV, or save it to compare later.

The desktop app (`electron/`) wraps the same web code in a locked-down Electron window: sandboxed, no Node.js access from the page, and only the app's own files loaded.

## Why it is easy to use

- **Four guided steps.** Mission, Time, Details, Build. Each step has sensible defaults, so you can press through and get a working design in under a minute.
- **No setup.** Install and open. No account, no configuration, no database, no internet needed.
- **Plain language.** Results come with short explanations, and warnings say what is wrong and what to change.
- **Instant feedback.** Select or remove a part and the total cost and checks update straight away.
- **Your units and language.** Metric or imperial, English, Español or हिन्दी, light or dark theme.
- **Easy to share.** One-click PDF report, CSV for Excel or Google Sheets, or a link that reopens the same build.
- **Works everywhere.** Windows, macOS, Linux (including Raspberry Pi), or any modern browser.

## What it is for

Designing a drone usually means juggling a lot of linked numbers. A heavier battery lasts longer, but it also makes the drone heavier, which needs bigger motors, which draw more current, which needs a stronger battery. Builders often guess the weight, buy parts that do not plug together, or find out at the field that the flight time is half of what they expected.

DroneCalc does that sizing loop for you, shows the reasoning, and flags the common mistakes before you spend money.

It suits:

- **Students and hobbyists** planning a first build and wanting to know which parts go together.
- **Teams and competitions** (delivery, inspection, mapping, spraying, interceptor or FPV missions) that need a quick, defensible starting design and a parts list.
- **Anyone checking a design** they already have in mind, to see whether the battery, ESC, motors and props are a sensible match.

## What you can do with it

- **Size a drone from a mission.** Pick a mission, flight time, airframe and payload, and get the motors, props, battery and frame sized for it.
- **See the physics.** Flight time, thrust-to-weight, hover throttle and current draw, with charts and plain-language notes.
- **Get real parts, with prices.** Recommended parts from a catalog, priced in your currency, with store links.
- **Check that parts fit together.** Pass, warn or fail checks on battery, ESC, motors, connectors and props.
- **Use your real weight.** Enter the measured weight and the figures update.
- **Know your weight class.** A badge for your region, with a reminder to check local rules.
- **Plan the build.** A wiring table and a first-flight checklist.
- **Save, compare and share.** Keep up to 20 builds on your computer, compare them, or copy a link.
- **Export.** A PDF report or a CSV bill of materials.

## What you get out of it

- A starting design that is internally consistent, so you begin from numbers that add up.
- A parts list you can order from, with a total cost against your budget.
- Early warnings: a battery that cannot supply the current, a motor and ESC mismatch, a thrust-to-weight ratio that is too low, a design that needs registration in your region.
- A way to compare alternatives (a bigger battery, a different frame) and see the effect before you buy.
- A report you can attach to a project proposal, a purchase request or a competition submission.

## What it is not

DroneCalc gives estimates, not guarantees. Flight time depends on weather, flying style, battery age and many other things. Prices in the catalog are static and may be out of date. Part specifications, battery plugs and frame propeller limits come from manufacturer pages and general product knowledge, and some are estimates. The weight-class rules (EU, UK, India, US) are a guide, not legal advice. Check the product page, the maker's limits and your local aviation authority before you buy parts or fly.

Some mission and airframe combinations have no off-the-shelf part in the catalog (for example octo frames between 470 and 900 mm). The app marks these with a "No off-the-shelf" note and shows the closest parts.

## Download and install

Get the latest installer from the [Releases page](https://github.com/shakthisharavan/DroneCalc_System/releases/latest). Open the **Assets** list at the bottom of the release and download the file for your system.

| System | File to download |
| --- | --- |
| Windows 10 or 11 | `DroneCalc-Setup-<version>.exe` |
| macOS 13 (Ventura) or newer (Apple Silicon and Intel) | `DroneCalc-<version>-universal.dmg` |
| Linux, any distribution | `DroneCalc-<version>-x86_64.AppImage` or `DroneCalc-<version>-arm64.AppImage` |
| Ubuntu, Debian and similar | `DroneCalc-<version>-amd64.deb` or `DroneCalc-<version>-arm64.deb` |
| Fedora and similar | `DroneCalc-<version>-x86_64.rpm` or `DroneCalc-<version>-arm64.rpm` |

x86_64 / amd64 = most PCs (Intel or AMD); arm64 = ARM machines such as Raspberry Pi 4/5.

The installers are not code-signed yet, so Windows and macOS show a warning the first time. This is expected. The steps below get past it once.

You only need the internet to download the installer, to open the store links in the parts list, and for the app to check whether a new version is out. The calculator itself works offline.

### Requirements

- **Windows:** Windows 10 or 11, 64-bit. The installer is x64 only.
- **macOS:** one universal build for Apple Silicon and Intel. The table above says macOS 13 (Ventura) or newer, but the build settings do not set a minimum version. That number is not confirmed on real hardware.
- **Linux:** AppImage, `.deb` and `.rpm` packages for x86_64 and arm64. The AppImage needs FUSE 2 (`sudo apt install libfuse2` on Ubuntu or Debian). Ubuntu 24.04 and similar systems block the unprivileged user namespaces that Electron's sandbox needs. The app keeps the sandbox on, so if the AppImage will not start with a sandbox error, use the `.deb` or `.rpm` package instead. Linux builds are not yet tested on real hardware.

### Check the download

Every release includes `SHA256SUMS.txt`. Compare the SHA-256 hash of your file with its line in that file before you run it:

- Linux: `sha256sum --ignore-missing -c SHA256SUMS.txt`, in the folder with the download.
- macOS: `shasum -a 256 DroneCalc-<version>-universal.dmg`, then compare the output with the matching line.
- Windows (PowerShell): `Get-FileHash .\DroneCalc-Setup-<version>.exe -Algorithm SHA256`, then compare the output with the matching line.

The installers are not code-signed, so Windows SmartScreen and macOS Gatekeeper warn about them (see the steps below). The checksum confirms that your file matches the one attached to the release. It is not a code signature.

### Windows

1. Run `DroneCalc-Setup-<version>.exe`.
2. If you see "Windows protected your PC", click **More info**, then **Run anyway**.
3. Follow the installer. It installs for your user account and does not need administrator rights.
4. Open DroneCalc from the Start menu or the desktop shortcut.

### macOS

1. Open `DroneCalc-<version>-universal.dmg` and drag **DroneCalc** into **Applications**.
2. Open DroneCalc from Applications once. The app is not signed with a paid Apple certificate, so macOS may block it. Close the message.
3. If macOS says it cannot verify the app: open **System Settings > Privacy & Security**, scroll down, and click **Open Anyway** next to the DroneCalc message. Confirm and enter your password if asked.
4. If macOS says the app "is damaged and can't be opened": this is the same missing signature, not real damage. Run this in Terminal, then open the app again:

   ```bash
   xattr -cr /Applications/DroneCalc.app
   ```

5. From now on, DroneCalc opens normally.

### Linux

AppImage (any distribution). Make the file runnable, then run it:

```bash
chmod +x DroneCalc-<version>-x86_64.AppImage
./DroneCalc-<version>-x86_64.AppImage
```

Use the exact name of the file you downloaded (`arm64` on ARM machines). If it does not start, your system may need FUSE 2 (on Ubuntu, `sudo apt install libfuse2`).

Debian or Ubuntu package:

```bash
sudo apt install ./DroneCalc-<version>-amd64.deb
```

Fedora package:

```bash
sudo dnf install ./DroneCalc-<version>-x86_64.rpm
```

Run these in the folder that holds the file, and use the exact name of the file you downloaded. After a package install, DroneCalc appears in your application launcher under Science.

## Use it online

If you do not want to install anything, open the site in your browser: <https://shakthisharavan.github.io/DroneCalc_System/>

It is the same calculator. Your saved builds are stored in that browser only, and are separate from the desktop app.

### Install as an app (offline)

The online version can be installed, and then opens without a connection. Install it from the address above:

- **Chrome or Edge** (Windows, macOS or Linux): click the install icon at the right of the address bar, or choose **Install DroneCalc** from the browser menu.
- **Safari on iPhone or iPad**: tap **Share**, then **Add to Home Screen**.
- **Safari on macOS**: choose **File > Add to Dock**.

The offline copy is set up by a service worker. It registers only on an `https` address (such as the GitHub Pages site) or on `localhost` for developers. It never runs inside the desktop app, which ships its files with the installer.

To uninstall the web app, remove it as your browser does: in Chrome or Edge, open the app window and choose **Uninstall** from its menu (Chrome also lists apps at `chrome://apps`, Edge at `edge://apps`). On iPhone or iPad, press and hold the icon and choose **Remove App**. On macOS, remove it from the Dock.

To remove the offline copy and the saved data, clear the site data for `shakthisharavan.github.io` in your browser's site settings. This removes the service worker, its cache and your saved builds. That origin is shared by every GitHub Pages site on the same account, so their data is cleared too. In Chrome or Edge you can also open DevTools (F12), go to **Application**, and choose **Clear site data**.

### Browser support

The site needs JavaScript and a current browser. The minimum is Chrome or Edge 93, Firefox 92 or Safari 15.4. An older browser shows a notice on the page instead of the calculator. For the full look, including the dark theme, use Chrome or Edge 123 or newer, Firefox 120 or newer, or Safari 17.5 or newer. Browsers between the minimum and these versions show the light colours only.

### Storage and backup

There is no server. Your saved builds, custom parts, imported thrust curves, last build, language, unit and theme choices are kept in this browser's local storage. The data belongs to one browser, one profile and one address. A different browser, another profile or a private window starts empty, and `http://localhost:8000` keeps separate data from `http://127.0.0.1:8000`.

Safari may delete a website's stored data, including saved builds, after about seven days without a visit. The installed web app on iPhone or iPad also has its own storage, separate from Safari tabs.

To keep a backup, open **My builds** and choose **Export all saved builds**. This downloads a `.json` file. Use **Import build file** in the same panel to load it again. A file can be up to 256 KB and hold up to 20 builds; anything the app cannot read is skipped. Export before you clear browser data, change browsers or reinstall.

### Languages and units

Pick English, Español or हिन्दी from the **Language** menu at the top of the page. Spanish and Hindi are machine-translated and still need review by a native speaker, so please report wording that is wrong. For Hindi, the PDF report is written in English, because the PDF writer cannot draw Devanagari. The page itself stays in Hindi.

The **Metric** and **Imperial** buttons change only the figures shown on screen and in the PDF (grams, metres and Celsius, or ounces, feet and Fahrenheit). Calculations, saved builds and copied links stay in SI units.

## How to use it

The page has four steps, shown as a bar at the top: **Mission**, **Time**, **Details** and **Build**.

1. **Mission.** Choose what the drone is for: delivery, inspection, agriculture spraying, interceptor, mapping / survey, or FPV. You can give the drone a name here (optional). The name is used in the exported file names and the page title. For FPV you also pick a size class.
2. **Time.** Set the target flight time. Each mission starts with a sensible default.
3. **Details.** Choose the airframe, payload, frame material, currency, country, budget and environment, then press **Calculate build**.
4. **Build.** This is the results page:
   - Read the headline figures (flight time, hover thrust, weight class) and the performance charts. The battery card shows the required current and the best pack size.
   - In each part category, **select** one part to add it to the BOM. Press it again to remove it. The BOM total and the compatibility checks update as you choose.
   - Open the **wiring** table and the **build and first-flight checklist** when you are ready to assemble.
   - Optional: enter your **measured weight** (in grams) once you have weighed your real parts, so the figures use real weight. **Use estimate** switches back.

Buttons on the results page:

| Button | What it does |
| --- | --- |
| **Export PDF** | Downloads the full report as `<Name>-Build.pdf`. |
| **Download CSV** | Downloads the BOM as `<Name>-BOM.csv`, which opens in Excel or Google Sheets. |
| **Copy list** / **Print list** | Copies the parts list as text, or prints it. |
| **Copy link** | Copies a link that reopens this exact build in the online version. |
| **Save build** | Stores the build on your computer. Open **My builds** to rename, delete or compare saved builds. |
| **Clear** | Clears your part selections. |
| Theme button (top of the page) | Switches between light and dark. It follows your system setting until you choose. |

Your saved builds, custom parts, imported thrust curves, last build, language, unit and theme choices are stored on your computer only (in the app's data folder, or in your browser for the online version). No build data is sent anywhere.

## Updates

When a new version is out, the app tells you when it starts and offers to open the download page. Download the new installer and install it over the old version. Your saved builds are kept.

The app never installs updates by itself. If you are offline, the check is skipped without any message.

## Run from source

This part is for contributors and for anyone who wants to run the plain website without the desktop app. The site is static HTML, CSS and JavaScript modules, so it only needs a local web server.

1. **Clone the repo**

   ```bash
   git clone https://github.com/shakthisharavan/DroneCalc_System.git
   cd DroneCalc_System
   ```

2. **Start a local web server** from the project folder (the one that contains `index.html`).

   Windows (PowerShell or Command Prompt):

   ```powershell
   python -m http.server 8000 --bind 127.0.0.1
   ```

   If `python` is not found on Windows, try `py -m http.server 8000 --bind 127.0.0.1`.

   macOS or Linux:

   ```bash
   python3 -m http.server 8000 --bind 127.0.0.1
   ```

   You should see `Serving HTTP on 127.0.0.1 port 8000`. Leave this terminal open while you use the site.

3. **Open the site** in your browser:

   ```
   http://127.0.0.1:8000/
   ```

   (`http://localhost:8000/` works too, but your saved builds are stored separately for each address, so pick one and keep using it.)

4. **Stop the server** with `Ctrl+C` in the terminal when you are done. To use the site again later, repeat steps 2 and 3 from the same folder.

To get the latest code, run `git pull` in the project folder, then hard-reload the page (`Ctrl+Shift+R`, or `Cmd+Shift+R` on macOS), because browsers cache JavaScript modules.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| Blank page or `Failed to load module` errors | You opened `index.html` directly. Use the `http://127.0.0.1:8000/` address instead. |
| `Address already in use` or `[Errno 98]` / `[WinError 10048]` | Port 8000 is taken. Use another port, for example `python -m http.server 8080 --bind 127.0.0.1`, and open `http://127.0.0.1:8080/`. |
| `python` is not recognized (Windows) | Install Python 3 from python.org and tick "Add python.exe to PATH", or use `py -m http.server 8000 --bind 127.0.0.1`. |
| Old behaviour after pulling new changes | Hard-reload the page (`Ctrl+Shift+R`, or `Cmd+Shift+R` on macOS). |

### Remove the data the site stored in your browser

If you ran the site from source, the saved builds, last build and theme choice stay in your browser after you delete the project folder. Open `http://127.0.0.1:8000/` (the same address you used before) while a server is running, press `F12`, open the **Console** tab, and run:

```js
["dronecalc:builds", "dronecalc:curves", "dronecalc:custom", "dronecalc:lang", "dronecalc:last", "dronecalc:theme", "dronecalc:units"].forEach((k) => localStorage.removeItem(k));
```

Close the tab afterwards without reloading it: the site saves your last build again each time the page loads.

You can also clear it in the browser's site-data settings for `127.0.0.1` (and for `localhost` if you used that address, or for any other port you used). The data is stored separately for each address and port.

## For developers

You need [Node.js](https://nodejs.org/) 22 or newer. From the project folder:

```bash
npm install      # install Electron and the build tool
npm start        # run the desktop app
npm test         # run all test suites
npm run smoke    # start the app, run a build to a result, print SMOKE OK, exit
npm run dist     # build the installer for the system you are on, into dist/
```

The tests use plain Node. Each suite prints a pass message and exits with code 0 when it passes. `npm test` runs them all. On Linux, run `npm run smoke` under a virtual display (`xvfb-run -a npm run smoke`) if you have no desktop session.

`npm run dist` builds for your own operating system only. Installers for all three systems are built by GitHub Actions when the maintainer releases a version (see [CONTRIBUTING.md](CONTRIBUTING.md)).

### Project layout

```
index.html          page shell
manifest.webmanifest  web app manifest (name, icons, install settings)
sw.js               offline service worker (SHELL and CACHE_VERSION are generated)
css/                main.css, perf.css
fonts/              self-hosted fonts and their license
icons/              app icons for the installed web app
js/app.js           wizard, results page, wiring of the UI
js/engine.js        physics: sizing, performance, wiring
js/matcher.js       picks catalog parts for a build
js/catalog.js       parts, prices, links, currencies, regions
js/checks.js        compatibility checks, weight class, checklist
js/ui/              state.js (build state, share-link codec), parts.js, perf.js and charts.js (figures), pdf.js, library.js (saved builds), io.js (build files), custom.js (custom parts), measured.js (measured weight, thrust curves), units.js, wiring.js
js/i18n/            i18n.js (language switching), en.js, es.js, hi.js (translations)
electron/           desktop app shell (main process)
build/              app icon used by the installers
tests/              node test suites and the build/test log
.github/workflows/  CI: test.yml, release.yml, pages.yml
package.json        scripts and installer settings
SPEC*.md            design notes (SPEC.md to SPEC-v4.md)
```

## Uninstall

### Remove the app

- **Windows:** open **Settings > Apps > Installed apps**, find **DroneCalc**, and choose **Uninstall**.
- **macOS:** open **Applications** and drag **DroneCalc** to the Trash.
- **Linux:**
  - Installed from the `.deb`: `sudo apt remove dronecalc`
  - Installed from the `.rpm`: `sudo dnf remove dronecalc`
  - Used the AppImage: delete the `.AppImage` file.

### Delete your saved data (optional)

Uninstalling does not delete your saved builds or your other saved settings. They stay in the app's data folder, so a later reinstall finds them again. To remove them for good, delete this folder after you uninstall:

| System | Data folder |
| --- | --- |
| Windows | `%APPDATA%\DroneCalc` (paste it into the File Explorer address bar) |
| macOS | `~/Library/Application Support/DroneCalc` |
| Linux | `~/.config/DroneCalc` |

Warning: deleting this folder permanently deletes your saved builds. If you want to keep a design, use **Download CSV** or **Export PDF** on each build first.

If you also ran DroneCalc from source or used the online version, see "Remove the data the site stored in your browser" above.

Git, Python and Node.js are general tools and were not installed by DroneCalc. Remove them through your system's usual uninstall method only if you installed them just for this project and no longer need them.

## Contributing

Contributions are welcome through pull requests. The maintainer, [shakthisharavan](https://github.com/shakthisharavan), reviews every pull request and is the only one who commits to `main` and manages versions. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Released under the [MIT License](LICENSE). The license covers the DroneCalc code. Product names, prices and store links in the parts catalog belong to their respective makers and sellers.
