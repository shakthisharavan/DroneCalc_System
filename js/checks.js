// SPEC-v4 checks: part compatibility, weight class by region, real parts mass and the build checklist. Pure: no DOM, node-importable.

const fx = (x, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d);
const sp = (it) => it?.specs || {};
const an = (w) => (/^[aefhilmnorsx]/i.test(w) ? "an " : "a ") + w; // article by sound of the spelled-out name: an XT60, an AS150, a JST
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
  if (ips && picks.esc) add("escExtra", "warn", `The ${motor.name} has its ESC built in: the separate ESC is not needed.`);
  if (motor && !ips && !picks.esc) add("escNeeded", "warn", `Pick an ESC: ${motor.name} has no built-in ESC. Needs >= ${q.esc?.minContinuousA ?? r?.escContinuousA} A per motor, ${r?.batteryCells}S.`);

  if (bat && esc && b.cells && e.maxCells) {
    const lo = e.minCells ?? 1, range = `${lo}-${e.maxCells}S`;
    add("cells", b.cells >= lo && b.cells <= e.maxCells ? "pass" : "fail", b.cells >= lo && b.cells <= e.maxCells
      ? `The ${b.cells}S battery is inside the ESC's ${range} range.` : `The ${b.cells}S battery is outside the ESC's ${range} range: pick an ESC rated for ${b.cells}S.`);
  }
  if (bat && esc && b.connector && e.connector) {
    if (e.connector === "pads") add("connector", "warn", `The ESC has bare power pads: solder ${an(b.connector)} lead to match the battery.`);
    else if (e.connector === b.connector) add("connector", "pass", `Battery and ESC both use ${b.connector}.`);
    else add("connector", "fail", `The battery has ${b.connector} but the ESC lead is ${e.connector}: buy an adapter rated for the current or change the lead.`);
  }
  const perA = r?.peakCurrentA > 0 ? r.peakCurrentA / n : null; // full-throttle draw per motor
  if (esc && e.continuousA && perA) {
    const lvl = e.continuousA < perA ? "fail" : e.continuousA < perA * 1.1 ? "warn" : "pass";
    add("escA", lvl, `The ESC is rated ${e.continuousA} A continuous for about ${fx(perA)} A peak per motor${lvl === "pass" ? "." : lvl === "warn" ? ": under 10% headroom." : ": pick a larger ESC."}`);
  }
  const mA = sp(motor).maxCurrentA;
  if (motor && esc && esc !== motor && mA && e.continuousA) add("motorA", mA <= e.continuousA ? "pass" : "warn", mA <= e.continuousA
    ? `The motor's ${mA} A maximum fits the ESC's ${e.continuousA} A rating.` : `The motor can draw ${mA} A at full throttle, above the ESC's ${e.continuousA} A rating: keep full throttle short.`);
  const need = r?.requirements?.fc?.minMotorOutputs ?? r?.motorCount;
  if (fc && sp(fc).motorOutputs && need) add("outputs", sp(fc).motorOutputs >= need ? "pass" : "fail", sp(fc).motorOutputs >= need
    ? `The flight controller has ${sp(fc).motorOutputs} outputs for the ${need} this build needs.` : `The flight controller has ${sp(fc).motorOutputs} outputs but this build needs ${need} (motors and servos): pick a larger one.`);
  const inch = sp(prop).inch ?? r?.propInch, max = sp(frame).maxPropInch;
  if (frame && max && inch) add("prop", inch <= max ? "pass" : "fail", inch <= max
    ? `The ${inch} in props fit the frame (up to ${max} in).` : `The ${inch} in props are larger than the frame's ${max} in maximum: they will hit each other or the frame.`);
  const want = sp(prop).inch && r?.propInch; // prop far smaller than the build was sized for cannot lift it
  if (want) { const p = sp(prop).inch, lvl = p < 0.8 * r.propInch ? "fail" : p > 1.25 * r.propInch ? "warn" : "pass";
    add("propSize", lvl, lvl === "pass" ? `The ${p} in props suit this build (sized for ~${r.propInch} in).` : lvl === "fail"
      ? `The ${p} in props are too small for this build (needs ~${r.propInch} in).` : `The ${p} in props are larger than the ~${r.propInch} in this build was sized for: check motor load.`); }
  const fq = q.frame, mm = sp(frame).sizeMm;
  if (frame && fq && mm) { const off = mm < fq.minSizeMm ? fq.minSizeMm / mm - 1 : mm > fq.maxSizeMm ? mm / fq.maxSizeMm - 1 : 0, lvl = !off ? "pass" : off <= 0.15 ? "warn" : "fail";
    add("frameSize", lvl, lvl === "pass" ? `The ${mm} mm frame is in the ${fq.minSizeMm}-${fq.maxSizeMm} mm range this build needs.`
      : `The ${mm} mm frame is outside the ${fq.minSizeMm}-${fq.maxSizeMm} mm range this build needs${lvl === "fail" ? ": pick another frame." : "."}`); }
  if (bat && b.cells && r?.batteryCells) add("packCells", b.cells === r.batteryCells ? "pass" : "warn", b.cells === r.batteryCells
    ? `The ${b.cells}S pack matches the ${r.batteryCells}S the build was sized for.` : b.cells < r.batteryCells
      ? `The engine sized ${r.batteryCells}S; a ${b.cells}S pack gives less power.` : `The engine sized ${r.batteryCells}S; a ${b.cells}S pack spins the motors faster and draws more current: check motor KV.`);
  if (bat && motor && b.cells && m.maxCells) { const ok = b.cells >= (m.minCells ?? 1) && b.cells <= m.maxCells;
    add("motorCells", ok ? "pass" : "fail", ok ? `The ${b.cells}S battery is inside the motor's ${m.minCells ?? 1}-${m.maxCells}S range.`
      : `The ${b.cells}S battery is outside the motor's ${m.minCells ?? 1}-${m.maxCells}S range: pick a motor rated for ${b.cells}S.`); }
  const thr = (picks.motor ? q.motor : q.pusher)?.minThrustG;
  if (motor && m.maxThrustG && thr) add("motorThrust", m.maxThrustG >= thr ? "pass" : "fail", m.maxThrustG >= thr
    ? `The motor's ${m.maxThrustG} g maximum thrust covers the ${thr} g each this build needs.` : `The motor's ${m.maxThrustG} g maximum thrust is below the ${thr} g each this build needs: pick a stronger motor.`);
  if (fc && esc && e.protocol && sp(fc).firmware) {
    const fw = sp(fc).firmware.toLowerCase().split("/"), ok = (PROTO[family(e.protocol)] || []).filter((f) => fw.includes(f));
    add("proto", ok.length ? "pass" : "warn", ok.length ? `${sp(fc).firmware} drives the ESC's ${e.protocol} protocol.`
      : `Check that ${sp(fc).firmware} supports the ESC's ${e.protocol} protocol.`);
  }
  if (bat && b.mah && b.cRating && r?.peakCurrentA > 0) {
    // Li-ion labels are continuous ratings: the cells take ~2x for seconds, so only above that is it a fail.
    const cont = (b.mah / 1000) * b.cRating, burst = cont * (b.chemistry === "liion" ? 2 : 1), p = r.peakCurrentA;
    const lvl = p > burst ? "fail" : p > 0.7 * cont ? "warn" : "pass";
    add("batC", lvl, lvl === "pass" ? `Peak draw ${fx(p)} A is under 70% of the battery's ${fx(cont)} A rating.`
      : lvl === "warn" ? `Peak draw ${fx(p)} A is over 70% of the battery's ${fx(cont)} A rating: label C rating is optimistic; keep peak under 70%.`
        : `Peak draw ${fx(p)} A is above the battery's ${fx(burst)} A limit: pick a higher C rating or a larger pack.`);
  }
  return out;
}

const END = " Check your local aviation authority.";
const W = (code, label, lvl, note) => ({ code, label, lvl, note: note + END });
/** Closest weight class for the all-up weight in a region (REGIONS codes). Self-built drones carry no class label. */
export function weightClass(auwKg, region) {
  const g = Math.round(Number(auwKg) * 1000); // whole grams: no float noise at 250/900/4000/25000
  if (region === "EU") {
    if (g < 250) return W("EU-A1", "EU A1 (self-built <250 g)", "ok", "Self-built under 250 g may fly in A1; register as an operator if it carries a camera.");
    if (g < 900) return W("EU-C1", "EU C1-equivalent (A1/A3)", "warn", "Operator registration and the A1/A3 online certificate; self-built drones carry no C label, so this is the closest class.");
    if (g < 4000) return W("EU-C2", "EU C2-equivalent (A2/A3)", "warn", "Operator registration, plus the A2 certificate near people or A3 away from people; no C label on self-built drones.");
    if (g <= 25000) return W("EU-A3", "EU C3/C4-equivalent (A3)", "warn", "A3 only: fly far from people and built-up areas, with operator registration and the A1/A3 certificate.");
    return W("EU-SPEC", "EU Specific category", "bad", "Over 25 kg leaves the Open category: the Specific category needs an operational authorisation.");
  }
  if (region === "GB") {
    if (g < 250) return W("UK-250", "UK under 250 g", "ok", "From 2026 the CAA asks for a Flyer ID from 100 g, and an Operator ID if it carries a camera.");
    if (g <= 25000) return W("UK-OPEN", "UK Open category", "warn", "Needs an Operator ID and a Flyer ID; heavier drones fly further from people.");
    return W("UK-SPEC", "UK Specific category", "bad", "Over 25 kg needs a CAA operational authorisation.");
  }
  if (region === "IN") { // Drone Rules 2021
    if (g <= 250) return W("IN-NANO", "India nano (up to 250 g)", "ok", "Nano drones need no remote pilot certificate; fly only in green zones.");
    const reg = "Register on Digital Sky for a UIN; a remote pilot certificate is needed for any non-nano commercial flying.";
    if (g <= 2000) return W("IN-MICRO", "India micro (250 g-2 kg)", "warn", reg);
    if (g <= 25000) return W("IN-SMALL", "India small (2-25 kg)", "warn", reg);
    if (g <= 150000) return W("IN-MEDIUM", "India medium (25-150 kg)", "bad", reg + " Medium drones need a type certificate.");
    return W("IN-LARGE", "India large (over 150 kg)", "bad", reg + " Large drones need a type certificate.");
  }
  if (region === "US") {
    if (g < 250) return W("US-250", "US under 250 g", "ok", "Recreational flying needs no FAA registration; commercial flying still falls under Part 107.");
    if (g <= 25000) return W("US-REG", "US FAA registration", "warn", "Register with the FAA and broadcast Remote ID; commercial flying needs a Part 107 certificate.");
    return W("US-55LB", "US over 55 lb", "bad", "Over 25 kg (55 lb) needs an FAA exemption or waiver beyond Part 107.");
  }
  if (g < 250) return W("GEN-250", "Under 250 g", "ok", "Below the common 250 g registration threshold.");
  if (g <= 25000) return W("GEN-REG", "250 g to 25 kg", "warn", "Registration and a pilot test are usually required.");
  return W("GEN-25KG", "Over 25 kg", "bad", "Heavy-UAS rules apply: expect an authorisation for every flight.");
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
    "Before the first plug-in, check with a multimeter for a short between battery + and - and for the right polarity at the ESC.",
    "Use a smoke stopper (or a fuse) for the first power-up and after any soldering.",
    "Take the props off for all bench setup and configuration.",
    wing ? "Check that the motor spins the right way and the prop faces the right way for thrust."
      : "Check motor order and spin direction in the configurator: 4-in-1 ESC motor order differs per board, so remap outputs if needed.",
    "Bind the receiver and check the channel mapping and stick directions in the configurator.",
    "Set the failsafe and test it with props off by switching the radio off.",
    ...(gps ? ["Calibrate the compass away from metal and the accelerometer on a level surface; wait for a 3D GPS fix before arming."] : []),
    ...(wing || vtol ? ["Check control surface direction and throws, and balance the CG at the airframe's marked point."] : []),
    ...(vtol && (r.vtol.tilt || S.configuration === "tiltrotor") ? ["Check tilt servo travel and direction with props off before the first transition."] : []),
    liion ? "Store Li-ion packs at about 3.6 V per cell and charge them on a fireproof surface."
      : "Store LiPo packs at 3.8 V per cell and charge them in a fireproof bag.",
    wing ? "Make the first flight in calm wind over an open field, and trim before flying far."
      : "Make the first hover low and close in an open area, then check motor temperatures after landing.",
  ];
}
