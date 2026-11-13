// SPEC-v4 UI logic: measured weight (hash + rerun), library storage, part deltas, glossary, PDF sections, hostile names in new HTML.
import assert from "node:assert/strict";
import * as E from "../js/engine.js";
import * as C from "../js/catalog.js";
import * as M from "../js/matcher.js";
import * as PERF from "../js/ui/perf.js";
import * as CHK from "../js/checks.js";
import { createState, mwOf, MW, hoverBand } from "../js/ui/state.js";

// Hover band on thrust share 100/TWR, with the mission's minimum TWR from the engine (never hard-coded mission ids).
const XB = createState({ E }), minOf = (h) => { const s = XB.parse(h).S; return XB.minTwr(s, XB.run(s)); };
const mapMin = minOf("#s=3&m=mapping"), fpvMin = minOf("#s=3&m=fpv&fc=5"), intMin = minOf("#s=3&m=interceptor");
assert.ok(mapMin < 3 && fpvMin >= 3 && intMin >= 3, `minTWR mapping ${mapMin}, fpv ${fpvMin}, interceptor ${intMin}`);
assert.equal(hoverBand(2, mapMin)[0], "good"); assert.match(hoverBand(2, mapMin)[1], /^50% of max thrust to hover/);
assert.equal(hoverBand(4, mapMin)[0], "warn", "overpowered is warn, never bad"); assert.match(hoverBand(4, mapMin)[1], /overpowered/);
assert.equal(hoverBand(1.7, 1.5)[0], "warn", "59% share, above its minimum"); assert.equal(hoverBand(1.7, mapMin)[0], mapMin > 1.7 ? "bad" : "warn"); assert.equal(hoverBand(2.5, mapMin)[0], "good", "40% edge");
assert.equal(hoverBand(7, fpvMin)[0], "good"); assert.match(hoverBand(7, fpvMin)[1], /racer or interceptor/);
assert.equal(hoverBand(2, intMin)[0], "bad", "under the interceptor minimum"); assert.equal(hoverBand(intMin, intMin)[0], "good");
for (const m of [mapMin, fpvMin, null]) assert.equal(hoverBand(1.4, m)[0], "bad", "71% is bad on any mission");
assert.equal(hoverBand(0, mapMin), null); assert.equal(hoverBand(NaN, mapMin), null);
import { delta, gl, GLOSSARY, partsHtml, section, dockHtml } from "../js/ui/parts.js";
import { wiringRows } from "../js/ui/wiring.js";
import { createLibrary, compareRow, cmpHtml, libHtml, LIB_KEY, LIB_MAX } from "../js/ui/library.js";
import { buildBomPdf } from "../js/ui/pdf.js";

const X = createState({ E, C, M, PERF, CHK });
const EVIL = "<img src=x onerror=alert(1)>\"'&";

// mw: plain grams in 1..200000 only; garbage from the hash is dropped, never kept as an error value.
assert.equal(X.parse("#s=3&m=inspection&mw=2100").S.mw, 2100);
for (const g of ["abc", "-5", "1e9", "1e3", "<x>", "0", "200001", "", " ", "NaN", "Infinity", "0x10"]) assert.equal(X.parse(`#s=3&m=inspection&mw=${encodeURIComponent(g)}`).S.mw, "", `mw=${g} rejected`);
assert.equal(mwOf(MW.max), MW.max); assert.equal(mwOf(MW.min), MW.min); assert.equal(mwOf("12.5"), 12.5);
const base = X.parse("#s=3&m=inspection&n=Inspect").S;
assert.ok(!X.hashOf(base, 3).includes("mw="), "no mw: hash as before");
assert.ok(X.hashOf({ ...base, mw: 2100 }, 3).includes("mw=2100"), "mw round trips");
assert.equal(X.parse(X.hashOf({ ...base, mw: 2100 }, 3)).S.mw, 2100);

// runMeasured: heavier -> shorter flight, lower TWR, higher throttle; lighter -> longer. Parts stay matched to the estimate.
const est = X.run(base), g0 = Math.round(est.auwKg * 1000);
const heavy = X.runMeasured({ ...base, mw: g0 + 400 }), light = X.runMeasured({ ...base, mw: g0 - 200 }), same = X.runMeasured({ ...base, mw: g0 });
assert.equal(heavy.err, ""); assert.ok(heavy.r.estFlightMin < est.estFlightMin, `heavier is shorter: ${heavy.r.estFlightMin} < ${est.estFlightMin}`);
assert.ok(heavy.r.twr < est.twr && heavy.r.hoverThrottlePct > est.hoverThrottlePct, "heavier: lower TWR, more throttle");
assert.ok(light.r.estFlightMin > est.estFlightMin, "lighter is longer");
assert.ok(Math.abs(same.r.estFlightMin - est.estFlightMin) <= 0.2, "measured = estimate: same flight time");
assert.equal(heavy.r.measuredG, g0 + 400); assert.equal(heavy.r.batteryMah, est.batteryMah, "same pack");
const far = X.runMeasured({ ...base, mw: 200000 }, est);
assert.ok(far.err && far.r === est, "out of the build's range: field error, estimate kept");
assert.equal(X.runMeasured(base, est).r, est, "no mw: estimate");
const R = X.results({ ...base, mw: g0 + 400 }, est);
assert.equal(R.r.estFlightMin, heavy.r.estFlightMin); assert.equal(R.est, est, "results keep the estimate for parts and mass");
// Fixed wing and VTOL also take a measured weight.
for (const cfg of ["fixedwing", "vtol"]) {
  const s = X.parse(`#s=3&m=mapping&cfg=${cfg}`).S, e = X.run(s), m = X.runMeasured({ ...s, mw: Math.round(e.auwKg * 1150) });
  assert.ok(!m.err && m.r.estFlightMin < e.estFlightMin, `${cfg}: heavier is shorter`);
}
// Best pack (round 2): only packs that keep T:W >= the mission minimum; wording from the reason, never a hard-coded "2x".
const mt0 = X.minTwr(base, est), bp = X.bestPack(est, mt0);
assert.ok(bp && bp.wh > 0 && ["peak", "twrLimit", "rangeEnd"].includes(bp.reason), `best pack ${JSON.stringify(bp)}`);
if (!est.performance.batteryBest) assert.ok((est.twr * est.auwKg) / est.performance.battery.find((q) => q.wh === bp.wh).auwKg >= mt0, "best pack still flies");
const fake = (pts, best) => ({ ...est, twr: 2, auwKg: 1, batteryWh: 100, batteryMah: 5000, performance: { battery: pts, batteryBest: best } });
const P3 = [{ wh: 50, flightMin: 10, auwKg: 0.8 }, { wh: 100, flightMin: 15, auwKg: 1 }, { wh: 200, flightMin: 14, auwKg: 1.2 }];
assert.equal(X.bestPack(fake(P3), 1.5).reason, "peak"); assert.match(X.packText(X.bestPack(fake(P3), 1.5), 1.5).line, /^Best pack: 100 Wh \(5000 mAh\), 15.0 min\. Bigger packs fly shorter\.$/);
const P4 = [{ wh: 50, flightMin: 10, auwKg: 0.8 }, { wh: 100, flightMin: 15, auwKg: 1 }, { wh: 300, flightMin: 20, auwKg: 1.6 }];
const tl = X.bestPack(fake(P4), 1.5);
assert.equal(tl.reason, "twrLimit"); assert.equal(tl.wh, 100, "1.6 kg pack gives T:W 1.25 < 1.5: not offered");
assert.equal(X.packText(tl, 1.5).line, "This pack is already the largest that keeps T:W >= 1.5. A bigger pack needs stronger motors or bigger props.", "about 1x: no (1.0x) wording");
assert.ok(!X.packText({ ...tl, mult: 1.04 }, 1.5).more.includes("×"));
assert.match(X.packText({ ...tl, wh: 150, mult: 1.5 }, 1.5).line, /^Largest pack that keeps T:W >= 1.5: 150 Wh, 15.0 min \(1.5× this pack\)/);
const re = X.bestPack(fake(P4), null);
assert.equal(re.reason, "rangeEnd"); assert.equal(X.packText(re).line, "300+ Wh, still rising at 3.0× this pack");
assert.equal(X.bestPack(fake(P4, { wh: 80, flightMin: 12, reason: "peak" }), 1.5).wh, 80, "engine batteryBest wins");
assert.ok(!/2x/.test(JSON.stringify(X.pdfDoc(X.results(base, est), base, "2026-11-08").specs)), "no hard-coded 2x");
// Measured T:W under the mission minimum: a caution and a bad band.
const tw = X.runMeasured({ ...base, mw: 2000 }, est).r;
assert.ok(tw.twr < mt0 && tw.warnings.some((w) => /thrust : weight is [\d.]+, below the Inspection minimum of 2: fit stronger motors or bigger props\./.test(w)), tw.warnings.join(" | "));
assert.deepEqual(hoverBand(tw.twr, mt0).slice(0, 1), ["bad"]); assert.match(hoverBand(1.84, 2)[1], /under the mission minimum of 2/);
assert.ok(!X.runMeasured({ ...base, mw: g0 }, est).r.warnings.some((w) => /below the .* minimum/.test(w)), "no T:W caution at the estimate");

// Library: injectable store (Map), max 20, untrusted entries re-parsed, rename updates the hash name, delete.
const map = new Map(), store = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
let t = 1;
const L = createLibrary(X, store, () => t++);
assert.deepEqual(L.list(), []);
const s1 = L.save({ ...base, name: EVIL }, "Inspection");
assert.ok(s1.ok && L.list().length === 1 && L.list()[0].name === EVIL);
L.save({ ...base, name: EVIL }); assert.equal(L.list().length, 1, "same build saved twice: one entry");
for (let i = 0; i < 25; i++) L.save({ ...base, name: `B${i}`, targetFlightMin: 10 + i });
assert.equal(L.list().length, LIB_MAX, "capped at 20");
assert.equal(L.list()[0].name, "B24", "newest first");
const id = L.list()[0].id;
L.rename(id, "Renamed\u0000 one");
assert.equal(L.list()[0].name, "Renamed one"); assert.equal(X.parse(L.list()[0].hash).S.name, "Renamed one", "rename reaches the hash");
L.remove(id); assert.equal(L.list().length, LIB_MAX - 1); assert.ok(!L.list().some((b) => b.id === id));
// Hostile storage: junk JSON, wrong shapes, foreign hashes, prototype keys.
map.set(LIB_KEY, "{not json"); assert.deepEqual(L.list(), []);
map.set(LIB_KEY, JSON.stringify([{ id: "a1", name: EVIL, hash: "#s=3&m=inspection&mw=abc&sel=__proto__:x", savedAt: 5 }, { id: "a2", hash: "javascript:alert(1)" }, { id: "<b>", hash: "#m=inspection" }, null, 7, { id: "a3", hash: "#m=nope" }]));
const got = L.list();
assert.equal(got.length, 1, "only the valid entry survives");
assert.ok(got[0].hash.startsWith("#s=3&m=inspection") && !got[0].hash.includes("mw=") && !got[0].hash.includes("proto"), "hash re-serialised");
map.set(LIB_KEY, JSON.stringify({ length: 3 })); assert.deepEqual(L.list(), []);
const broken = createLibrary(X, { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } });
assert.deepEqual(broken.list(), []); assert.equal(broken.save(base).ok, false, "storage errors never throw");
assert.deepEqual(createLibrary(X, null).list(), []);

// Compare: recomputed from the hash; hostile name escaped in drawer and table.
const A = { id: "x1", name: EVIL, hash: X.hashOf(base, 3), savedAt: 1 }, B = { id: "x2", name: "Hex", hash: X.hashOf({ ...base, configuration: "hex" }, 3), savedAt: 2 };
const cols = [compareRow(X, CHK, A), compareRow(X, CHK, B)];
assert.ok(cols[0].flight.endsWith("min") && cols[1].config === X.cfgLabel("hex") && cols[0].wclass !== "-");
const ch = cmpHtml(cols), lh = libHtml([A, B], { cmp: new Set(["x1", "x2"]), confirm: "x1", edit: "x2" }, cols);
for (const h of [ch, lh]) assert.ok(!h.includes("<img") && h.includes("&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;"), "name escaped");
assert.ok(lh.includes("Confirm delete") && lh.includes('class="lib-in"') && lh.includes('aria-pressed="true"'));
assert.equal(cmpHtml(cols.slice(0, 1)), "", "compare needs 2 builds");
assert.ok(libHtml([], { cmp: new Set() }, []).includes("No saved builds"));

// Delta vs the best pick: weight x pieces and price x qty, sign and direction.
const c = { qty: () => 4, money: (u) => `$${u.toFixed(0)}` };
const best = { id: "b", weightG: 30, priceUsd: 20 };
assert.deepEqual(delta({ id: "o", weightG: 33, priceUsd: 21 }, best, "motor", c), { dir: "up", text: "+12 g · +$4" });
assert.deepEqual(delta({ id: "o", weightG: 25, priceUsd: 15 }, best, "motor", c), { dir: "down", text: "−20 g · −$20" });
assert.equal(delta({ id: "o", weightG: 25, priceUsd: 25 }, best, "motor", c).dir, "same", "mixed trade is neutral");
assert.equal(delta(best, best, "motor", c), null, "no delta on the best pick itself");
// In the parts HTML: non-best cards carry a delta, in-build categories say "Similar parts".
const RR = X.results(base, est), ph = partsHtml(X.ctx(RR, base));
assert.ok(ph.includes('class="delta" data-dir=') && ph.includes("Similar parts ("), "deltas and Similar parts label");
assert.ok(!/<p class="need">[^<]*<details/.test(ph), "no <details> inside a <p>");

// Glossary: every term, escaped, label in summary.
for (const k of ["kv", "cells", "c", "twr", "hover", "wh", "stator"]) assert.ok(GLOSSARY[k] && gl(k).startsWith('<details class="gl"><summary aria-label="What is '), k);
assert.equal(gl("nope"), "");

// PDF doc: v4 sections with a selection and a measured weight; file still valid.
const sel = Object.fromEntries(["battery", "esc", "fc", "frame", "motor", "prop"].filter((k) => RR.rec[k]?.[0]).map((k) => [k, RR.rec[k][0].id]));
const S2 = { ...base, name: EVIL, sel, mw: g0 + 400 }, R2 = X.results(S2, est), doc = X.pdfDoc(R2, S2, "2026-11-08");
const titles = doc.tables.map((x) => x.title), keys = doc.specs.map((x) => x[0]);
for (const tt of ["Compatibility checks", "Weight class", "Build and first-flight checklist"]) assert.ok(titles.includes(tt), `PDF table ${tt}`);
for (const kk of ["Measured weight", "Parts mass", "Weight class", "C rating needed", "Best pack size", "Typical build cost"]) assert.ok(keys.includes(kk), `PDF spec ${kk}`);
assert.ok(doc.tables.find((x) => x.title === "Compatibility checks").rows.every(([l]) => ["Pass", "Check", "Fail"].includes(l)));
const pdf = Buffer.from(buildBomPdf(doc)).toString("latin1");
assert.ok(pdf.startsWith("%PDF-1.4") && pdf.includes("(COMPATIBILITY CHECKS) Tj") && pdf.includes("(BUILD AND FIRST-FLIGHT CHECKLIST) Tj"));
assert.ok(!/alert\(1/.test(pdf), "name escaped in PDF");
// Without checks.js the doc still builds (no v4 tables).
const X0 = createState({ E, C, M, PERF });
assert.ok(!X0.pdfDoc(X0.results(S2, est), S2, "2026-11-08").tables.some((x) => x.title === "Compatibility checks"));

// Round 1 #1: the ESC follows the picked motor. Agriculture quad: the best motor may carry a built-in ESC.
const ag = X.parse("#s=3&m=agriculture&cfg=quad").S, agR = X.results(ag, X.run(ag));
const intM = C.CATALOG.find((i) => i.category === "motor" && i.specs?.integratedEsc), plainM = agR.opts.motor.find((i) => !i.specs?.integratedEsc);
assert.ok(agR.sec.main.includes("esc"), "ESC is a main category whenever the build has motors");
const withInt = X.ctx(agR, { ...ag, sel: { motor: intM.id } }), withPlain = X.ctx(agR, { ...ag, sel: { motor: plainM.id } });
assert.ok(withInt.escFree && withInt.motor.id === intM.id && !withPlain.escFree, "escFree follows the pick");
assert.ok(section("esc", withInt).includes("Not needed: built into") && !section("esc", withPlain).includes("Not needed"), "ESC note only for a built-in-ESC motor");
assert.ok(!partsHtml(withPlain).includes("ESC built into "), "no stale matcher note");
assert.ok(dockHtml([{ key: "battery", label: "Battery", it: { name: "B" }, line: 1 }], withInt).includes("Built into the motor"));
{
  const e0 = agR.rec.esc?.[0] || agR.opts.esc[0], cx = { ...withInt, rec: { ...agR.rec, motor: [intM], esc: [e0] } }, d = delta(plainM, intM, "motor", cx);
  const plain = delta(plainM, intM, "motor", { ...cx, rec: { ...cx.rec, esc: [] } }), num = (t) => Number(t.match(/^[+−](\d+) g/)[1]) * (t[0] === "−" ? -1 : 1);
  assert.ok(d.text.endsWith(" incl. ESC") && num(d.text) > num(plain.text), `alternate without built-in ESC adds the ESC weight: ${d.text} vs ${plain.text}`);
}

// #3 KPI glossary names the thrust share; #4 measured mass re-derives the AUW warnings; Fig 2/6 use it, Figs 1/3/5 say "estimate".
assert.match(GLOSSARY.hover[1], /share of full thrust/);
const fp = X.parse("#s=3&m=fpv&fc=5&t=1&p=0&reg=EU").S, fpE = X.run(fp);
if (fpE.auwKg > 0.25) {
  const m249 = X.runMeasured({ ...fp, mw: 249 }, fpE);
  assert.equal(m249.err, ""); assert.ok(!m249.r.warnings.some((w) => /AUW above 250 g/.test(w)), "249 g: no 250 g warning");
}
const big = X.runMeasured({ ...base, mw: g0 + 600 }, est).r;
assert.ok(big.warnings.some((w) => /^AUW above 250 g/.test(w)) && big.weights.measuredExtraG > 0);
const ph2 = PERF.renderPerformance(big, { missionLabel: "Inspection" });
assert.ok(ph2.includes("Speed polar (estimate)") && ph2.includes("Battery sweep (estimate)") && ph2.includes("Mission profile (estimate)"), "estimate-only figures are labelled");
assert.ok(ph2.includes("Measured, not in the estimate") && new RegExp(`Takeoff mass ${(g0 + 600).toLocaleString("en-US")} g`).test(ph2.replace(/&#39;|&quot;/g, "")), "Fig 6 sums to the measured mass");
assert.ok(ph2.includes(`Your measured ${(g0 + 600).toLocaleString("en-US")} g flies like`), "Fig 2 marks the measured point");
assert.ok(!PERF.renderPerformance(est, {}).includes("(estimate)"), "no labels without a measured weight");

// #8 budget warning in the chosen currency.
const bS = { ...base, cur: "INR", budget: 1000 }, bR = X.run(bS), bw = X.warnsOf(bS, bR);
if (bR.warnings.some((w) => /^Estimated core parts cost/.test(w))) assert.ok(bw.some((w) => w.includes("₹") && !w.includes("$")), `budget warning in INR: ${bw.join(" | ")}`);
// #10 wiring: the picked battery's connector replaces the estimate.
assert.ok(wiringRows(est, "inspection", { specs: { connector: "AS150" } }).rows.some((w) => /^battery/i.test(w.name) && w.connector.startsWith("AS150")));
// #9 rename input has an id, a name and a label.
assert.ok(/<label class="sr" for="lib-in">[^<]*<\/label><input class="lib-in" id="lib-in" name="lib-name"/.test(lh));
// #13 thrust, not part weight.
assert.ok(ph.includes("g thrust each"));

// Fig 3 with engine feasibility: hatched past the T:W limit, never recommends past it; table says Flies?; the card reads batteryBest.
if (est.performance.batteryBest) {
  assert.equal(X.bestPack(est, mt0).wh, est.performance.batteryBest.wh, "card uses engine batteryBest");
  const f3 = PERF.perfTables(est).find((t) => /^Fig 3/.test(t.title));
  assert.equal(f3.columns.at(-1), "Flies?"); assert.ok(f3.rows.some((r) => r.at(-1) === "no") && f3.rows.some((r) => r.at(-1) === "yes"));
  const h3 = PERF.renderPerformance(est, { missionLabel: "Inspection" });
  assert.ok(h3.includes("Bigger packs would fly longer only with stronger motors: past") && /T:W below 2 past here/i.test(h3) && h3.includes("past this pack (") && !/x the pack buys/.test(h3), "no recommendation past the limit");
}
// R3-1: a wing has a static T:W minimum too (engine r.minTwr, else its sweep limit): card, PDF and measured caution all use it.
{
  const fwS = X.parse("#s=3&m=mapping&cfg=fixedwing").S, fwE = X.run(fwS), m = X.minTwr(fwS, fwE);
  assert.ok(Number.isFinite(m) && m > 0 && m < 1, `wing min T:W ${m}`);
  if (Number.isFinite(fwE.minTwr)) assert.equal(m, fwE.minTwr, "engine r.minTwr wins");
  const bpw = X.bestPack(fwE, m), line = X.packText(bpw, m, fwE).line;
  assert.ok(!line.includes("-.") && line.includes(`static T:W >= ${m}`), line);
  assert.ok(!X.packText(bp, mt0, est).line.includes("static"), "multirotor: plain T:W");
  const pd = X.pdfDoc(X.results(fwS, fwE), fwS, "2026-11-08").specs.find((x) => x[0] === "Best pack size")[1];
  assert.ok(pd.includes(`static T:W >= ${m}`) && !pd.includes("-."), pd);
  const mw = X.runMeasured({ ...fwS, mw: 2500 }, fwE).r;
  assert.ok(mw.twr < m && mw.warnings.some((w) => w.startsWith("At the measured 2,500 g, static thrust : weight is") && w.includes("the wing may not launch or climb")), mw.warnings.join(" | "));
  // R3-2: at about 1x the card shows the sized pack's own figures.
  assert.ok(bpw.mult !== 1 || (bpw.wh === fwE.batteryWh && bpw.flightMin === fwE.estFlightMin), "1x = this pack");
}
// R4-1: wing figures follow the measured mass (loading x k, stall and cruise x sqrt k, endurance and range = measured); the rest says "at estimated mass".
for (const [h, g] of [["#s=3&m=mapping&cfg=fixedwing", 2500], ["#s=3&m=mapping&cfg=vtol", 4000]]) {
  const s0 = X.parse(h).S, e = X.run(s0), mr = X.runMeasured({ ...s0, mw: g }, e).r, w0 = e.fixedWing || e.vtol, w1 = mr.fixedWing || mr.vtol, k = g / 1000 / e.auwKg;
  assert.ok(Math.abs(w1.wingLoadingGdm2 - w0.wingLoadingGdm2 * k) < 0.1 && Math.abs(w1.stallMs - w0.stallMs * Math.sqrt(k)) < 0.1 && Math.abs(w1.cruiseMs - w0.cruiseMs * Math.sqrt(k)) < 0.1, h);
  assert.equal(w1.rangeKm, mr.rangeKm); if (Number.isFinite(w0.endurance)) assert.equal(w1.endurance, mr.estFlightMin, "endurance = measured flight");
  const html = PERF.renderPerformance(mr, {}), sp = X.pdfDoc(X.results({ ...s0, mw: g }, e), { ...s0, mw: g }, "2026-11-08").specs;
  assert.ok(html.includes("at estimated mass"), `${h}: key strip labels what it cannot rescale`);
  assert.ok(sp.some(([k2, v]) => /Launch|Hover \/ transition/.test(k2) && v.includes("(at estimated mass)")), `${h}: PDF label`);
  if (e.fixedWing) assert.ok(sp.find((x) => x[0] === "Endurance")[1].startsWith(`${mr.estFlightMin.toFixed(1)} min`), "PDF endurance is measured");
}
// R4-2: Fig 3 "your pack" equals the KPI flight time.
{ const s0 = X.parse("#s=3&m=mapping&cfg=fixedwing").S, e = X.run(s0); assert.ok(PERF.renderPerformance(e, {}).includes(`pack gives ${e.estFlightMin.toFixed(1)} min`)); }
// R5-2: fixed-wing key strip and PDF show the KPI figures (1 decimal, flight time and range), labelled "at cruise speed".
for (const g of [0, 1000, 1395, 2500]) { // 1000 and 1395 end the range in x.x5, where toLocaleString and toFixed round apart
  const s0 = { ...X.parse("#s=3&m=mapping&cfg=fixedwing").S, ...(g ? { mw: g } : {}) }, R = X.results(s0, X.run(s0)), r = R.r;
  const html = PERF.renderPerformance(r, {}), pdf = X.pdfDoc(R, s0, "2026-11-13").specs;
  assert.ok(!html.includes("best-endurance") && html.includes("at cruise speed"), `mw=${g}: strip label`);
  assert.ok(html.includes(`>${r.estFlightMin.toFixed(1)}<`) && html.includes(`>${r.rangeKm.toFixed(1)}<`), `mw=${g}: strip shows ${r.estFlightMin.toFixed(1)} min / ${r.rangeKm.toFixed(1)} km`);
  assert.equal(pdf.find((x) => x[0] === "Endurance")[1], `${r.estFlightMin.toFixed(1)} min at cruise speed`, `mw=${g}: PDF endurance`);
}
// R6-1: Fig 1 caption says its cruise numbers are steady level flight, not the mission estimate the tiles show.
for (const h of ["#s=3&m=mapping&cfg=fixedwing", "#s=3&m=mapping&cfg=vtol", "#s=3&m=inspection&cfg=quad"]) {
  const s0 = X.parse(h).S, html = PERF.renderPerformance(X.run(s0), {});
  assert.ok(/cruise, steady level flight, still air, full pack: [^<]*\. The headline figures above are the whole-mission estimate \(/.test(html), h);
}
// R6-3: a measured weight equal to the estimate (same gram) adds no "estimate"/"at estimated mass" wording anywhere.
{ const base = X.parse("#s=3&m=mapping&cfg=fixedwing").S, g = Math.round(X.run(base).auwKg * 1000), s0 = { ...base, mw: g }, R = X.results(s0, X.run(s0));
  assert.equal(R.r.measuredG, g);
  const html = PERF.renderPerformance(R.r, {}), pdf = X.pdfDoc(R, s0, "2026-11-13").specs.map((x) => x.join(" ")).join(" ");
  assert.ok(!/\(estimate\)|At the estimated|estimated mass/.test(html + pdf), "no estimate wording when measured = estimate");
  const s1 = { ...base, mw: g + 100 }, R1 = X.results(s1, X.run(s1));
  assert.ok(/At the estimated/.test(PERF.renderPerformance(R1.r, {})), "still labelled when they differ"); }
// R7: measured marker never prints over the Min / Max / weight labels; Fig 1 and Fig 4 keep one mass; Fig 5 wording.
{ const cases = [["inspection", "", 2000], ["fpv", "&fc=5", 1100], ["fpv", "&fc=5", 1200], ["mapping", "", 2000], ["mapping", "", 3000], ["agriculture", "", 16000], ["interceptor", "", 1500], ["mapping", "&cfg=fixedwing", 2500], ["mapping", "&cfg=vtol", 4000]];
  for (const [m, x, g] of [...cases, ...cases.map(([m2, x2]) => [m2, x2, 0])]) for (const width of [325, 560, 1100]) {
    const S = X.parse(`#s=3&m=${m}${x}${g ? `&mw=${g}` : ""}`).S, R = X.results(S, X.run(S)), html = PERF.renderPerformance(R.r, { width });
    [...html.matchAll(/<svg class="pf-svg"[\s\S]*?<\/svg>/g)].forEach((sv, i) => assert.equal(PERF.overlaps(sv[0]), 0, `${m}${x} mw=${g} w=${width}: figure ${i + 1} labels collide`));
  }
  // (a) Fig 1 keeps the sweep's own mass: the estimate's stall and cruise, not the measured ones
  const b0 = X.parse("#s=3&m=mapping&cfg=fixedwing").S, e0 = X.run(b0), s2 = { ...b0, mw: 2500 }, R2 = X.results(s2, X.run(s2)), h2 = PERF.renderPerformance(R2.r, {});
  assert.ok(R2.r.fixedWing.stallMs > e0.fixedWing.stallMs, "measured stall moved");
  assert.ok(h2.includes(`Stall boundary ${e0.fixedWing.stallMs.toFixed(1)} m/s`) && h2.includes(`Below the ${e0.fixedWing.stallMs.toFixed(1)} m/s stall`) && h2.includes(`At the ${e0.fixedWing.cruiseMs.toFixed(1)} m/s cruise`), "Fig 1 uses the estimate's stall and cruise");
  // (b) Fig 4 cruise marker is labelled estimate only when a different weight is measured
  assert.ok(/Bench throttle at cruise power [\d.]+% \(estimate\)/.test(h2) && /W at the estimated mass\. On a static test stand/.test(h2), "Fig 4 cruise tagged estimate");
  const h0 = PERF.renderPerformance(e0, {});
  assert.ok(!/Bench throttle at cruise power [\d.]+% \(estimate\)/.test(h0), "Fig 4 not tagged without mw");
  // the fixed-wing Fig 4 says bench throttle, and why the headline cruise throttle is lower; the tile figure is the engine's
  assert.ok(/On a static test stand that is about \d+% throttle; in flight the airspeed unloads the propeller, so the cruise setting on the headline tile \(\d+%\) is lower\./.test(h0) && h0.includes(`(${Math.round(e0.hoverThrottlePct)}%) is lower`), "Fig 4 bench vs headline throttle");
  { const q = X.parse("#s=3&m=inspection&cfg=quad").S, hq = PERF.renderPerformance(X.run(q), {}); assert.ok(!/bench|test stand/i.test(hq) && /Hover throttle \d+%/.test(hq), "multirotor Fig 4 unchanged"); }
  // (c) Fig 5: "and" when the two shares match within a point, else "but"
  for (const h of ["#s=3&m=delivery", "#s=3&m=agriculture", "#s=3&m=mapping&cfg=vtol"]) {
    const S = X.parse(h).S, mm = PERF.renderPerformance(X.run(S), {}).match(/take[s]? (\d+)% of the flight time (and|but) (\d+)% of the energy/);
    if (mm) assert.equal(mm[2], Math.abs(mm[1] - mm[3]) <= 1 ? "and" : "but", h);
  } }
// R9-1: Fig 2 takes the result's own T:W floor (interceptor vtol/tiltrotor 2, not the mission's 6); R9-2: one measured T:W everywhere, rounded once.
for (const [h, want] of [["#s=3&m=interceptor&cfg=vtol", "2.0"], ["#s=3&m=interceptor&cfg=tiltrotor", "2.0"], ["#s=3&m=interceptor&cfg=quad", "6.0"], ["#s=3&m=fpv&fc=5", "7.0"], ["#s=3&m=fpv&fc=7", "4.0"], ["#s=3&m=fpv&fc=10", "3.0"], ["#s=3&m=mapping", "2.0"]]) {
  const S = X.parse(h).S, html = PERF.renderPerformance(X.run(S), { missionLabel: X.MISSIONS[S.mission].label });
  assert.ok(html.includes(`minimum of ${want}`) && !/costs about 0\.0 min/.test(html), `${h}: Fig 2 floor ${want}`);
}
for (const [h, g] of [["#s=3&m=interceptor&t=6&cfg=vtol", 2200], ["#s=3&m=inspection&cfg=hex", 2634], ["#s=3&m=mapping&cfg=vtol", 3151], ["#s=3&m=interceptor&cfg=fixedwing", 1127]]) {
  const S = { ...X.parse(h).S, mw: g }, e = X.run(S), R = X.results(S, e), html = PERF.renderPerformance(R.r, { missionLabel: X.MISSIONS[S.mission].label });
  const t = e.performance.throttle.at(-1).thrustG, want = (Math.round((t / g) * 100) / 100).toFixed(2); // whole-gram full-throttle thrust over the measured grams, rounded once
  assert.equal(R.r.twr.toFixed(2), want, `${h} mw=${g}: tile T:W from the unrounded thrust`);
  const quoted = [...html.matchAll(/(?:thrust-to-weight|thrust : weight) (\d+\.\d+)/g)].map((m) => m[1]);
  assert.ok(quoted.length >= 1 && quoted.every((q) => q === want), `${h} mw=${g}: figure captions say ${quoted} not ${want}`);
  const cau = R.r.warnings.find((w) => /weight is/.test(w)); if (cau) assert.ok(cau.includes(`weight is ${want},`), `${h}: caution says ${want}`);
}
console.log("ui tests passed");
