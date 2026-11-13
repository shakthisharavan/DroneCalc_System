import assert from "node:assert/strict";
import { MISSIONS, MATERIALS, CONFIGURATIONS, FPV_CLASSES, LIMITS, HARDWARE, estimate } from "../js/engine.js";
import { recommend } from "../js/matcher.js";
import { CATALOG } from "../js/catalog.js";

const env = { altitudeM: 0, tempC: 15, windMs: 0 };
const base = { mission: "mapping", targetFlightMin: 20, payloadKg: 0.5, frameMaterial: "carbon", configuration: "quad", environment: env };
const run = (o) => { const r = estimate({ ...base, ...o }); assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const finiteAll = (o, path = "") => { // recurses into objects and arrays (performance series)
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "number") assert.ok(Number.isFinite(v), `non-finite ${path}${k}`);
    else assert.notEqual(v, undefined, `undefined ${path}${k}`);
    if (v && typeof v === "object") finiteAll(v, path + k + ".");
  }
};
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const tgtFor = (m) => (m === "fpv" ? 5 : m === "interceptor" ? 8 : 15);

t("exports", () => {
  assert.deepEqual(Object.keys(MISSIONS).sort(), ["agriculture", "delivery", "fpv", "inspection", "interceptor", "mapping"]);
  assert.deepEqual(Object.keys(MATERIALS).sort(), ["aluminum", "balsa", "carbon", "foam", "glass", "pacf", "petg", "plastic", "titanium"]);
  assert.deepEqual(Object.keys(HARDWARE).sort(), ["boltG", "escLinkG", "harnessG", "pairG", "sensorG", "standoffG", "tieG", "xt30G", "xt60G", "xt90G", "as150G", "fpv"].sort());
  for (const m of Object.values(MISSIONS)) for (const k of ["label", "defaultPayloadKg", "minTWR", "cruiseMs", "reserve", "note"]) assert.ok(k in m);
  for (const m of Object.values(MATERIALS)) for (const k of ["label", "densityGcc", "stiffness", "costRel"]) assert.ok(k in m);
  assert.ok(MATERIALS.foam.densityGcc < 0.1 && MATERIALS.foam.stiffness === 1, "foam = EPO/EPP");
  assert.deepEqual(Object.keys(CONFIGURATIONS).sort(), ["fixedwing", "hex", "octo", "quad", "tiltrotor", "vtol"]);
  for (const c of Object.values(CONFIGURATIONS)) assert.ok(c.label && c.note && c.motors >= 1 && ["multirotor", "vtol", "wing"].includes(c.family));
  assert.deepEqual(Object.entries(CONFIGURATIONS).map(([k, c]) => k + ":" + c.family + ":" + c.motors),
    ["quad:multirotor:4", "hex:multirotor:6", "octo:multirotor:8", "vtol:vtol:5", "tiltrotor:vtol:4", "fixedwing:wing:1"]);
  assert.deepEqual(Object.keys(FPV_CLASSES), ["5", "7", "10"]);
  for (const c of Object.values(FPV_CLASSES)) for (const k of ["label", "propInch", "defaultFlightMin", "maxFlightMin", "note", "typicalAuwG"]) assert.ok(k in c);
});

t("all 6 missions: finite, complete, requirements shape", () => {
  for (const mission of Object.keys(MISSIONS)) {
    const target = tgtFor(mission);
    const r = run({ mission, targetFlightMin: target, payloadKg: undefined });
    finiteAll(r);
    assert.ok(r.meetsTarget, mission);
    assert.ok(r.estFlightMin >= 0.99 * target);
    assert.ok(r.twr >= MISSIONS[mission].minTWR - 0.05, mission + " twr");
    assert.equal(r.weights.payloadG, Math.round(MISSIONS[mission].defaultPayloadKg * 1000), "default payload used");
    const q = r.requirements;
    assert.match(q.motor.statorMm, /^\d{4}$/);
    assert.equal(q.motor.count, 4);
    assert.equal(q.fc.minMotorOutputs, 4);
    assert.equal(q.esc.protocol, "DShot600");
    assert.ok(q.motor.kvMin < r.motorKv && r.motorKv < q.motor.kvMax);
    assert.ok(q.frame.minSizeMm < r.frameSizeMm && r.frameSizeMm < q.frame.maxSizeMm);
    assert.ok(q.battery.minMah <= q.battery.maxMah && q.battery.cells === r.batteryCells);
    assert.ok(["lipo", "liion"].includes(q.battery.chemistry));
    assert.equal(q.prop.inch, r.propInch);
    const sum = Object.values(r.weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum / 1000 - r.auwKg) < 0.02 * r.auwKg + 0.01, mission + " weights sum " + sum + " vs " + r.auwKg);
    assert.ok(Math.abs(r.dryWeightKg + (r.weights.batteryG + r.weights.payloadG) / 1000 - r.auwKg) < 0.01);
  }
  assert.equal(run({ mission: "fpv", targetFlightMin: 5 }).requirements.fc.needsGps, false);
  assert.equal(run({ mission: "delivery" }).requirements.fc.needsGps, true);
});

t("all materials (foam included): valid, glass/aluminium heavier than carbon", () => {
  const w = {};
  for (const frameMaterial of Object.keys(MATERIALS)) {
    const r = run({ frameMaterial });
    finiteAll(r);
    w[frameMaterial] = r.weights.frameG;
    assert.equal(r.requirements.frame.material, frameMaterial);
  }
  assert.ok(w.glass > w.carbon && w.aluminum > w.carbon, JSON.stringify(w));
  assert.ok(run({ frameMaterial: "aluminum" }).auwKg > run({ frameMaterial: "carbon" }).auwKg);
});

t("all configurations: motor count", () => {
  const o = { payloadKg: 3, targetFlightMin: 15 };
  const q = run(o), h = run({ ...o, configuration: "hex" }), oc = run({ ...o, configuration: "octo" }), v = run({ ...o, configuration: "vtol" });
  assert.deepEqual([q.motorCount, h.motorCount, oc.motorCount, v.motorCount], [4, 6, 8, 4]);
  assert.equal(oc.requirements.fc.minMotorOutputs, 8);
  assert.equal(h.requirements.frame.configuration, "hex");
  assert.equal(v.requirements.fc.minMotorOutputs, 5 + v.vtol.servoCount, "4 lift + pusher + servos");
});

t("sanity: 5in freestyle 6S, ~5 min", () => {
  const r = run({ mission: "fpv", targetFlightMin: 5, payloadKg: 0.1 });
  assert.equal(r.propInch, 5);
  assert.equal(r.batteryCells, 6);
  assert.equal(r.requirements.battery.chemistry, "lipo");
  assert.ok(r.batteryMah > 700 && r.batteryMah < 2200, "mah " + r.batteryMah);
  assert.ok(r.auwKg > 0.4 && r.auwKg < 0.9, "auw " + r.auwKg);
  assert.ok(r.hoverPowerW > 60 && r.hoverPowerW < 160, "hover W " + r.hoverPowerW);
  assert.ok(r.frameSizeMm > 190 && r.frameSizeMm < 260);
  assert.ok(r.hoverThrottlePct > 25 && r.hoverThrottlePct < 45);
  assert.ok(r.batteryCRating >= 40);
});

t("sanity: 10in long-range Li-ion, ~30 min", () => {
  const r = run({ mission: "mapping", targetFlightMin: 30, payloadKg: 0.2 });
  assert.equal(r.requirements.battery.chemistry, "liion");
  assert.ok(r.propInch >= 9 && r.propInch <= 11, "prop " + r.propInch);
  assert.ok(r.batteryCells === 4 || r.batteryCells === 6);
  assert.ok(r.auwKg > 0.9 && r.auwKg < 1.8, "auw " + r.auwKg);
  assert.ok(r.batteryWh > 60 && r.batteryWh < 140, "Wh " + r.batteryWh);
  assert.ok(r.batteryCRating <= 10);
  assert.ok(r.estFlightMin >= 29.7 && r.estFlightMin <= 31.5);
});

t("sanity: 800mm hex 5kg payload ~17 min on 12S", () => {
  const r = run({ mission: "delivery", configuration: "hex", payloadKg: 5, targetFlightMin: 17 });
  assert.equal(r.batteryCells, 12);
  assert.ok(r.frameSizeMm >= 700 && r.frameSizeMm <= 900, "frame " + r.frameSizeMm);
  assert.ok(r.propInch >= 13 && r.propInch <= 16);
  assert.ok(r.batteryMah > 8000 && r.batteryMah < 25000, "mah " + r.batteryMah);
  assert.ok(r.auwKg > 8 && r.auwKg < 15);
  assert.ok(r.meetsTarget);
});

t("invalid input never throws and returns errors", () => {
  const bad = [undefined, null, 5, "x", {}, { ...base, mission: "nope" }, { ...base, targetFlightMin: 0 }, { ...base, targetFlightMin: NaN },
    { ...base, targetFlightMin: "20" }, { ...base, payloadKg: -1 }, { ...base, payloadKg: Infinity }, { ...base, frameMaterial: "wood" },
    { ...base, configuration: "tri" }, { ...base, environment: { altitudeM: 99999, tempC: 15, windMs: 0 } },
    { ...base, environment: { altitudeM: 0, tempC: -200, windMs: 0 } }, { ...base, environment: { altitudeM: 0, tempC: 15, windMs: -3 } },
    { ...base, budgetUsd: -5 }, { ...base, budgetUsd: "lots" }, { ...base, mission: "__proto__" }, { ...base, mission: "toString" }];
  for (const b of bad) {
    const r = estimate(b);
    assert.equal(r.ok, false, JSON.stringify(b));
    assert.ok(Array.isArray(r.errors) && r.errors.length > 0);
  }
  assert.ok(estimate({}).errors.length >= 4, "collects multiple errors");
});

t("optional fields: missing environment/budget/payload default fine", () => {
  const { environment, payloadKg, ...rest } = base;
  const r = estimate(rest);
  assert.equal(r.ok, true);
  finiteAll(r);
  assert.equal(estimate({ ...rest, budgetUsd: 100000 }).ok, true);
});

t("unreachable target warns, best effort, still finite", () => {
  const r = run({ mission: "delivery", configuration: "quad", payloadKg: 2, targetFlightMin: 180 });
  finiteAll(r);
  assert.equal(r.meetsTarget, false);
  assert.ok(r.estFlightMin < 180 && r.estFlightMin > 5);
  assert.ok(r.warnings.some((w) => /not reachable/i.test(w)), r.warnings.join("|"));
  assert.ok(r.weights.batteryG / (r.auwKg * 1000) <= 0.61);
  assert.equal(run({ targetFlightMin: 15 }).warnings.some((w) => /not reachable/i.test(w)), false);
});

t("budget warning", () => {
  assert.ok(run({ budgetUsd: 10 }).warnings.some((w) => /budget/i.test(w)));
  assert.ok(!run({ budgetUsd: 1e6 }).warnings.some((w) => /budget/i.test(w)));
});

t("warnings: quad heavy payload, strong wind", () => {
  assert.ok(run({ payloadKg: 4, targetFlightMin: 10 }).warnings.some((w) => /hex or octo/i.test(w)));
  assert.ok(run({ environment: { ...env, windMs: 12 } }).warnings.some((w) => /wind/i.test(w)));
});

t("altitude and temperature raise power, battery and rated thrust", () => {
  const e = (altitudeM, tempC, windMs = 0) => ({ targetFlightMin: 15, environment: { altitudeM, tempC, windMs } });
  const sea = run(e(0, 15)), high = run(e(4000, 15)), hot = run(e(0, 45)), cold = run(e(0, -15));
  assert.ok(high.airDensity < sea.airDensity * 0.7);
  assert.ok(high.hoverPowerW > sea.hoverPowerW * 1.1);
  assert.ok(high.batteryWh > sea.batteryWh);
  assert.ok(high.thrustPerMotorG > sea.thrustPerMotorG);
  assert.ok(hot.hoverPowerW > sea.hoverPowerW && hot.batteryWh > sea.batteryWh);
  assert.ok(cold.hoverPowerW < sea.hoverPowerW);
  assert.ok(high.warnings.some((w) => /thin|hot/i.test(w)));
  assert.ok(run(e(0, 15, 8)).avgPowerW > sea.avgPowerW);
});

t("monotonic: more payload => less flight time (capped battery) and bigger battery", () => {
  let prevT = Infinity, prevWh = 0;
  for (const p of [1, 2, 3, 4]) {
    const capped = run({ mission: "delivery", configuration: "hex", payloadKg: p, targetFlightMin: 180 });
    assert.ok(capped.estFlightMin < prevT, `capped t at ${p}: ${capped.estFlightMin} !< ${prevT}`);
    prevT = capped.estFlightMin;
    const fixed = run({ mission: "delivery", configuration: "hex", payloadKg: p, targetFlightMin: 15 });
    assert.ok(fixed.batteryWh > prevWh, `Wh at ${p}`);
    prevWh = fixed.batteryWh;
  }
});

t("monotonic: shorter target => smaller battery and lighter drone", () => {
  for (const mission of ["mapping", "delivery", "inspection", "fpv"]) {
    let prev = null;
    for (const tgt of mission === "fpv" ? [2, 3, 4, 5, 6] : [4, 8, 12, 18, 24]) {
      const r = run({ mission, targetFlightMin: tgt, payloadKg: mission === "fpv" ? 0.1 : 0.3 }); // 5in class carries an action cam, not 0.3 kg
      if (prev) {
        assert.ok(r.batteryWh > prev.batteryWh, `${mission} Wh @${tgt}`);
        assert.ok(r.auwKg > prev.auwKg, `${mission} auw @${tgt}`);
      }
      prev = r;
    }
  }
  assert.ok(run({ targetFlightMin: 60 }).batteryWh > run({ targetFlightMin: 30 }).batteryWh);
});

t("range: finite, positive, wind hurts", () => {
  const a = run({ mission: "delivery" }), b = run({ mission: "delivery", environment: { ...env, windMs: 10 } });
  assert.ok(a.rangeKm > 0 && b.rangeKm < a.rangeKm);
  const c = run({ mission: "delivery", environment: { ...env, windMs: 20 } });
  assert.ok(c.rangeKm >= 0 && Number.isFinite(c.rangeKm));
});

t("mission default/max flight time, cell caps, unreachable stays buildable", () => {
  for (const [k, m] of Object.entries(MISSIONS)) {
    assert.ok(m.defaultFlightMin >= 1 && m.defaultFlightMin < m.maxFlightMin && m.maxFlightMin <= 180, k);
    const r = run({ mission: k, targetFlightMin: m.defaultFlightMin, payloadKg: undefined });
    assert.ok(r.meetsTarget, k + " default meets target: " + r.estFlightMin);
  }
  for (const [mission, cap] of [["fpv", 6], ["interceptor", 8]]) {
    const r = run({ mission, targetFlightMin: 20, payloadKg: undefined });
    finiteAll(r);
    assert.ok(r.batteryCells <= cap, mission + " cells " + r.batteryCells);
    assert.equal(r.meetsTarget, false);
    assert.ok(r.warnings.some((w) => /maximum reachable flight time is ~[\d.]+ min/.test(w)));
    assert.equal(r.requirements.battery.cells, r.batteryCells);
    assert.ok(r.requirements.esc.minCells === r.batteryCells && r.requirements.battery.minMah > 0);
  }
});

t("LIMITS enforced with readable errors", () => {
  assert.deepEqual(LIMITS, { targetFlightMin: [1, 180], payloadKg: [0, 25], altitudeM: [0, 6000], tempC: [-30, 50], windMs: [0, 20], budgetUsd: [0, 1e6] });
  const msg = (o) => estimate({ ...base, ...o }).errors?.join("|");
  assert.equal(msg({ targetFlightMin: 181 }), "Flight time must be between 1 and 180 minutes");
  assert.match(msg({ payloadKg: 26 }), /^Payload must be between 0 and 25 kg/);
  assert.match(msg({ environment: { altitudeM: -1 } }), /Altitude must be between 0 and 6000 m/);
  assert.match(msg({ environment: { tempC: 51 } }), /Temperature must be between -30 and 50/);
  assert.match(msg({ environment: { windMs: 21 } }), /Wind speed must be between 0 and 20 m\/s/);
  assert.match(msg({ budgetUsd: -1 }), /Budget must be between 0 and 1000000 USD/);
  assert.match(msg({ budgetUsd: 1e6 + 1 }), /Budget/);
  for (const o of [{ targetFlightMin: 1 }, { targetFlightMin: 180 }, { payloadKg: 25 }, { environment: { altitudeM: 6000, tempC: -30, windMs: 20 } }, { budgetUsd: 0 }]) assert.equal(estimate({ ...base, ...o }).ok, true, JSON.stringify(o));
});

// ---- v2 ----
const vtol60 = (o) => run({ configuration: "vtol", targetFlightMin: 60, payloadKg: 0.5, ...o });

t("vtol sanity: mapping, 0.5 kg payload, 60 min -> 1.4-2.6 m span, 2.5-8 kg AUW, meets target", () => {
  for (const frameMaterial of ["carbon", "foam", "glass"]) {
    const r = vtol60({ frameMaterial }), v = r.vtol, id = frameMaterial + " " + JSON.stringify(v);
    finiteAll(r);
    assert.ok(r.meetsTarget && r.estFlightMin >= 59.4, id);
    assert.ok(v.wingspanMm >= 1400 && v.wingspanMm <= 2600, "span " + id);
    assert.ok(r.auwKg >= 2.5 && r.auwKg <= 8, "auw " + r.auwKg + " " + id);
    assert.equal(r.batteryChemistry, "liion");
    // real survey quadplanes: L/D 9-15, 60-150 g/dm2, stall 9-14 m/s, cruise 13-20 m/s
    assert.ok(v.liftToDrag >= 9 && v.liftToDrag <= 15, id);
    assert.ok(v.wingLoadingGdm2 >= 60 && v.wingLoadingGdm2 <= 150, id);
    assert.ok(v.stallMs >= 9 && v.stallMs <= 14 && v.cruiseMs > 1.25 * v.stallMs && v.cruiseMs <= 20, id);
    assert.ok(Math.abs(v.wingspanMm ** 2 / (v.wingAreaDm2 * 1e4) - v.aspectRatio) < 0.15, "AR = b^2/S " + id);
    assert.ok(Math.abs((r.auwKg * 1000) / v.wingAreaDm2 - v.wingLoadingGdm2) < 0.5, id);
    assert.ok(r.twr >= 1.95 && r.twr <= 2.05, "lift TWR ~2: " + r.twr);
  }
  assert.ok(vtol60({ frameMaterial: "foam" }).weights.frameG > vtol60({ frameMaterial: "carbon" }).weights.frameG, "EPO heavier than carbon");
});

t("vtol endurance >= 2x quad at the same payload and pack", () => {
  // carbon at the 60 min sanity build; foam (heavier EPO airframe) from 90 min
  for (const [frameMaterial, targetFlightMin] of [["carbon", 60], ["foam", 90]]) {
    const v = vtol60({ frameMaterial, targetFlightMin });
    const q = run({ configuration: "quad", targetFlightMin: v.estFlightMin / 2 }); // same mission, payload 0.5 kg
    assert.equal(q.batteryChemistry, v.batteryChemistry);
    // a quad needs at least the VTOL's pack to fly half as long <=> on the same pack it flies <= half as long
    assert.ok(!q.meetsTarget || q.batteryWh >= v.batteryWh, `${frameMaterial}: quad needs ${q.batteryWh} Wh for ${q.estFlightMin} min, vtol ${v.batteryWh} Wh for ${v.estFlightMin} min`);
    const b = q.performance.battery, i = b.findIndex((p) => p.wh >= v.batteryWh); // the quad's own hardware on the VTOL's pack
    assert.ok(i > 0, "quad battery sweep covers the vtol pack");
    const a = (v.batteryWh - b[i - 1].wh) / (b[i].wh - b[i - 1].wh), tq = b[i - 1].flightMin + a * (b[i].flightMin - b[i - 1].flightMin);
    assert.ok(v.estFlightMin >= 2 * tq, `${frameMaterial}: vtol ${v.estFlightMin} min vs quad ${tq} min on ${v.batteryWh} Wh`);
  }
});

t("vtol result and requirements shape; null for multirotors", () => {
  const r = vtol60({}), v = r.vtol, q = r.requirements;
  assert.deepEqual(Object.keys(v).sort(), ["aspectRatio", "cruiseMin", "cruiseMs", "hoverS", "liftMotorCount", "liftToDrag", "pusher", "rangeKm",
    "servoCount", "stallMs", "tilt", "transitionS", "type", "wingAreaDm2", "wingLoadingGdm2", "wingspanMm"]);
  assert.deepEqual([v.type, v.tilt, r.fixedWing, r.fpvClass], ["quadplane", null, null, null]);
  assert.equal(v.liftMotorCount, 4);
  assert.deepEqual([v.hoverS, v.transitionS], [90, 30], "default profile 2 x 45 s hover + 2 x 15 s transition");
  assert.ok(Math.abs((v.hoverS + v.transitionS) / 60 + v.cruiseMin - r.estFlightMin) < 0.1, "estFlightMin includes hover phases");
  assert.match(v.pusher.statorMm, /^\d{4}$/);
  assert.ok(v.pusher.kv > 0 && v.pusher.thrustG > 0.3 * r.auwKg * 1000 && v.pusher.propInch >= 6);
  assert.ok([4, 6].includes(v.servoCount));
  assert.deepEqual([r.motorCount, q.motor.count, r.frameSizeMm, r.cruiseMs, r.rangeKm], [4, 4, v.wingspanMm, v.cruiseMs, v.rangeKm]);
  assert.equal(q.frame, null);
  assert.deepEqual(Object.keys(q.vtol).sort(), ["auwKg", "frameG", "maxAuwKg", "maxSpanMm", "minAreaDm2", "minSpanMm", "servoCount"]);
  assert.ok(q.vtol.frameG === r.weights.frameG && q.vtol.auwKg === r.auwKg, "airframe weight window for the matcher");
  assert.ok(q.vtol.minSpanMm < v.wingspanMm && v.wingspanMm < q.vtol.maxSpanMm && q.vtol.minAreaDm2 <= v.wingAreaDm2);
  assert.ok(q.vtol.maxAuwKg >= r.auwKg && q.vtol.servoCount === v.servoCount);
  assert.deepEqual(Object.keys(q.pusher).sort(), ["cells", "kvMax", "kvMin", "minThrustG", "propInch", "statorMm"]);
  assert.ok(q.pusher.kvMin < v.pusher.kv && v.pusher.kv < q.pusher.kvMax && q.pusher.propInch === v.pusher.propInch && q.pusher.statorMm === v.pusher.statorMm);
  assert.equal(q.fc.needsGps, true);
  const sum = Object.values(r.weights).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum / 1000 - r.auwKg) < 0.02 * r.auwKg + 0.01, "vtol weights sum");
  for (const configuration of ["quad", "hex", "octo"]) {
    const m = run({ configuration });
    assert.equal(m.vtol, null);
    assert.equal(m.requirements.vtol, null);
    assert.equal(m.requirements.pusher, null);
    for (const k of ["wing", "tilt", "servo"]) assert.equal(m.requirements[k], null);
    assert.deepEqual([m.fixedWing, m.requirements.fpvClass], [null, null]);
    assert.equal(m.requirements.frame.configuration, configuration);
  }
});

t("camera requirement by mission, every configuration", () => {
  const cam = (mission, payloadKg, configuration = "quad") => run({ mission, payloadKg, configuration, targetFlightMin: tgtFor(mission) }).requirements.camera;
  for (const configuration of ["quad", "vtol"]) {
    assert.deepEqual(cam("mapping", 0.5, configuration), { kind: "survey", maxWeightG: 500 });
    assert.ok(["thermal", "zoom", "gimbal4k"].includes(cam("inspection", undefined, configuration).kind));
    assert.equal(cam("fpv", 0.1, configuration).kind, "fpv");
    assert.equal(cam("interceptor", 0.15, configuration).kind, "fpv");
  }
  assert.deepEqual([cam("inspection", 0.1).kind, cam("inspection", 0.3).kind, cam("inspection", 0.8).kind], ["gimbal4k", "thermal", "zoom"]);
  assert.ok(["fpv", null].includes(cam("delivery", 1).kind) && ["fpv", null].includes(cam("agriculture", 5).kind));
  for (const mission of Object.keys(MISSIONS)) {
    const c = cam(mission, undefined);
    assert.deepEqual(Object.keys(c).sort(), ["kind", "maxWeightG"]);
    assert.ok(Number.isFinite(c.maxWeightG) && (c.kind === null ? c.maxWeightG === 0 : c.maxWeightG > 0), mission);
  }
});

t("v2 warnings: vtol for fpv/interceptor, foam multirotor, hover wind", () => {
  for (const mission of ["fpv", "interceptor"]) assert.ok(run({ mission, configuration: "vtol", targetFlightMin: 10, payloadKg: undefined }).warnings.some((w) => /VTOL quadplane does not suit/.test(w)), mission);
  assert.ok(!vtol60({}).warnings.some((w) => /does not suit|foam/i.test(w)));
  assert.ok(run({ frameMaterial: "foam" }).warnings.some((w) => /foam/i.test(w)));
  assert.ok(!vtol60({ frameMaterial: "foam" }).warnings.some((w) => /foam/i.test(w)));
  assert.ok(vtol60({ environment: { ...env, windMs: 12 } }).warnings.some((w) => /hover take-off and landing/.test(w)));
});

t("vtol physics: wind raises cruise speed and pack, altitude raises stall TAS, short targets converge", () => {
  const calm = vtol60({}), windy = vtol60({ environment: { ...env, windMs: 10 } }), high = vtol60({ environment: { altitudeM: 3000, tempC: 0, windMs: 0 } });
  assert.ok(windy.vtol.cruiseMs > calm.vtol.cruiseMs && windy.batteryWh > calm.batteryWh);
  assert.ok(high.vtol.stallMs > calm.vtol.stallMs && high.hoverPowerW > calm.hoverPowerW);
  assert.ok(vtol60({ payloadKg: 2 }).vtol.wingspanMm > calm.vtol.wingspanMm);
  for (const targetFlightMin of [1, 3, 5, 10]) for (const mission of ["delivery", "mapping"]) { // hover phases dominate: flight time has a kink
    const r = run({ mission, configuration: "vtol", targetFlightMin, payloadKg: 0.5 });
    assert.ok(r.meetsTarget && r.estFlightMin <= targetFlightMin * 1.05, `${mission} ${targetFlightMin}: ${r.estFlightMin}`);
  }
  const tiny = run({ configuration: "vtol", targetFlightMin: 1 }); // pack smaller than the full VTOL profile: phases scale down
  assert.ok(tiny.vtol.cruiseMin === 0 && tiny.vtol.hoverS < 90 && tiny.meetsTarget);
});

t("performance: shape, ranges and monotonicity for every configuration", () => {
  const PH = ["takeoff", "transition", "cruise", "hover", "landing", "reserve", "launch", "climb", "loiter", "descent"];
  for (const cfg of ["quad", "hex", "octo", "vtol", "tiltrotor", "fixedwing"]) for (const mission of ["mapping", "delivery", "inspection", "fpv"]) {
    const configuration = mission === "fpv" ? "quad" : cfg, wingy = ["vtol", "tiltrotor", "fixedwing"].includes(configuration), fw = configuration === "fixedwing";
    const r = run({ configuration: cfg, mission, targetFlightMin: mission === "fpv" ? 5 : 30, payloadKg: undefined }), P = r.performance, id = configuration + "/" + mission;
    const wing = r.vtol ?? r.fixedWing;
    finiteAll(P, id + ".");
    assert.deepEqual(Object.keys(P).sort(), ["battery", "batteryBest", "bestSpeed", "payload", "profile", "speed", "throttle"]);
    // speed: >=12 pts; multirotor 0..>=1.6x cruise, vtol stall..1.6x cruise
    const S = P.speed;
    assert.ok(S.length >= 12, id);
    for (const p of S) assert.deepEqual(Object.keys(p), ["ms", "powerW", "currentA", "flightMin", "rangeKm"]);
    for (let i = 1; i < S.length; i++) assert.ok(S[i].ms > S[i - 1].ms, id + " speed axis");
    if (wingy) assert.ok(Math.abs(S[0].ms - wing.stallMs) < 0.06 && Math.abs(S.at(-1).ms - (fw ? 1.8 : 1.6) * wing.cruiseMs) < 0.2, id);
    else assert.ok(S[0].ms === 0 && S.at(-1).ms >= 1.6 * r.cruiseMs - 0.01, id);
    assert.ok(S.every((p) => p.powerW > 0 && p.currentA > 0 && p.flightMin > 0 && p.rangeKm >= 0), id);
    const { enduranceMs, rangeMs } = P.bestSpeed;
    assert.ok(rangeMs > enduranceMs && enduranceMs >= S[0].ms && rangeMs <= S.at(-1).ms, id + " " + JSON.stringify(P.bestSpeed));
    const minP = S.reduce((a, p) => (p.powerW < a.powerW ? p : a));
    assert.ok(minP.ms > S[0].ms && minP.ms < S.at(-1).ms, id + " power curve has a bucket");
    // payload: >=10 pts, 0..max(1.5x payload, 0.5 kg), same pack: flight time and TWR fall
    const Y = P.payload, pk = r.weights.payloadG / 1000;
    assert.ok(Y.length >= 10 && Y[0].kg === 0 && Math.abs(Y.at(-1).kg - Math.max(1.5 * pk, 0.5)) < 1e-3, id);
    for (let i = 1; i < Y.length; i++) assert.ok(Y[i].flightMin < Y[i - 1].flightMin && Y[i].twr < Y[i - 1].twr, id + " payload " + i);
    const at = Y.find((p) => Math.abs(p.kg - pk) < 1e-3);
    if (at) assert.ok(Math.abs(at.flightMin - r.estFlightMin) < 0.06, id + " payload curve passes the build");
    // battery: >=10 pts, 0.5x..2-6x the chosen pack (v4; v3 stopped at 2x so the peak never showed), flight time rises to one peak
    const B = P.battery, top = B.reduce((a, p, i) => (p.flightMin > B[a].flightMin ? i : a), 0);
    assert.ok(B.length >= 10 && Math.abs(B[0].wh - r.batteryWh / 2) < 0.1 && B.at(-1).wh >= 2 * r.batteryWh - 0.2 && B.at(-1).wh <= 6 * r.batteryWh + 0.2, id);
    for (let i = 1; i < B.length; i++) assert.ok((i <= top ? B[i].flightMin >= B[i - 1].flightMin : B[i].flightMin <= B[i - 1].flightMin) && B[i].auwKg > B[i - 1].auwKg && B[i].twr <= B[i - 1].twr, id + " battery " + i);
    const inc = B.slice(1).map((p, i) => p.flightMin - B[i].flightMin); // vtol: small packs barely cover the fixed hover energy
    assert.ok(inc.at(-1) < (wingy ? Math.max(...inc) : inc[0]), id + " diminishing returns");
    // v4 R2-1: feasible = carried at the build's T:W, a prefix of the sweep; batteryBest = longest feasible flight (or the T:W boundary pack)
    const minTw = fw ? 0.6 : wingy ? 2 : mission === "fpv" ? 7 : 2;
    assert.ok(r.minTwr === minTw && r.twrKind === (fw ? "static" : "hover"), id + " r.minTwr/twrKind");
    const bb = P.batteryBest, nf = B.findIndex((p) => !p.feasible);
    assert.ok(B.every((p) => (p.feasible ? p.twr >= minTw - 0.005 : p.twr <= minTw + 0.005)) && (nf < 0 || B.slice(nf).every((p) => !p.feasible)), id + " feasible prefix");
    assert.deepEqual(Object.keys(bb), ["wh", "mah", "flightMin", "mult", "twr", "reason"], id);
    assert.ok(["peak", "twrLimit", "rangeEnd"].includes(bb.reason) && bb.twr >= minTw - 0.005 && B.every((p) => !p.feasible || p.flightMin <= bb.flightMin + 0.06), id + " best " + JSON.stringify(bb));
    assert.ok(Math.abs(bb.mult - bb.wh / r.batteryWh) < 0.01 && bb.mah > 0, id);
    // throttle: >=10 pts over 10..100 %, thrust and power rise, efficiency (g/W) highest below hover
    const T = P.throttle;
    assert.ok(T.length >= 10 && T[0].pct === 10 && T.at(-1).pct === 100, id);
    for (let i = 1; i < T.length; i++) assert.ok(T[i].thrustG > T[i - 1].thrustG && T[i].powerW > T[i - 1].powerW && T[i].currentA > T[i - 1].currentA, id);
    assert.ok(T.at(-1).gPerW < Math.max(...T.map((p) => p.gPerW)), id);
    assert.ok(Math.abs(T.at(-1).thrustG - r.maxThrustG * r.airDensity / 1.225) < 0.01 * r.maxThrustG, id + " full throttle = max thrust");
    // profile: contiguous phases; flight phases add up to estFlightMin and use the usable energy (80% DoD minus reserve)
    const F = P.profile;
    assert.ok(F.every((p) => PH.includes(p.phase) && p.durationS >= 0 && p.powerW > 0), id);
    for (let i = 1; i < F.length; i++) assert.ok(Math.abs(F[i].startS - F[i - 1].startS - F[i - 1].durationS) < 0.2, id + " contiguous");
    const fl = F.filter((p) => p.phase !== "reserve");
    assert.ok(Math.abs(fl.reduce((a, p) => a + p.durationS, 0) / 60 - r.estFlightMin) < 0.06, id + " profile time");
    const eWh = fl.reduce((a, p) => a + p.powerW * p.durationS, 0) / 3600;
    assert.ok(Math.abs(eWh / (r.batteryWh * 0.8 * (1 - MISSIONS[mission].reserve)) - 1) < 0.01, id + " profile energy " + eWh);
    assert.equal(F.at(-1).phase, "reserve");
    if (fw) assert.deepEqual(F.map((p) => p.phase), ["launch", "climb", "cruise", "loiter", "descent", "reserve"]);
    else if (wingy) assert.deepEqual(F.map((p) => p.phase), ["takeoff", "transition", "cruise", "transition", "landing", "reserve"]);
    else assert.deepEqual(F.map((p) => p.phase), ["takeoff", mission === "inspection" ? "hover" : "cruise", "landing", "reserve"]);
  }
});

t("pack mass calibrated to real packs (LiPo ~125-150 Wh/kg, lower for small FPV packs; Li-ion ~190-240)", () => {
  const whKg = (r) => r.batteryWh / (r.weights.batteryG / 1000);
  const fpv = run({ mission: "fpv", targetFlightMin: 5, payloadKg: 0.1 }); // 6S ~1300-1500 mAh
  assert.ok(fpv.batteryCells === 6 && whKg(fpv) >= 118 && whKg(fpv) <= 132, "6S FPV pack " + whKg(fpv)); // real 6S 1300 mAh: 28.9 Wh, ~230 g
  const big = run({ mission: "delivery", configuration: "hex", payloadKg: 5, targetFlightMin: 17 }); // 12S ~700 Wh LiPo
  assert.ok(big.batteryChemistry === "lipo" && whKg(big) >= 140 && whKg(big) <= 150.5, "big LiPo " + whKg(big)); // 150.5: rounding of batteryG at the 150 asymptote
  for (const r of [run({ targetFlightMin: 30 }), vtol60({}), vtol60({ targetFlightMin: 120 })]) {
    assert.equal(r.batteryChemistry, "liion");
    assert.ok(whKg(r) >= 190 && whKg(r) <= 240, "Li-ion " + whKg(r));
  }
  // Li-ion packs are ~10C continuous / ~20C burst: the engine never asks more (it grows the pack or switches to LiPo)
  for (const mission of Object.keys(MISSIONS)) for (const configuration of ["quad", "hex", "vtol", "tiltrotor", "fixedwing"]) for (const targetFlightMin of [25, 45, 90]) {
    const b = run({ mission, configuration, targetFlightMin, fpvClass: "10", payloadKg: undefined }).requirements.battery, id = `${mission}/${configuration}/${targetFlightMin} ${JSON.stringify(b)}`;
    if (b.chemistry === "liion") assert.ok(b.minC <= 10 && b.burstC <= 20 && b.minC >= 2, id);
    else assert.ok(b.minC === Math.max(5, b.burstC), id); // LiPo labels are burst-style: minC covers the full-throttle peak
  }
});

t("catalog fit: motor, prop and pusher match whenever the catalog stocks that size class", () => {
  // Engine asks for real stator/KV/prop classes: if the catalog stocks the class (prop +-0.5in; stator volume d^2*h +-30% with
  // enough thrust and KV), recommend() must find it, so KV bands and stator choices are realistic. Classes not stocked are listed.
  // v3: every mission x (quad, hex, vtol, tiltrotor, fixedwing), fpv x class 5/7/10 (fpv is always a quad).
  const vol = (s) => { const [, d, h] = /^(\d\d)(\d\d(?:\.\d+)?)$/.exec(s); return d * d * h; }; // "2806.5" too
  const motors = (pusher) => CATALOG.filter((i) => i.category === "motor" && i.tags.includes("pusher") === pusher);
  // same voltage class too: KV within +-40% of the band centre (a 380KV 6S motor is not a 900KV 4S one)
  const motorStocked = (pusher) => (q) => motors(pusher).some((i) => Math.abs(vol(i.specs.statorMm) / vol(q.statorMm) - 1) <= 0.3
    && i.specs.maxThrustG >= q.minThrustG && Math.abs((2 * i.specs.kv) / (q.kvMin + q.kvMax) - 1) <= 0.4
    && (!i.specs.maxCells || (q.cells >= i.specs.minCells && q.cells <= i.specs.maxCells))); // rated for the pack (v4 motor cell range)
  const stocked = { prop: (q) => CATALOG.some((i) => i.category === "prop" && Math.abs(i.specs.inch - q.inch) <= 0.5), motor: motorStocked(false), pusher: motorStocked(true) };
  const gaps = [], pending = [];
  let found = 0;
  const cases = Object.keys(MISSIONS).flatMap((mission) => mission === "fpv" ? Object.keys(FPV_CLASSES).map((fpvClass) => [mission, "quad", fpvClass])
    : ["quad", "hex", "vtol", "tiltrotor", "fixedwing"].map((configuration) => [mission, configuration]));
  for (const [mission, configuration, fpvClass] of cases) {
    const vt = configuration !== "quad" && configuration !== "hex";
    const r = run({ mission, configuration, fpvClass, targetFlightMin: fpvClass ? FPV_CLASSES[fpvClass].defaultFlightMin : MISSIONS[mission].defaultFlightMin,
      payloadKg: undefined, frameMaterial: vt ? "foam" : "carbon" });
    const rec = recommend(r.requirements, mission, undefined, undefined, "GLOBAL"), v3 = "fixedwing" in rec; // matcher with v3 keys
    for (const cat of ["motor", "prop", "pusher"]) {
      const q = r.requirements[cat], id = `${mission}/${configuration}${fpvClass ? "/" + fpvClass + "in" : ""} ${cat}`;
      if (!q) continue;
      if (rec[cat]?.length) { found++; continue; }
      if (!v3 && configuration === "fixedwing") { pending.push(id); continue; } // v2 matcher ignores requirements.pusher without vtol
      assert.ok(!stocked[cat](q), `${id}: catalog stocks this class but nothing matched ${JSON.stringify(q)}`);
      gaps.push(`${id} ${q.statorMm ?? q.inch + "in"}`);
    }
  }
  assert.ok(found >= 40, "matched slots regressed: " + found); // v2 floor 19, 40 of 42 v2 slots matched on 2026-11-07
  console.log(`   ${found} matched; not stocked in catalog: ${gaps.join(", ") || "none"}${pending.length ? "; matcher not v3 yet: " + pending.join(", ") : ""}`);
});

t("v4 batteryBest: the sized pack is the largest the build carries at its minimum T:W", () => {
  const env0 = { payloadKg: undefined };
  for (const [o, minTw] of [[{ mission: "inspection", targetFlightMin: 25 }, 2], [{ mission: "fpv", fpvClass: "5", targetFlightMin: 5 }, 7], [{ mission: "mapping", configuration: "vtol", frameMaterial: "foam", targetFlightMin: 30 }, 2]]) {
    const r = run({ ...env0, ...o }), bb = r.performance.batteryBest, B = r.performance.battery, id = JSON.stringify(o) + " " + JSON.stringify(bb);
    // engine thrust is sized to exactly minTWR at the design pack, so any bigger pack drops below it: best = boundary, ~1x the pack
    assert.ok(bb.reason === "twrLimit" && bb.twr >= minTw && Math.abs(bb.mult - 1) <= 0.03, id);
    assert.ok(B.some((p) => !p.feasible && p.flightMin > bb.flightMin), id + " longer flights exist only below the minimum T:W (R2-1: 361.6 Wh at T:W 1.3)");
  }
});

t("v4 R3-2: a twrLimit best pack within 5% of the design pack is the design pack, with the page's own numbers", () => {
  for (const configuration of ["vtol", "tiltrotor", "fixedwing"]) {
    const r = run({ mission: "mapping", configuration, frameMaterial: "foam", targetFlightMin: 30, payloadKg: undefined }), bb = r.performance.batteryBest;
    assert.deepEqual(bb, { wh: r.batteryWh, mah: r.batteryMah, flightMin: r.estFlightMin, mult: 1, twr: r.twr, reason: "twrLimit" }, configuration);
    assert.ok(r.twr >= r.minTwr, configuration);
  }
  for (const fpvClass of ["5", "7", "10"]) assert.equal(run({ mission: "fpv", fpvClass, targetFlightMin: 5, payloadKg: undefined }).minTwr, FPV_CLASSES[fpvClass].minTWR, "fpv class minTwr");
});

t("v4 R4: every build can cruise: cruise power <= 85% of the static full-throttle power (interceptor wing was 135%)", () => {
  for (const mission of Object.keys(MISSIONS)) for (const configuration of mission === "fpv" ? ["quad"] : ["quad", "hex", "octo", "vtol", "tiltrotor", "fixedwing"]) for (const fpvClass of mission === "fpv" ? ["5", "7", "10"] : [undefined]) {
    const wing = ["vtol", "tiltrotor", "fixedwing"].includes(configuration);
    const r = run({ mission, configuration, fpvClass, targetFlightMin: fpvClass ? 5 : 30, payloadKg: undefined, frameMaterial: wing ? "foam" : "carbon" }), P = r.performance, id = `${mission}/${configuration}${fpvClass ?? ""}`;
    const cruise = P.profile.find((p) => p.phase === "cruise" || p.phase === "hover").powerW, max = P.throttle.at(-1).powerW;
    assert.ok(cruise <= 0.85 * max, `${id}: cruise ${cruise} W vs static max ${max} W`);
    assert.ok(r.twr >= r.minTwr - 0.005, id + " twr");
  }
  // quadplane pusher: its static full-throttle power (ideal rotor / (fm x motor 0.85 x ESC 0.95 x wiring 0.97), +10% droop) covers cruise too
  const fm = (inch) => (inch <= 7 ? 0.6 : inch >= 12 ? 0.7 : 0.6 + (0.1 * (inch - 7)) / 5);
  for (const mission of ["mapping", "delivery", "inspection", "agriculture", "interceptor"]) {
    const r = run({ mission, configuration: "vtol", targetFlightMin: 30, payloadKg: undefined, frameMaterial: "foam" }), q = r.requirements.pusher, T = (q.minThrustG / 1000) * 9.81, d = q.propInch * 0.0254;
    const full = ((T * Math.sqrt(T / (2 * 1.225 * (Math.PI * d * d) / 4))) / (fm(q.propInch) * 0.85 * 0.95 * 0.97)) * 1.1, cruiseW = r.performance.profile.find((p) => p.phase === "cruise").powerW - MISSIONS[mission].avionicsW;
    assert.ok(cruiseW <= 0.85 * full, `${mission}/vtol pusher: cruise ${Math.round(cruiseW)} W vs static ${Math.round(full)} W`);
  }
  const ic = run({ mission: "interceptor", configuration: "fixedwing", targetFlightMin: 6, payloadKg: undefined, frameMaterial: "foam" });
  assert.ok(ic.minTwr > 0.6 && ic.twr >= ic.minTwr - 0.005, "interceptor wing: static T:W raised above the 0.6 launch minimum to power 30 m/s: " + ic.minTwr);
  assert.equal(run({ mission: "mapping", configuration: "fixedwing", targetFlightMin: 30, payloadKg: undefined, frameMaterial: "foam" }).minTwr, 0.6, "slow wings stay at 0.6");
});

// ---- v3 ----
// flight time of build r's own hardware on a pack of wh, interpolated from its battery sweep
const onPack = (r, wh) => {
  const b = r.performance.battery, i = b.findIndex((p) => p.wh >= wh);
  assert.ok(i > 0, `battery sweep ${b[0].wh}-${b.at(-1).wh} Wh covers ${wh} Wh`);
  return b[i - 1].flightMin + ((wh - b[i - 1].wh) / (b[i].wh - b[i - 1].wh)) * (b[i].flightMin - b[i - 1].flightMin);
};
const fw90 = (o) => run({ configuration: "fixedwing", targetFlightMin: 90, payloadKg: 0.5, frameMaterial: "foam", ...o });

t("fixedwing sanity: mapping 0.5 kg, 90 min -> 1.6-2.8 m span, 1.8-5 kg, >= 2.5x the quad on the same pack", () => {
  for (const frameMaterial of ["foam", "carbon", "glass"]) {
    const r = fw90({ frameMaterial }), w = r.fixedWing, id = frameMaterial + " " + JSON.stringify(w);
    finiteAll(r);
    assert.ok(r.meetsTarget && r.estFlightMin >= 89.1, id);
    assert.ok(w.wingspanMm >= 1600 && w.wingspanMm <= 2800 && r.auwKg >= 1.8 && r.auwKg <= 5, "span/auw " + r.auwKg + " " + id);
    // real survey wings (Skywalker X8, 1900/2000 class, Mini Talon): L/D 8-14, 35-80 g/dm2, stall 6-11 m/s, cruise 11-20 m/s
    assert.ok(w.liftToDrag >= 8 && w.liftToDrag <= 14 && w.wingLoadingGdm2 >= 35 && w.wingLoadingGdm2 <= 80, id);
    assert.ok(w.stallMs >= 6 && w.stallMs <= 11 && w.cruiseMs >= 1.25 * w.stallMs && w.cruiseMs <= 20, id);
    assert.ok(Math.abs(w.wingspanMm ** 2 / (w.wingAreaDm2 * 1e4) - w.aspectRatio) < 0.15, "AR = b^2/S " + id);
    assert.ok(r.avgPowerW / r.auwKg >= 18 && r.avgPowerW / r.auwKg <= 45, "cruise W/kg " + r.avgPowerW / r.auwKg); // flown: 25-40 W/kg
    assert.equal(r.batteryChemistry, "liion");
    const q = run({ configuration: "quad", targetFlightMin: 30 }), tq = onPack(q, r.batteryWh); // same mission and payload
    assert.ok(r.estFlightMin >= 2.5 * tq, `${frameMaterial}: wing ${r.estFlightMin} min vs quad ${tq} min on ${r.batteryWh} Wh`);
  }
  // per kg: a quad hovers at 3-6x the wing's cruise power (calibration: endurance 3-5x a quad of the same mass)
  const r = fw90({}), q = run({ configuration: "quad", targetFlightMin: 30 });
  const ratio = (q.hoverPowerW / q.auwKg) / (r.hoverPowerW / r.auwKg);
  assert.ok(ratio >= 3 && ratio <= 6, "quad hover W/kg / wing cruise W/kg = " + ratio);
});

t("fixedwing result, requirements, launch and warnings", () => {
  const r = fw90({}), w = r.fixedWing, q = r.requirements;
  assert.deepEqual(Object.keys(w).sort(), ["aspectRatio", "cruiseMs", "endurance", "launch", "liftToDrag", "motor", "rangeKm", "stallMs",
    "wingAreaDm2", "wingLoadingGdm2", "wingspanMm"]);
  assert.deepEqual([r.vtol, r.fpvClass, r.motorCount, r.frameSizeMm, r.propInch, w.endurance, w.rangeKm], [null, null, 1, w.wingspanMm, w.motor.propInch, r.estFlightMin, r.rangeKm]);
  assert.match(w.motor.statorMm, /^\d{4}$/);
  assert.ok(w.motor.kv > 0 && w.motor.thrustG > 0.5 * r.auwKg * 1000 && w.motor.propInch >= 7 && r.twr >= 0.5 && r.twr <= 0.8, JSON.stringify(w.motor));
  assert.ok(r.hoverThrottlePct > 15 && r.hoverThrottlePct < 70, "cruise throttle " + r.hoverThrottlePct);
  assert.deepEqual([q.frame, q.motor, q.vtol, q.tilt], [null, null, null, null]);
  assert.deepEqual(Object.keys(q.wing).sort(), ["auwKg", "frameG", "maxAuwKg", "maxSpanMm", "minAreaDm2", "minSpanMm"]);
  assert.ok(q.wing.minSpanMm < w.wingspanMm && w.wingspanMm < q.wing.maxSpanMm && q.wing.minAreaDm2 <= w.wingAreaDm2 && q.wing.maxAuwKg >= r.auwKg);
  assert.ok(q.pusher.statorMm === w.motor.statorMm && q.pusher.kvMin < w.motor.kv && w.motor.kv < q.pusher.kvMax && q.pusher.propInch === w.motor.propInch);
  assert.deepEqual(q.servo, { count: 4 });
  assert.deepEqual([q.fc.minMotorOutputs, q.fc.needsGps, q.prop.inch], [5, true, w.motor.propInch]);
  const sum = Object.values(r.weights).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum / 1000 - r.auwKg) < 0.02 * r.auwKg + 0.01, "fixedwing weights sum");
  // launch from AUW: hand < 2 kg; 2-5 kg hand or bungee; above 5 kg bungee or runway
  const seen = new Set();
  for (const payloadKg of [0, 0.5, 1.5, 5, 15]) {
    const x = fw90({ payloadKg, targetFlightMin: 60 }), want = x.auwKg < 2 ? ["hand"] : x.auwKg <= 5 ? ["hand", "bungee"] : ["bungee", "runway"];
    assert.ok(want.includes(x.fixedWing.launch), payloadKg + " kg: " + x.auwKg + " " + x.fixedWing.launch);
    seen.add(x.fixedWing.launch);
  }
  assert.ok(seen.has("hand") && seen.has("bungee"), [...seen].join());
  assert.ok(run({ mission: "inspection", configuration: "fixedwing", targetFlightMin: 30 }).warnings.some((x) => /cannot hover/.test(x)));
  const ic = run({ mission: "interceptor", configuration: "fixedwing", targetFlightMin: 10, payloadKg: undefined });
  assert.ok(ic.ok && ic.fixedWing && ic.warnings.some((x) => /fixed-wing interceptor/.test(x)) && ic.fixedWing.cruiseMs >= 30, "interceptor allowed as a fast wing");
  assert.ok(!fw90({}).warnings.some((x) => /hover|foam|does not suit/i.test(x)), "mapping wing in foam: no warnings");
  const tiny = run({ configuration: "fixedwing", targetFlightMin: 1 }); // pack smaller than launch + climb + descent: phases scale down
  // the solver's smallest pack (20 g) still flies a wing ~1.4 min, so only "meets, short, phases scaled" is asserted
  assert.ok(tiny.meetsTarget && tiny.estFlightMin < 2.5 && tiny.performance.profile[1].durationS < 50, "tiny " + tiny.estFlightMin);
});

const tr60 = (o) => run({ configuration: "tiltrotor", targetFlightMin: 60, payloadKg: 0.5, frameMaterial: "foam", ...o });

t("tiltrotor sanity: mapping 0.5 kg, 60 min meets target; cruise beats the quad; endurance below the quadplane on the same pack", () => {
  const r = tr60({}), v = r.vtol, qp = vtol60({ frameMaterial: "foam" }), quad = run({ configuration: "quad", targetFlightMin: 30 });
  finiteAll(r);
  assert.ok(r.meetsTarget && r.estFlightMin >= 59.4, JSON.stringify(v));
  assert.ok(v.wingspanMm >= 1400 && v.wingspanMm <= 2600 && r.auwKg >= 2.5 && r.auwKg <= 8, "span/auw " + v.wingspanMm + " " + r.auwKg);
  assert.ok(v.liftToDrag >= 9 && v.liftToDrag <= 15 && v.stallMs >= 9 && v.stallMs <= 14 && v.cruiseMs > 1.25 * v.stallMs, JSON.stringify(v));
  const cruiseW = (x) => x.performance.profile.find((p) => p.phase === "cruise").powerW / x.auwKg;
  assert.ok(cruiseW(r) < cruiseW(quad) / 2, `tiltrotor cruise ${cruiseW(r)} W/kg vs quad ${cruiseW(quad)} W/kg`);
  assert.ok(cruiseW(r) > cruiseW(qp), "tilted hover rotors cruise less efficiently than a dedicated pusher");
  assert.ok(Math.abs(r.hoverPowerW / r.auwKg / (qp.hoverPowerW / qp.auwKg) - 1) < 0.15, "hover power ~ quadplane per kg");
  assert.ok(r.estFlightMin < onPack(qp, r.batteryWh), "quadplane flies longer on the tiltrotor's pack");
  assert.ok(r.auwKg > qp.auwKg && r.batteryWh > qp.batteryWh, "tilt mechanism and worse cruise cost mass and energy");
});

t("tiltrotor result and requirements shape", () => {
  const r = tr60({}), v = r.vtol, q = r.requirements;
  assert.deepEqual([v.type, v.liftMotorCount, v.pusher, r.fixedWing, r.motorCount], ["tiltrotor", 4, null, null, 4]);
  assert.deepEqual(Object.keys(v.tilt).sort(), ["motorCount", "servoCount", "tiltTimeS", "transitionAngleDeg"]);
  assert.ok(v.tilt.motorCount === 4 && v.tilt.servoCount === 4 && v.tilt.tiltTimeS > 1 && v.tilt.tiltTimeS < 6 && v.tilt.transitionAngleDeg === 90);
  assert.deepEqual([v.hoverS, v.transitionS], [90, 24], "2 x 45 s hover + 2 x 12 s transition");
  assert.ok(Math.abs((v.hoverS + v.transitionS) / 60 + v.cruiseMin - r.estFlightMin) < 0.1);
  assert.deepEqual([q.frame, q.pusher, q.wing, q.servo, q.motor.count], [null, null, null, null, 4]);
  assert.deepEqual(Object.keys(q.vtol).sort(), ["auwKg", "frameG", "maxAuwKg", "maxSpanMm", "minAreaDm2", "minSpanMm", "servoCount"]);
  assert.ok(q.vtol.frameG === r.weights.frameG && q.vtol.auwKg === r.auwKg, "airframe weight window for the matcher");
  assert.ok(q.tilt.servoCount === 4 && q.tilt.minTorqueKgcm >= 5 && q.tilt.minTorqueKgcm <= 40, JSON.stringify(q.tilt));
  assert.equal(q.fc.minMotorOutputs, 4 + 4 + v.servoCount, "4 motors + 4 tilt servos + control servos");
  assert.ok(q.fc.needsGps && r.twr >= 1.95 && r.twr <= 2.05);
  const sum = Object.values(r.weights).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum / 1000 - r.auwKg) < 0.02 * r.auwKg + 0.01, "tiltrotor weights sum");
  assert.ok(run({ mission: "interceptor", configuration: "tiltrotor", targetFlightMin: 8 }).warnings.some((x) => /VTOL tiltrotor does not suit/.test(x)));
  assert.ok(tr60({ environment: { ...env, windMs: 12 } }).warnings.some((x) => /hover take-off and landing/.test(x)));
});

t("fpv classes 5/7/10: default flight time, prop, 6S, TWR above class minimum, realistic packs", () => {
  // real: 5in 6S 1100-1600 mAh 600-800 g 4-6 min; 7in 6S LiPo ~1 kg 10-12 min; 10in 6S 1.2-2 kg ~15 min
  // v4: 5in <= 0.8 kg with its ~25-40 g of FPV-class hardware counted (real 650-750 g)
  const band = { 5: { auw: [0.5, 0.8], mah: [1000, 1800] }, 7: { auw: [0.8, 1.3], mah: [1800, 4000] }, 10: { auw: [1.1, 2.2], mah: [2200, 5500] } };
  for (const [fc, c] of Object.entries(FPV_CLASSES)) {
    const r = run({ mission: "fpv", fpvClass: fc, targetFlightMin: c.defaultFlightMin, payloadKg: undefined }), q = r.requirements;
    const id = fc + "in " + JSON.stringify({ auw: r.auwKg, mah: r.batteryMah });
    finiteAll(r);
    assert.ok(r.meetsTarget && r.estFlightMin >= 0.99 * c.defaultFlightMin, id);
    assert.deepEqual([r.propInch, q.prop.inch, r.batteryCells, r.batteryChemistry, r.motorCount, r.fpvClass, q.fpvClass], [c.propInch, c.propInch, 6, "lipo", 4, fc, fc], id);
    assert.ok(r.twr >= c.minTWR - 0.05, id + " twr " + r.twr);
    assert.ok(r.auwKg >= band[fc].auw[0] && r.auwKg <= band[fc].auw[1] && r.batteryMah >= band[fc].mah[0] && r.batteryMah <= band[fc].mah[1], id);
    assert.ok(Math.abs((r.auwKg * 1000) / c.typicalAuwG - 1) < 0.35, id + " vs typicalAuwG");
    assert.equal(q.motor.statorMm, { 5: "2306", 7: "2807", 10: "3115" }[fc]);
    assert.equal(q.frame.configuration, "quad");
    assert.ok(Math.abs(r.frameSizeMm - { 5: 220, 7: 310, 10: 445 }[fc]) <= 25, id + " frame " + r.frameSizeMm);
    assert.ok(c.defaultFlightMin < c.maxFlightMin);
  }
  // stock KV classes on 6S: 2306 ~1700-2100KV, 2807 ~1200-1500KV, 3115 ~800-1000KV
  const kv = (fc) => run({ mission: "fpv", fpvClass: fc, targetFlightMin: FPV_CLASSES[fc].defaultFlightMin, payloadKg: undefined }).motorKv;
  assert.ok(kv("5") >= 1700 && kv("5") <= 2150 && kv("7") >= 1200 && kv("7") <= 1500 && kv("10") >= 800 && kv("10") <= 1000, [kv("5"), kv("7"), kv("10")].join());
  // long range on 6S Li-ion: 7in 15-25 min, 10in 20-30 min
  for (const [fc, tgt] of [["7", 20], ["10", 25]]) {
    const r = run({ mission: "fpv", fpvClass: fc, targetFlightMin: tgt, payloadKg: undefined });
    assert.ok(r.meetsTarget && r.batteryChemistry === "liion" && r.batteryCells === 6, fc + " Li-ion " + r.batteryChemistry);
  }
  assert.equal(run({ mission: "fpv", fpvClass: "7", targetFlightMin: 40, payloadKg: undefined }).meetsTarget, false, "7in beyond its class");
});

t("fpv class fallback, forced quad, fpvClass ignored for other missions", () => {
  const five = run({ mission: "fpv", targetFlightMin: 5 });
  for (const fpvClass of [undefined, null, "", "6", 6, "abc", "__proto__", {}]) {
    const r = estimate({ ...base, mission: "fpv", targetFlightMin: 5, fpvClass });
    assert.ok(r.ok && r.fpvClass === "5" && r.propInch === 5 && r.auwKg === five.auwKg, String(fpvClass));
  }
  assert.equal(run({ mission: "fpv", targetFlightMin: 12, fpvClass: 7 }).fpvClass, "7", "numeric class accepted");
  for (const configuration of ["hex", "octo", "vtol", "tiltrotor", "fixedwing"]) {
    const r = run({ mission: "fpv", targetFlightMin: 5, configuration });
    assert.deepEqual([r.motorCount, r.requirements.frame.configuration, r.vtol, r.fixedWing], [4, "quad", null, null], configuration);
    assert.ok(r.warnings.some((x) => /does not suit FPV.*uses a quad/.test(x)), configuration);
    assert.equal(r.auwKg, five.auwKg);
  }
  assert.ok(!five.warnings.some((x) => /uses a quad/.test(x)));
  const m = run({ fpvClass: "10" });
  assert.deepEqual([m.fpvClass, m.requirements.fpvClass], [null, null]);
  assert.equal(m.auwKg, run({}).auwKg);
});

t("mass statement: named lines sum to AUW; tilt and servos are own lines; motor mass from stator class", () => {
  const KEYS = ["frameG", "motorsG", "escG", "fcG", "batteryG", "propsG", "payloadG", "otherG", "servosG", "tiltG", "hardwareG"];
  const MOTOR_G = { 2306: 33, 2807: 54, 2216: 70, 2814: 108, 3508: 106, 4114: 150, 5008: 170 }; // real class masses (catalog)
  for (const configuration of ["quad", "hex", "vtol", "tiltrotor", "fixedwing"]) {
    const r = run({ configuration, frameMaterial: configuration === "quad" || configuration === "hex" ? "carbon" : "foam", targetFlightMin: configuration === "quad" || configuration === "hex" ? 20 : 60 });
    assert.deepEqual(Object.keys(r.weights), KEYS, configuration + " weight keys");
    const sum = KEYS.reduce((a, k) => a + r.weights[k], 0);
    assert.ok(Math.abs(sum - r.auwKg * 1000) <= 6, `${configuration} weights sum ${sum} vs AUW ${r.auwKg}`);
    assert.equal(r.weights.tiltG > 0, configuration === "tiltrotor", configuration + " tiltG");
    assert.equal(r.weights.servosG > 0, ["vtol", "tiltrotor", "fixedwing"].includes(configuration), configuration + " servosG");
    assert.ok(r.weights.otherG < 0.2 * r.auwKg * 1000, `${configuration} Other ${r.weights.otherG} g is not a catch-all`);
    const lift = configuration === "fixedwing" ? 0 : r.motorCount; // vtol motorsG = 4 lift + pusher
    if (lift && MOTOR_G[r.motorStatorMm]) assert.ok(r.weights.motorsG >= lift * MOTOR_G[r.motorStatorMm] * 0.95, `${configuration} motors ${r.weights.motorsG} g for ${lift} x ${r.motorStatorMm}`);
  }
  // the v3 report case: tiltrotor 4 rotors at ~1.1 kg max thrust each weighed 122 g of motors; now >= 4 x 2814/3508 class (~100 g)
  const tr = run({ configuration: "tiltrotor", frameMaterial: "foam", targetFlightMin: 60 });
  assert.ok(tr.weights.motorsG / 4 >= 90, "tiltrotor motor " + tr.weights.motorsG / 4 + " g each");
  assert.ok(tr.weights.tiltG >= 4 * 40 && tr.weights.tiltG <= 4 * 150, "tilt mechanism + servos " + tr.weights.tiltG);
  const fw = run({ configuration: "fixedwing", frameMaterial: "foam", targetFlightMin: 60 });
  assert.equal(fw.weights.motorsG, { 2312: 60, 2814: 108, 2820: 132, 3520: 218, 4120: 300, 4130: 406 }[fw.fixedWing.motor.statorMm], "fixed wing motor = class mass");
});

// ---- v4 ----
t("materials: every mission x configuration x material builds (ok, finite), unsuitable pairs only warn", () => {
  for (const mission of Object.keys(MISSIONS)) for (const configuration of Object.keys(CONFIGURATIONS)) for (const frameMaterial of Object.keys(MATERIALS)) {
    const r = estimate({ ...base, mission, configuration, frameMaterial, targetFlightMin: tgtFor(mission), payloadKg: undefined });
    assert.equal(r.ok, true, `${mission}/${configuration}/${frameMaterial} ${JSON.stringify(r.errors)}`);
    finiteAll(r);
    assert.equal(r.warnings.every((w) => typeof w === "string" && w.length > 0), true);
  }
  const w = {};
  for (const frameMaterial of Object.keys(MATERIALS)) w[frameMaterial] = run({ frameMaterial }).weights.frameG;
  assert.ok(w.titanium > w.aluminum && w.aluminum > w.glass && w.glass > w.carbon, "density x stiffness rule " + JSON.stringify(w));
  assert.ok(w.pacf < w.petg && w.petg < w.titanium, "printed PA-CF lighter than PETG");
});

t("material warnings: balsa only on wings and VTOL, titanium on heavy-duty multirotors, PETG off FPV and interceptor", () => {
  const warns = (o) => run(o).warnings.filter((w) => /balsa|titanium|petg/i.test(w));
  assert.ok(warns({ frameMaterial: "balsa" }).length === 1, "balsa quad warns");
  assert.ok(warns({ mission: "fpv", targetFlightMin: 5, frameMaterial: "balsa" }).length === 1, "balsa FPV warns");
  assert.deepEqual(warns({ configuration: "fixedwing", targetFlightMin: 60, frameMaterial: "balsa" }), [], "balsa wing ok");
  assert.deepEqual(warns({ configuration: "vtol", targetFlightMin: 60, frameMaterial: "balsa" }), [], "balsa VTOL ok");
  assert.equal(warns({ mission: "fpv", targetFlightMin: 5, frameMaterial: "titanium" }).length, 1, "titanium FPV warns");
  assert.equal(warns({ configuration: "fixedwing", targetFlightMin: 60, frameMaterial: "titanium" }).length, 1, "titanium wing warns");
  assert.deepEqual(warns({ frameMaterial: "titanium" }), [], "titanium mapping quad ok");
  assert.equal(warns({ mission: "fpv", targetFlightMin: 5, frameMaterial: "petg" }).length, 1, "PETG FPV warns");
  assert.equal(warns({ mission: "interceptor", targetFlightMin: 8, frameMaterial: "petg" }).length, 1, "PETG interceptor warns");
  assert.deepEqual(warns({ frameMaterial: "petg" }), [], "PETG mapping quad ok");
  assert.deepEqual(warns({ mission: "fpv", targetFlightMin: 5, frameMaterial: "pacf" }), [], "PA-CF FPV ok");
  assert.ok(run({ mission: "fpv", targetFlightMin: 5, frameMaterial: "balsa" }).ok, "unsuitable material still computes");
});

t("hardware: ESC links match motors, connectors follow the FC size, hex adds two motors of hardware", () => {
  const motorsOf = { quad: 4, hex: 6, octo: 8, vtol: 5, tiltrotor: 4, fixedwing: 1 };
  const row = (r, name) => r.wiring.find((w) => w.name === name);
  const perMotor = HARDWARE.boltG + HARDWARE.standoffG + HARDWARE.tieG + HARDWARE.escLinkG;
  // v4 plug by continuous rating (XT30 30 A, XT60 60 A, XT90 90 A, AS150 above): sustained draw = multirotor mission average, VTOL hover,
  // wing cruise (hoverPowerW), or peak / 1.5 (FPV: peak / 3). v3 compared the sustained draw with 60 A only, so 116 A peaks got XT60.
  const contA = (r) => (r.vtol || r.fixedWing ? r.hoverPowerW : r.avgPowerW) / (r.batteryCells * (r.batteryChemistry === "liion" ? 3.6 : 3.7));
  const amps = (r) => Math.max(contA(r), r.peakCurrentA / (r.fpvClass ? 3 : 1.5));
  const plug = (r) => (amps(r) <= 30 && !r.fpvClass ? "XT30" : amps(r) <= 60 ? "XT60" : amps(r) <= 90 ? "XT90" : "AS150");
  const xt = (r) => HARDWARE[{ XT30: "xt30G", XT60: "xt60G", XT90: "xt90G", AS150: "as150G" }[plug(r)]];
  for (const [configuration, n] of Object.entries(motorsOf)) {
    const wing = ["vtol", "tiltrotor", "fixedwing"].includes(configuration);
    const r = run({ configuration, payloadKg: 0.5, targetFlightMin: 30, frameMaterial: wing ? "foam" : "carbon" });
    assert.equal(row(r, "ESC signal").count, n, configuration + " ESC signal");
    assert.equal(row(r, "ESC power").count, n, configuration + " ESC power");
    assert.equal(row(r, "Battery").connector, plug(r), configuration + " battery connector");
    assert.equal(!!row(r, "CAN"), wing, configuration + " CAN only with airspeed sensor");
    assert.ok(row(r, "GPS") && r.weights.hardwareG >= 30 && r.weights.hardwareG <= 200, configuration + " GPS and hardware " + r.weights.hardwareG);
    const servos = { vtol: r.vtol?.servoCount, tiltrotor: (r.vtol?.servoCount ?? 0) + 4, fixedwing: 4 }[configuration];
    assert.equal(row(r, "Servo leads")?.count, servos, configuration + " servo leads");
    assert.ok(r.wiring.every((w) => w.count > 0 && w.lengthMm > 0 && Object.keys(w).sort().join() === "connector,count,lengthMm,name"), configuration);
  }
  const q = run({ payloadKg: 0.5, targetFlightMin: 30 }), h = run({ payloadKg: 0.5, targetFlightMin: 30, configuration: "hex" });
  assert.ok(Math.abs(h.weights.hardwareG - q.weights.hardwareG - (2 * perMotor + xt(h) - xt(q))) <= 1.5, `hex ${h.weights.hardwareG} vs quad ${q.weights.hardwareG} g`);
  const f5 = run({ mission: "fpv", targetFlightMin: 5 }), f7 = run({ mission: "fpv", fpvClass: "7", targetFlightMin: 12, payloadKg: undefined });
  assert.ok(row(q, "FC link").connector.startsWith("JST-GH") && row(f7, "FC link").connector.startsWith("JST-ZH") && row(f5, "FC link").connector.startsWith("JST-SH"));
  assert.ok(!row(f5, "GPS") && row(f5, "VTX") && row(f5, "Camera").connector.includes("video") && !row(q, "VTX"), "FPV camera and VTX, no GPS");
  assert.ok(row(q, "Camera").connector.includes("gimbal") && !run({ mission: "agriculture" }).wiring.some((w) => w.name === "Camera"), "survey camera; spray rig has none");
  const big = run({ mission: "delivery", configuration: "hex", payloadKg: 5, targetFlightMin: 17 });
  assert.equal(row(big, "Battery").connector, plug(big), "12S hex " + Math.round(contA(big)) + " A continuous");
  // FPV class: one 4-in-1 ESC link, motor leads per motor, M2/M3 hardware: 25-40 g like real builds, far below a heavy hex
  for (const fc of Object.keys(FPV_CLASSES)) {
    const f = run({ mission: "fpv", fpvClass: fc, targetFlightMin: FPV_CLASSES[fc].defaultFlightMin, payloadKg: undefined });
    assert.deepEqual([row(f, "ESC signal").count, row(f, "ESC power").count, row(f, "Motor leads").count], [1, 1, 4], fc + "in ESC links");
    assert.ok(f.weights.hardwareG >= 25 && f.weights.hardwareG <= 40 && f.weights.hardwareG < big.weights.hardwareG / 1.5, fc + "in hardware " + f.weights.hardwareG);
    assert.equal(row(f, "Battery").connector, "XT60", fc + "in 6S uses XT60 (" + Math.round(contA(f)) + " A continuous)");
  }
});

console.log(`\n${n} test groups passed`);
