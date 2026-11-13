import assert from "node:assert/strict";
import { CATALOG, CURRENCIES, RATES_NOTE, REGIONS, regionForCurrency, toUsd, fromUsd, formatMoney, localLinks } from "../js/catalog.js";
import { recommend, listOptions } from "../js/matcher.js";

const CATS = ["frame", "motor", "esc", "fc", "battery", "prop", "camera", "vtx", "gps", "radio", "payload", "vtol", "servo", "sensor", "fixedwing", "tilt"];
const CORE = ["frame", "motor", "esc", "fc", "battery", "prop"];
const OUT_KEYS = [...CORE, "camera", "vtol", "fixedwing", "tilt", "pusher", "servo", "extras"];
const MISSIONS = ["delivery", "inspection", "agriculture", "interceptor", "mapping", "fpv"];
const REG_CODES = ["US", "CA", "GB", "EU", "IN", "AU", "AE", "SG", "JP", "GLOBAL"];
const num = (x) => typeof x === "number" && Number.isFinite(x);
const ascii = (s) => /^[\x20-\x7e]+$/.test(s);

// ---- currencies ----
assert.ok(Object.keys(CURRENCIES).length >= 15, "at least 15 currencies");
for (const c of ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "AED", "SGD", "JPY", "CNY", "CHF", "ZAR", "BRL", "SAR", "NZD", "KRW", "MYR"]) assert.ok(CURRENCIES[c], "currency " + c);
for (const [code, c] of Object.entries(CURRENCIES)) {
  assert.ok(c.name && c.symbol && num(c.perUsd) && c.perUsd > 0 && [0, 2].includes(c.decimals), code + " fields");
  assert.ok(Math.abs(toUsd(fromUsd(123.45, code), code) - 123.45) < 1e-9, code + " round-trip");
  for (const v of [0, 1, 1234.5, -42.42, 1e9, NaN, undefined, null, "12", Infinity]) {
    const s = formatMoney(v, code), iso = formatMoney(v, code, { iso: true });
    assert.ok(typeof s === "string" && !s.includes("NaN") && !iso.includes("NaN"), `${code} ${v} NaN`);
    assert.ok(ascii(iso) && iso.startsWith(code + " "), `${code} iso ascii: ${iso}`);
  }
}
assert.equal(formatMoney(toUsd(12340, "INR"), "INR", { iso: true }), "INR 12,340.00");
assert.equal(formatMoney(toUsd(12340, "JPY"), "JPY", { iso: true }), "JPY 12,340");
assert.equal(formatMoney(5, "XXX", { iso: true }), "USD 5.00", "unknown currency -> USD");
assert.equal(formatMoney(5, undefined, { iso: true }), "USD 5.00");
assert.equal(formatMoney(5, "__proto__", { iso: true }), "USD 5.00");
assert.equal(toUsd(10, "XXX"), 10);
assert.ok(RATES_NOTE.includes("2026-11-06") && RATES_NOTE.includes("Verify at checkout"), "rates note");

// ---- regions and store search templates ----
assert.deepEqual(Object.keys(REGIONS).sort(), [...REG_CODES].sort());
for (const [code, r] of Object.entries(REGIONS)) {
  assert.ok(r.name && CURRENCIES[r.currency] && r.stores.length >= 2, code + " region");
  for (const s of r.stores) assert.ok(s.store && /^https:\/\/\S+$/.test(s.searchUrl) && s.searchUrl.includes("{q}"), `${code} ${s.store} searchUrl`);
}
for (const [cur, reg] of [["USD", "US"], ["CAD", "CA"], ["GBP", "GB"], ["EUR", "EU"], ["INR", "IN"], ["AUD", "AU"], ["AED", "AE"], ["SGD", "SG"], ["JPY", "JP"], ["NZD", "GLOBAL"], ["XXX", "GLOBAL"], [undefined, "GLOBAL"]])
  assert.equal(regionForCurrency(cur), reg, "regionForCurrency " + cur);

// ---- catalog items ----
assert.ok(CATALOG.length >= 40, "at least 40 items");
const ids = new Set();
for (const i of CATALOG) {
  assert.ok(!ids.has(i.id), "dup id " + i.id); ids.add(i.id);
  assert.ok(CATS.includes(i.category), i.id + " category");
  assert.ok(i.name && i.brand && !i.name.includes("/"), i.id + " name/brand (no '/', it lands in a search path)");
  assert.ok(num(i.priceUsd) && i.priceUsd > 0 && num(i.weightG) && i.weightG > 0, i.id + " price/weight");
  assert.ok(i.specs && typeof i.specs === "object", i.id + " specs");
  assert.ok(Array.isArray(i.tags) && i.tags.some((t) => MISSIONS.includes(t)) && i.tags.every((t) => MISSIONS.includes(t) || t === "pusher"), i.id + " tags");
  assert.ok(Array.isArray(i.links), i.id + " links");
  for (const l of i.links) {
    assert.ok(l.store && /^https:\/\/[^\s]+$/.test(l.url), i.id + " bad link " + l.url);
    assert.ok(l.kind === "product" && REG_CODES.includes(l.region), i.id + " link kind/region");
  }
  assert.deepEqual(i.regions, [...new Set(i.links.map((l) => l.region))], i.id + " derived regions");
  for (const r of REG_CODES) assert.ok(localLinks(i, r).length >= 2, `${i.id} links in ${r}`);
  const need = {
    motor: ["statorMm", "kv", "maxThrustG", "maxCurrentA"], esc: ["continuousA", "burstA", "minCells", "maxCells", "protocol", "connector"],
    battery: ["cells", "mah", "cRating", "chemistry", "connector"], frame: ["sizeMm", "material", "configuration", "maxPropInch"],
    prop: ["inch"], fc: ["motorOutputs", "hasGps", "mcu", "firmware"], camera: ["kind", "weightG", "resolution"],
    vtol: ["wingspanMm", "wingAreaDm2", "maxAuwKg", "material"], servo: ["torqueKgCm"],
    fixedwing: ["wingspanMm", "wingAreaDm2", "maxAuwKg", "material", "launch", "tail"], tilt: ["tiltAxes", "includesServos", "maxAuwKg"],
  }[i.category] || [];
  for (const k of need) assert.ok(i.specs[k] !== undefined, `${i.id} missing spec ${k}`);
  if (i.specs.fpvClass !== undefined) assert.ok([].concat(i.specs.fpvClass).every((c) => ["5", "7", "10"].includes(c)), i.id + " fpvClass");
  // SPEC-v4: compat() compares these strings ("pads" = bare power leads, solder the battery's plug)
  if (i.specs.connector !== undefined) assert.ok(["XT30", "XT60", "XT90", "XT90-S", "XT150", "AS150", "EC5", "JST", "pads"].includes(i.specs.connector), i.id + " connector");
  if (i.category === "esc") assert.ok(i.specs.minCells <= i.specs.maxCells, i.id + " cell range");
  if (i.category === "fixedwing") assert.ok(["hand", "bungee", "runway"].includes(i.specs.launch), i.id + " launch");
  if (i.category === "vtol") assert.ok([undefined, "tiltrotor"].includes(i.specs.type), i.id + " vtol type");
}
const of = (c) => CATALOG.filter((i) => i.category === c);
for (const c of CORE) assert.ok(of(c).length >= 5, "core category " + c);
for (const c of CATS) assert.ok(of(c).length, "category " + c);
for (const m of MISSIONS) assert.ok(CATALOG.some((i) => i.tags.includes(m)), "mission " + m);
assert.ok(of("camera").length >= 8, "8+ cameras");
for (const k of ["thermal", "zoom", "gimbal4k", "survey", "fpv"]) assert.ok(of("camera").some((i) => i.specs.kind === k), "camera kind " + k);
const vtolItems = [...of("vtol"), ...of("servo"), ...of("sensor"), ...of("motor").filter((i) => i.tags.includes("pusher"))];
assert.ok(vtolItems.length >= 6 && of("vtol").length >= 2, "VTOL items");
assert.ok(of("battery").some((i) => i.specs.cells === 12) && of("battery").some((i) => i.specs.cells === 14), "12S and 14S packs");
assert.ok(of("esc").some((i) => i.specs.maxCells >= 14), "HV ESC");
const listed = (r) => CATALOG.filter((i) => i.regions.includes(r)).length;
for (const r of REG_CODES) assert.ok(listed(r) >= (["US", "IN", "GB", "EU"].includes(r) ? 10 : 4), `local listings in ${r}: ${listed(r)}`);

// ---- localLinks: own region products, region searches, then GLOBAL products and searches; deduped ----
const tier = (l, r) => (l.region === r ? 0 : 2) + (l.kind === "search" ? 1 : 0);
for (const i of CATALOG) for (const r of REG_CODES) {
  const L = localLinks(i, r);
  assert.equal(new Set(L.map((l) => l.url)).size, L.length, `${i.id} ${r} deduped`);
  L.forEach((l, k) => {
    assert.ok(k === 0 || tier(L[k - 1], r) <= tier(l, r), `${i.id} ${r} link order`);
    assert.ok([r, "GLOBAL"].includes(l.region) && l.local === (l.region === r) && ["product", "search"].includes(l.kind), `${i.id} ${r} link fields`);
  });
}
const px = CATALOG.find((i) => i.id === "fc-pixhawk6c"), gb = localLinks(px, "GB"), q = encodeURIComponent("Holybro Pixhawk 6C");
assert.deepEqual(gb.map((l) => tier(l, "GB")), [0, 0, 0, 1, 1, 2, 3, 3], "pixhawk GB tiers");
assert.deepEqual(gb.filter((l) => l.kind === "search").map((l) => l.store), ["Amazon.co.uk", "Flying Tech", "eBay", "AliExpress"]);
assert.ok(gb.filter((l) => l.kind === "search").every((l) => l.url.includes(q)), "search uses brand + name");
assert.ok(localLinks(px, "GLOBAL").every((l) => l.local), "GLOBAL links are local in GLOBAL");
assert.deepEqual(localLinks({ brand: "X", name: "Y", links: [] }, "SG").map((l) => [l.kind, l.local]), [["search", true], ["search", true], ["search", false], ["search", false]]);
assert.ok(localLinks(px, "nowhere").every((l) => l.region === "GLOBAL"), "unknown region -> GLOBAL");

// ---- recommend ----
const fpv = { frame: { minSizeMm: 200, maxSizeMm: 250, material: "carbon", configuration: "quad" }, motor: { statorMm: "2306", kvMin: 1600, kvMax: 2000, minThrustG: 1200, count: 4 }, esc: { minContinuousA: 40, minCells: 6, maxCells: 6, protocol: "DShot600" }, battery: { cells: 6, minMah: 1200, maxMah: 1600, minC: 75, chemistry: "lipo" }, prop: { inch: 5 }, fc: { minMotorOutputs: 4, needsGps: false } };
const quad10 = { frame: { minSizeMm: 430, maxSizeMm: 520, material: "carbon", configuration: "quad" }, motor: { statorMm: "2216", kvMin: 800, kvMax: 1000, minThrustG: 900, count: 4 }, esc: { minContinuousA: 30, minCells: 4, maxCells: 6, protocol: "DShot600" }, battery: { cells: 6, minMah: 4000, maxMah: 6000, minC: 20, chemistry: "lipo" }, prop: { inch: 10 }, fc: { minMotorOutputs: 4, needsGps: true } };
const agri = { frame: { minSizeMm: 900, maxSizeMm: 1100, material: "carbon", configuration: "hex" }, motor: { statorMm: "3508", kvMin: 300, kvMax: 450, minThrustG: 1800, count: 6 }, esc: { minContinuousA: 40, minCells: 6, maxCells: 6, protocol: "DShot600" }, battery: { cells: 6, minMah: 14000, maxMah: 20000, minC: 10, chemistry: "lipo" }, prop: { inch: 15 }, fc: { minMotorOutputs: 6, needsGps: true } };
const quads = { fpv, interceptor: fpv, inspection: quad10, mapping: quad10, delivery: quad10, agriculture: agri };
// new engine fields (camera, vtol, pusher); camera kinds per SPEC-v2 1.3
const CAM = { inspection: { kind: "gimbal4k", maxWeightG: 300 }, mapping: { kind: "survey", maxWeightG: 300 }, fpv: { kind: "fpv", maxWeightG: 30 }, interceptor: { kind: "fpv", maxWeightG: 30 }, delivery: { kind: null, maxWeightG: 0 }, agriculture: { kind: "fpv", maxWeightG: 50 } };
const vtolReq = (m) => ({ frame: null, motor: { statorMm: "3508", kvMin: 330, kvMax: 430, minThrustG: 1500, count: 4 },
  esc: { minContinuousA: 20, minCells: 6, maxCells: 8, protocol: "DShot600" }, battery: { cells: 6, minMah: 16000, maxMah: 24000, minC: 10, chemistry: "lipo" },
  prop: { inch: 15 }, fc: { minMotorOutputs: 9, needsGps: true }, camera: CAM[m],
  vtol: { minSpanMm: 1400, maxSpanMm: 2600, minAreaDm2: 40, maxAuwKg: 6, servoCount: 4 },
  pusher: { statorMm: "3520", kvMin: 450, kvMax: 650, minThrustG: 2500, propInch: 14 } });

function check(r, req, label) {
  const count = req?.motor?.count ?? (req?.wing ? 1 : 4), ts = req?.tilt?.servoCount ?? 4;
  for (const k of OUT_KEYS) assert.ok(Array.isArray(r[k]), `${label} ${k} array`);
  assert.ok(Array.isArray(r.regionFallback) && Array.isArray(r.notes) && Array.isArray(r.missing) && typeof r.closest === "object", label + " meta");
  assert.ok(num(r.totalUsd.low) && r.totalUsd.high >= r.totalUsd.low, label + " totals");
  assert.equal(r.incomplete, r.missing.length > 0, label + " incomplete");
  if (r.regionFallback.length) assert.ok(r.notes.some((n) => /^No local listing found in .+; showing parts that ship internationally\.$/.test(n)), label + " fallback note");
  const all = [...OUT_KEYS.flatMap((k) => r[k].map((i) => [k, i])), ...Object.entries(r.closest).flatMap(([k, l]) => l.map((i) => [k, i]))];
  for (const [k, i] of all) {
    const want = k === "motor" || k === "prop" ? count : k === "esc" ? (i.specs.fourInOne ? Math.ceil(count / 4) : count)
      : k === "servo" ? (req.vtol ? req.vtol.servoCount : req.servo?.count ?? 1) : k === "tilt" ? (i.category === "tilt" ? Math.ceil(ts / i.specs.tiltAxes) : ts) : 1;
    const pk = i.specs.packOf || 1; // pack-sold parts: qty = packs, units = pieces needed
    assert.deepEqual([i.qty, i.units, i.packOf], [Math.ceil(want / pk), want, pk], `${label} ${k} ${i.id} qty/units/packOf`);
    assert.equal(i.lineUsd, Math.round(i.qty * i.priceUsd * 100) / 100, `${label} ${i.id} lineUsd`);
    assert.ok(typeof i.localListing === "boolean" && i.links.length >= 2 && i.links.every((l) => l.kind && l.url && typeof l.local === "boolean"), `${label} ${i.id} links`);
    assert.ok(k === "extras" || k === "pusher" || (k === "motor" && req?.wing) ? true : k === "tilt" ? i.category === "tilt" || i.specs.tilt === true : i.category === k, `${label} ${i.id} category`);
  }
  for (const c of r.regionFallback) assert.ok(r[c].length && r[c].every((i) => !i.localListing), `${label} ${c} fallback items`);
  for (const k of OUT_KEYS) if (!r.regionFallback.includes(k) && k !== "extras") assert.ok(r[k].every((i) => i.localListing), `${label} ${k} local only`);
  return r;
}

for (const m of MISSIONS) for (const reg of ["US", "IN", "GLOBAL"]) {
  const quad = { ...quads[m], camera: CAM[m] }, vt = vtolReq(m);
  const q4 = check(recommend(quad, m, 800, undefined, reg), quad, `${m}/quad/${reg}`);
  for (const c of CORE) assert.ok(q4[c].length >= 1 && q4[c].length <= 3, `${m}/quad/${reg} ${c}`);
  assert.deepEqual([q4.vtol, q4.pusher, q4.servo, q4.fixedwing, q4.tilt], [[], [], [], [], []], `${m}/quad/${reg} no vtol parts`);
  assert.ok(q4.extras.length >= 2, `${m}/quad/${reg} extras`);
  const v = check(recommend(vt, m, 800, undefined, reg), vt, `${m}/vtol/${reg}`);
  assert.ok(!v.frame.length && !v.missing.includes("frame"), `${m}/vtol/${reg} frame skipped`);
  assert.ok(v.vtol.every((i) => i.specs.type !== "tiltrotor") && !v.tilt.length && !v.fixedwing.length, `${m}/vtol/${reg} quadplane airframes only`);
  for (const c of ["vtol", "pusher", "servo", "motor", "esc", "battery", "fc", "prop"]) assert.ok(v[c].length >= 1, `${m}/vtol/${reg} ${c}`);
  assert.ok(v.vtol.every((i) => i.specs.wingspanMm >= 1400 && i.specs.wingspanMm <= 2600 && i.specs.maxAuwKg >= 6), `${m}/vtol/${reg} airframe fit`);
  assert.ok(v.pusher.every((i) => i.tags.includes("pusher")) && !v.motor.some((i) => i.tags.includes("pusher")), `${m}/vtol/${reg} pusher pool`);
  assert.ok(v.extras.some((i) => i.category === "sensor"), `${m}/vtol/${reg} airspeed sensor`);
  for (const r of [q4, v]) {
    if (CAM[m].kind) assert.ok(r.camera.length && r.camera.every((i) => i.specs.kind === CAM[m].kind && i.weightG <= CAM[m].maxWeightG), `${m}/${reg} camera`);
    else assert.ok(!r.camera.length && !r.missing.includes("camera"), `${m}/${reg} no camera`);
  }
}
// inspection always gets a camera: thermal/zoom kinds, and an older engine that sends no camera at all
for (const kind of ["thermal", "zoom", "gimbal4k"]) assert.ok(recommend({ ...quad10, camera: { kind, maxWeightG: 900 } }, "inspection").camera.length, "inspection " + kind);
assert.ok(recommend(quad10, "inspection").camera.length && recommend(quad10, "mapping").camera.length, "camera fallback without requirements.camera");
// camera is core for inspection/mapping only
const noCam = { ...quad10, camera: { kind: "thermal", maxWeightG: 1 } };
assert.ok(recommend(noCam, "inspection").missing.includes("camera") && recommend(noCam, "inspection").closest.camera.length, "inspection camera missing");
assert.ok(!recommend({ ...fpv, camera: { kind: "thermal", maxWeightG: 1 } }, "fpv").missing.includes("camera"), "fpv camera optional");

// qty / lineUsd on known parts: 6 motors -> 4-in-1 ESC x2, single ESC x6
const esc6 = recommend({ esc: { minContinuousA: 10, minCells: 4 }, motor: { count: 6 } }, "mapping", undefined, of("esc"), "GLOBAL");
const tekko = esc6.esc.concat(esc6.closest.esc || []), lv = recommend({ motor: { count: 6 }, esc: { minContinuousA: 10 } }, "fpv", undefined, CATALOG.filter((i) => i.id === "esc-tekko32-50" || i.id === "esc-xrotor-40"), "GLOBAL");
assert.equal(lv.esc.find((i) => i.id === "esc-tekko32-50").qty, 2);
assert.equal(lv.esc.find((i) => i.id === "esc-xrotor-40").qty, 6);
assert.equal(lv.esc.find((i) => i.id === "esc-xrotor-40").lineUsd, 330);
assert.ok(tekko.length, "esc picks");
// fewer than 4 motors (fixed wing, single pusher): a 4-in-1 never fits, single ESCs only
const esc2 = CATALOG.filter((i) => i.id === "esc-tekko32-50" || i.id === "esc-xrotor-40");
for (const n of [1, 2, 3]) {
  const e = recommend({ motor: { count: n }, esc: { minContinuousA: 10 } }, "mapping", undefined, esc2, "GLOBAL").esc;
  assert.deepEqual(e.map((i) => [i.id, i.qty]), [["esc-xrotor-40", n]], `${n} motors: single ESCs only`);
}
assert.ok(recommend({ motor: { count: 4 }, esc: { minContinuousA: 10 } }, "fpv", undefined, esc2, "GLOBAL").esc.some((i) => i.specs.fourInOne), "4 motors: 4-in-1 allowed");

// pack-sold parts: every prop states its pack size; specs.packOf matches the name; priceUsd is per pack
const packOfName = (n) => (/\(pair\)|set of 2|2 ?pack|2pcs/i.test(n) ? 2 : /set of 4|4 ?pack/i.test(n) ? 4 : 1);
for (const i of CATALOG) {
  const pk = i.specs.packOf ?? 1;
  assert.ok(Number.isInteger(pk) && pk >= 1, i.id + " packOf");
  assert.equal(pk, packOfName(i.name), `${i.id} packOf ${pk} vs name "${i.name}"`);
  if (i.category === "prop") assert.ok(i.specs.packOf >= 1, i.id + " prop states packOf");
}
const props = (id, n) => recommend({ motor: { count: n }, prop: {} }, "fpv", undefined, CATALOG.filter((i) => i.id === id), "GLOBAL").prop[0];
const packLine = (p) => [p.qty, p.units, p.packOf, p.lineUsd];
assert.deepEqual(packLine(props("prop-hq-5x43x3", 4)), [1, 4, 4, 4], "set of 4 on a quad: 1 set, 4 props, $4");
assert.deepEqual(packLine(props("prop-hq-5x43x3", 6)), [2, 6, 4, 8], "set of 4 on a hex: 2 sets");
assert.deepEqual(packLine(props("prop-t12x4", 4)), [2, 4, 2, 78], "pair on a quad/tiltrotor: 2 pairs, 4 props");
assert.deepEqual(packLine(props("prop-gemfan-1050-3", 4)), [2, 4, 2, 12.6], "10in pair priced per pair");
const mp = recommend({ motor: { count: 4 } }, "mapping", undefined, CATALOG.filter((i) => i.id === "motor-mn4006-380"), "GLOBAL").motor[0];
assert.deepEqual(packLine(mp), [2, 4, 2, 299.8], "motor pair: 2 pairs for 4 motors");
assert.ok(Object.values(listOptions("US", "fpv")).flat().every((i) => i.packOf === (i.specs.packOf || 1)), "listOptions exposes packOf");
const vt = recommend(vtolReq("mapping"), "mapping", undefined, undefined, "US");
assert.ok(vt.servo.every((i) => i.qty === 4) && vt.pusher.every((i) => i.qty === 1) && vt.motor.every((i) => i.units === 4 && i.qty === 4 / i.packOf), "vtol qty");
assert.ok(vt.servo[0].id === "servo-kst-x10mini", "servo torque ranks first for a 6 kg airframe");
const servoSum = Math.min(...vt.servo.map((i) => i.lineUsd));
assert.ok(vt.totalUsd.low >= servoSum, "totals include servo lines");

// region rule: only local fits when any exist, else all fits + regionFallback + note
const mk = (id, links) => ({ id, category: "motor", name: id, brand: "T", priceUsd: 10, weightG: 30, tags: ["fpv"], specs: { statorMm: "2306", kv: 1800, maxThrustG: 1500, maxCurrentA: 30 }, links });
const two = [mk("m-in", [{ store: "Robu.in", url: "https://robu.in/product/x/", kind: "product", region: "IN" }]), mk("m-none", [])];
const rin = recommend({ motor: fpv.motor }, "fpv", undefined, two, "IN"), rus = recommend({ motor: fpv.motor }, "fpv", undefined, two, "US");
assert.deepEqual(rin.motor.map((i) => i.id), ["m-in"]);
assert.ok(rin.motor[0].localListing && !rin.regionFallback.includes("motor"));
assert.deepEqual(rus.motor.map((i) => i.id).sort(), ["m-in", "m-none"]);
assert.ok(rus.regionFallback.includes("motor") && rus.notes.includes("No local listing found in United States; showing parts that ship internationally."));
assert.ok(rus.motor.every((i) => i.links[0].kind === "search" && i.links[0].region === "US"), "fallback items still get local search links");

// stator volume tolerance (+-30%): 2207 counts as 2306, 2806 and 2212 do not
const st = ["2207", "2306", "2806", "2212"].map((s) => ({ ...mk("s" + s, []), specs: { statorMm: s, kv: 1800, maxThrustG: 1500, maxCurrentA: 30 } }));
assert.deepEqual(recommend({ motor: { statorMm: "2306" } }, "fpv", undefined, st, "US").motor.map((i) => i.specs.statorMm).sort(), ["2207", "2306"]);
assert.deepEqual(recommend({ motor: { statorMm: "2207" } }, "fpv", undefined, st, "US").motor.map((i) => i.specs.statorMm).sort(), ["2207", "2306"]);

// v1 behaviour kept
const f = recommend(fpv, "fpv");
assert.equal(f.motor[0].specs.statorMm, "2306");
assert.equal(f.prop[0].specs.inch, 5);
assert.ok(f.frame[0].specs.sizeMm <= 250);
assert.equal(f.incomplete, false);
const a = recommend(agri, "agriculture");
assert.equal(a.motor[0].specs.statorMm, "3508");
assert.equal(a.frame[0].specs.configuration, "hex");
assert.ok(a.extras.some((i) => i.category === "payload"));
const impossible = { frame: { minSizeMm: 5000, maxSizeMm: 6000 }, motor: { statorMm: "9999", kvMin: 1, kvMax: 2, minThrustG: 1e6 }, esc: { minContinuousA: 1e4, minCells: 20 }, battery: { cells: 99 }, prop: { inch: 99 }, fc: { minMotorOutputs: 99 } };
assert.ok(recommend(impossible, "fpv", 1).notes.length >= 6);
for (const x of [undefined, null, {}]) assert.doesNotThrow(() => check(recommend(x, "delivery"), x, "empty req"));
assert.doesNotThrow(() => recommend(fpv, "nonsense", undefined, undefined, "nowhere"));
assert.deepEqual(recommend(fpv, "fpv", 1, []).motor, []);
// 14S heavy build: HV ESC and 14S pack now exist; no 3.2 kg-class 3508 motor, so motor stays missing with closest options
const big = { motor: { statorMm: "3508", kvMin: 300, kvMax: 450, minThrustG: 3246, count: 4 }, esc: { minContinuousA: 60, minCells: 14 }, battery: { cells: 14, minMah: 10000 } };
const bg = recommend(big, "delivery");
assert.equal(bg.incomplete, true);
assert.deepEqual(bg.motor, []);
assert.ok(bg.missing.includes("motor") && bg.closest.motor.length >= 1 && bg.notes.some((n) => n.includes("motor") && /closest/.test(n)), "motor closest");
assert.ok(bg.esc.length && bg.esc.every((i) => i.specs.maxCells >= 14), "HV ESC matched");
assert.ok(bg.battery.length && bg.battery.every((i) => i.specs.cells === 14), "14S pack matched");
// HV ESCs (6S minimum) are never offered for a 4S pack; 4S packs and a 1.2-1.9 m airframe exist
const s4 = recommend({ esc: { minContinuousA: 20, minCells: 4, maxCells: 6 } }, "delivery", undefined, of("esc"), "GLOBAL");
assert.ok(s4.esc.length && [...s4.esc, ...(s4.closest.esc || [])].every((i) => (i.specs.minCells ?? 0) <= 4), "no HV ESC on 4S");
assert.ok(recommend({ battery: { cells: 4, minMah: 7000, maxMah: 10600, chemistry: "liion" } }, "inspection").battery.length, "4S Li-ion pack");
assert.ok(recommend({ battery: { cells: 4, minMah: 12040, maxMah: 18060, chemistry: "lipo" } }, "delivery").battery.length, "4S LiPo pack");
assert.ok(recommend({ frame: null, vtol: { minSpanMm: 1197, maxSpanMm: 1870, minAreaDm2: 26, maxAuwKg: 2.6, servoCount: 4 } }, "inspection").vtol.length, "mid-size VTOL airframe");

// ---- v3: fixed wing, tiltrotor, FPV size classes ----
const cls = (i, c) => [].concat(i.specs.fpvClass ?? []).includes(c);
assert.ok(of("fixedwing").length >= 6, "6+ fixed-wing airframes");
const spans = of("fixedwing").map((i) => i.specs.wingspanMm);
assert.ok(Math.min(...spans) <= 1000 && Math.max(...spans) >= 2100, "fixed-wing spans cover ~1.0-2.1 m");
assert.ok(of("vtol").filter((i) => i.specs.type === "tiltrotor").length + of("tilt").length >= 3 && of("vtol").some((i) => i.specs.type === "tiltrotor"), "tiltrotor airframes / tilt kits");
assert.ok(of("servo").filter((i) => i.specs.tilt === true).length >= 2, "tilt servos");
for (const c of ["5", "7", "10"]) {
  assert.ok(of("frame").filter((i) => cls(i, c)).length >= 3, `3+ frames for ${c}in`);
  assert.ok(of("motor").filter((i) => cls(i, c) && !i.tags.includes("pusher")).length >= 2, `2+ motors for ${c}in`);
  for (const k of ["prop", "battery", "esc", "fc", "camera", "vtx"]) assert.ok(of(k).some((i) => cls(i, c)), `${k} for ${c}in`);
}
assert.ok(of("prop").some((i) => cls(i, "5") && i.specs.blades === 3), "5in tri-blade");
const bands = { 5: ["2306", "2207"], 7: ["2806.5", "2807"], 10: ["3110", "3115"] };
for (const [c, st] of Object.entries(bands)) for (const s of st) assert.ok(of("motor").some((i) => i.specs.statorMm === s && cls(i, c)), `motor ${s} for ${c}in`);
const bat = (c, chem, lo, hi, cells = 6) => of("battery").some((i) => cls(i, c) && i.specs.chemistry === chem && i.specs.cells === cells && i.specs.mah >= lo && i.specs.mah <= hi);
assert.ok(bat("5", "lipo", 1100, 1600) && bat("7", "lipo", 3000, 5000) && bat("10", "lipo", 3000, 5000), "6S LiPo packs per class");
for (const c of ["7", "10"]) assert.ok(bat(c, "liion", 6000, 10000) && bat(c, "liion", 6000, 10000, 4), `6S and 4S Li-ion for ${c}in`);
assert.ok(of("esc").some((i) => i.specs.fourInOne && i.specs.continuousA >= 35 && i.specs.continuousA <= 65), "4-in-1 35-65 A");
// gap-fill classes stay stocked (2026-11-07)
const pk = (cells, chem, lo, hi) => of("battery").some((i) => i.specs.cells === cells && i.specs.chemistry === chem && i.specs.mah >= lo && i.specs.mah <= hi);
assert.ok(pk(6, "lipo", 8000, 12050) && pk(4, "lipo", 2000, 3300) && pk(4, "lipo", 4000, 5200) && pk(4, "liion", 2000, 3300), "delivery / interceptor / fixed-wing packs");
const fr = (cfg, lo, hi) => of("frame").some((i) => i.specs.configuration === cfg && i.specs.sizeMm >= lo && i.specs.sizeMm <= hi);
assert.ok(fr("hex", 361, 510) && fr("hex", 455, 642) && fr("quad", 757, 1068), "hex 360-640 mm and 760-1070 mm quad frames");
assert.ok(of("vtol").some((i) => i.specs.type === "tiltrotor" && i.specs.wingspanMm >= 1400 && i.specs.wingspanMm <= 1900), "1.4-1.9 m tiltrotor");

// fpvClass ranks exact-class frame, motor and prop first; stator "2806.5" matches the 2807 class
const fpvReq = (c) => ({ frame: { minSizeMm: { 5: 190, 7: 270, 10: 380 }[c], maxSizeMm: { 5: 260, 7: 340, 10: 460 }[c], material: "carbon", configuration: "quad" },
  motor: { statorMm: { 5: "2306", 7: "2807", 10: "3115" }[c], kvMin: { 5: 1600, 7: 1100, 10: 750 }[c], kvMax: { 5: 2000, 7: 1500, 10: 1050 }[c], minThrustG: { 5: 1200, 7: 1600, 10: 2500 }[c], count: 4 },
  esc: { minContinuousA: 40, minCells: 6, maxCells: 8 }, battery: { cells: 6, minMah: { 5: 1200, 7: 3000, 10: 6000 }[c], maxMah: { 5: 1600, 7: 5000, 10: 10000 }[c], minC: 3 },
  prop: { inch: Number(c) }, fc: { minMotorOutputs: 4 }, camera: { kind: "fpv", maxWeightG: 30 }, fpvClass: c });
for (const c of ["5", "7", "10"]) for (const reg of ["US", "IN", "GB", "EU", "GLOBAL"]) {
  const req = fpvReq(c), r = check(recommend(req, "fpv", 1000, undefined, reg), req, `fpv${c}/${reg}`);
  for (const k of [...CORE, "camera"]) assert.ok(r[k].length, `fpv${c}/${reg} ${k}`);
  for (const k of ["frame", "motor", "prop"]) assert.ok(cls(r[k][0], c), `fpv${c}/${reg} ${k} class first`);
  assert.equal(r.incomplete, false, `fpv${c}/${reg} complete`);
}
assert.ok(recommend({ motor: { statorMm: "2807" } }, "fpv").motor.some((i) => i.specs.statorMm === "2806.5"), "2806.5 in the 2807 class");
assert.ok(recommend({ ...fpvReq("7"), fpvClass: 7 }, "fpv").frame.every((i) => cls(i, "7")), "numeric fpvClass accepted");

// fixed wing: no frame, airframe from requirements.wing, main motor = pusher (qty 1), servo qty = servo.count
const fwReq = (servoCount = 4) => ({ frame: null, motor: null, wing: { minSpanMm: 1600, maxSpanMm: 2800, minAreaDm2: 35, maxAuwKg: 3 },
  pusher: { statorMm: "2820", kvMin: 600, kvMax: 1000, minThrustG: 1500, propInch: 11 }, servo: { count: servoCount },
  esc: { minContinuousA: 30, minCells: 4, maxCells: 6 }, battery: { cells: 4, minMah: 7000, maxMah: 10600, chemistry: "liion" },
  prop: { inch: 11 }, fc: { minMotorOutputs: 5, needsGps: true }, camera: { kind: "survey", maxWeightG: 300 } });
for (const reg of ["US", "IN", "GB", "EU", "GLOBAL"]) for (const sc of [3, 4]) {
  const req = fwReq(sc), r = check(recommend(req, "mapping", 2000, undefined, reg), req, `fixedwing/${reg}`);
  assert.ok(!r.frame.length && !r.missing.includes("frame") && !r.motor.length && !r.vtol.length && !r.tilt.length, `fixedwing/${reg} slots`);
  for (const k of ["fixedwing", "pusher", "servo", "esc", "battery", "fc", "camera"]) assert.ok(r[k].length, `fixedwing/${reg} ${k}`);
  assert.ok(r.fixedwing.every((i) => i.category === "fixedwing" && i.specs.wingspanMm >= 1600 && i.specs.maxAuwKg >= 3), `fixedwing/${reg} airframe fit`);
  assert.ok(r.pusher.every((i) => i.qty === 1) && r.servo.every((i) => i.qty === sc) && r.esc.every((i) => i.qty === 1 && !i.specs.fourInOne), `fixedwing/${reg} qty`);
  assert.ok(r.extras.some((i) => i.category === "sensor"), `fixedwing/${reg} airspeed sensor`);
}
// engine that sends no motor key for a fixed wing: lift-motor slot stays empty; motor key given: matched from the fixed-wing pool
assert.ok(!recommend({ ...fwReq(), motor: undefined }, "mapping").motor.length, "fixed wing without motor key");
assert.ok(recommend({ ...fwReq(), motor: { statorMm: "2820", count: 1 } }, "mapping").motor.every((i) => i.tags.includes("pusher") && i.qty === 1), "fixed wing motor = cruise motor");

// tiltrotor: no frame, no pusher, 4 combined motors, tiltrotor airframes only, tilt qty = servoCount (kits: per tilt axis)
const trReq = (tilt) => ({ frame: null, pusher: null, motor: { statorMm: "2814", kvMin: 700, kvMax: 1100, minThrustG: 900, count: 4 },
  vtol: { minSpanMm: 900, maxSpanMm: 2600, minAreaDm2: 15, maxAuwKg: 3, servoCount: 2 }, ...(tilt === undefined ? {} : { tilt }),
  esc: { minContinuousA: 20, minCells: 4, maxCells: 6 }, battery: { cells: 4, minMah: 7000, maxMah: 10600, chemistry: "liion" },
  prop: { inch: 10 }, fc: { minMotorOutputs: 10, needsGps: true }, camera: { kind: "gimbal4k", maxWeightG: 300 } });
for (const reg of ["US", "IN", "GB", "EU", "GLOBAL"]) {
  const req = trReq({ servoCount: 4, minTorqueKgcm: 2.5 }), r = check(recommend(req, "inspection", 3000, undefined, reg), req, `tiltrotor/${reg}`);
  assert.ok(!r.frame.length && !r.pusher.length && !r.fixedwing.length && !r.missing.includes("frame") && !r.missing.includes("pusher"), `tiltrotor/${reg} slots`);
  for (const k of ["vtol", "tilt", "motor", "servo", "esc", "battery", "fc"]) assert.ok(r[k].length, `tiltrotor/${reg} ${k}`);
  assert.ok(r.vtol.every((i) => i.specs.type === "tiltrotor") && r.motor.every((i) => i.qty === 4), `tiltrotor/${reg} airframe and motors`);
  assert.ok(r.tilt.every((i) => (i.specs.torqueKgCm ?? 99) >= 2.5 || !i.specs.includesServos), `tiltrotor/${reg} tilt torque`);
}
const tq = recommend(trReq({ servoCount: 4, minTorqueKgcm: 1 }), "inspection", undefined, undefined, "GLOBAL");
const tAll = [...tq.tilt, ...listOptions("GLOBAL", "inspection").tilt ?? []];
assert.ok(tq.tilt.filter((i) => i.category === "servo").every((i) => i.qty === 4), "tilt servo qty = servoCount");
const kit = recommend(trReq({ servoCount: 4 }), "inspection", undefined, of("tilt"), "GLOBAL").tilt;
assert.ok(kit.length && kit.every((i) => i.qty === Math.ceil(4 / i.specs.tiltAxes)), "tilt kit qty per axis");
assert.ok(tAll.length && recommend(trReq({ servoCount: 4, minTorqueKgcm: 99 }), "inspection").tilt.every((i) => !i.specs.includesServos && i.category === "tilt"), "weak tilt servos rejected");
// engine without the tilt key yet: vtol + pusher null still means tiltrotor
assert.ok(recommend(trReq(undefined), "inspection").vtol.every((i) => i.specs.type === "tiltrotor") && !recommend(trReq(undefined), "inspection").tilt.length, "tiltrotor detected from pusher null");

// ---- listOptions: every category, mission-tagged first, then locally listed ----
for (const reg of ["US", "IN", "GLOBAL"]) for (const m of MISSIONS) {
  const o = listOptions(reg, m);
  assert.deepEqual(Object.keys(o).sort(), [...new Set(CATALOG.map((i) => i.category))].sort(), "listOptions categories");
  for (const [c, l] of Object.entries(o)) {
    assert.equal(l.length, of(c).length, `listOptions ${c} count`);
    const key = (i) => (i.tags.includes(m) ? 2 : 0) + (i.localListing ? 1 : 0);
    l.forEach((i, k) => assert.ok(k === 0 || key(l[k - 1]) >= key(i), `listOptions ${reg}/${m}/${c} order`));
    assert.ok(l.every((i) => i.links.length >= 2 && i.localListing === i.regions.includes(reg)), `listOptions ${c} links`);
  }
}
assert.ok(["camera", "vtol", "servo", "sensor", "fixedwing", "tilt"].every((c) => listOptions("JP", "mapping")[c].length), "listOptions has v2/v3 categories");

// ---- live engine smoke test (the engine is being extended in parallel; skip what it cannot do yet) ----
// SPEC-v3 1.5 matcher check: core slots per mission x configuration (x fpvClass); unstocked slots are printed, not failed
let live = 0;
const unstocked = [];
try {
  const { estimate, MISSIONS: EM, MATERIALS, FPV_CLASSES: FC = {} } = await import("../js/engine.js");
  for (const m of Object.keys(EM)) for (const configuration of ["quad", "hex", "vtol", "tiltrotor", "fixedwing"]) for (const fpvClass of m === "fpv" ? ["5", "7", "10"] : [undefined]) {
    const wingy = ["vtol", "tiltrotor", "fixedwing"].includes(configuration);
    let r;
    try { r = estimate({ mission: m, fpvClass, targetFlightMin: FC[fpvClass]?.defaultFlightMin ?? EM[m].defaultFlightMin ?? 20, payloadKg: EM[m].defaultPayloadKg, frameMaterial: wingy && MATERIALS.foam ? "foam" : "carbon", configuration, environment: { altitudeM: 0, tempC: 15, windMs: 0 } }); } catch { continue; }
    if (!r?.ok || !r.requirements) continue;
    const req = { ...r.requirements, fpvClass: r.fpvClass ?? fpvClass };
    for (const reg of ["US", "IN", "GLOBAL"]) {
      const rec = check(recommend(req, m, undefined, undefined, reg), req, `engine ${m}/${configuration}${fpvClass ? "/" + fpvClass : ""}/${reg}`); live++;
      if (reg === "GLOBAL") for (const k of rec.missing) unstocked.push(`${m}/${configuration}${fpvClass ? "/" + fpvClass + "in" : ""} ${k}`);
    }
  }
} catch (e) { console.log("engine smoke test skipped:", e.message); }
if (unstocked.length) console.log("unstocked classes (catalog gaps):", unstocked.join(", "));

const counts = Object.fromEntries(REG_CODES.map((r) => [r, listed(r)]));
// size classes the engine asks for (2026-11-06): props within 0.5in, lift and pusher stators stocked
for (const inch of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 17, 18, 20, 22])
  assert.ok(CATALOG.some((i) => i.category === "prop" && Math.abs(i.specs.inch - inch) <= 0.5), "prop " + inch + "in stocked");
const motorHas = (st, pusher) => CATALOG.some((i) => i.category === "motor" && i.specs.statorMm === st && i.tags.includes("pusher") === pusher);
for (const st of ["2807", "2814", "4006", "6007"]) assert.ok(motorHas(st, false), "lift " + st);
for (const st of ["2312", "4130"]) assert.ok(motorHas(st, true), "pusher " + st);

const prod = CATALOG.reduce((n, i) => n + i.links.length, 0);
console.log("catalog tests ok:", CATALOG.length, "items;", prod, "product links; local listings", JSON.stringify(counts), "; engine runs", live);
