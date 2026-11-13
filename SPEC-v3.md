# Drone Calc v3 addendum (extends SPEC.md + SPEC-v2.md)

Adds: fixed-wing, VTOL tiltrotor, FPV size classes (5 / 7 / 10 inch), a better type system, and design updates across the site.
Rules from v2 stay: tests are plain node + node:assert, no deps, the server on :8000 is already running (do not start/stop it), machine memory is tight (at most ONE browser page, and close it at the end).

## Owners (v3)
| Files | Owner |
|---|---|
| js/engine.js, tests/engine.test.mjs | ENGINE |
| js/catalog.js, js/matcher.js, tests/catalog.test.mjs | CATALOG |
| js/ui/perf.js, js/ui/charts.js, css/perf.css, tests/perf.test.mjs, tests/perf-preview.html | PERF |
| index.html, css/main.css, js/app.js, js/ui/parts.js, js/ui/state.js, js/ui/pdf.js | SHELL |
Never edit another owner's files. Code against these contracts and fall back gracefully if a dependency has not landed. Re-check before finishing.

## 1. Configurations (ENGINE owns the list; export `CONFIGURATIONS` with {label, motors, note, family})
| id | label | family | notes |
|---|---|---|---|
| quad / hex / octo | as v1 | multirotor | unchanged |
| vtol | VTOL quadplane | vtol | v2 unchanged |
| tiltrotor | VTOL tiltrotor | vtol | NEW: 4 tilting motors (quad-tilt) give both hover and cruise thrust; no separate pusher; 4 tilt servos plus control surfaces; wing as in vtol |
| fixedwing | Fixed wing | wing | NEW: one tractor or pusher motor, conventional wing + tail; launch by hand, bungee or runway; no hover, no VTOL mass |

### 1.1 tiltrotor
- `result.vtol` is reused with `type:"tiltrotor"` and these changes:
  - `liftMotorCount` is 4 and `pusher` is null.
  - Add `tilt: { motorCount:4, servoCount:4, tiltTimeS, transitionAngleDeg }`.
  - The motors are sized for hover thrust AND cruise efficiency; document that cruise runs the tilted rotors at low throttle, with efficiency below a dedicated pusher.
  - Hover power is about as for a quadplane; cruise power is a bit worse than a quadplane's (rotor drag at 90 degrees, higher disk loading).
  - Wing and weight come from the same model as vtol, plus tilt mechanism mass.
- `requirements` for tiltrotor:
  - `frame` is null.
  - `vtol` is as v2.
  - `pusher` is null.
  - `motor` is the combined hover/cruise motor, with `count` 4.
  - New `tilt = { servoCount:4, minTorqueKgcm }`.

### 1.2 fixed wing
- `result.fixedWing` is `{ wingspanMm, wingAreaDm2, aspectRatio, wingLoadingGdm2, liftToDrag, stallMs, cruiseMs, launch:"hand"|"bungee"|"runway", motor:{statorMm,kv,thrustG,propInch}, rangeKm, endurance }`, and null for other configurations. `result.vtol` is null for fixedwing.
- Physics:
  - Cruise at the best-endurance speed, with L/D from aspect ratio, a parasite drag estimate, and propeller + motor + ESC efficiency (about 0.55-0.65 total).
  - Mass from payload + battery + airframe model (material-aware; foam is common here). The solver iterates battery mass to hit the target flight time, as for the other types.
  - Launch is chosen from AUW: hand under 2 kg; hand or bungee 2-5 kg; bungee or runway above 5 kg.
  - Endurance is 3-5x a quad of the same mass; document the calibration.
- `requirements` for fixedwing:
  - `frame` is null.
  - `wing = { minSpanMm, maxSpanMm, minAreaDm2, maxAuwKg }`.
  - `pusher` is the main propulsion motor (reuse the key).
  - `servo = { count }`, 4 (two ailerons, elevator, rudder), or 3 for a V-tail or flying wing.
  - `fc` has `needsGps` true.
- Warn for fixedwing with inspection missions that need hover, and with fpv/interceptor; the interceptor is allowed as a fast fixed wing.

### 1.3 FPV size classes
Input gains `fpvClass`: `"5" | "7" | "10"`, used only when `mission==="fpv"`; the default is `"5"`. A missing or invalid value falls back to `"5"`, with no error.
| class | role | cells | stator band | prop | default / max flight min |
|---|---|---|---|---|---|
| 5 | freestyle / racing | 6S | 2306-2207 | 5 in | 5 / 10 |
| 7 | long range / cruiser | 6S (4S Li-ion allowed) | 2806.5-2807 | 7 in | 12 / 25 |
| 10 | long range / heavy | 6S (4S Li-ion allowed) | 3110-3115 | 10 in | 15 / 35 |
- `MISSIONS.fpv` keeps its fields; add `FPV_CLASSES` = `{ "5":{label,propInch,defaultFlightMin,maxFlightMin,note,typicalAuwG}, "7":{...}, "10":{...} }`.
- Each class sets `propInch`, the cell cap, the motor band (via the class-to-stator table), `minTWR` (5 in about 7:1, 7 in about 4:1, 10 in about 3:1), `defaultFlightMin`/`maxFlightMin` and frame size. These override the single fpv values when fpv is chosen.
- `result.fpvClass` echoes the class (null for other missions). The configuration is forced to quad for fpv; if the user passes another, return a warning and use quad.

### 1.4 performance for the new types
- `result.performance` keeps the v2 shape. Fixed wing and tiltrotor must fill every series.
- Fixed wing:
  - The speed series runs from stall to 1.8x cruise.
  - The throttle series covers the cruise motor only.
  - `throttle[].thrustG` is static thrust.
- `profile[].phase` may now also be `"launch"`, `"climb"`, `"loiter"` and `"descent"`.
  - fixedwing: launch, climb, cruise, loiter, descent, reserve.
  - tiltrotor: takeoff, transition, cruise, transition, landing, reserve.
- `bestSpeed` is always present.
- The payload series for a wing has no TWR constraint; set `twr` to the thrust-to-weight of the cruise motor.

### 1.5 tests
- fixedwing mapping at 0.5 kg payload and 90 min: span 1.6-2.8 m, AUW 1.8-5 kg, endurance at least 2.5x the quad at the same pack.
- tiltrotor mapping at 0.5 kg payload and 60 min: meets the target; cruise is more efficient than the quad; endurance is less than the quadplane's at the same weight.
- Every fpv class meets its default flight time, with prop sizes 5, 7 and 10 and TWR above class minimum.
- All v1/v2 tests still pass.
- Add the matcher check: for every mission x (quad, vtol, tiltrotor, fixedwing) x fpvClass where relevant, the core slots return a non-empty list when the catalog stocks that class. Print unstocked classes instead of failing, and keep the floor from v2 or raise it.

## 2. CATALOG
- Airframes:
  - Add >=6 fixed-wing airframes/kits (category `fixedwing`, specs `{wingspanMm,wingAreaDm2,maxAuwKg,material,launch,tail}`), spanning 1.0-2.6 m (e.g. Skywalker X8, Skywalker 1900/2000, Volantex Ranger, Mini Talon, Believer, Eclipson / Foxtech wings; use only what you can verify).
  - Add >=3 tiltrotor-capable airframes or kits (category `vtol`, specs.type `"tiltrotor"`), e.g. kits or frames sold for tiltrotor VTOLs; if few exist, add tilt mechanism kits (category `tilt`: servos + brackets) and state that in your report.
  - Add a tilt-capable servo set (category `servo`, specs.tilt true).
- FPV 5/7/10:
  - Add at least 3 frames per class (category `frame`, specs.sizeMm, specs.fpvClass).
  - Add at least 2 motors per class for the engine's bands: 5 in 2306/2207; 7 in 2806.5/2807; 10 in 3110/3115.
  - Add the props: 5 in tri-blade, 7 in and 10 in.
  - Add batteries: 6S 1100-1600 mAh; 6S 3000-5000 mAh; 6S and 4S Li-ion 6000-10000 mAh for 7 in and 10 in.
  - Add 4-in-1 ESCs 35-65 A.
  - Add FCs and VTXs/cameras suited to each class (analog or digital).
  - Tag each class's items with `fpvClass` in specs or tags.
- Matcher:
  - Accept `requirements.fpvClass` (echoed from the engine via `result.fpvClass`; the UI passes it in) and `requirements.wing`, `requirements.tilt`, `requirements.pusher`.
  - For fixedwing and tiltrotor, `frame` is empty and not counted as missing.
  - Output keys: add `fixedwing` (airframe options) and `tilt` as arrays that are always present.
  - Prefer exact fpvClass matches for frame, prop and motor.
  - `qty` rules: tilt servos = servoCount; fixed-wing servos = servo.count; fixed-wing motor 1; tiltrotor motors 4.
  - Keep the region rules and `listOptions` covering every category.
- Real URLs only (WebSearch/WebFetch); flag estimates; keep RATES_NOTE.
- Tests: schema; regions; the matcher check from 1.5; the new classes stay stocked.

## 3. PERF
- Update `renderPerformance`, `bindPerformance` and `perfTables` for the new data. All six figures work for fixedwing and tiltrotor.
- Profile phases: draw `launch`, `climb`, `loiter` and `descent` with their own marks and legend entries.
- Key-figures strip:
  - fixed wing: span, wing loading, L/D, stall, cruise, launch method, endurance and range, with a to-scale planform.
  - tiltrotor: the vtol strip plus tilt servo count, tilt time and transition angle. Draw the planform with four rotors and the tilt angle.
  - vtol: unchanged.
- The speed polar for a fixed wing has no hover marker; show the stall boundary.
- FPV: if `result.fpvClass`, put the class label ("5 in freestyle") in the figure captions where mission is named.
- `perfTables` may add a "Wing / tilt" table.
- Tests: add fake fixedwing and tiltrotor fixtures and check there is no NaN/undefined and the tables match the data length. Check visually with headless Chrome via file:// only (see v2 rules), at 375, 1366 and 2560, and Read the PNGs.

## 4. SHELL
- Configuration picker (Details step):
  - Group the cards by family: Multirotor (quad/hex/octo), VTOL (quadplane, tiltrotor) and Fixed wing.
  - Each card has a one-line explainer and a small, accurate inline SVG schematic (top view); the tiltrotor shows the tilt axis and the fixed wing a tail.
  - Mark clearly which families fit which missions, and show the engine's warnings inline when a mismatch is chosen (e.g. inspection needs hover). Never block.
  - fpv forces quad; hide the picker for fpv and show the size selector instead.
- FPV size selector (Details step, only when mission is fpv): three large option cards, "5 in - freestyle / racing", "7 in - long range", "10 in - long range heavy", each with typical weight, flight time and a one-line use note, taken from FPV_CLASSES. Changing the class resets the flight time to that class's default. The selection goes in the hash (`fc=5|7|10`).
- Data flow:
  - Pass `fpvClass` to `estimate()` and to `recommend()` requirements.
  - Wire the new result fields (`result.fixedWing`, `result.vtol.type`, `result.vtol.tilt`) into the readout, KPIs and PDF specs.
  - Parts category order: frame, airframe (vtol / fixedwing / tilt), motor, pusher, esc, fc, battery, prop, servo, camera, extras.
  - Show the right section headings ("Fixed-wing airframe", "Tilt mechanism and servos").
  - The PDF header, specs table and the options PDF include the new categories.
- Typography: replace the current font trio with a better set, chosen for this site (technical, legible at small sizes, distinct, not generic).
  - Before picking, invoke Skill `impeccable:impeccable` and `ui-ux-pro-max:ui-ux-pro-max` and follow their type guidance; load fonts from Google Fonts with `display=swap` plus metric-compatible system fallbacks, and preload only what is needed.
  - Keep the flight-manual identity: condensed or grotesque display for headings, a body face with strong numerals, and a mono with tabular figures for data.
  - Define the type scale as custom properties (display, h1-h3, body, caption, data) in css/main.css; use `font-variant-numeric: tabular-nums` on numeric UI; check long headings at 375 for wrap and overflow.
  - Document the choice in a 3-line comment at the top of css/main.css.
  - The PDF keeps Helvetica (built in); no change needed there.
- Design update: use the new types across the site consistently (wizard, readout dock, KPIs, cards, BOM, performance via the shared custom properties).
  - Only edit perf.css/charts.js tokens through the shared custom properties; ask PERF (via your report) for anything else.
  - Keep: no side-stripe borders, gradients or glassmorphism.
- Verify in the browser at 375, 1366 and 2560 (ONE page, hard-reload, close it at the end):
  - FPV 5/7/10 each end to end.
  - fixed wing, tiltrotor and quadplane results.
  - Details step at 375.
  - PDF export (check the bytes and /Count via evaluate_script).
  - Fonts load (no FOIT/FOUT layout jumps), no horizontal scroll, and a clean console.

## Done
- All four test files pass (`node tests/engine.test.mjs`, `catalog`, `pdf`, `perf`).
- In the browser at 375, 1366 and 2560: no console errors, no horizontal scroll, and the new options work end to end.
