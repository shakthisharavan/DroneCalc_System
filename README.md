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

- **Size a drone from a mission.** Pick a mission, flight time, airframe and payload, and get the motors, props, battery and frame sized for it.
- **See the physics.** Flight time, thrust-to-weight, hover throttle and current draw, with charts and plain-language notes.
- **Get real parts, with prices.** Recommended parts from a catalog, priced in your currency, with store links.
- **Check that parts fit together.** Pass, warn or fail checks on battery, ESC, motors, connectors and props.
- **Use your real weight.** Enter the measured weight and the figures update.
- **Know your weight class.** A badge for your region, with a reminder to check local rules.
- **Plan the build.** A wiring table and a first-flight checklist.
- **Save, compare and share.** Keep up to 20 builds in your browser, compare them, or copy a link.
- **Export.** A PDF report or a CSV bill of materials.

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

## License

Released under the [MIT License](LICENSE). The license covers the DroneCalc code. Product names, prices and store links in the parts catalog belong to their respective makers and sellers.
