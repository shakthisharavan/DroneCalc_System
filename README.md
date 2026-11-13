# DroneCalc

A drone calculator and bill of materials. Pick a mission and a flight time, and DroneCalc sizes the build (motors, props, battery, frame), picks real parts from a catalog, checks that they fit together, and exports a BOM as PDF or CSV.

It is a static site: plain HTML, CSS and JavaScript modules. There is no build step, no `npm install` and no backend.

## Run it locally

### What you need

- **Git**, to clone the repo.
- **Python 3**, to serve the files. Check with `python --version` (on some systems the command is `python3` or `py`).
- A modern browser (current Chrome, Edge, Firefox or Safari).
- Internet access is optional. It only loads the web fonts; without it the site falls back to system fonts.
- **Node.js 18 or newer** is only needed to run the tests (see below), not to run the site.

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

   (`http://localhost:8000/` works too.)

4. **Stop the server** with `Ctrl+C` in the terminal when you are done.

### Why a server is needed

Opening `index.html` by double-clicking it (a `file://` address) shows a blank page. The app is built from JavaScript modules, and browsers do not load modules from `file://`. Serving the folder over `http://` fixes this. Binding to `127.0.0.1` keeps the server reachable only from your own machine.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| Blank page or `Failed to load module` errors | You opened `index.html` directly. Use the `http://127.0.0.1:8000/` address instead. |
| `Address already in use` or `[Errno 98]` / `[WinError 10048]` | Port 8000 is taken. Use another port, for example `python -m http.server 8080 --bind 127.0.0.1`, and open `http://127.0.0.1:8080/`. |
| `python` is not recognized (Windows) | Install Python 3 from python.org and tick "Add python.exe to PATH", or use `py -m http.server 8000 --bind 127.0.0.1`. |
| Old behaviour after pulling new changes | Hard-reload the page (`Ctrl+Shift+R`, or `Cmd+Shift+R` on macOS). Browsers cache JavaScript modules. |
| Fonts look different | The Google Fonts request failed (offline or blocked). The site still works with fallback fonts. |

## Using the site

1. **Mission:** choose what the drone is for (delivery, inspection, agriculture spraying, interceptor, mapping / survey, FPV). You can name your drone here; the name is used in the exported file names.
2. **Time:** set the target flight time.
3. **Details:** choose the airframe (quad, hex, octo, VTOL quadplane, tiltrotor, fixed wing, or an FPV size), payload, frame material, currency, country, budget and environment, then press **Calculate build**.
4. **Build:** read the performance figures, select one part per category to fill the BOM, and check the compatibility list.

Useful things on the results page:

- **Measured weight:** enter the real weight of your parts to re-derive flight time, thrust-to-weight and warnings.
- **Export PDF** and **Download CSV:** files are named after your drone, for example `Inspect-Build.pdf` and `Inspect-BOM.csv`.
- **Copy link:** the whole build is stored in the page address, so a copied link reopens the same build.
- **Save build** and **My builds:** keep up to 20 builds in your browser and compare two or three side by side.
- **Theme toggle:** light or dark. It follows your system setting until you choose.

Your saved builds, last build and theme are stored in your browser only (`localStorage`). Nothing is sent to a server.

## Run the tests

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

## Project layout

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

## Good to know

- **Verify before you buy or fly.** Prices are static and may be out of date. Part specs, battery plugs and frame prop limits come from manufacturer pages and general product knowledge, and some values are estimates. Check them against the product page and the maker's limits for your build.
- **Weight-class rules** (EU, UK, India, US and a generic fallback) are a guide, not legal advice. Check your local aviation authority before you fly.
- Some mission and airframe combinations have no off-the-shelf part in the catalog (for example octo frames between 470 and 900 mm). The site marks these with a "No off-the-shelf" note and shows the closest parts.
