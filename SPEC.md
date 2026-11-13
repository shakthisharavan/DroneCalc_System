# Drone Calc — shared contract (all agents obey this)

Static site, no build step, no npm deps. ES modules. Served by `python -m http.server 8000` from this folder.
Root: C:\Users\shakt\drone-calc

## Files and owners
| File | Owner |
|---|---|
| js/engine.js, tests/engine.test.mjs | ENGINE agent |
| js/catalog.js, js/matcher.js, tests/catalog.test.mjs | CATALOG agent |
| index.html, css/*.css, js/app.js, js/ui/*.js | UI agent |
Never edit another owner's file. Report needed changes instead.

## Product flow (wizard, in this order)
1. Mission: `delivery` | `inspection` | `agriculture` | `interceptor` | `mapping` | `fpv`
2. Flight time target (minutes) — second question, always.
3. Details: payloadKg, frameMaterial (`carbon`|`glass`|`aluminum`|`plastic`), configuration (`quad`|`hex`|`octo`), environment {altitudeM, tempC, windMs}, budgetUsd (optional)
4. Results: numbers + recommended parts per category with buy links.

## engine.js — exports
```js
export const MISSIONS;            // { id: { label, defaultPayloadKg, minTWR, cruiseMs, reserve, note } }
export const MATERIALS;           // { id: { label, densityGcc, stiffness (1-10), costRel } }
export function estimate(input);  // pure function
```
input: `{ mission, targetFlightMin, payloadKg, frameMaterial, configuration, environment:{altitudeM,tempC,windMs}, budgetUsd? }`
output (all numbers finite, SI unless named):
```js
{ ok: true,
  auwKg, dryWeightKg, weights:{frameG,motorsG,escG,fcG,batteryG,propsG,payloadG,otherG},
  frameSizeMm, propInch, motorCount, motorKv, motorStatorMm: "2306" style string,
  thrustPerMotorG, maxThrustG, twr, hoverThrottlePct,
  batteryCells, batteryMah, batteryWh, batteryCRating,
  escContinuousA, escBurstA, hoverPowerW, avgPowerW, peakCurrentA,
  estFlightMin, rangeKm, cruiseMs,
  warnings: [ "text" ], // e.g. target unreachable, TWR low, over budget
  meetsTarget: bool,
  requirements: { frame:{...}, motor:{...}, esc:{...}, battery:{...}, prop:{...}, fc:{...} } // what matcher consumes, see below
}
```
Invalid input → `{ ok:false, errors:[...] }`, never throw.
Physics: momentum-theory hover power, figure of merit ~0.6-0.7, air density from altitude+temp, motor+ESC efficiency, usable battery 80%, Li-ion vs LiPo chosen by mission (long endurance → Li-ion), iterate battery mass until target flight time converges (cap iterations, report best effort). Document every constant in a comment.

`requirements` shape (engine produces, matcher consumes):
```js
{ frame:{ minSizeMm, maxSizeMm, material, configuration },
  motor:{ statorMm:"2306", kvMin, kvMax, minThrustG, count },
  esc:{ minContinuousA, minCells, maxCells, protocol:"DShot600" },
  battery:{ cells, minMah, maxMah, minC, chemistry:"lipo"|"liion" },
  prop:{ inch },
  fc:{ minMotorOutputs, needsGps:bool } }
```

## catalog.js / matcher.js — exports
```js
// catalog.js
export const CATALOG; // array of items:
// { id, category:"frame"|"motor"|"esc"|"fc"|"battery"|"prop"|"camera"|"vtx"|"gps"|"radio"|"payload",
//   name, brand, priceUsd, weightG, specs:{...}, tags:[mission ids],
//   links:[{ store:"GetFPV", url:"https://..." }] }
// matcher.js
export function recommend(requirements, mission, budgetUsd) // → { frame:[Item x3 ranked], motor:[...], esc:[...], fc:[...], battery:[...], prop:[...], extras:[...] , totalUsd:{low,high}, notes:[] }
```
Spec keys per category the matcher reads — motor: statorMm, kv, maxThrustG, maxCurrentA, weightG; esc: continuousA, burstA, maxCells, protocol; battery: cells, mah, cRating, chemistry; frame: sizeMm, material, configuration; prop: inch; fc: motorOutputs, hasGps, mcu, firmware.
Links: only real, working URLs. Use WebSearch/WebFetch to find real product pages (GetFPV, RaceDayQuads, T-Motor store, iFlight, Holybro, Amazon). If a product page can't be verified, use that store's search URL for the product name (clearly valid, never invented product paths). At least 40 items, ≥2 links each where possible, ≥5 items per core category, all 6 missions covered by tags. Note in catalog.js header: prices/links checked on 2026-11-06, may drift.

## UI
Own the look. NOT generic AI-slop: no purple-blue gradients, no glassmorphism cards grid, no Inter-on-white, no emoji icons. Distinct point of view (e.g. aerospace flight-manual / instrument-panel / blueprint feel with strong type and real data viz). Use skills: impeccable:impeccable, ui-ux-pro-max:ui-ux-pro-max, taste-skill:design-taste-frontend. References to study for structure only: eCalc, DroneBuild, LumiPad, Flyi.io calculators.
Must have: keyboard-accessible wizard, live preview of key numbers while answering, responsive (mobile+desktop), charts in inline SVG (power vs thrust, weight breakdown, flight time vs battery size), parts list grouped by category with price and buy-link buttons (target=_blank rel="noopener"), copy/print parts list, URL-hash state so refresh/back keeps answers. Imports only `./engine.js`, `./matcher.js`, `./catalog.js`.
Until engine/catalog land, UI agent may stub locally in js/ui/mock.js (delete before finish).

## Done = 
No console errors, `node tests/*.test.mjs` pass, wizard works start to finish on 375px and 1440px.
