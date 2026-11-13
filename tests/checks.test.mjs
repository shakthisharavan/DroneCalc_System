// SPEC-v4 checks.js: compat rules, weight class boundaries, parts mass, checklist, and real best-pick builds.
import assert from "node:assert/strict";
import * as E from "../js/engine.js";
import * as C from "../js/catalog.js";
import * as M from "../js/matcher.js";
import * as PERF from "../js/ui/perf.js";
import { createState } from "../js/ui/state.js";
import { compat, weightClass, partsMassG, checklist } from "../js/checks.js";

const it = (category, specs, extra = {}) => ({ id: category, category, name: category, weightG: 10, priceUsd: 1, specs, ...extra });
const lvl = (res, id) => res.find((x) => x.id === id)?.level;
const r = { motorCount: 4, peakCurrentA: 100, propInch: 5, batteryCells: 6, escContinuousA: 30, weights: { hardwareG: 30 },
  requirements: { fc: { minMotorOutputs: 4 }, frame: { minSizeMm: 190, maxSizeMm: 270 }, motor: { minThrustG: 1000 }, esc: { minContinuousA: 30 } } };
const good = {
  battery: it("battery", { cells: 6, mah: 1500, cRating: 100, chemistry: "lipo", connector: "XT60" }),
  esc: it("esc", { continuousA: 50, minCells: 3, maxCells: 6, protocol: "DShot600", connector: "XT60" }),
  motor: it("motor", { maxCurrentA: 40, minCells: 4, maxCells: 6, maxThrustG: 1500 }), fc: it("fc", { motorOutputs: 8, firmware: "Betaflight/INAV" }),
  frame: it("frame", { maxPropInch: 5.1, sizeMm: 225 }), prop: it("prop", { inch: 5 }),
};
const all = compat(r, good);
assert.deepEqual(all.map((x) => x.id).sort(), ["batC", "cells", "connector", "escA", "frameSize", "motorA", "motorCells", "motorThrust", "outputs", "packCells", "prop", "propSize", "proto"], "one check per rule");
for (const x of all) assert.ok(x.level === "pass" && /^[A-Z].*\.$/.test(x.text) && !/NaN|undefined/.test(x.text), "pass: " + x.text);
assert.deepEqual(compat(r, {}), [], "no picks, no checks");
assert.deepEqual(compat(r, { battery: good.battery }).map((x) => x.id), ["packCells", "batC"], "rules with unpicked parts are skipped");
const swap = (cat, specs) => compat(r, { ...good, [cat]: it(cat, { ...good[cat].specs, ...specs }) });

// cells
assert.equal(lvl(swap("esc", { minCells: 2, maxCells: 4 }), "cells"), "fail", "6S on a 2-4S ESC");
assert.match(swap("esc", { minCells: 2, maxCells: 4 }).find((x) => x.id === "cells").text, /6S.*2-4S/);
assert.equal(lvl(swap("esc", { minCells: 6, maxCells: 12 }), "cells"), "pass");
assert.equal(lvl(swap("esc", { minCells: 7, maxCells: 12 }), "cells"), "fail", "HV ESC below its minimum");
// connector
assert.equal(lvl(swap("esc", { connector: "XT90" }), "connector"), "fail", "XT60 battery + XT90 ESC");
assert.match(swap("esc", { connector: "XT90" }).find((x) => x.id === "connector").text, /XT60.*XT90.*adapter/);
assert.equal(lvl(swap("esc", { connector: "pads" }), "connector"), "warn", "pads ESC");
assert.match(swap("esc", { connector: "pads" }).find((x) => x.id === "connector").text, /solder an XT60 lead/);
assert.equal(lvl(swap("esc", { connector: undefined }), "connector"), undefined, "no connector data, no check");
// ESC current: 100 A / 4 motors = 25 A per motor
assert.equal(lvl(swap("esc", { continuousA: 24 }), "escA"), "fail");
assert.equal(lvl(swap("esc", { continuousA: 27 }), "escA"), "warn", "within 10%");
assert.match(swap("esc", { continuousA: 24 }).find((x) => x.id === "escA").text, /24 A.*25 A/);
assert.equal(lvl(swap("motor", { maxCurrentA: 55 }), "motorA"), "warn", "motor max above ESC");
assert.equal(lvl(compat(r, { esc: good.esc, pusher: it("motor", { maxCurrentA: 60 }) }), "motorA"), "warn", "fixed wing: pusher is the motor");
// outputs
assert.equal(lvl(compat({ ...r, requirements: { fc: { minMotorOutputs: 9 } } }, good), "outputs"), "fail", "quadplane needs 9");
assert.equal(lvl(compat({ ...r, requirements: {} }, { fc: it("fc", { motorOutputs: 4 }) }), "outputs"), "pass", "falls back to motorCount");
assert.equal(lvl(compat({ ...r, motorCount: 6, requirements: {} }, { fc: it("fc", { motorOutputs: 4 }) }), "outputs"), "fail");
// prop: picked prop, else the engine's size
assert.equal(lvl(swap("prop", { inch: 6 }), "prop"), "fail");
assert.equal(lvl(compat({ ...r, propInch: 7 }, { frame: good.frame }), "prop"), "fail", "engine prop size without a prop pick");
// protocol
assert.equal(lvl(swap("fc", { firmware: "ArduPilot/PX4" }), "proto"), "pass", "DShot on ArduPilot");
assert.equal(lvl(compat(r, { ...good, esc: it("esc", { ...good.esc.specs, protocol: "PWM" }), fc: it("fc", { motorOutputs: 8, firmware: "Betaflight" }) }), "proto"), "pass", "PWM anywhere");
assert.equal(lvl(swap("fc", { firmware: "KISS" }), "proto"), "warn", "unknown firmware");
assert.equal(lvl(swap("esc", { protocol: "ProShot" }), "proto"), "warn", "unknown protocol");
// battery C: 1.5 Ah x 100C = 150 A
assert.equal(lvl(compat({ ...r, peakCurrentA: 105 }, good), "batC"), "pass");
assert.equal(lvl(compat({ ...r, peakCurrentA: 106 }, good), "batC"), "warn", "over 70%");
assert.match(compat({ ...r, peakCurrentA: 106 }, good).find((x) => x.id === "batC").text, /optimistic; keep peak under 70%/);
assert.equal(lvl(compat({ ...r, peakCurrentA: 151 }, good), "batC"), "fail", "over 100%");
const li = it("battery", { cells: 6, mah: 4200, cRating: 10, chemistry: "liion" }); // 42 A continuous, ~84 A burst
assert.equal(lvl(compat({ ...r, peakCurrentA: 60 }, { battery: li }), "batC"), "warn", "Li-ion burst above continuous is a warning");
assert.equal(lvl(compat({ ...r, peakCurrentA: 90 }, { battery: li }), "batC"), "fail");

// integrated power system: the motor's built-in ESC stands in for picks.esc
const ips = it("motor", { maxCurrentA: 80, integratedEsc: true, continuousA: 80, minCells: 12, maxCells: 14, protocol: "PWM", connector: "pads" });
const ipsRes = compat({ ...r, peakCurrentA: 400 }, { motor: ips, battery: it("battery", { cells: 6, mah: 16000, cRating: 25, chemistry: "lipo", connector: "AS150" }) });
assert.deepEqual(["cells", "connector", "escA", "motorA"].map((id) => lvl(ipsRes, id)), ["fail", "warn", "fail", undefined], "6S on a 12-14S built-in ESC, bare leads, 100 A per motor on 80 A, no motor-vs-own-ESC check");
assert.equal(lvl(compat(r, { motor: ips, esc: good.esc }), "cells"), undefined, "no battery picked: no cell check against either ESC");
assert.match(compat(r, { motor: ips, esc: good.esc }).find((x) => x.id === "escExtra").text, /built in: the separate ESC is not needed/);
// escNeeded: a motor without a built-in ESC and no ESC picked
assert.equal(compat(r, { motor: good.motor }).find((x) => x.id === "escNeeded").text, "Pick an ESC: motor has no built-in ESC. Needs >= 30 A per motor, 6S.");
assert.equal(lvl(compat(r, { motor: ips }), "escNeeded"), undefined, "built-in ESC: none needed");
assert.equal(lvl(all, "escNeeded"), undefined, "ESC picked");
// propSize: under 0.8x the sized prop fails, over 1.25x warns
assert.deepEqual([3.9, 4, 6.25, 6.3].map((inch) => lvl(compat(r, { prop: it("prop", { inch }) }), "propSize")), ["fail", "pass", "pass", "warn"]);
// frameSize: 190-270 mm; up to 15% outside warns, beyond fails
assert.deepEqual([160, 170, 190, 270, 310, 311].map((sizeMm) => lvl(compat(r, { frame: it("frame", { sizeMm }) }), "frameSize")), ["fail", "warn", "pass", "pass", "warn", "fail"]);
// packCells / motorCells / motorThrust
assert.equal(lvl(swap("battery", { cells: 4 }), "packCells"), "warn");
assert.match(swap("battery", { cells: 4 }).find((x) => x.id === "packCells").text, /sized 6S; a 4S pack gives less power/);
assert.equal(lvl(swap("motor", { maxCells: 4 }), "motorCells"), "fail", "6S on a 2-4S motor");
assert.equal(lvl(swap("motor", { minCells: 8, maxCells: 12 }), "motorCells"), "fail", "6S on an HV motor");
assert.equal(lvl(swap("motor", { maxThrustG: 999 }), "motorThrust"), "fail");
assert.equal(lvl(compat({ ...r, requirements: { pusher: { minThrustG: 2000 } } }, { pusher: it("motor", { maxThrustG: 1500 }) }), "motorThrust"), "fail", "fixed wing: pusher thrust");
// article by sound
for (const [c, a] of [["XT60", "an"], ["AS150", "an"], ["EC5", "an"], ["XT90-S", "an"], ["JST", "a"]]) assert.match(compat(r, { ...good, battery: it("battery", { ...good.battery.specs, connector: c }), esc: it("esc", { ...good.esc.specs, connector: "pads" }) }).find((x) => x.id === "connector").text, new RegExp(`solder ${a} ${c} lead`));

// ---- weightClass ----
const wc = (g, reg) => weightClass(g / 1000, reg);
const codes = (reg, gs) => gs.map((g) => wc(g, reg).code);
const G = [249, 250, 899, 900, 3999, 4000, 25000, 25001];
assert.deepEqual(codes("EU", G), ["EU-A1", "EU-C1", "EU-C1", "EU-C2", "EU-C2", "EU-A3", "EU-A3", "EU-SPEC"]);
assert.deepEqual(codes("IN", G), ["IN-NANO", "IN-NANO", "IN-MICRO", "IN-MICRO", "IN-SMALL", "IN-SMALL", "IN-SMALL", "IN-MEDIUM"]);
assert.deepEqual(codes("IN", [251, 2000, 2001, 150000, 150001]), ["IN-MICRO", "IN-MICRO", "IN-SMALL", "IN-MEDIUM", "IN-LARGE"]);
assert.deepEqual(codes("US", G), ["US-250", "US-REG", "US-REG", "US-REG", "US-REG", "US-REG", "US-REG", "US-55LB"]);
assert.deepEqual(codes("GB", G), ["UK-250", "UK-OPEN", "UK-OPEN", "UK-OPEN", "UK-OPEN", "UK-OPEN", "UK-OPEN", "UK-SPEC"]);
for (const reg of ["CA", "AU", "AE", "SG", "JP", "GLOBAL", undefined]) assert.deepEqual(codes(reg, [249, 250, 25000, 25001]), ["GEN-250", "GEN-REG", "GEN-REG", "GEN-25KG"], "generic " + reg);
assert.equal(wc(249, "EU").label, "EU A1 (self-built <250 g)");
assert.match(wc(500, "IN").note, /Digital Sky|UIN/);
assert.match(wc(500, "EU").note, /no C label/);
for (const reg of [...Object.keys(C.REGIONS), "XX"]) for (const g of G) {
  const w = wc(g, reg);
  assert.ok(w.code && w.label && ["ok", "warn", "bad"].includes(w.lvl) && w.note.endsWith("Check your local aviation authority."), `${reg} ${g} g`);
  assert.equal(w.lvl, g < 250 ? "ok" : g > 25000 ? "bad" : reg === "IN" && g === 250 ? "ok" : "warn", `${reg} ${g} g level`);
}
assert.equal(weightClass(0.25, "EU").code, "EU-C1", "0.25 kg is 250 g exactly");

// ---- partsMassG ----
const props = { ...it("prop", { inch: 5, packOf: 4 }), weightG: 4.5, packOf: 4 };
assert.deepEqual(partsMassG([{ key: "frame", it: { ...it("frame", {}), weightG: 240 }, qty: 1, pack: null },
  { key: "prop", it: props, qty: 2, pack: { sets: "set of 4", pcs: "8 props" } }], r), { partsG: 276, allowanceG: 30, totalG: 306 }, "pack: 2 x 4 pieces");
assert.equal(partsMassG([{ key: "prop", it: { ...props, units: 4 }, qty: 1, pack: {} }], r).partsG, 18, "units needed win over pack size");
assert.equal(partsMassG([{ key: "motor", it: { ...it("motor", {}), weightG: 33.3 }, qty: 4, pack: null, units: 4 }], {}).totalG, 133, "rounded, no allowance");
assert.deepEqual(partsMassG([], undefined), { partsG: 0, allowanceG: 0, totalG: 0 });

// ---- checklist and real builds: every mission/config best-pick build has no compat fail ----
const X = createState({ E, C, M, PERF });
// Every required category gets a pick, except these combos; each keeps rec.missing and the matcher's "No off-the-shelf" note.
const NEED = ["frame", "motor", "esc", "fc", "battery", "prop", "vtol", "fixedwing", "pusher"];
const GAPS = {
  // physically unreasonable: no spray VTOL or spray wing (can't hover to spray), and no VTOL interceptor (the engine warns on each)
  "agriculture/vtol": ["vtol", "pusher"], "agriculture/tiltrotor": ["prop", "vtol"], "agriculture/fixedwing": ["battery", "fixedwing"],
  "interceptor/vtol": ["vtol", "pusher"], "interceptor/tiltrotor": ["vtol"],
  // market gaps: flat octo frames are sold from ~1000 mm (Tarot X8 II, X-CAM FO1000), no FPV-size hex frames are sold, and
  // quadplane kits of 1.3-2.1 m (Nimbus V2 2.85 kg empty, Striver Mini ~7 kg TOW) weigh about as much as this 2.7-2.8 kg build
  "delivery/octo": ["frame"], "inspection/octo": ["frame"], "mapping/octo": ["frame"], "interceptor/hex": ["frame"],
  "inspection/vtol": ["vtol"], "mapping/vtol": ["vtol"],
};
let n = 0, integrated = 0;
for (const m of Object.keys(E.MISSIONS)) for (const cfg of m === "fpv" ? ["5", "7", "10"] : Object.keys(E.CONFIGURATIONS)) {
  const { S } = X.parse(m === "fpv" ? `#s=3&m=fpv&fc=${cfg}` : `#s=3&m=${m}&cfg=${cfg}`);
  const res = X.run(S); assert.ok(res?.ok, `${m}/${cfg} runs`);
  const rec = X.results(S, res).rec, picks = {};
  for (const [k, v] of Object.entries(rec)) if (Array.isArray(v) && v[0]?.category) picks[k] = v[0];
  for (const x of compat(res, picks)) {
    assert.ok(["pass", "warn", "fail"].includes(x.level) && !/NaN|undefined|null/.test(x.text), x.text);
    assert.notEqual(x.level, "fail", `${m}/${cfg}: ${x.text}`);
  }
  const want = { ...res.requirements, fixedwing: res.requirements.wing };
  const gap = GAPS[`${m}/${cfg}`] || [], mot = picks.motor || picks.pusher;
  assert.equal(rec.integratedEsc, mot?.specs.integratedEsc ? mot.id : null, `${m}/${cfg} rec.integratedEsc`);
  if (mot?.specs.integratedEsc) { // integrated power system: ESC options stay listed (the user may swap the motor), the built-in one is checked as the ESC
    assert.ok(rec.esc.length && !rec.notes.some((t) => /ESC built into/.test(t)), `${m}/${cfg} built-in ESC`);
    assert.equal(lvl(compat(res, { ...picks, esc: undefined }), "escNeeded"), undefined, `${m}/${cfg} no ESC needed`);
    assert.equal(lvl(compat(res, picks), "escExtra"), "warn", `${m}/${cfg} separate ESC flagged as not needed`);
    assert.ok(["cells", "connector", "escA"].every((id) => compat(res, picks).some((x) => x.id === id)), `${m}/${cfg} built-in ESC checked`);
    integrated++;
  }
  for (const c of NEED) if (want[c]) assert.ok(gap.includes(c) ? !rec[c].length && rec.missing.includes(c) && rec.notes.some((t) => t.includes(`No off-the-shelf ${c} `))
    : rec[c].length, `${m}/${cfg} ${c}: ${gap.includes(c) ? "listed gap is still missing, with its note" : "filled"}`);
  if (m === "fpv") assert.ok([].concat(picks.fc.specs.fpvClass ?? []).includes(cfg) && !/PX4/.test(picks.fc.specs.firmware), `fpv ${cfg}: FPV-class FC, got ${picks.fc.id}`);
  if (res.fixedWing && picks.pusher) assert.ok(picks.esc.specs.continuousA >= picks.pusher.specs.maxCurrentA, `${m}/${cfg}: ESC covers the motor's max current`);
  const cl = checklist(res, S), gps = cl.some((s) => /compass/i.test(s));
  assert.ok(cl.length >= 8 && cl.length <= 12 && cl.every((s) => typeof s === "string" && s.endsWith(".")), `${m}/${cfg} checklist`);
  assert.equal(gps, !!res.requirements.fc.needsGps, `${m}/${cfg} GPS item only for GPS builds`);
  assert.equal(cl.some((s) => /control surface/.test(s)), !!(res.vtol || res.fixedWing), `${m}/${cfg} surfaces for wings`);
  assert.ok(weightClass(res.auwKg, "EU").code, "weight class for a real build");
  n++;
}
assert.equal(n, 33, "5 missions x 6 configurations + 3 FPV classes");
assert.ok(integrated >= 1, "agriculture quad picks the X6 Plus power system");
// Every region's local picks pair up too (the matcher's pairing pass ranks across local listings).
for (const reg of Object.keys(C.REGIONS)) for (const m of Object.keys(E.MISSIONS)) for (const cfg of m === "fpv" ? ["5", "7", "10"] : Object.keys(E.CONFIGURATIONS)) {
  const { S } = X.parse((m === "fpv" ? `#s=3&m=fpv&fc=${cfg}` : `#s=3&m=${m}&cfg=${cfg}`) + `&reg=${reg}`);
  const res = X.run(S), rec = X.results(S, res).rec, picks = {};
  for (const [k, v] of Object.entries(rec)) if (Array.isArray(v) && v[0]?.category) picks[k] = v[0];
  for (const x of compat(res, picks)) assert.notEqual(x.level, "fail", `${reg} ${m}/${cfg}: ${x.text}`);
}
// tester repro: agriculture quad with F450 frame, 10 in props and a 12S pack fails on prop and frame size, warns on pack cells
const agR = X.run(X.parse("#s=3&m=agriculture&cfg=quad").S), byId = (id) => C.CATALOG.find((i) => i.id === id);
const agC = compat(agR, { frame: byId("frame-f450"), prop: byId("prop-gemfan-1050-3"), battery: byId("bat-tattu-12s16000"), fc: byId("fc-speedybee-f405"), motor: byId("motor-hw-x6-plus") });
assert.deepEqual(["propSize", "frameSize", "packCells", "motorCells"].map((id) => lvl(agC, id)), ["fail", "fail", "warn", "pass"], "agriculture F450 repro");
const fpv5 = X.run(X.parse("#s=3&m=fpv&fc=5").S);
assert.ok(!fpv5.requirements.fc.needsGps && !checklist(fpv5).some((s) => /compass/i.test(s)), "5in FPV: no compass step");
console.log("checks.test.mjs: all assertions passed");
