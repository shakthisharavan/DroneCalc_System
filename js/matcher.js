import { allParts, REGIONS, localLinks } from "./catalog.js";
import { t } from "./i18n/i18n.js";

// distance of v outside [lo,hi], relative; 0 when inside
const near = (v, lo, hi) => (v >= lo && v <= hi ? 0 : v < lo ? (lo - v) / (lo || 1) : (v - hi) / (hi || 1));
// Stator "DDHH" (diameter, height mm; "2806.5" allowed): same size class when the volume d²·h is within ±30% (2207 counts as 2306).
const vol = (s) => { const m = /^(\d\d)(\d\d(?:\.\d+)?)$/.exec(String(s)); return m ? m[1] * m[1] * m[2] : NaN; };
const statorOk = (want, have) => !want || want === have || Math.abs(vol(have) / vol(want) - 1) <= 0.3;

// Each rule(req) -> item -> { ok (hard fit), score (higher = better) }. Missing requirement = no constraint.
const RULES = {
  frame: (r) => (i) => {
    const s = i.specs, d = near(s.sizeMm, r.minSizeMm ?? 0, r.maxSizeMm ?? Infinity);
    const cfg = !r.configuration || s.configuration === r.configuration;
    return { ok: d === 0 && cfg, score: -d * 5 + (cfg ? 3 : 0) + (!r.material || s.material === r.material ? 2 : 0) };
  },
  motor: (r) => (i) => {
    const s = i.specs, kv = near(s.kv, r.kvMin ?? 0, r.kvMax ?? Infinity);
    const th = s.maxThrustG >= (r.minThrustG ?? 0), st = statorOk(r.statorMm, s.statorMm);
    const cl = !r.cells || !s.maxCells || (r.cells >= (s.minCells ?? 1) && r.cells <= s.maxCells); // pack voltage inside the motor's rated range
    return { ok: kv < 0.15 && th && st && cl, score: -kv * 5 + (th ? 2 : -3) + (st ? 3 : 0) + (cl ? 0 : -5) };
  },
  // n = motor count: a 4-in-1 board never fits fewer than 4 motors (fixed wing / pusher builds need single ESCs)
  esc: (r, n = 4) => (i) => {
    // r.minCells is the pack's cell count: it must sit inside the ESC's range (6-14S HV ESCs cannot run a 4S pack)
    const s = i.specs, cur = s.continuousA >= (r.minContinuousA ?? 0), cells = s.maxCells >= (r.minCells ?? 0) && (s.minCells ?? 0) <= (r.minCells ?? Infinity);
    // protocol is a preference only: 12-14S ESCs are PWM, which ArduPilot/PX4 drive fine
    const proto = !r.protocol || /dshot/i.test(s.protocol) === /dshot/i.test(r.protocol);
    return { ok: cur && cells && !(i.specs.fourInOne && n < 4), score: (cur ? 2 : -3) + (cells ? 1 : -3) + (proto ? 1 : -1) - Math.max(0, s.continuousA - (r.minContinuousA ?? 0)) / 100 };
  },
  battery: (r) => (i) => {
    const s = i.specs, cells = !r.cells || s.cells === r.cells, mah = near(s.mah, r.minMah ?? 0, r.maxMah ?? Infinity);
    const c = s.cRating >= (r.minC ?? 0), chem = !r.chemistry || s.chemistry === r.chemistry;
    return { ok: cells && mah < 0.25 && c && chem, score: (cells ? 3 : -3) - mah * 4 + (c ? 1 : -1) + (chem ? 2 : 0) };
  },
  prop: (r) => (i) => {
    const d = r.inch == null ? 0 : Math.abs(i.specs.inch - r.inch);
    return { ok: d <= 0.5, score: -d };
  },
  fc: (r) => (i) => {
    const s = i.specs, out = s.motorOutputs >= (r.minMotorOutputs ?? 0), gps = !r.needsGps || s.hasGps;
    return { ok: out, score: (out ? 3 : -3) + (gps ? 1 : 0) - s.motorOutputs / 100 };
  },
  camera: (r) => (i) => {
    const kind = !r.kind || i.specs.kind === r.kind, w = !(r.maxWeightG > 0) || i.weightG <= r.maxWeightG;
    return { ok: kind && w, score: (kind ? 3 : -3) + (w ? 1 : -3) };
  },
  vtol: (r) => (i) => {
    const s = i.specs, span = near(s.wingspanMm, r.minSpanMm ?? 0, r.maxSpanMm ?? Infinity);
    const area = s.wingAreaDm2 >= (r.minAreaDm2 ?? 0), auw = s.maxAuwKg >= (r.maxAuwKg ?? 0);
    // Empty kit must weigh less than the whole aircraft; a kit over 1.4x the engine's structure estimate ranks down by how far over.
    const light = !(r.auwKg > 0) || !(i.weightG >= r.auwKg * 1000), over = r.frameG > 0 ? i.weightG / r.frameG - 1.4 : 0;
    return { ok: span === 0 && area && auw && light, score: -span * 5 + (area ? 2 : -3) + (auw ? 2 : -3) - (over > 0 ? 3 + over * 2 : 0) - (light ? 0 : 5) };
  },
  // r = requirements.vtol. Ranking only: rule of thumb ~1.5 kg·cm of servo torque per kg of AUW.
  servo: (r) => (i) => ({ ok: true, score: 3 * Math.min(1, i.specs.torqueKgCm / Math.max(0.1, 1.5 * (r.maxAuwKg ?? 0))) }),
  // r = requirements.tilt. Tilt servos (and kits that include servos) must reach the torque; bracket-only kits always fit, ranked lower.
  tilt: (r) => (i) => {
    const min = r.minTorqueKgcm ?? r.minTorqueKgCm ?? 0, t = i.specs.torqueKgCm;
    const ok = t == null ? i.category === "tilt" && !i.specs.includesServos : t >= min;
    return { ok, score: (t == null ? 0 : 3) - (t ?? 0) / 100 };
  },
};
RULES.pusher = RULES.motor;
RULES.fixedwing = RULES.vtol; // same airframe window: span, wing area, max AUW

const CORE = ["frame", "motor", "esc", "fc", "battery", "prop"];
// Used only while the engine sends no requirements.camera (older engine).
const CAMERA_KIND = { inspection: "gimbal4k", mapping: "survey", fpv: "fpv", interceptor: "fpv" };
const regionOf = (region) => (typeof region === "string" && Object.hasOwn(REGIONS, region) ? region : "GLOBAL");
// a custom part is the user's own, in hand: it counts as local everywhere (else any locally listed catalog part would outrank it)
const isLocal = (i, reg) => i.custom === true || (i.links || []).some((l) => l.kind === "product" && (l.region || "GLOBAL") === reg);
// ...but it is not a store listing: it never filters the verified catalog fits out, and never hides the "no local listing" note
const listed = (i, reg) => i.custom !== true && isLocal(i, reg);
// lift and pusher motors are separate pools (a fixed wing's main motor comes from the pusher pool);
// quadplane and tiltrotor airframes are separate; tilt = tilt-capable servos plus tilt mechanism kits
const pool = (catalog, c, b) => catalog.filter((i) => {
  if (c === "pusher" || (c === "motor" && b.wing)) return i.category === "motor" && i.tags.includes("pusher");
  if (c === "motor") return i.category === "motor" && !i.tags.includes("pusher");
  if (c === "vtol") return i.category === "vtol" && (i.specs.type === "tiltrotor") === b.tilt;
  if (c === "tilt") return i.category === "tilt" || (i.category === "servo" && i.specs.tilt === true);
  return i.category === c;
});
const classOf = (i) => [].concat(i.specs.fpvClass ?? []).map(String);
// battery plug vs ESC lead: 0 same plug (or no data), 1 bare pads (solder the battery's plug), 4 mismatch (adapter or new lead)
const plugCost = (bat, esc) => { const a = bat?.specs.connector, e = esc?.specs.connector; return !a || !e || a === e ? 0 : e === "pads" ? 1 : 4; };

function rank(cat, rule, items, mission, notes, cls) {
  // exact fpvClass match ranks first (frame, prop and motor carry one class; shared parts list several)
  const scored = items.map((i) => { const r = rule(i); return { i, ok: r.ok, score: r.score + (i.tags.includes(mission) ? 2 : 0) + (cls && classOf(i).includes(cls) ? 4 : 0) }; });
  const by = (a, b) => b.score - a.score || a.i.priceUsd - b.i.priceUsd;
  const fits = scored.filter((x) => x.ok).sort(by).map((x) => x.i);
  if (fits.length) return { fits, closest: [] };
  if (!scored.length) { notes.push(t("match.noParts", { cat })); return { fits, closest: [] }; }
  // hard requirements unmet: never recommend; offer closest separately
  notes.push(t("match.noFit", { cat }));
  return { fits, closest: scored.sort(by).slice(0, 3).map((x) => x.i) };
}

export function recommend(requirements, mission, budgetUsd, catalog = allParts(), region = "US") {
  const req = requirements || {}, reg = regionOf(region), vt = req.vtol || null, wing = req.wing || null, tilt = req.tilt || null;
  // tiltrotor: requirements.tilt, or (engine without that key yet) a vtol build whose pusher is null
  const b = { wing: !!wing, tilt: !!tilt || (!!vt && req.pusher === null) };
  const count = req.motor?.count ?? (wing ? 1 : 4), cls = req.fpvClass == null ? null : String(req.fpvClass);
  const notes = [], out = {}, closest = {}, missing = [], regionFallback = [];
  const cam = req.camera !== undefined ? req.camera : CAMERA_KIND[mission] ? { kind: CAMERA_KIND[mission] } : null;
  const qty = (c, i) => (c === "motor" || c === "prop" ? count : c === "esc" ? (i.specs.fourInOne ? Math.ceil(count / 4) : count)
    : c === "servo" ? (vt ? vt.servoCount : req.servo?.count) ?? 1
    : c === "tilt" ? (i.category === "tilt" ? Math.ceil((tilt.servoCount ?? 4) / (i.specs.tiltAxes || 1)) : tilt.servoCount ?? 4) : 1);
  // pack-sold parts (specs.packOf props, motors, ... per pack, priceUsd per pack): qty = packs, units = pieces needed
  const dress = (c) => (i) => {
    const units = qty(c, i), packOf = i.specs?.packOf || 1, q = Math.ceil(units / packOf);
    return { ...i, qty: q, units, packOf, lineUsd: Math.round(q * i.priceUsd * 100) / 100, links: localLinks(i, reg), localListing: isLocal(i, reg) };
  };
  // fixed wing: requirements.pusher is the main motor and requirements.servo = {count}; servo torque is ranked against max AUW
  const want = { camera: cam?.kind ? cam : null, vtol: vt, fixedwing: wing, tilt,
    pusher: (vt || wing) && (req.pusher === undefined ? (b.tilt ? null : {}) : req.pusher),
    servo: vt || (wing || req.servo ? { maxAuwKg: wing?.maxAuwKg } : null) };

  const CATS = [...CORE, "camera", "vtol", "fixedwing", "tilt", "pusher", "servo"], need = new Set();
  // adj(item) = extra score from the parts already picked (pairing pass); it reorders fits only, so it never empties a list
  const pick = (c, adj) => {
    out[c] = []; delete closest[c];
    // core: an absent requirement means no constraint (v1); null means not needed (frame on vtol / fixed-wing builds)
    const r = CORE.includes(c) ? (req[c] === undefined ? (c === "motor" && wing ? null : {}) : req[c]) : want[c];
    if (!r) return;
    need.add(c);
    try {
      const rule = RULES[c](r, count), scored = adj ? (i) => { const x = rule(i); return { ...x, score: x.score + adj(i) }; } : rule;
      let { fits, closest: cl } = rank(c, scored, pool(catalog, c, b), mission, notes, cls);
      // FPV class builds: a class-tagged (Betaflight/INAV stack) FC beats a locally listed Pixhawk-class one
      const fpvFc = c === "fc" && cls ? fits.filter((i) => classOf(i).includes(cls)) : [];
      if (fpvFc.length) fits = fpvFc;
      // pairing re-rank: the best-paired part beats a local listing (then the list is a region fallback: all international)
      if (adj && fits.length) { const top = Math.max(...fits.map(adj)); fits = [...fits].sort((x, y) => adj(y) - adj(x));
        if (!fits.some((i) => adj(i) === top && isLocal(i, reg))) fits = fits.filter((i) => i.custom === true || !isLocal(i, reg)); }
      const loc = fits.filter((i) => listed(i, reg));
      if (fits.some((i) => i.custom !== true) && !loc.length) regionFallback.push(c);
      // custom parts stay eligible beside the catalog fits (local listings first when there are any) and win only on score; they never crowd out every catalog fit
      const eligible = fits.filter((i) => i.custom === true || !loc.length || listed(i, reg)), keep = eligible.find((i) => i.custom !== true);
      let top3 = eligible.slice(0, 3);
      if (keep && !top3.includes(keep)) top3 = [...top3.slice(0, 2), keep];
      out[c] = top3.map(dress(c));
      if (cl.length) closest[c] = cl.map(dress(c));
    } catch { notes.push(t("match.failed", { cat: c })); }
  };
  for (const c of CATS) pick(c);
  // Pairing pass (SPEC-v4 compat): a frame that clears the props, an ESC rated for the motor's full-throttle current, then a battery plug that matches the ESC lead
  // (bare pads cost a little: solder the battery's plug); if no battery matches, the ESC is re-ranked against the battery.
  const inch = req.prop?.inch, small = (i) => (i.specs.maxPropInch < inch ? -5 : 0); // frame too small for the props
  if (out.frame.length && small(out.frame[0])) pick("frame", small);
  const mot = (wing ? out.pusher : out.motor)?.[0], low = (i) => (mot?.specs.maxCurrentA > i.specs.continuousA ? -5 : 0);
  if (out.esc.length && mot) pick("esc", low);
  // integrated power system (motor with its ESC built in): ESC options stay ranked (the user may swap the motor), rec.integratedEsc
  // names the motor, and the battery plug pairs with the motor's power leads instead of the ESC's
  const lead = mot?.specs.integratedEsc ? mot : out.esc[0];
  const bad = () => out.battery.length && lead && plugCost(out.battery[0], lead) > 0;
  if (bad()) pick("battery", (i) => -plugCost(i, lead));
  if (bad() && lead === out.esc[0]) pick("esc", (i) => low(i) - plugCost(out.battery[0], i));
  for (const c of CATS) if (need.has(c) && (c !== "camera" || mission === "inspection" || mission === "mapping") && !out[c].length) missing.push(c);
  regionFallback.splice(0, Infinity, ...new Set(regionFallback));
  if (regionFallback.length) notes.push(t("match.noLocal", { region: REGIONS[reg].name }));

  // extras: cheapest mission-tagged item per extra category, local listings preferred (payload only if the mission tags it)
  out.extras = ["vtx", "gps", "radio", "payload", ...(vt || wing ? ["sensor"] : [])].flatMap((c) => {
    const t = catalog.filter((i) => i.category === c && i.tags.includes(mission)), l = t.filter((i) => isLocal(i, reg));
    const best = (l.length ? l : t).sort((a, b) => a.priceUsd - b.priceUsd)[0];
    return best ? [dress("extras")(best)] : [];
  });
  const sum = (f) => Math.round(Object.entries(out).reduce((a, [c, l]) => (!l.length ? a
    : a + (c === "extras" ? l.reduce((x, i) => x + i.lineUsd, 0) : f(l.map((i) => i.lineUsd)))), 0));
  out.totalUsd = { low: sum((p) => Math.min(...p)), high: sum((p) => Math.max(...p)) };
  if (budgetUsd != null && out.totalUsd.low > budgetUsd) notes.push(t("match.budget", { low: out.totalUsd.low, budget: budgetUsd }));
  out.notes = notes;
  out.closest = closest; // category -> near-miss parts that fail hard requirements
  out.missing = missing; // core categories with no fitting part
  out.incomplete = missing.length > 0;
  out.regionFallback = regionFallback; // categories with no local listing: all fits shown
  out.integratedEsc = mot?.specs.integratedEsc ? mot.id : null; // best motor's id when it has its ESC built in (no separate ESC needed)
  return out;
}

// Every catalog category -> all its items: mission-tagged first, then locally listed, each with localized links.
export function listOptions(region, mission, catalog = allParts()) {
  const reg = regionOf(region), out = {};
  for (const i of catalog) (out[i.category] ??= []).push(i);
  for (const c of Object.keys(out)) {
    out[c] = out[c].map((i) => ({ i, t: i.tags.includes(mission), l: isLocal(i, reg) }))
      .sort((a, b) => b.t - a.t || b.l - a.l)
      .map(({ i, l }) => ({ ...i, packOf: i.specs?.packOf || 1, links: localLinks(i, reg), localListing: l }));
  }
  return out;
}
