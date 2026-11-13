# Drone Calc v2 addendum (extends SPEC.md; v1 rules apply unless changed here)

## Owners (v2)
| Files | Owner |
|---|---|
| js/engine.js, tests/engine.test.mjs | ENGINE |
| js/catalog.js, js/matcher.js, tests/catalog.test.mjs | CATALOG |
| js/ui/pdf.js, tests/pdf.test.mjs, tests/out/* | PDF |
| js/ui/perf.js, js/ui/charts.js, css/perf.css, tests/perf.test.mjs, tests/perf-preview.html | PERF |
| index.html, css/main.css, js/app.js, js/ui/parts.js, any other new js/ui/*.js | SHELL |

Never edit another owner's files. Others are writing their parts in parallel: code against these contracts, fall back gracefully when a dependency is not there yet, and re-check before finishing. Tests are plain node + node:assert, no deps, no package installs. Do not start or stop the server; it already runs on :8000.

## 0. Title
"DroneCalc", tagline "Drone calculator and bill of materials" (renamed 2026-11-07): use it in `<title>`, the masthead, the meta description and the PDF header.

## 1. ENGINE
1.1 `configuration` adds `"vtol"` (quadplane: 4 lift motors, 1 pusher, fixed wing). MATERIALS adds `foam` (EPO/EPP, mainly for VTOL and fixed wing). Warn when vtol is used with fpv or interceptor.
1.2 `result.vtol` = `{ wingspanMm, wingAreaDm2, aspectRatio, wingLoadingGdm2, liftToDrag, stallMs, cruiseMs, liftMotorCount:4, pusher:{statorMm,kv,thrustG,propInch}, hoverS, transitionS, cruiseMin, rangeKm, servoCount }`. For other configurations `result.vtol = null`. `estFlightMin` is the total, including the hover phases. The default profile is 2 x 45 s hover plus 2 x 15 s transition; document it.
1.3 `requirements` additions:
- For vtol: `frame = null`, plus `vtol = { minSpanMm, maxSpanMm, minAreaDm2, maxAuwKg, servoCount }` and `pusher = { statorMm, kvMin, kvMax, minThrustG, propInch }`. For other configurations both are null.
- All configurations: `camera = { kind: "thermal"|"zoom"|"gimbal4k"|"survey"|"fpv"|"action"|null, maxWeightG }`, chosen by mission:
  - inspection: thermal, zoom or gimbal4k
  - mapping: survey
  - fpv and interceptor: fpv
  - delivery and agriculture: fpv or null
1.4 `result.performance`, for every configuration:
```
{ speed:   [{ms,powerW,currentA,flightMin,rangeKm}],   // >=12 pts; multirotor 0..1.6x cruise; vtol stall..1.6x cruise
  payload: [{kg,flightMin,twr}],                        // >=10 pts, 0..max(1.5x payload,0.5 kg), battery FIXED = chosen pack
  battery: [{wh,flightMin,auwKg}],                      // >=10 pts, 0.5x..2x chosen pack
  throttle:[{pct,thrustG,powerW,currentA,gPerW}],       // >=10 pts, 10..100 %
  profile: [{phase:"takeoff"|"transition"|"cruise"|"hover"|"landing"|"reserve", startS, durationS, powerW}],
  bestSpeed:{ enduranceMs, rangeMs } }
```
All values must be finite. flightMin falls as payload rises. flightMin rises with battery and then flattens. Best-range speed is above best-endurance speed.
1.5 Calibrate pack mass to real packs:
- LiPo: about 125-150 Wh/kg at pack level, lower for small FPV packs. Round 1 estimated 145 g for 25 Wh; a real 6S 1300 mAh pack weighs 230 g.
- Li-ion: about 190-240 Wh/kg.
- Document both.
1.6 Tests:
- VTOL sanity: mapping vtol, 0.5 kg payload, 60 min gives a span of 1.4-2.6 m and an AUW of 2.5-8 kg, and meets the target.
- VTOL endurance is at least 2x the quad's at the same payload and pack.
- Performance arrays have the right shape and monotonicity.
- All v1 tests still pass.

## 2. CATALOG
2.1 catalog.js exports:
- `CURRENCIES` `{code:{name,symbol,perUsd,decimals}}`: at least 15 codes (USD EUR GBP INR CAD AUD AED SGD JPY CNY CHF ZAR BRL SAR NZD KRW MYR …). perUsd is approximate; look it up with WebSearch.
- `RATES_NOTE`: "Approximate exchange rates as of <date>. Prices are converted from USD list prices; local prices differ (duties, shipping). Verify at checkout."
- `REGIONS` `{code:{name,currency,stores:[{store,searchUrl}]}}` for US CA GB EU IN AU AE SG JP GLOBAL. Each searchUrl contains `{q}`, and every template pattern must be confirmed real with WebSearch/WebFetch. At least 2 stores per region. GLOBAL means international shippers.
- `regionForCurrency(code)` returns a region code, with GLOBAL as fallback.
- `toUsd(amount,cur)`, `fromUsd(usd,cur)`.
- `formatMoney(usd,cur,{iso=false}={})` uses Intl.NumberFormat. With `iso:true` it returns ASCII only, e.g. "INR 12,340.00" or "JPY 12,340". It never returns NaN, and an unknown currency falls back to USD.
- `localLinks(item,region)` returns `[{store,url,kind:"product"|"search",region,local:bool}]` in this order, deduped:
  1. the item's own product links for that region
  2. search links generated from that region's stores, using `encodeURIComponent(brand+" "+name)`
  3. GLOBAL links
- Item links gain `region` (default "GLOBAL"). Add researched local product listings: real URLs you saw, never invented paths. Aim for at least 10 per region for US, IN, GB and EU, and at least 4 for the others. Each item gets a derived `regions` list of the codes where it has a local listing.

2.2 New items:
- Cameras, at least 8: thermal, zoom gimbal, 4K gimbal, survey and FPV cams. Category `camera`, specs `{kind,weightG,resolution}`, tagged by mission.
- VTOL, at least 6:
  - airframes: category `vtol`, specs `{wingspanMm,wingAreaDm2,maxAuwKg,material}`
  - pusher-capable motors: category `motor`, tag `pusher`
  - servos: category `servo`
  - airspeed sensor: category `sensor`
- 12S/14S batteries and HV ESCs, if real ones exist. Round 1 had none, so big ag builds showed "none found".

2.3 matcher: `recommend(requirements, mission, budgetUsd, catalog=CATALOG, region="US")`
- These output keys are always arrays: frame, motor, esc, fc, battery, prop, camera, vtol, pusher, servo, extras.
- Each returned item is a copy that adds:
  - `qty`:
    - motor and prop: the motor count
    - 4-in-1 ESC: ceil(count/4); single ESC: count
    - pusher: 1
    - servo: servoCount
    - everything else: 1
  - `lineUsd` = qty x priceUsd
  - `links` = localLinks(item, region)
  - `localListing` (bool)
- Region rule, per category:
  - If local fits exist, return only those.
  - Otherwise return all fits, push the category to `out.regionFallback`, and add the note "No local listing found in <region name>; showing parts that ship internationally."
- Match motors by stator volume (d² x h) within ±30%, not by exact string; 2207 counts as 2306.
- vtol builds: `frame=[]` and frame is not counted as missing. vtol, pusher and servo come from requirements.
- Camera always comes from requirements.camera. For inspection and mapping it is a core category, so it counts in missing/incomplete. For other missions it is optional.
- `totalUsd {low,high}` is summed from lineUsd. Keep incomplete, missing, closest and notes.
- `export function listOptions(region, mission, catalog=CATALOG)` returns `{[category]: item[]}` for every category in the catalog (camera, vtol, servo and sensor included). Order mission-tagged items first, then locally listed ones. Each item gets `links=localLinks(...)`.

2.4 Tests:
- currency round-trip; formatMoney never returns NaN, and its iso output is ASCII
- every searchUrl is https and contains {q}
- localLinks returns links in the specified order
- recommend for every mission x (quad, vtol) x (US, IN, GLOBAL)
- qty and lineUsd values
- inspection builds include a camera
- listOptions covers all categories
- stator tolerance works

## 3. PDF: `js/ui/pdf.js` (pure; no DOM access at import)
`export function buildBomPdf(doc) -> Uint8Array`, and `export function downloadPdf(bytes, filename)`, which is browser-only.
```
doc = { title, subtitle, dateISO, meta:[[k,v]], specs:[[k,v]],
  bom: null | { rows:[{n,category,part,brand,qty,unit,line,note,links:[{label,url}]}], total, budget?, budgetNote? },
  options: null | [{ category, items:[{part,brand,price,links:[{label,url}]}] }],
  tables: [{title, columns:[str], rows:[[str]]}], notes:[str] }
```
All values are display strings; money is pre-formatted in iso style.
- Hand-write PDF 1.4 with Helvetica and Helvetica-Bold (Courier for figures is optional) and /WinAnsiEncoding.
- Build the file as a byte string of char codes 0-255, then convert to Uint8Array. Do not use TextEncoder.
- xref byte offsets must be exact. Escape `\ ( )`.
- Sanitize characters outside WinAnsi: ≥ becomes ">=", ↗ is dropped, → becomes "->", ₹ and other currency signs become ISO codes, anything else unknown becomes "?".
- Layout:
  - A4 portrait with a header band: title, date, and "Page x of y".
  - Tables repeat the header row on each page and use zebra rows.
  - Text wraps using real Helvetica AFM widths, and numbers are right-aligned.
  - Clickable /Link /URI annotations on the link labels.
  - A BOM total box and a notes block.
- The design matches the site: ink, cream and rust.

tests/pdf.test.mjs builds (a) a BOM doc with 30 rows, which must reach at least 2 pages, and (b) an options doc. It asserts:
- the file starts with %PDF-1.4 and ends with %%EOF
- startxref equals the real offset of "xref"
- every xref offset points at "<n> 0 obj"
- the page count matches /Count
- the number of link annotations equals the number of links
- every byte is ≤255
- an input containing ₹ does not crash
Write the samples to tests/out/. If `python -c "import fitz"` or `import pypdf` works, also open them, extract the text, and render a page to PNG to look at.

## 4. PERF: `js/ui/perf.js` (+ charts.js, css/perf.css)
Exports:
- `renderPerformance(result, ctx) -> HTML string`, where `ctx = {missionLabel}`
- `bindPerformance(rootEl)`: idempotent. Handles tooltips, crosshair, arrow keys on a focused chart, table toggles and Copy CSV.
- `perfTables(result) -> [{title,columns,rows}]`: display strings with units, for the PDF.

The "Performance" section has these inline-SVG figures:
1. Speed curve: power and flight time/range against speed, with markers for best endurance, best range and cruise.
2. Payload against flight time, with a current-payload marker. Shade the zone where TWR is below the mission's minTWR.
3. Battery Wh against flight time, with the chosen-pack marker and a diminishing-returns note.
4. Throttle against thrust and g/W, with the hover-throttle marker.
5. Mission profile: power against time as a phase strip (VTOL: takeoff hover, transition, cruise, landing).
6. Weight breakdown as a horizontal stacked bar, not a pie.

For VTOL, add a key-figures strip: span, wing loading, L/D, stall, cruise, and hover vs cruise time.

Every figure has:
- a fig number and caption, units, round ticks and a legend
- the build point annotated
- a tooltip with exact values on hover or focus
- a table toggle and Copy CSV
- role="img" with an aria-label summary

If a series is missing, skip that chart with a small note and never crash.
- Use the custom properties from main.css; read it for the tokens.
- Showcase quality, but readable.
- Columns: 1 at 375px, 2 at 1366px, 3 at 2560px.

Visual checks: take headless Chrome CLI screenshots of tests/perf-preview.html, served at http://localhost:8000/tests/perf-preview.html, and Read the PNGs. SHELL owns the DevTools MCP browser.

tests/perf.test.mjs uses a fake quad result and a fake vtol result. It checks:
- no NaN, undefined, Infinity or null in the output text
- table rows match the data lengths
- perfTables has the right shape

## 5. SHELL
- Rename the title and link css/perf.css.
- Details step:
  - Currency select listing all CURRENCIES ("INR - Indian rupee"), with the budget entered in that currency and converted with toUsd before calling the engine or matcher.
  - Country select from REGIONS, defaulting to regionForCurrency; the user can override it.
  - Configuration choices from the engine, VTOL included, each with a one-line explainer and a tiny inline SVG schematic.
  - Materials from MATERIALS, foam included.
- Hash state gains cur, reg and sel (the selected id per category). An out-of-range t in the hash shows a field error instead of being clamped silently.
- Results page:
  - KPIs.
  - Performance: renderPerformance plus bindPerformance, replacing the old charts call.
  - Parts from `recommend(req, mission, budgetUsd, undefined, region)`.
- Category order: frame or vtol, motor, pusher, esc, fc, battery, prop, servo, camera, extras, then any other category.
- Each part card shows:
  - its rank A/B/C
  - unit price and line price (qty) via formatMoney
  - a badge: "Listed in <country>" or "Search in <country>"
  - its links
  - a Select toggle: one per category, can be deselected, keyboard accessible, uses aria-pressed
- Each category has an "All N options in <country>" expander built from listOptions, also with Select toggles.
- BOM, on screen under the parts list:
  - columns: category, part, qty, unit, line, links
  - TOTAL, and a budget comparison
  - a Clear button
  - Desktop shows a sticky compact summary. Mobile shows a drawer that does not clash with the readout bar.
- Export PDF button: calls buildBomPdf.
  - Uses bom when anything is selected; otherwise options from listOptions, covering ALL categories with camera included.
  - specs = the key engine numbers, tables = perfTables(result), notes = [RATES_NOTE, availability disclaimer].
  - Money via formatMoney(usd, cur, {iso:true}).
  - Filename: `drone-bom-<mission>-<yyyy-mm-dd>.pdf`, saved with downloadPdf.
- Design: enhance the flight-manual identity (hierarchy, rhythm, refined controls) without restyling it. No side-stripe borders, gradients or glassmorphism.
  - At 375px, no horizontal scroll.
  - At 1366px and 2560px, max content width is about 1800px, and results lay out in 2-3 columns (performance | parts | BOM) with no huge empty gutters.

## Done
- node tests/engine.test.mjs, catalog.test.mjs, pdf.test.mjs and perf.test.mjs all pass.
- In the browser: no console errors, and the full flow (select parts, export PDF) works at 375, 1366 and 2560.
