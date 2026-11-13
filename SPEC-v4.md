# DroneCalc v4: research-driven upgrades, built and tested by agents in a loop

## Context
DroneCalc lives in `C:\Users\shakt\drone-calc`. It is a static vanilla-JS site served at http://127.0.0.1:8000.

What it does today:
- A wizard: Mission → Endurance → Details → Results.
- Engine physics and about 150 catalog parts across 10 regions and 17 currencies.
- Six performance figures, a wiring table, a BOM with a dock.
- PDF and CSV exports named after the drone, a copy-link button, and a remembered last build.

The user wants three things:
1. A plan based on forum research into what builders actually struggle with.
2. A site that looks better and is easier to use.
3. Autonomous execution by several agents (builder, runner, tester), looping fix → retest until no bugs remain.

## Forum research: what builders struggle with (sources at bottom)
1. **Flight time differs in the field.** All-up weight is guessed too low: battery, wiring and hardware get forgotten. Advice repeated everywhere: weigh the real build and aim for about 45–50 % hover throttle. Only about 80 % of pack capacity is really usable.
2. **A bigger battery does not mean a longer flight.** Returns diminish, and 10 000 mAh packs can shorten the flight.
3. **C rating is marketing.** Real continuous current is well below the label, and sag grows in cold weather and at low charge. Rule of thumb: keep peak current at or below about 70 % of the claimed continuous rating.
4. **Parts don't plug together.** Common problems:
   - FC↔ESC harness pin count or pinout mismatch
   - 4-in-1 ESC motor order
   - XT30/XT60/XT90 connectors melting when undersized
   - ESC protocol not supported
   - reversed polarity
5. **Calculator inputs are guesswork.** Users don't know cell weight or frame weight.
6. **Out-of-stock or discontinued parts.** Builders need "similar part" alternatives and to see the effect of a swap.
7. **Weight-class rules are confusing:**
   - EU: C0 < 250 g, C1 < 900 g, C2 ≤ 4 kg, C3/C4 ≤ 25 kg. Self-built under 250 g may fly in A1.
   - India Drone Rules 2021: nano ≤ 250 g, micro ≤ 2 kg, small ≤ 25 kg.
   - US: FAA registration from 250 g.
   - UK: CAA has its own class marks from 2026.

Gaps the codebase inventory confirmed:
- Part weights (`weightG`) are shown but never summed.
- No connector field and no compatibility logic.
- Only 1 saved build, and no way to compare builds.
- C rating, ESC amps and chemistry appear only in the PDF.
- `estCostUsd` is never shown.
- No dark mode.
- The weight-class warning is coarse: 250 g or 25 kg only (`engine.js:606`).

## Features (priority order, each tied to a research finding)

### P1: trust and correctness
1. **Real-weight check (findings 1, 5).**
   - Sum the `weightG` of the selected parts, plus the engine's wiring and hardware allowance.
   - Show "Your parts: X g vs estimate Y g" in the BOM section.
   - Add an optional "Measured weight (g)" field on the results page (hash key `mw`). When set, rerun the engine with `payloadKg += (measured − estimated)` so flight time, hover throttle and TWR update. This reuses `X.run` and needs no engine change.
2. **Hover-throttle sweet spot (finding 1).** Colour the hover-throttle KPI by band: 40–55 % good, 55–70 % warn, above 70 % bad. Add a one-line why.
3. **Battery honesty card (findings 2, 3).**
   - Show required continuous current, the C rating needed, ESC continuous/burst A and chemistry on screen. These are already in the result; today only the PDF shows them.
   - Flag a selected battery whose `peakCurrentA` > 70 % of `mah/1000 × cRating`.
   - Show the best pack size: the peak of the existing battery-sweep figure data in `perf.js`.
4. **Compatibility checker (finding 4).**
   - New pure module `js/checks.js` with `compat(result, picks)` → `[{id, level:'pass'|'warn'|'fail', text}]`.
   - Checks:
     - battery cells inside the ESC's `minCells`–`maxCells`
     - ESC `continuousA` ≥ per-motor current
     - battery connector = ESC/PDB input connector
     - FC `motorOutputs` ≥ motor count
     - prop inch ≤ the frame's maximum
     - motor `maxCurrentA` ≤ ESC continuous
     - ESC protocol supported by the FC firmware
   - Data work: add a `connector` field (XT30/XT60/XT90/XT150/AS150) to every battery, ESC and PDB item in `js/catalog.js`, taken from item names and specs.
   - Shown as a pass/warn/fail list under the BOM and in the PDF.
5. **Weight class badge (finding 7).**
   - `weightClass(auwKg, region)` in `js/checks.js` returns `{code, label, note}` for EU/GB (C0–C4, self-built rule), IN (nano/micro/small/medium), US (under 250 g vs registration/Part 107), and others (generic 250 g / 25 kg).
   - Shown as a KPI badge with a "check your local authority" note, and in the PDF.
   - Replaces the coarse warning at `engine.js:606` only in the UI. The engine warning stays.
6. **Build and first-flight checklist (finding 4).**
   - Static, configuration-aware list: multimeter polarity check, smoke stopper, props off for setup, motor order and direction, failsafe, compass calibration for GPS builds, receiver binding.
   - Shown as a collapsible section on results and as a PDF page.

### P2: ease of use and looks
7. **Saved builds library and compare (finding 6, UX).**
   - New `js/ui/library.js`: a localStorage list (`dronecalc:builds`, max 20) of `{name, hash, savedAt}`.
   - "Save build" on results, plus a "My builds" drawer listing, opening, renaming and deleting builds.
   - Compare 2–3 builds side by side: KPIs, BOM total, weight class.
   - Every stored hash goes back through `X.parse` (untrusted).
8. **Swap a part and see the effect (finding 6).** On each part card, show Δ weight and Δ price against the best pick. The matcher's "All N options" already lists alternatives; label them "Similar parts".
9. **Plain-language explainers (finding 5).** A small "?" `<details>` popover for KV, S count, C rating, TWR, hover throttle, mAh vs Wh, stator size. Text lives in one `GLOSSARY` object in `js/ui/parts.js`.
10. **Cost sanity line.** Show the engine's `estCostUsd` against the BOM total ("typical build cost").
11. **Dark mode.** `prefers-color-scheme` plus a toggle in the header, stored in localStorage. Token-based in `css/main.css` and `css/perf.css`. Contrast ≥ 4.5:1 for text. Charts use the existing tone tokens.
12. **Visual polish pass.** Apply the impeccable / ui-ux design skills to the results hierarchy: KPI strip, check list and badge styles, empty states, mobile drawer. No restructure.

Skipped and why:
- **Imperial units:** the target users (India, Germany) work in metric.
- **Custom part entry:** larger scope; a candidate for v5.
- **Live stock and prices:** needs a backend or scraping; the site is static.

## Contracts (so lanes work in parallel)
- `js/checks.js` (new, pure, node-testable):
  - `compat(r, picks)` → `Check[]`
  - `weightClass(auwKg, regionCode)` → `{code, label, note}`
  - `partsMassG(rows, r)` → `{partsG, allowanceG, totalG}`
- Catalog items gain an optional `specs.connector` string.
- `ui/state.js`: hash key `mw` (measured grams, 1–200 000) plus `X.runMeasured(S)`.
- Write all of this first as `SPEC-v4.md` in the repo: the single source for every agent.

## Execution model (multi-agent loop)
Lanes are split by file ownership, so no two agents edit the same file. **Builder agents:**
- **B1 data and checks:** `js/catalog.js`, `js/checks.js` (new), `tests/checks.test.mjs` (new), and `tests/catalog.test.mjs`. Covers the connector field and features 4, 5 and the parts-mass helper.
- **B2 UI logic:** `js/app.js`, `js/ui/state.js`, `js/ui/parts.js`, `js/ui/pdf.js`, `js/ui/library.js` (new), and `tests/name.test.mjs`. Covers features 1–3 and 5–10, plus PDF pages for checks, class and checklist.
- **B3 styles:** `css/main.css` and `css/perf.css`. Covers features 11 and 12, plus styles for the new components.

**Runner** (one agent, read-only on code):
- Keeps `python -m http.server 8000 --bind 127.0.0.1` alive.
- After each build round, runs all `node tests/*.test.mjs` and a smoke load of 6 hashes (one per mission and configuration family). Reports console errors.

**Tester** (one agent, read-only):
- Uses chrome-devtools at 375 (emulated), 1366 and 2560 px, light and dark.
- Covers every new feature, the existing exports, keyboard and Escape behaviour, print title and contrast.
- Checks hostile input: a drone name with `<>"'`, and garbage `mw`/`sel` values in the hash.
- Outputs a numbered bug list with repros.

**Loop:**
1. B1 runs first, because B2 depends on its contract. B3 runs in parallel with B1.
2. Then B2 runs.
3. Runner, then Tester.
4. Each bug goes back to the lane that owns the file. A fixer is a builder resumed with its context. Then Runner and Tester run again.
5. Stop when 2 tester passes in a row find 0 bugs and all suites are green, or after 6 rounds. At the cap, report what is left.
6. Each round's bug list and fixes are logged in `drone-calc/tests/LOOP-LOG.md`.

Note: "auto mode" is a permission setting the user toggles (Shift+Tab). I cannot switch it myself. Approving this plan starts the run.

## Verification
- All suites green: `cd /c/Users/shakt/drone-calc && for t in tests/*.test.mjs; do node "$t" || echo FAIL $t; done`. That is 5 existing suites plus the new `checks.test.mjs`.
- `checks.test.mjs` covers:
  - each compat rule pass/fail, including a 6S battery on a 2–4S ESC giving fail and an XT60↔XT90 mismatch
  - weightClass boundaries: 249/250/899/900/4000/25000 g for EU, IN, US
  - partsMassG sums
- In the browser, at the 3 widths and in both themes:
  - the measured-weight override changes flight time
  - the compat list renders, the weight badge is correct, saved builds survive a reload, compare shows 2 builds
  - PDF and CSV filenames still match the drone name, and the PDF includes the new pages
  - no console errors

## Sources
- https://discuss.ardupilot.org/t/flight-endurance-weight-batteries-ecalc-and-things-like-that/102222
- https://discuss.ardupilot.org/t/what-battery-size-and-rating-would-be-recommended-for-a-large-hexa/105798
- https://discuss.ardupilot.org/t/typical-flight-time-and-tips-to-extend-it/69659
- https://discuss.ardupilot.org/t/how-to-choose-a-battery-for-a-copter/113719
- https://diydrones.com/forum/topics/motor-battery-prop-combination-selection
- https://intofpv.com/printthread.php?tid=16031 (FC/ESC cables don't plug together)
- https://intofpv.com/printthread.php?tid=8520 (C rating unreliable)
- https://forum.dronebotworkshop.com/electronic-components/choosing-the-right-drone-parts-for-diy-builds/ (connector melted on 6S)
- https://zbotic.in/drone-build-troubleshooting-common-first-build-mistakes/
- https://blog.uavmodel.com/fpv-lipo-battery-c-rating-explained-internal-resistance-voltage-sag-and-real-world-performance/
- https://www.rctalk.com/forum/threads/rotation-holder.38307/ (discontinued parts → similar models)
- https://uas-betrieb.bund.de/homepage/en/information/categorizing-drone-operations/c-classified-drones
- https://www.easa.europa.eu/en/document-library/general-publications/drones-class-0-basics-and-height-limit-120-m

## UI markup contract (B2 emits, B3 styles; both MUST use these names)
- Theme: `<html data-theme="light|dark">` set by app.js from localStorage `dronecalc:theme`, default from `prefers-color-scheme`. Toggle `<button type="button" class="theme-tog" aria-pressed="true|false">` in the header (index.html header, B2 owns index.html).
- Hover-throttle band: the KPI `<div class="kpi" data-band="good|warn|bad">` with a `<span class="why">` one-liner inside dd.
- Weight class badge: `<span class="wclass" data-lvl="ok|warn|bad">EU C1</span>` + `<small class="wclass-n">note</small>` in the results header next to `.verdict`.
- Battery honesty card: `<section class="sec s-bat"><h3><em>PWR</em>Battery and current</h3><dl class="bat">...<div><dt>..</dt><dd>..</dd></div>...</dl><p class="bat-flag" data-lvl="warn|bad">..</p></section>`.
- Compatibility list: `<section class="sec s-chk"><h3><em>CHK</em>Compatibility</h3><ul class="checks"><li class="chk" data-lvl="pass|warn|fail"><b>Pass|Check|Fail</b> text</li></ul></section>` placed under the BOM.
- Mass line: `<p class="mass" data-lvl="ok|warn">Your parts: X g + Y g wiring/hardware = Z g vs estimate W g</p>` in BOM; measured field `<div class="field mw">` (reuse .field/.inp markup) in BOM section.
- Cost line: `<p class="cost">Typical build cost ... vs your BOM ...</p>` in BOM.
- Checklist: `<details class="sec checklist"><summary>Build and first-flight checklist</summary><ol class="cl"><li>..</li></ol></details>`.
- Part card deltas: `<span class="delta" data-dir="up|down|same">+12 g · +$4</span>` inside `.meta` of non-best cards and option rows.
- Glossary: `<details class="gl"><summary aria-label="What is KV?">?</summary><p>..</p></details>` inline after a label/dt.
- Library: header button `<button type="button" class="lib-tog" aria-expanded aria-controls="lib">My builds</button>`; drawer `<aside class="lib" id="lib" hidden><h2>My builds</h2><ul class="lib-list"><li><a>name</a><small>date</small><button class="btn sm" data-lib="rename|delete|cmp">..</button></li></ul><div class="cmp"><table class="cmpt">..</table></div></aside>`; results action `<button class="btn sm" data-act="save">Save build</button>`.
