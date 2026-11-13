# DroneCalc

DroneCalc turns "I want a drone that does X" into a sized design and a shopping list. You pick a mission and a flight time. It works out what motors, props, battery and frame the build needs, picks real parts from a catalog, checks that they fit together, and gives you a bill of materials (BOM) you can print or open in a spreadsheet.

It is a static website: plain HTML, CSS and JavaScript modules. There is no backend, no account, no build step and no `npm install`. Everything runs in your browser.

## What it is for

Designing a drone usually means juggling a lot of linked numbers. A heavier battery lasts longer, but it also makes the drone heavier, which needs bigger motors, which draw more current, which needs a stronger battery. Builders often guess the weight, buy parts that do not plug together, or find out at the field that the flight time is half of what they expected.

DroneCalc does that sizing loop for you, shows the reasoning, and flags the common mistakes before you spend money.

It suits:

- **Students and hobbyists** planning a first build and wanting to know which parts go together.
- **Teams and competitions** (delivery, inspection, mapping, spraying, interceptor or FPV missions) that need a quick, defensible starting design and a parts list.
- **Anyone checking a design** they already have in mind, to see whether the battery, ESC, motors and props are a sensible match.

## What you can do with it

- **Size a drone from a mission.** Choose a mission, a target flight time, an airframe (quad, hex, octo, VTOL quadplane, tiltrotor, fixed wing, or an FPV size class), a payload and a frame material. DroneCalc sizes the motors, props, battery and frame for that.
- **See the physics, not just a number.** The results page shows estimated flight time, thrust-to-weight ratio, hover throttle and current draw, with charts that show how flight time changes with battery size and where the best pack size is. Plain-language "?" notes explain terms such as KV, S count, C rating and thrust-to-weight.
- **Get real parts, with prices.** Each part category lists recommended parts from a catalog of about 150 items, with prices in your currency (17 currencies), links to stores for your region, and weight and price differences against the best pick.
- **Check that parts fit together.** A compatibility list checks battery cell count against the ESC range, ESC current against motor current, connector types, flight-controller motor outputs and propeller size against the frame, and marks each check as pass, warn or fail.
- **Check your weight against reality.** Enter the measured weight of your actual parts and DroneCalc recalculates flight time, thrust-to-weight and warnings for that weight instead of its estimate.
- **Know which weight class you are in.** A badge shows the weight class for your region (EU, UK, India, US, or a generic fallback) with a reminder to check the local rules.
- **Plan the build.** The wiring table lists the connectors and wire sizes to use, and a build and first-flight checklist covers steps such as checking polarity, setting up the failsafe and calibrating the compass.
- **Keep and compare designs.** Save up to 20 builds in your browser, name them, and compare two or three side by side. Copy a link to share a build with someone else; the link contains the whole build.
- **Export.** Download a PDF report or a CSV bill of materials, named after your drone (for example `Survey-01-Build.pdf` and `Survey-01-BOM.csv`).

## What you get out of it

- A starting design that is internally consistent, so you begin from numbers that add up.
- A parts list you can order from, with a total cost against your budget.
- Early warnings: a battery that cannot supply the current, a motor and ESC mismatch, a thrust-to-weight ratio that is too low, a design that needs registration in your region.
- A way to compare alternatives (a bigger battery, a different frame) and see the effect before you buy.
- A report you can attach to a project proposal, a purchase request or a competition submission.

## What it is not

DroneCalc gives estimates, not guarantees. Flight time depends on weather, flying style, battery age and many other things. Prices in the catalog are static and may be out of date. Part specifications, battery plugs and frame propeller limits come from manufacturer pages and general product knowledge, and some are estimates. The weight-class rules (EU, UK, India, US) are a guide, not legal advice. Check the product page, the maker's limits and your local aviation authority before you buy parts or fly.

Some mission and airframe combinations have no off-the-shelf part in the catalog (for example octo frames between 470 and 900 mm). The site marks these with a "No off-the-shelf" note and shows the closest parts.

## Installation

There is nothing to install system-wide. You download the files and serve them from a local web server.

### What you need

- **Git**, to clone the repo.
- **Python 3**, to serve the files. Check with `python --version` (on some systems the command is `python3` or `py`).
- A modern browser (current Chrome, Edge, Firefox or Safari).
- Internet access is optional. It only loads the web fonts; without it the site falls back to system fonts.
- **Node.js 18 or newer** is only needed to run the tests, not to run the site.

### Steps

1. **Clone the repo**

   ```bash
   git clone https://github.com/shakthisharavan/DroneCalc.git
   cd DroneCalc
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

### Why a server is needed

Opening `index.html` by double-clicking it (a `file://` address) shows a blank page. The app is built from JavaScript modules, and browsers do not load modules from `file://`. Serving the folder over `http://` fixes this. Binding to `127.0.0.1` keeps the server reachable only from your own machine.

### Updating

To get the latest version, run `git pull` in the project folder, then hard-reload the page (`Ctrl+Shift+R`, or `Cmd+Shift+R` on macOS), because browsers cache JavaScript modules.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| Blank page or `Failed to load module` errors | You opened `index.html` directly. Use the `http://127.0.0.1:8000/` address instead. |
| `Address already in use` or `[Errno 98]` / `[WinError 10048]` | Port 8000 is taken. Use another port, for example `python -m http.server 8080 --bind 127.0.0.1`, and open `http://127.0.0.1:8080/`. |
| `python` is not recognized (Windows) | Install Python 3 from python.org and tick "Add python.exe to PATH", or use `py -m http.server 8000 --bind 127.0.0.1`. |
| Old behaviour after pulling new changes | Hard-reload the page (`Ctrl+Shift+R`, or `Cmd+Shift+R` on macOS). |
| Fonts look different | The Google Fonts request failed (offline or blocked). The site still works with fallback fonts. |

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
| **Copy link** | Copies a link that reopens this exact build. |
| **Save build** | Stores the build in your browser. Open **My builds** to rename, delete or compare saved builds. |
| **Clear** | Clears your part selections. |
| Theme button (top of the page) | Switches between light and dark. It follows your system setting until you choose. |

Your saved builds, last build and theme choice are stored in your browser only (`localStorage`). Nothing is sent to a server.

## For developers

### Run the tests

The tests use plain Node with no dependencies. From the project folder:

```bash
node tests/engine.test.mjs
node tests/catalog.test.mjs
node tests/checks.test.mjs
node tests/name.test.mjs
node tests/pdf.test.mjs
node tests/perf.test.mjs
node tests/ui.test.mjs
```

Each prints a pass message and exits with code 0 when it passes. To run them all at once:

```bash
# macOS, Linux, Git Bash
for t in tests/*.test.mjs; do node "$t" || echo "FAIL $t"; done
```

```powershell
# Windows PowerShell
Get-ChildItem tests\*.test.mjs | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { "FAIL $($_.Name)" } }
```

### Project layout

```
index.html          page shell
css/                main.css, perf.css
js/app.js           wizard, results page, wiring of the UI
js/engine.js        physics: sizing, performance, wiring
js/matcher.js       picks catalog parts for a build
js/catalog.js       parts, prices, links, currencies, regions
js/checks.js        compatibility checks, weight class, checklist
js/ui/              state, parts list, figures, PDF, saved builds library
tests/              node test suites and the build/test log
SPEC*.md            design notes (SPEC.md to SPEC-v4.md)
```

## Uninstall

DroneCalc does not install anything outside its own folder, so removing it takes three steps.

1. **Stop the server.** Press `Ctrl+C` in the terminal where `python -m http.server` is running.

2. **Delete the project folder.** This permanently deletes the folder and any changes you made inside it. Move out of the folder first, then delete it.

   Windows (PowerShell):

   ```powershell
   cd ..
   Remove-Item -Recurse -Force DroneCalc
   ```

   macOS or Linux:

   ```bash
   cd ..
   rm -rf DroneCalc
   ```

   If you want to keep a copy of your designs first, use **Download CSV** or **Export PDF** on each build before you delete anything.

3. **Remove the data the site stored in your browser.** The saved builds, last build and theme choice stay in your browser after the folder is gone. Open `http://127.0.0.1:8000/` (the same address you used before) while a server is running, press `F12`, open the **Console** tab, and run:

   ```js
   ["dronecalc:builds", "dronecalc:last", "dronecalc:theme"].forEach((k) => localStorage.removeItem(k));
   ```

   Close the tab afterwards without reloading it: the site saves your last build again each time the page loads.

   You can also clear it in the browser's site-data settings for `127.0.0.1` (and for `localhost` if you used that address, or for any other port you used). The data is stored separately for each address and port.

Git, Python and Node.js are general tools and were not installed by DroneCalc. Remove them through your system's usual uninstall method only if you installed them just for this project and no longer need them.
