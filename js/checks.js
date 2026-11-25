// SPEC-v4 checks: part compatibility, weight class by region, real parts mass and the build checklist. Pure: no DOM, node-importable.
import { t } from "./i18n/i18n.js";

const fx = (x, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d);
const sp = (it) => it?.specs || {};
const an = (w) => t(/^[aefhilmnorsx]/i.test(w) ? "compat.article.an" : "compat.article.a", { w }); // article by sound of the spelled-out name: an XT60, an AS150, a JST (a language without articles sets both to {w})
// Protocol family -> firmwares that drive it. A DShot1200 ESC also runs DShot600/300, so DShot is one family.
const PROTO = { pwm: ["betaflight", "inav", "ardupilot", "px4"], oneshot: ["betaflight", "inav", "ardupilot", "px4"], dshot: ["betaflight", "inav", "ardupilot", "px4"] };
const family = (p) => (/dshot/i.test(p) ? "dshot" : /oneshot/i.test(p) ? "oneshot" : /pwm/i.test(p) ? "pwm" : null);

/** r = engine result, picks = { category: item } of the selected parts. One check per rule whose parts are picked and have the data. */
export function compat(r, picks = {}) {
  const out = [], add = (id, level, text) => out.push({ id, level, text });
  const bat = picks.battery, fc = picks.fc, frame = picks.frame, prop = picks.prop;
  const motor = picks.motor || picks.pusher; // fixed wing: the main motor is the pusher pick
  const ips = sp(motor).integratedEsc, esc = ips ? motor : picks.esc; // integrated power system: the motor's built-in ESC is the ESC
  const b = sp(bat), e = sp(esc), m = sp(motor), n = r?.motorCount || 1, q = r?.requirements || {};
  if (ips && picks.esc) add("escExtra", "warn", t("compat.escExtra", { name: motor.name }));
  if (motor && !ips && !picks.esc) add("escNeeded", "warn", t("compat.escNeeded", { name: motor.name, a: q.esc?.minContinuousA ?? r?.escContinuousA, cells: r?.batteryCells }));

  if (bat && esc && b.cells && e.maxCells) {
    const lo = e.minCells ?? 1, range = `${lo}-${e.maxCells}S`, ok = b.cells >= lo && b.cells <= e.maxCells;
    add("cells", ok ? "pass" : "fail", t(ok ? "compat.cells.pass" : "compat.cells.fail", { n: b.cells, range }));
  }
  if (bat && esc && b.connector && e.connector) {
    if (e.connector === "pads") add("connector", "warn", t("compat.connector.pads", { conn: an(b.connector) }));
    else if (e.connector === b.connector) add("connector", "pass", t("compat.connector.pass", { conn: b.connector }));
    else add("connector", "fail", t("compat.connector.fail", { bat: b.connector, esc: e.connector }));
  }
  const perA = r?.peakCurrentA > 0 ? r.peakCurrentA / n : null; // full-throttle draw per motor
  if (esc && e.continuousA && perA) {
    const lvl = e.continuousA < perA ? "fail" : e.continuousA < perA * 1.1 ? "warn" : "pass";
    add("escA", lvl, t(`compat.escA.${lvl}`, { a: e.continuousA, peak: fx(perA) }));
  }
  const mA = sp(motor).maxCurrentA;
  if (motor && esc && esc !== motor && mA && e.continuousA) add("motorA", mA <= e.continuousA ? "pass" : "warn", t(mA <= e.continuousA ? "compat.motorA.pass" : "compat.motorA.warn", { a: mA, esc: e.continuousA }));
  const need = r?.requirements?.fc?.minMotorOutputs ?? r?.motorCount;
  if (fc && sp(fc).motorOutputs && need) add("outputs", sp(fc).motorOutputs >= need ? "pass" : "fail", t(sp(fc).motorOutputs >= need ? "compat.outputs.pass" : "compat.outputs.fail", { n: sp(fc).motorOutputs, need }));
  const inch = sp(prop).inch ?? r?.propInch, max = sp(frame).maxPropInch;
  if (frame && max && inch) add("prop", inch <= max ? "pass" : "fail", t(inch <= max ? "compat.prop.pass" : "compat.prop.fail", { inch, max }));
  const want = sp(prop).inch && r?.propInch; // prop far smaller than the build was sized for cannot lift it
  if (want) { const p = sp(prop).inch, lvl = p < 0.8 * r.propInch ? "fail" : p > 1.25 * r.propInch ? "warn" : "pass";
    add("propSize", lvl, t(`compat.propSize.${lvl}`, { p, size: r.propInch })); }
  const fq = q.frame, mm = sp(frame).sizeMm;
  if (frame && fq && mm) { const off = mm < fq.minSizeMm ? fq.minSizeMm / mm - 1 : mm > fq.maxSizeMm ? mm / fq.maxSizeMm - 1 : 0, lvl = !off ? "pass" : off <= 0.15 ? "warn" : "fail";
    add("frameSize", lvl, t(`compat.frameSize.${lvl}`, { mm, min: fq.minSizeMm, max: fq.maxSizeMm })); }
  if (bat && b.cells && r?.batteryCells) add("packCells", b.cells === r.batteryCells ? "pass" : "warn", t(b.cells === r.batteryCells ? "compat.packCells.pass" : b.cells < r.batteryCells ? "compat.packCells.low" : "compat.packCells.high", { n: b.cells, sized: r.batteryCells }));
  if (bat && motor && b.cells && m.maxCells) { const lo = m.minCells ?? 1, ok = b.cells >= lo && b.cells <= m.maxCells;
    add("motorCells", ok ? "pass" : "fail", t(ok ? "compat.motorCells.pass" : "compat.motorCells.fail", { n: b.cells, range: `${lo}-${m.maxCells}S` })); }
  const thr = (picks.motor ? q.motor : q.pusher)?.minThrustG;
  if (motor && m.maxThrustG && thr) add("motorThrust", m.maxThrustG >= thr ? "pass" : "fail", t(m.maxThrustG >= thr ? "compat.motorThrust.pass" : "compat.motorThrust.fail", { g: m.maxThrustG, need: thr }));
  if (fc && esc && e.protocol && sp(fc).firmware) {
    const fw = sp(fc).firmware.toLowerCase().split("/"), ok = (PROTO[family(e.protocol)] || []).filter((f) => fw.includes(f));
    add("proto", ok.length ? "pass" : "warn", t(ok.length ? "compat.proto.pass" : "compat.proto.warn", { firmware: sp(fc).firmware, protocol: e.protocol }));
  }
  if (bat && b.mah && b.cRating && r?.peakCurrentA > 0) {
    // Li-ion labels are continuous ratings: the cells take ~2x for seconds, so only above that is it a fail.
    // v5: a cold or aged pack (engine battery.resistanceFactor > 1) delivers less current than its label
    const rf = r.battery?.resistanceFactor ?? 1, dr = rf > 1 ? " " + t("compat.derate", { rf: fx(rf, 2) }) : "";
    const cont = ((b.mah / 1000) * b.cRating) / rf, burst = cont * (b.chemistry === "liion" ? 2 : 1), p = r.peakCurrentA;
    const lvl = p > burst ? "fail" : p > 0.7 * cont ? "warn" : "pass";
    add("batC", lvl, t(`compat.batC.${lvl}`, { p: fx(p), cont: fx(cont), burst: fx(burst), derate: dr }));
  }
  return out;
}

const W = (code, lvl) => ({ code, label: t(`wclass.${code}.label`), lvl, note: t(`wclass.${code}.note`) + " " + t("wclass.end") }); // text: wclass.<code>.label and .note
/** Closest weight class for the all-up weight in a region (REGIONS codes). Self-built drones carry no class label. */
export function weightClass(auwKg, region) {
  const g = Math.round(Number(auwKg) * 1000); // whole grams: no float noise at 250/900/4000/25000
  if (region === "EU") {
    if (g < 250) return W("EU-A1", "ok");
    if (g < 900) return W("EU-C1", "warn");
    if (g < 4000) return W("EU-C2", "warn");
    if (g <= 25000) return W("EU-A3", "warn");
    return W("EU-SPEC", "bad");
  }
  if (region === "GB") {
    if (g < 250) return W("UK-250", "ok");
    if (g <= 25000) return W("UK-OPEN", "warn");
    return W("UK-SPEC", "bad");
  }
  if (region === "IN") { // Drone Rules 2021
    if (g <= 250) return W("IN-NANO", "ok");
    if (g <= 2000) return W("IN-MICRO", "warn");
    if (g <= 25000) return W("IN-SMALL", "warn");
    if (g <= 150000) return W("IN-MEDIUM", "bad");
    return W("IN-LARGE", "bad");
  }
  if (region === "US") {
    if (g < 250) return W("US-250", "ok");
    if (g <= 25000) return W("US-REG", "warn");
    return W("US-55LB", "bad");
  }
  if (g < 250) return W("GEN-250", "ok");
  if (g <= 25000) return W("GEN-REG", "warn");
  return W("GEN-25KG", "bad");
}

/** Mass of the BOM rows (weightG is per piece; pieces = units needed, else packs x pack size) plus the engine's wiring/hardware allowance. */
export function partsMassG(rows, r) {
  const partsG = Math.round((rows || []).reduce((a, { it, qty, pack, units }) => {
    const pcs = Number.isFinite(units ?? it?.units) ? units ?? it.units : pack ? qty * (it.packOf || 1) : qty;
    return a + (Number(it?.weightG) || 0) * (pcs || 0);
  }, 0));
  const allowanceG = Math.round(r?.weights?.hardwareG || 0);
  return { partsG, allowanceG, totalG: partsG + allowanceG };
}

/** Build and first-flight checklist for this build: r = engine result, S = wizard state (configuration, mission). */
export function checklist(r, S = {}) {
  const wing = !!r?.fixedWing, vtol = !!r?.vtol, gps = !!r?.requirements?.fc?.needsGps, liion = r?.batteryChemistry === "liion";
  return [
    t("check.shortCircuit"),
    t("check.smoke"),
    t("check.propsOff"),
    t(wing ? "check.spinWing" : "check.spinMulti"),
    t("check.bind"),
    t("check.failsafe"),
    ...(gps ? [t("check.compass")] : []),
    ...(wing || vtol ? [t("check.surfaces")] : []),
    ...(vtol && (r.vtol.tilt || S.configuration === "tiltrotor") ? [t("check.tilt")] : []),
    t(liion ? "check.storeLiion" : "check.storeLipo"),
    t(wing ? "check.firstWing" : "check.firstHover"),
  ];
}
