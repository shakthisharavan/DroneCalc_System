// v5 battery model: voltage sag, cold derate, age fade (F1, F5), hover calibration (F2), hash codec bounds and old-link compatibility.
import assert from "node:assert/strict";
import * as E from "../js/engine.js";
import * as C from "../js/catalog.js";
import * as M from "../js/matcher.js";
import * as PERF from "../js/ui/perf.js";
import * as CHK from "../js/checks.js";
import { createState, ageOf, haOf, AGE, HA } from "../js/ui/state.js";
import { estimate, batteryFactors, packOhm, loadedCellV, BATTERY_LIMITS } from "../js/engine.js";

const X = createState({ E, C, M, PERF, CHK });
const env = (tempC) => ({ altitudeM: 0, tempC, windMs: 0 });
const base = { mission: "mapping", targetFlightMin: 30, frameMaterial: "carbon", configuration: "quad", environment: env(20) };
const run = (o) => { const r = estimate({ ...base, ...o }); assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("batteryFactors: 1 and 1 at >= 15 C and 0% fade, documented curve below", () => {
  for (const c of [15, 20, 50]) assert.deepEqual(batteryFactors(c, 0), { cap: 1, res: 1 }, `${c} C`);
  near(batteryFactors(0).cap, 0.85, 1e-12, "0 C capacity"); near(batteryFactors(0).res, 1.6, 1e-12, "0 C resistance");
  near(batteryFactors(-10).cap, 0.75, 1e-12, "-10 C capacity"); near(batteryFactors(-10).res, 2.0, 1e-12, "-10 C resistance");
  near(batteryFactors(20, 20).cap, 0.8, 1e-12, "20% fade capacity"); near(batteryFactors(20, 20).res, 1.5, 1e-12, "20% fade resistance");
  near(batteryFactors(20, 40).res, 2.0, 1e-12, "40% fade resistance");
  near(batteryFactors(0, 20).cap, 0.85 * 0.8, 1e-12, "cold and age multiply");
});

t("batteryFactors: monotonic in temperature and in age", () => {
  let prev = batteryFactors(50);
  for (let c = 49; c >= -30; c--) { const f = batteryFactors(c); assert.ok(f.cap <= prev.cap && f.res >= prev.res, `temp ${c}`); prev = f; }
  prev = batteryFactors(20, 0);
  for (let a = 1; a <= 40; a++) { const f = batteryFactors(20, a); assert.ok(f.cap < prev.cap && f.res > prev.res, `age ${a}`); prev = f; }
  assert.ok(batteryFactors(-30, 40).cap > 0, "capacity stays positive at the limits");
});

t("sag formula: V_cell = V_nominal - I x R_pack / S, R_pack = S x rAh / Ah x factor", () => {
  near(packOhm("lipo", 6, 5), 6 * 0.008 / 5, 1e-12, "6S 5 Ah LiPo");
  near(packOhm("liion", 4, 8.4, 2), 4 * 0.05 * 2 / 8.4, 1e-12, "4S 8.4 Ah Li-ion at x2");
  near(loadedCellV("lipo", 6, 5, 1, 50), 3.7 - (50 * 0.0096) / 6, 1e-12, "50 A on 6S 5 Ah");
  near(loadedCellV("liion", 4, 8.4, 1, 0), 3.6, 1e-12, "no load = nominal");
  assert.ok(loadedCellV("lipo", 6, 5, 2, 50) < loadedCellV("lipo", 6, 5, 1, 50), "more resistance, more sag");
  assert.ok(loadedCellV("lipo", 6, 10, 1, 50) > loadedCellV("lipo", 6, 5, 1, 50), "more Ah (parallel), less sag");
});

t("no new inputs: results identical to explicit zero / empty battery inputs", () => {
  for (const [mission, configuration, targetFlightMin] of [["mapping", "quad", 30], ["fpv", "quad", 5], ["mapping", "vtol", 60], ["mapping", "fixedwing", 90]]) {
    const a = run({ mission, configuration, targetFlightMin });
    for (const battery of [{}, { ageFadePct: 0 }, { ageFadePct: "", measuredHoverA: null }, { measuredHoverA: undefined }]) assert.deepEqual(estimate({ ...base, mission, configuration, targetFlightMin, battery }), a, `${mission}/${configuration}`);
    assert.equal(a.battery.capacityFactor, 1); assert.equal(a.battery.resistanceFactor, 1); assert.equal(a.battery.calibration, null);
  }
});

t("result.battery: sag figures follow the formula from the result's own numbers", () => {
  const r = run({}), b = r.battery, vc = r.batteryChemistry === "liion" ? 3.6 : 3.7;
  assert.equal(b.estimate, true);
  near(b.hoverCellV, vc - (b.hoverA * (b.packMOhm / 1000)) / b.cells, 0.02, "hover cell V");
  near(b.maxCellV, vc - (b.maxA * (b.packMOhm / 1000)) / b.cells, 0.02, "full-throttle cell V");
  near(b.hoverA, r.hoverPowerW / (b.cells * vc), 0.2, "hover current = power / nominal volts");
  assert.ok(b.maxCellV < b.hoverCellV && b.hoverCellV < vc, "more current, more sag");
  assert.equal(b.floorV, r.batteryChemistry === "liion" ? 3 : 3.3);
});

t("cold derate: bigger pack, monotonic in temperature, no effect at >= 15 C", () => {
  const wh = (tempC) => run({ environment: env(tempC) }).batteryWh;
  const c15 = run({ environment: env(15) }), c40 = run({ environment: env(40) });
  assert.equal(c15.battery.capacityFactor, 1); assert.equal(c40.battery.capacityFactor, 1);
  let prev = wh(15);
  for (const c of [10, 5, 0, -10, -20, -30]) { const w = wh(c); assert.ok(w > prev, `${c} C: ${w} > ${prev}`); prev = w; }
  const cold = run({ environment: env(-10) });
  assert.equal(cold.battery.capacityFactor, 0.75); assert.equal(cold.battery.resistanceFactor, 2);
  assert.ok(cold.meetsTarget && cold.estFlightMin >= 30 * 0.99, "the pack is re-sized to still meet the target");
});

t("age fade: bigger pack, higher C, monotonic; hash-less default is a new pack", () => {
  const rs = [0, 10, 20, 30, 40].map((ageFadePct) => run({ battery: { ageFadePct } }));
  for (let i = 1; i < rs.length; i++) {
    assert.ok(rs[i].batteryWh > rs[i - 1].batteryWh, `Wh at ${i * 10}%`);
    assert.ok(rs[i].battery.resistanceFactor > rs[i - 1].battery.resistanceFactor && rs[i].battery.capacityFactor < rs[i - 1].battery.capacityFactor);
    assert.ok(rs[i].batteryCRating >= rs[i - 1].batteryCRating, `C rating at ${i * 10}%`);
  }
  const fpv = [0, 30].map((ageFadePct) => run({ mission: "fpv", targetFlightMin: 5, battery: { ageFadePct } }));
  assert.ok(fpv[1].batteryCRating > fpv[0].batteryCRating, "LiPo label C rises with the resistance");
  near(rs[3].battery.effectiveAh, rs[3].battery.nominalAh * 0.7, 0.002, "30% fade leaves 70% of the capacity");
});

t("age and cold shorten a flight the pack cannot be re-sized for (battery capped at 60% of AUW)", () => {
  const fl = (o) => run({ mission: "fpv", targetFlightMin: 12, ...o }).estFlightMin;
  const ages = [0, 10, 20, 30, 40].map((ageFadePct) => fl({ battery: { ageFadePct } })), colds = [15, 5, -5, -15, -30].map((c) => fl({ environment: env(c) }));
  for (const L of [ages, colds]) for (let i = 1; i < L.length; i++) assert.ok(L[i] < L[i - 1], L.join(" > "));
});

t("sag warnings: derate pushes full-throttle sag under the floor; a new warm pack never adds one to the results", () => {
  const w = (r) => r.warnings.filter((x) => /sag/i.test(x));
  const warm = run({ configuration: "vtol", targetFlightMin: 60 }), cold = run({ configuration: "vtol", targetFlightMin: 60, environment: env(-10) });
  assert.equal(w(warm).length, 0);
  assert.ok(warm.battery.maxCellV >= warm.battery.floorV);
  assert.ok(cold.battery.maxCellV < cold.battery.floorV && w(cold).some((x) => /^Full-throttle sag: [\d.]+ V per cell, below the 3 V floor/.test(x)), cold.warnings.join("|"));
  // FPV already sags under 3.3 V/cell at full throttle with a new pack: shown on the battery card only, the old warnings list is unchanged
  const fpv = run({ mission: "fpv", targetFlightMin: 5 });
  assert.ok(fpv.battery.maxCellV < fpv.battery.floorV && fpv.battery.warnings.some((x) => /^Full-throttle sag/.test(x)) && w(fpv).length === 0);
});

t("hover calibration: factor, scaled hover power and current, flight time and the pack unchanged", () => {
  for (const [configuration, mission, tgt] of [["quad", "mapping", 30], ["hex", "delivery", 20], ["vtol", "mapping", 60], ["tiltrotor", "mapping", 40], ["fixedwing", "mapping", 90]]) {
    const o = { configuration, mission, targetFlightMin: tgt }, u = run(o), pred = u.battery.hoverA;
    const c = run({ ...o, battery: { measuredHoverA: pred * 1.5 } }), k = c.battery.calibration;
    near(k.predictedA, pred, 0.1, `${configuration} predicted`); near(k.factor, k.measuredA / k.predictedA, 0.001, `${configuration} factor = measured / predicted`); near(k.factor, 1.5, 0.04, `${configuration} factor`); assert.equal(k.measuredA, pred * 1.5);
    assert.equal(k.kind, configuration === "fixedwing" ? "cruise" : "hover");
    near(c.battery.hoverA, pred * 1.5, 0.1, `${configuration} hover current matches the measurement`);
    near(c.hoverPowerW / u.hoverPowerW, k.factor, 0.01, `${configuration} hover power x factor`);
    // multirotor: all power scales, so flight time ~ 1 / factor; VTOL and wing keep fixed-duration phases (hover, launch, climb) whose energy scales too
    if (configuration === "quad" || configuration === "hex") near(c.estFlightMin * k.factor, u.estFlightMin, u.estFlightMin * 0.01 + 0.15, `${configuration} flight time / factor`);
    else assert.ok(c.estFlightMin > 1 && c.estFlightMin < u.estFlightMin * 0.85, `${configuration}: ${c.estFlightMin} vs ${u.estFlightMin}`);
    assert.equal(k.uncalibratedFlightMin, u.estFlightMin);
    assert.equal(c.batteryWh, u.batteryWh, `${configuration} pack as sized`); assert.equal(c.auwKg, u.auwKg);
    assert.equal(c.meetsTarget, false); assert.ok(c.warnings.some((x) => /^At the measured hover current/.test(x)), configuration);
  }
  const lo = run({ battery: { measuredHoverA: run({}).battery.hoverA * 0.8 } });
  assert.ok(lo.estFlightMin > 30 && lo.meetsTarget && lo.battery.calibration.factor < 1, "a lower reading lengthens the flight");
  assert.ok(run({ battery: { measuredHoverA: 100 } }).warnings.some((x) => /Measured hover current is .*x the predicted/.test(x)), "implausible factor warns");
});

t("calibrated sweeps follow the factor: speed polar and mission profile powers", () => {
  const u = run({}), c = run({ battery: { measuredHoverA: u.battery.hoverA * 2 } }), f = c.battery.calibration.factor;
  near(c.performance.speed[0].powerW / u.performance.speed[0].powerW, f, 0.01 * f, "speed polar power x factor");
  near(c.performance.speed[3].currentA / u.performance.speed[3].currentA, f, 0.01 * f, "speed polar current x factor");
  near(c.performance.profile[1].powerW / u.performance.profile[1].powerW, f, 0.05 * f, "cruise phase power x factor");
  near(c.performance.profile[0].powerW / u.performance.profile[0].powerW, f, 0.01 * f, "take-off power x factor");
});

t("engine validation: bounds and junk values for the battery inputs", () => {
  assert.deepEqual(BATTERY_LIMITS, { ageFadePct: [0, 40], measuredHoverA: [0.1, 500] });
  for (const ageFadePct of [-1, 40.01, 41, NaN, Infinity, "10", {}, [], true]) assert.equal(estimate({ ...base, battery: { ageFadePct } }).ok, false, `age ${String(ageFadePct)}`);
  for (const measuredHoverA of [0, 0.09, 500.01, -3, NaN, Infinity, "20", {}, true]) assert.equal(estimate({ ...base, battery: { measuredHoverA } }).ok, false, `ha ${String(measuredHoverA)}`);
  for (const ageFadePct of [0, 0.5, 40]) assert.equal(estimate({ ...base, battery: { ageFadePct } }).ok, true, `age ${ageFadePct}`);
  for (const measuredHoverA of [0.1, 20, 500]) assert.equal(estimate({ ...base, battery: { measuredHoverA } }).ok, true, `ha ${measuredHoverA}`);
  assert.match(estimate({ ...base, battery: { ageFadePct: 50 } }).errors[0], /Battery age fade must be between 0 and 40 %/);
  assert.match(estimate({ ...base, battery: { measuredHoverA: 600 } }).errors[0], /Measured hover current must be between 0.1 and 500 A/);
  assert.equal(estimate({ ...base, battery: null }).ok, true, "null battery object = not set");
  assert.deepEqual(E.LIMITS, { targetFlightMin: [1, 180], payloadKg: [0, 25], altitudeM: [0, 6000], tempC: [-30, 50], windMs: [0, 20], budgetUsd: [0, 1e6] }, "LIMITS untouched");
});

t("batC compat check: a derated pack has less current than its label", () => {
  const r = { motorCount: 4, peakCurrentA: 100, batteryCells: 6 }, bat = { id: "b", category: "battery", name: "b", specs: { cells: 6, mah: 1500, cRating: 100, chemistry: "lipo" } };
  const one = CHK.compat(r, { battery: bat }).find((x) => x.id === "batC"), two = CHK.compat({ ...r, battery: { resistanceFactor: 2 } }, { battery: bat }).find((x) => x.id === "batC");
  assert.equal(one.level, "pass"); assert.doesNotMatch(one.text, /derated/);
  assert.equal(two.level, "fail"); assert.match(two.text, /above the battery's 75 A limit \(derated 2x for cold or age\)/);
  assert.match(CHK.compat({ ...r, peakCurrentA: 60, battery: { resistanceFactor: 2 } }, { battery: bat }).find((x) => x.id === "batC").text, /over 70% of the battery's 75 A rating \(derated 2x for cold or age\)/);
  assert.equal(CHK.compat({ ...r, battery: { resistanceFactor: 1 } }, { battery: bat }).find((x) => x.id === "batC").text, one.text, "factor 1 = same text");
});

// ---- hash codec: old links, new keys, hostile values
const OLD = [
  "#s=3&m=delivery&t=25&p=1&mat=carbon&cfg=quad&alt=0&tmp=20&w=3&cur=USD",
  "#s=3&m=fpv&t=5&p=0.1&mat=carbon&cfg=quad&fc=7&alt=200&tmp=5&w=3&b=900&cur=USD&reg=US",
  "#s=2&m=mapping&t=45&mat=glass&cfg=fixedwing&alt=100&tmp=-5&w=6&cur=EUR&mw=2100",
];
t("old share links round-trip byte-identical through hashOf", () => {
  for (const h of OLD) {
    const { S, step } = X.parse(h);
    assert.equal(S.age, ""); assert.equal(S.ha, "");
    assert.equal(X.hashOf(S, step), h, h);
    assert.equal(X.hashOf({ ...S, age: 0 }, step), h, "age 0 is a new pack: absent");
    assert.equal(X.hashOf({ ...S, age: "", ha: "" }, step), h);
  }
  const named = "#s=3&m=mapping&t=30&mat=carbon&cfg=quad&alt=0&tmp=20&w=3&cur=USD&mw=900&sel=battery%3Ab1%2Cesc%3Ae2&n=Survey%2001";
  assert.equal(X.hashOf(X.parse(named).S, 3), named, "mw, sel and name links");
});

t("old links give the same engine input as before (no battery key)", () => {
  const { S } = X.parse(OLD[0]);
  assert.deepEqual(X.run(S), estimate({ mission: "delivery", targetFlightMin: 25, payloadKg: 1, frameMaterial: "carbon", configuration: "quad", environment: { altitudeM: 0, tempC: 20, windMs: 3 } }));
});

t("new keys age and ha: round trip, after mw, bounds", () => {
  const { S } = X.parse(OLD[2] + "&age=12.5&ha=18.25&sel=battery:b1");
  assert.equal(S.age, 12.5); assert.equal(S.ha, 18.25);
  const h = X.hashOf(S, 3);
  assert.ok(h.includes("&mw=2100&age=12.5&ha=18.25&sel=battery%3Ab1"), h);
  assert.deepEqual([X.parse(h).S.age, X.parse(h).S.ha], [12.5, 18.25]);
  assert.equal(X.hashOf(X.parse(h).S, 3), h, "stable");
  for (const [v, want] of [["0", 0], ["40", 40], ["7", 7], ["7.5", 7.5], ["07", 7]]) assert.equal(X.parse(`#s=3&m=mapping&age=${v}`).S.age, want, `age ${v}`);
  for (const [v, want] of [["0.1", 0.1], ["500", 500], ["18", 18], ["18.25", 18.25], ["018", 18]]) assert.equal(X.parse(`#s=3&m=mapping&ha=${v}`).S.ha, want, `ha ${v}`);
  assert.equal(AGE.max, 40); assert.equal(HA.min, 0.1); assert.equal(HA.max, 500);
});

t("hostile age and ha in the hash are dropped, never clamped, never in the engine input", () => {
  const bad = ["-1", "-0", "40.1", "41", "99", "100", "1e1", "1e3", "1E1", "NaN", "Infinity", "-Infinity", "0x10", "0b1", " ", "", "1 2", "5;<script>alert(1)</script>", "%3Cb%3E", "1.25", "7.", ".5", "+5",
    "9".repeat(400), "0".repeat(400), "5%00", "5‮", "٥", "١٢"];
  for (const v of bad) { const { S } = X.parse(`#s=3&m=mapping&age=${encodeURIComponent(v)}`); assert.equal(S.age, "", `age ${JSON.stringify(v)}`); }
  const badHa = ["-1", "-0.1", "0", "0.0", "0.09", "0.05", "500.01", "501", "1000", "12.345", "1e2", "1E2", "NaN", "Infinity", "0x10", "", " ", "1 2", "1,5", "abc", "0.", ".5", "+5", "5;<script>alert(1)</script>", "9".repeat(400), "5‮", "٥", "١٢"];
  for (const v of badHa) { const { S } = X.parse(`#s=3&m=mapping&ha=${encodeURIComponent(v)}`); assert.equal(S.ha, "", `ha ${JSON.stringify(v)}`); }
  assert.equal(X.parse("#s=3&m=mapping&age=5&age=99").S.age, 5, "first value wins like every other key");
  assert.equal(X.parse("#s=3&m=mapping&age[]=5&ha[]=9").S.age, "");
  assert.equal(X.parse("#s=3&m=mapping&age=" + "5".repeat(5000)).S.mission, "", "oversized hash falls back to defaults");
  // state set from code (not the hash) with hostile values: the hash writer ignores them
  const { S } = X.parse("#s=3&m=mapping");
  for (const age of [NaN, Infinity, -5, 41, "<b>", null, undefined, {}]) for (const ha of [NaN, Infinity, 0, 0.01, 501, "<i>", null, undefined, {}]) {
    assert.equal(X.hashOf({ ...S, age, ha }, 3), X.hashOf(S, 3), `${String(age)} / ${String(ha)}`);
    assert.equal(X.run({ ...S, age, ha }) !== null && Object.hasOwn(X.run({ ...S, age, ha }) ?? {}, "battery") ? X.run({ ...S, age, ha }).battery.ageFadePct : 0, 0, "engine input ignores them");
  }
});

t("state: input() carries age and ha to the engine; errs flags a bad age; results and PDF show the battery model", () => {
  const { S } = X.parse("#s=3&m=mapping&cfg=quad&tmp=-5&age=20");
  const r = X.run(S), u = X.run({ ...S, age: "" });
  assert.equal(r.battery.ageFadePct, 20); assert.ok(r.batteryWh > u.batteryWh);
  assert.deepEqual(X.errs(S), {}); assert.deepEqual(X.errs({ ...S, age: "" }), {}, "age is optional");
  assert.ok(X.errs({ ...S, age: 50 }).age && /between 0 and 40 %/.test(X.errs({ ...S, age: 50 }).age));
  assert.equal(X.run({ ...S, age: 50 }), null, "no run with a bad age");
  const cal = X.parse("#s=3&m=mapping&cfg=quad&ha=20").S, rc = X.run(cal);
  assert.equal(rc.battery.calibration.measuredA, 20); assert.equal(rc.battery.hoverA, 20);
  const R = X.results(S, r), rows = Object.fromEntries(X.pdfDoc(R, S, "2026-11-14").specs);
  assert.match(rows["Pack voltage under load, estimated"], /^hover [\d.]+ V\/cell at [\d.]+ A, full throttle [\d.]+ V\/cell at \d+ A, safe floor [\d.]+ V\/cell$/);
  assert.match(rows["Cold and age derate"], /^-5 °C, 20 % age fade: \d+ % of capacity, pack resistance [\d.]+ times new$/);
  assert.ok(!("Hover calibration" in rows));
  const rowsC = Object.fromEntries(X.pdfDoc(X.results(cal, rc), cal, "2026-11-14").specs);
  assert.match(rowsC["Hover calibration"], /^measured 20.0 A vs predicted [\d.]+ A: factor [\d.]+$/);
  assert.ok(!("Cold and age derate" in Object.fromEntries(X.pdfDoc(X.results(X.parse("#s=3&m=mapping").S, X.run(X.parse("#s=3&m=mapping").S)), X.parse("#s=3&m=mapping").S, "2026-11-14").specs)), "no derate row for a new warm pack");
  const html = PERF.renderPerformance(r, {});
  assert.match(html, /Flight times include the cold and age derate \(\d+% of nominal capacity\)/);
  assert.doesNotMatch(PERF.renderPerformance(X.run(X.parse("#s=3&m=mapping&cfg=quad").S), {}), /Flight times include/, "a new warm pack: no derate note");
});

console.log(`\n${n} test groups passed`);
