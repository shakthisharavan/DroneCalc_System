// Drone Calc physics engine. Pure, no DOM, never throws from estimate().
// Method: size airframe from a guessed battery mass, compute momentum-theory hover power,
// then iterate battery mass until estimated flight time == target (capped, best effort).
// v2: "vtol" quadplane (4 lift rotors + pusher + wing), foam material, result.vtol, result.performance,
// camera/vtol/pusher requirements, pack masses calibrated to real packs.
// v3: "tiltrotor" (quad-tilt VTOL, result.vtol.type/tilt), "fixedwing" (result.fixedWing), FPV size classes (FPV_CLASSES, input fpvClass).
// v4: frame materials titanium, pacf, petg, balsa; weights.hardwareG (screws, standoffs, ties, harness) in AUW; result.wiring list.

import { t } from "./i18n/i18n.js";

// Display text of the data tables below (labels, notes) is read from the active language catalog at access time: key <prefix>.<id>.<field>.
const localize = (tbl, prefix, fields) => { for (const id of Object.keys(tbl)) for (const f of fields) Object.defineProperty(tbl[id], f, { enumerable: true, get: () => t(`${prefix}.${id}.${f}`) }); return tbl; };

// ---- Constants (all documented) ----
const G = 9.80665;          // m/s^2
const RHO0 = 1.225;         // kg/m^3, ISA sea level air density
const R_AIR = 287.05;       // J/(kg K), dry air gas constant
const ETA = 0.85 * 0.95 * 0.97; // motor 0.85 * ESC 0.95 * wiring/battery IR loss 0.97 (hover operating point)
const USABLE = 0.8;         // usable battery fraction (depth of discharge limit)
const MAX_BATT_FRAC = 0.6;  // battery cannot exceed 60% of AUW (beyond this: target unreachable)
// Pack-level specific energy (Wh/kg) vs pack mass m (kg): small packs carry relatively more leads, connector and wrap,
// FPV packs use heavier high-C cells, big low-C packs approach the cell limit. (v1 used a flat 170: 145 g for 25 Wh, too light.)
// LiPo   150 - 40e^(-m/0.45), ~120-150 Wh/kg: 6S 1300 mAh (28.9 Wh) -> 230 g, real 210-230 g; 4S 1500 mAh (22 Wh) -> 180 g,
//        real 175-185 g; 6S 10 Ah (222 Wh) -> 1.5 kg, real 1.35-1.5 kg.
// Li-ion 235 - 50e^(-m/0.5), ~190-235 Wh/kg (21700 cells): 4S1P (62 Wh) -> 0.30 kg; 6S2P (200 Wh) -> 0.88 kg;
//        6S 22 Ah (475 Wh) -> 2.0 kg, like the DeltaQuad Evo pack.
const WH_KG = { lipo: (m) => 150 - 40 * Math.exp(-m / 0.45), liion: (m) => 235 - 50 * Math.exp(-m / 0.5) };
const VCELL = { lipo: 3.7, liion: 3.6 }; // nominal volts per cell
// vtol: 4 lift motors, its pusher is sized separately; tiltrotor: 4 tilting motors do both; fixedwing: 1 cruise motor
const NMOT = { quad: 4, hex: 6, octo: 8, vtol: 4, tiltrotor: 4, fixedwing: 1 };
// frame diagonal (motor-to-motor) / prop diameter: prop tips just clear their neighbours (+ margin)
const FRAME_K = { quad: 1.75, hex: 2.1, octo: 2.7 };
const PROPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30]; // stock sizes, inch
// Pack cell counts sold off the shelf (v4: 10S dropped): 3/4/6S hobby, 8S FPV X-class, 12/14S heavy-lift smart packs. 12in+ lift
// builds skip 8S: heavy-lift packs come in 6S, 12S and 14S (Tattu, Herewin, DJI Agras), not 8S or 10S.
const CELLS = [3, 4, 6, 8, 12, 14];
// Heavy-lift 12S/14S LiPo capacities sold (mAh): Tattu Plus/Pro 12S 16000/22000, Herewin 14S 16000, Tattu 3.0 14S 22000/25000/28000.
const HL_MAH = [16000, 22000, 25000, 28000];
const ESC_A = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 100, 120, 150, 200];
// Lift stator classes real builds pair with each prop size: [max prop inch, stator "DDHH", typical max thrust g on that prop].
// 5in 2306 1.5-1.7 kg, 7in 2807, 10in 2212/2216 ~1 kg, 12-13in 3508, 15in 4114, 18in 5008, 20in 5010, 22-24in 6215, 26-30in 8318.
// When the needed thrust exceeds the class, step to the next bigger stator (more torque, same prop).
// 4th column: typical motor mass g of the class (catalog: 2306 33, 2807 54, 2216 70, 2814 108, 3508 106 (MN3508), 5008 170,
// 5010 255; 1404/1507/4114 from listings, 6215/8318/9025 est.). Low-KV lift motors weigh 0.03-0.07 g per g of max thrust.
const LIFT_STATORS = [[3.5, "1404", 500, 9], [4.5, "1507", 800, 14], [6.5, "2306", 1600, 33], [8.5, "2807", 2200, 54],
  [10.5, "2216", 1100, 70], [11.5, "2814", 2000, 108], [14, "3508", 2500, 106], [16.5, "4114", 4500, 150], [19, "5008", 5500, 170],
  [21, "5010", 8700, 255], [25, "6215", 13000, 380], [28, "8318", 20000, 600], [99, "9025", 30000, 850]];
// Fixed-wing pusher outrunners (T-Motor AT/AM class) and their quoted max static thrust g. A pusher spins a high-pitch cruise
// prop that gives ~2/3 of that static figure, so the class must quote >= 1.5x the needed static thrust.
// 3rd column: motor mass g (catalog AT2312 60, AT2814 108, AT2820 132, AT3520 218, AT4130 406; 4120/5220/7215 est.).
const PUSHER_STATORS = [["2312", 1100, 60], ["2814", 2200, 108], ["2820", 2900, 132], ["3520", 4100, 218], ["4120", 5600, 300],
  ["4130", 8000, 406], ["5220", 10000, 560], ["7215", 18000, 1000]];
const KV_LOAD = 0.7;  // loaded rpm / (KV x nominal V) at full throttle: sag + motor slip (X500 2216 920KV, 10in, 4S: ~8500 rpm = 0.62)
const KV_BAND = 0.15; // motors in a stator class come in KV steps ~15-25% apart: accept +-15% around the computed KV
// Pusher KV band +-20%: the pitch-speed rule itself spans 1.5-2.5x cruise, the prop pairs with whichever KV is chosen.
const FPV_CAM_G = 60;       // FPV camera + VTX budget, g (DJI O3 air unit 36 g, analog cam + VTX 15-25 g)
const MOTOR_IDLE = 0.03;    // no-load (iron + ESC) loss as a fraction of hover rotor power: g/W peaks at 30-40% throttle like stand data
// Multirotor forward flight (performance.speed): flat-plate drag area f = dragK * AUW^(2/3) m^2 (5in FPV ~0.015, 1.3 kg 10in ~0.024,
// 10 kg hex ~0.09); induced power factor kappa; profile power = hover power not explained by induced power (from FM), rising as
// (1 + prof * mu^2) with mu = V / hover tip speed. Mission profile: toS s climb at toP x hover, toS s descent at landP x hover.
const MR = { dragK: 0.02, kappa: 1.15, prof: 4.65, toS: 20, toP: 1.2, landP: 0.9 };

// VTOL quadplane: 4 lift rotors + 1 pusher + wing. Published specs behind the sanity ranges: DeltaQuad Evo 2.69 m span, 84 dm2,
// 4.8 kg empty, 10 kg MTOW, 16.5 m/s cruise, 2 x 6S 22 Ah Li-ion -> 272 min; Foxtech Nimbus VTOL V2 1.8 m, 2.85 kg empty,
// 4.8 kg MTOW, 6S 12 Ah, ~60 min; MakeFlyEasy Freeman 2100 2.1 m, 6.5 kg MTOW, stall 10 m/s; WingtraOne 4.8 kg, 16 m/s, 59 min.
const VT = {
  hoverS: 45, transS: 15,   // default profile: 2 x 45 s hover (take-off climb, landing descent) + 2 x 15 s transition
  liftTWR: 2.0,             // lift rotors sized for 2:1 thrust:weight (attitude authority in gusts while hovering)
  download: 1.06,           // wing and booms under the lift props: hover needs 6% more thrust
  transP: 1.1,              // transition power / hover power: pusher at full power while the rotors still carry most of the weight
  wlK: 63,                  // wing loading g/dm2 = 63 x AUW(kg)^(1/3) (square-cube): 1 kg 63, 4 kg 100, 10 kg 136
  clMax: 1.3,               // wing CLmax: cambered low-Re section, no flaps
  cd0: 0.03,                // zero-lift drag: clean small UAV ~0.02 + booms and stopped lift props ~0.01
  e: 0.8,                   // Oswald span efficiency
  stallDrag: 0.5,           // profile-drag rise near stall: dCD = 0.5 (CL/CLmax - 0.7)^2, +0.02 at 0.9 CLmax as in low-Re airfoil polars
  arBase: 7.5, arStiff: 0.15, // aspect ratio = 7.5 + 0.15 x stiffness: carbon 9, glass 8.3, foam 7.7 (flexible spars limit AR)
  etaPush: 0.72 * 0.85 * 0.95 * 0.97, // cruise drivetrain: pusher prop 0.72 x motor 0.85 x ESC 0.95 x wiring 0.97
  maneuver: 1.05,           // turns at line ends, climbs and gusts: +5% over steady level cruise
  cruiseVs: 1.3,            // cruise >= 1.3 x stall (gust margin); normally the best-range speed in the given wind
  minVs: 1.2,               // slowest safe airspeed 1.2 x stall: lower bound of the best-endurance speed
  pushTW: 0.4,              // pusher static thrust 0.4 x weight: climb and acceleration through transition
  pushDL: 180,              // pusher static disk loading N/m2: 10in on a 2.4 kg plane, 13in on 4 kg (Nimbus/Freeman class 13-15in)
  // airframe (wing, fuselage, tail, booms) kg = (0.25 + 1.6 x S[m2] + 0.1 x AUW[kg]) x material factor; the fixed part is the
  // fuselage/boom mounts that house pack and payload whatever the wing size. Gives Nimbus V2 2.8 kg and DeltaQuad Evo 4.5 kg empty.
  afFix: 0.25, afArea: 1.6, afLoad: 0.1,
  sysG: 80, sysKg: 40,      // airspeed sensor, GPS mast, boom wiring, skids: 80 g + 40 g per kg AUW
  servoG: 10, servoKg: 4,   // each servo 10 g + 4 g per kg AUW (9 g micro on 0.5 kg, 50 g standard on 10 kg)
  flapSpanMm: 2400,         // spans above 2.4 m add 2 flap servos (4 -> 6): ailerons 2 + tail 2 (+ flaps 2)
  hoverWindMs: 10           // above ~10 m/s wind, hovering a big wing is marginal (DeltaQuad limit 12.5 m/s, Wingtra 8 m/s)
};

// VTOL tiltrotor (quad-tilt): the 4 rotors tilt 90 deg from lift to cruise, so there is no pusher. Same wing and airframe model as
// the quadplane (VT), plus the tilt mechanism. Real quad-tilts: Wingcopter 178 (~1.8-2 m span, 15-20 kg MTOW, ~25 m/s cruise),
// hobby quad-tilt conversions of 1.6-2 m foam wings on ArduPilot (Q_TILT_TYPE continuous). Cruise runs the tilted hover rotors at
// ~15-30% throttle: a low-pitch hover prop at high advance ratio and a motor far below its best-efficiency load beat no dedicated
// pusher, so cruise needs ~20% more power than a quadplane (stopped lift props are already in VT.cd0 for both).
const TR = {
  eta: 0.62 * 0.82 * 0.95 * 0.97, // cruise drivetrain: tilted hover prop 0.62 x lightly loaded motor 0.82 x ESC 0.95 x wiring 0.97
  transS: 12, transP: 1.0,  // transition 12 s each way at ~hover power: rotors tilt progressively, no extra pusher burning power
  tiltG: 20, tiltKg: 10,    // tilt mechanism per rotor (servo, bracket, bearing, hinge): 20 g + 10 g per kg AUW (60 g on 4 kg)
  rateDegS: 40,             // tilt servo slew 40 deg/s (ArduPilot Q_TILT_RATE_UP default): 90 deg in ~2.3 s
  angleDeg: 90,             // tilt travel, degrees from vertical thrust: 0 = hover, 90 = cruise (result.vtol.tilt.transitionAngleDeg)
  torqueK: 4, torqueMin: 5, // tilt servo torque kg.cm >= 4 x per-rotor max thrust kg (thrust-line offset, gyroscopic and aero moments, x2 margin), >= 5
  cruisePitch: 1.3, maxPD: 0.8 // full-throttle pitch speed >= 1.3 x cruise; the tilt prop's pitch rises up to P/D 0.8 first, KV only beyond that
};

// Fixed wing: one tractor or pusher motor, wing + tail, no VTOL hardware; launched by hand, bungee or runway. Published specs behind
// the constants: Skywalker X8 2.12 m, 80 dm2, 3.5-4.2 kg AUW (44-52 g/dm2), 60-90 min on 4S-6S 10-16 Ah; ZOHD/Skywalker 1900-2000
// class 1.9-2 m, ~45 dm2, 2-2.6 kg, 60-120 min on Li-ion; Mini Talon 1.3 m, ~30 dm2, 1.1 kg, 40-60 min; eBee X 1.16 m, 1.4 kg, 90 min.
// Calibration: these give 3-5x the endurance of a quad of the same AUW on the same pack (quad hover ~180-250 W/kg, wing ~45-70 W/kg).
const FW = {
  wlK: 36,                  // wing loading g/dm2 = 36 x AUW(kg)^(1/3): 1.1 kg 37, 2.4 kg 48, 3.8 kg 56 (no VTOL mass to carry)
  cd0: 0.035,               // zero-lift drag: low-Re foam airframe with fuselage, tail, camera, antennas (no booms or stopped props);
                            // with it a 2.4 kg 1900-class wing cruises at ~26 W/kg, X8 ~25-30 W/kg, Mini Talon ~35-40 W/kg as flown
  eta: 0.7 * 0.85 * 0.95 * 0.97, // cruise drivetrain 0.55: prop 0.7 x motor 0.85 x ESC 0.95 x wiring 0.97 (spec 0.55-0.65)
  tw: 0.6,                  // static thrust 0.6 x weight: hand/bungee launch and climb
  dl: 250,                  // static disk loading N/m2: 8in on 1.1 kg, 13in on 3.8 kg (X8 flies 11-13in)
  // airframe kg = (0.1 + 1.0 x S[m2] + 0.05 x AUW[kg]) x material factor: X8 foam 1.3 kg, Mini Talon 0.55 kg, 1900-class 0.8 kg
  afFix: 0.1, afArea: 1.0, afLoad: 0.05,
  sysG: 40, sysKg: 20,      // airspeed sensor, GPS, wiring: 40 g + 20 g per kg AUW
  servoCount: 4,            // conventional tail: 2 ailerons + elevator + rudder (a V-tail or flying wing needs 3)
  packA: 25, minCells: 4,   // cells: fewest (>= 4S) that keep full-throttle current <= 25 A (Mini Talon / 2 m wings 4S, X8 4-6S)
  launchS: 5,               // launch: 5 s at full throttle
  climbS: 50, climbMs: 2.5, // climb to ~120 m at 2.5 m/s: cruise power + W x climb rate / drivetrain efficiency
  descS: 60, descP: 0.25,   // descent: 60 s glide at 25% of cruise propulsion power + avionics
  loiter: { inspection: 0.7, interceptor: 0 }, loiterDef: 0.1, // share of the en-route energy spent loitering at best-endurance speed (orbits, waits); interceptor: dash only
  clMin: 0.25,              // fast-wing sizing: smallest cruise CL before the wing is shrunk (fast FPV wings 50-70 g/dm2)
  handKg: 2, handStall: 9, bungeeKg: 15 // launch: hand < 2 kg; 2-5 kg hand if stall <= 9 m/s else bungee; bungee <= 15 kg; else runway
};

// v5 battery model: voltage sag, cold derate, age fade. Every figure is an ESTIMATE (real packs differ 2x by brand, C class and history).
// Pack resistance R = R_cell x S / P: with P = pack Ah / cell Ah that is S x rAh / Ah, rAh = R_cell x cell Ah. LiPo 8 mohm Ah (6S 1.3 Ah high-C
// ~37 mohm, 6S 5 Ah ~10 mohm); Li-ion 21700 (P42A 12 mohm x 4.2 Ah) 50 mohm Ah. Loaded cell volts = nominal - I x R / S, with I the engine's
// P / nominal volts. Nominal is the resting voltage near the end of the usable capacity: a conservative floor (a fresh pack sits higher).
// Cold: below coldC capacity falls 1% per C (0 C 85%, -10 C 75%, -20 C 65%) and resistance rises 4% per C (0 C x1.6, -10 C x2.0, -20 C x2.4).
// Age: capacity x (1 - fade), resistance x (1 + ageR x fade): 20% fade ~ x1.5, 40% ~ x2.0 (end-of-life packs read 1.5-2x new). Floor V/cell: LiPo 3.3
// (below it cells are damaged), Li-ion 3.0 (the 21700 cutoff is ~2.5 V, flight controllers warn at 3.0).
// The hover calibration factor (measured / predicted hover current) is limited to this range: outside it the measurement is far more likely wrong
// (units, a different build, a clamp meter on the wrong lead) than real, and an unbounded factor gave absurd flight times (0.1 A measured: thousands of minutes).
// Above the range the factor is capped (a pessimistic limit); below it the calibration is not applied (a low reading must never lengthen the flight).
const KAPPA = [0.5, 2];
const BATT = { rAh: { lipo: 0.008, liion: 0.05 }, floor: { lipo: 3.3, liion: 3.0 }, coldC: 15, capPerC: 0.01, rPerC: 0.04, ageR: 2.5 };

// Mission fields beyond the contract: diskLoad (N/m^2 at 1 kg AUW, scaled by AUW^0.25 since big drones load props harder -> picks prop size), powerMult (avg/hover power),
// defaultFlightMin/maxFlightMin (wizard default / realistic ceiling), maxCells (pack voltage cap for the class, ignored when payload > 1 kg),
// avionicsW (FC+cam+VTX+payload electronics), otherBaseG (cam/gimbal/pump/release gear), fcG, liionOK, needsGps.
export const MISSIONS = {
  delivery:    { defaultFlightMin: 20, maxFlightMin: 45, defaultPayloadKg: 1.0,  minTWR: 2.0, cruiseMs: 12, reserve: 0.15, diskLoad: 82,  powerMult: 1.0, avionicsW: 8,  otherBaseG: 130, fcG: 40, liionOK: true,  needsGps: true },
  inspection:  { defaultFlightMin: 25, maxFlightMin: 50, defaultPayloadKg: 0.3,  minTWR: 2.0, cruiseMs: 8,  reserve: 0.10, diskLoad: 78,  powerMult: 1.0, avionicsW: 18, otherBaseG: 180, fcG: 40, liionOK: true,  needsGps: true },
  agriculture: { defaultFlightMin: 12, maxFlightMin: 25, defaultPayloadKg: 5.0,  minTWR: 2.0, cruiseMs: 6,  reserve: 0.10, diskLoad: 61,  powerMult: 1.1, avionicsW: 25, otherBaseG: 250, fcG: 40, liionOK: true,  needsGps: true },
  interceptor: { defaultFlightMin: 6, maxFlightMin: 15, maxCells: 8, defaultPayloadKg: 0.15, minTWR: 6.0, cruiseMs: 30, reserve: 0.10, diskLoad: 132, powerMult: 2.2, avionicsW: 10, otherBaseG: 80,  fcG: 40, liionOK: false, needsGps: true },
  mapping:     { defaultFlightMin: 30, maxFlightMin: 60, defaultPayloadKg: 0.25, minTWR: 2.0, cruiseMs: 12, reserve: 0.10, diskLoad: 67,  powerMult: 0.9, avionicsW: 12, otherBaseG: 150, fcG: 40, liionOK: true,  needsGps: true },
  fpv:         { defaultFlightMin: 5, maxFlightMin: 12, maxCells: 6, defaultPayloadKg: 0.1,  minTWR: 7.0, cruiseMs: 18, reserve: 0.05, diskLoad: 151, powerMult: 2.6, avionicsW: 6,  otherBaseG: 55,  fcG: 12, liionOK: false, needsGps: false }
};
localize(MISSIONS, "mission", ["label", "note"]);

// FPV size classes: when mission is fpv these override MISSIONS.fpv. propInch is fixed (not sized from disk loading), stator/statorMaxG
// replace the LIFT_STATORS pick (class-to-stator table), minTWR is the class's thrust:weight. powerMult = average / hover power:
// freestyle flips and punch-outs 2.6x; long-range cruise at 15-20 m/s ~1.3-1.4x hover. liionFromMin: Li-ion pack from this target up.
// Real builds: 5in 2306 on 6S 1100-1500 mAh, 600-700 g, 3-6 min; 7in 2807 1300KV on 6S 3000 mAh LiPo (~1 kg, 10-12 min) or 6S1P-2P
// Li-ion (15-25 min); 10in 3115 on 6S 5000 mAh LiPo (~1.8 kg, ~15 min) or 6S2P Li-ion (20-35 min).
export const FPV_CLASSES = {
  "5":  { propInch: 5, defaultFlightMin: 5, maxFlightMin: 10, typicalAuwG: 650,
    minTWR: 7, minCells: 6, maxCells: 6, stator: "2306", statorMaxG: 1600, cruiseMs: 18, powerMult: 2.6, reserve: 0.05, avionicsW: 6, otherBaseG: 55, fcG: 12, liionOK: false, needsGps: false },
  "7":  { propInch: 7, defaultFlightMin: 12, maxFlightMin: 25, typicalAuwG: 1000,
    minTWR: 4, minCells: 6, maxCells: 6, stator: "2807", statorMaxG: 2200, cruiseMs: 17, powerMult: 1.4, reserve: 0.1, avionicsW: 8, otherBaseG: 75, fcG: 15, liionOK: true, liionFromMin: 15, needsGps: true },
  "10": { propInch: 10, defaultFlightMin: 15, maxFlightMin: 35, typicalAuwG: 1800,
    minTWR: 3, minCells: 6, maxCells: 6, stator: "3115", statorMaxG: 3000, cruiseMs: 16, powerMult: 1.3, reserve: 0.1, avionicsW: 9, otherBaseG: 95, fcG: 20, liionOK: true, liionFromMin: 18, needsGps: true }
};
localize(FPV_CLASSES, "fpv", ["label", "note"]);

// Frame material: density g/cc, stiffness 1-10, relative cost (carbon = 1). Optional frameRel = airframe mass vs carbon where the
// plate-stiffness rule (comps) does not apply: foam needs thick sections plus embedded spars; EPO VTOL kits weigh ~1.2x molded carbon;
// balsa/plywood is thickness-limited (cellular wood, ply spars): ~1.5x molded carbon. Matfactor (density ratio x stiffness penalty) gives:
// titanium 2.8x carbon (E ~110 GPa, heavy-duty multirotors only); PA-CF 1.1x (printed walls, layer bonding limits stiffness to 4);
// PETG 1.4x (E ~2 GPa, soft: slow hobby frames only). Printed parts are solid-equivalent densities.
export const MATERIALS = {
  carbon:   { densityGcc: 1.6, stiffness: 10, costRel: 1.0 },
  glass:    { densityGcc: 1.9, stiffness: 5, costRel: 0.35 },
  aluminum: { densityGcc: 2.7, stiffness: 7,  costRel: 0.5 },
  plastic:  { densityGcc: 1.1, stiffness: 3, costRel: 0.2 },
  foam:     { densityGcc: 0.035, stiffness: 1, costRel: 0.3, frameRel: 1.2 }, // mainly VTOL / fixed wing
  titanium: { densityGcc: 4.5, stiffness: 10, costRel: 4.0 },
  pacf:     { densityGcc: 1.3, stiffness: 4, costRel: 0.3 },
  petg:     { densityGcc: 1.27, stiffness: 2, costRel: 0.2 },
  balsa:    { densityGcc: 0.2, stiffness: 3, costRel: 0.25, frameRel: 1.5 } // fixed wing and foam-like VTOL only
};
localize(MATERIALS, "mat", ["label"]);

// Hardware and harness mass (g). Screws, nuts, standoffs and ties scale per motor; each ESC link is signal + power leads; each connector
// is a plug and socket; sensors add a mount. Connectors are Pixhawk-style: GPS = JST-GH 6-pin and CAN = JST-GH 4-pin (the Pixhawk GPS and
// CAN ports); FC ports use the JST size of the flight controller (JST-GH 1.25 mm Pixhawk class, JST-ZH 1.5 mm mid, JST-SH 1.0 mm micro FPV);
// battery XT60 up to 60 A continuous, XT90 above. Masses are estimates (M3 screw ~0.3 g, 14 AWG silicone ~8 g/m per conductor).
// Light end of the ranges, by connector: JST plug + socket ~1-2 g, XT60 pair ~6 g, XT90 ~10 g. Results: survey quad ~50 g, 5 kg-payload hex
// ~70 g, quadplane ~70 g. FPV class (fpv): M2/M3 hardware, one 4-in-1 ESC link, short leads: 5/7/10 in ~25-35 g (real 5in: 25-40 g).
export const HARDWARE = {
  boltG: 3,       // per motor: 4 motor screws, nuts and frame screws (3-4 g per motor)
  standoffG: 0.5, // per motor: M3 standoffs and spacers for the arm
  tieG: 0.5,      // per motor: zip ties and heatshrink on the arm wiring
  escLinkG: 3,    // per ESC: signal + power leads (14 AWG silicone pair, ~90 mm arm); the connectors are priced below
  pairG: 1.5,     // per JST connector pair (GH, SH or ZH plug and socket)
  xt60G: 6,       // battery XT60 pair (up to 60 A continuous)
  xt30G: 3,       // battery XT30 pair (up to 30 A continuous)
  xt90G: 10,      // battery XT90 pair (up to 90 A continuous)
  as150G: 20,     // battery AS150 anti-spark pair (above 90 A continuous); est.
  sensorG: 2,     // per sensor (GPS mast, airspeed): clamp and mount screws
  harnessG: 8,    // fixed harness: power board leads, GND braid, loom sleeving
  // FPV builds override: M2/M3 screws 1.5 g per motor, tiny ties, one 4-in-1 ESC link per build (escLinkG), 1 g micro JST, 4 g harness
  fpv: { boltG: 1.5, standoffG: 0.5, tieG: 0.25, escLinkG: 4, pairG: 1, harnessG: 4 }
};

// Airframe configurations for the wizard: label, total motor count, one-line explainer, family (multirotor | vtol | wing).
export const CONFIGURATIONS = {
  quad: { motors: 4, family: "multirotor" },
  hex:  { motors: 6, family: "multirotor" },
  octo: { motors: 8, family: "multirotor" },
  vtol: { motors: 5, family: "vtol" },
  tiltrotor: { motors: 4, family: "vtol" },
  fixedwing: { motors: 1, family: "wing" }
};
localize(CONFIGURATIONS, "cfg", ["label", "note"]);

// Input ranges enforced by estimate(); label is used in error text.
export const LIMITS = { targetFlightMin: [1, 180], payloadKg: [0, 25], altitudeM: [0, 6000], tempC: [-30, 50], windMs: [0, 20], budgetUsd: [0, 1e6] };
// Optional battery inputs (input.battery): capacity fade of an aged pack, and the hover current measured on the real build.
export const BATTERY_LIMITS = { ageFadePct: [0, 40], measuredHoverA: [0.1, 500] };
const LABELS = { targetFlightMin: ["engine.lim.targetFlightMin", null], payloadKg: ["engine.lim.payloadKg", "kg"], altitudeM: ["engine.lim.altitudeM", "m"], tempC: ["engine.lim.tempC", "°C"], windMs: ["engine.lim.windMs", "m/s"], budgetUsd: ["engine.lim.budgetUsd", "USD"],
  ageFadePct: ["engine.lim.ageFadePct", "%"], measuredHoverA: ["engine.lim.measuredHoverA", "A"] }; // [label key, unit symbol; null = the word "minutes", engine.minutes]
const rangeErr = (f, x) => {
  const [lo, hi] = LIMITS[f] ?? BATTERY_LIMITS[f];
  return num(x) && x >= lo && x <= hi ? null : t("engine.err.range", { label: t(LABELS[f][0]), lo, hi, unit: LABELS[f][1] ?? t("engine.minutes") });
};

const num = (x) => typeof x === "number" && Number.isFinite(x);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

/** ISA pressure at altitude + local temperature -> air density kg/m^3. */
function airDensity(altM, tempC) {
  const p = 101325 * Math.pow(1 - 2.25577e-5 * altM, 5.25588);
  return p / (R_AIR * (tempC + 273.15));
}

/** Capacity and resistance multipliers of the pack from temperature (cold derate) and age fade (%). Monotonic; exactly 1 and 1 at >= 15 C and 0% fade. */
export const batteryFactors = (tempC, agePct = 0) => {
  const cold = Math.max(0, BATT.coldC - tempC), fade = agePct / 100;
  return { cap: (1 - BATT.capPerC * cold) * (1 - fade), res: (1 + BATT.rPerC * cold) * (1 + BATT.ageR * fade) };
};
/** Pack resistance (ohm) of `cells` series cells on a pack of `ah` Ah; resF = the batteryFactors().res multiplier. */
export const packOhm = (chem, cells, ah, resF = 1) => (BATT.rAh[chem] * cells * resF) / ah;
/** Loaded cell voltage (V) at `amps`: nominal cell volts - amps x pack resistance / cells. */
export const loadedCellV = (chem, cells, ah, resF, amps) => VCELL[chem] - (amps * packOhm(chem, cells, ah, resF)) / cells;
// Energy factor of the extra resistive loss of a cold or aged pack at draw p (W) vs a new warm one: (1 - loss) / (1 - loss0), loss = p R / V^2 (first order).
// The engine's drivetrain efficiency already holds the new-pack loss, so only the change counts. Exactly 1 when the resistance is unchanged.
const drawEff = (c, k, wh, p) => {
  if (c.rF === 1) return 1;
  const l0 = Math.min(0.45, (p * packOhm(c.liion ? "liion" : "lipo", k.cells, wh / k.vnom)) / (k.vnom * k.vnom));
  return (1 - Math.min(0.5, l0 * c.rF)) / (1 - l0);
};

// v6 measured thrust curve: thrust-stand data for ONE motor + prop (throttle %, thrust g, current A, volts at that load; optional rpm and electrical watts).
// Points rise with throttle: throttle strictly, thrust and current never fall; 3 to 50 of them. The engine scales it by the motor count (and the air density, like the
// rated thrust) and uses it instead of the model for hover current, full-throttle thrust and current, T:W and flight time. The pack and parts are still sized by the model.
export const CURVE_LIMITS = { points: [3, 50], pct: [0, 100], thrustG: [0, 100000], currentA: [0, 500], voltageV: [1, 100], rpm: [0, 200000], powerW: [0, 50000] };
const CURVE_REQ = ["pct", "thrustG", "currentA", "voltageV"], CURVE_OPT = ["rpm", "powerW"];
/** Validate and rebuild a curve from anything (a form, storage): -> { curve: { name, points } } or { error }. Only the known numeric fields survive. */
export function curveOf(raw) {
  const bad = (error) => ({ error }), [lo, hi] = CURVE_LIMITS.points;
  const pts = raw && typeof raw === "object" && Array.isArray(raw.points) ? raw.points : null;
  if (!pts) return bad(t("engine.curve.list"));
  if (pts.length < lo || pts.length > hi) return bad(t("engine.curve.count", { lo, hi, n: pts.length }));
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = {};
    if (!p || typeof p !== "object") return bad(t("engine.curve.notPoint", { i: i + 1 }));
    for (const k of [...CURVE_REQ, ...CURVE_OPT]) {
      const v = p[k];
      if (v === undefined || v === null) { if (CURVE_REQ.includes(k)) return bad(t("engine.curve.missing", { i: i + 1, k })); continue; }
      const [a, b] = CURVE_LIMITS[k];
      if (!num(v) || v < a || v > b) return bad(t("engine.curve.range", { i: i + 1, k, lo: a, hi: b }));
      q[k] = v;
    }
    const w = out[i - 1];
    if (w && !(q.pct > w.pct)) return bad(t("engine.curve.rise", { i: i + 1 }));
    if (w && (q.thrustG < w.thrustG || q.currentA < w.currentA)) return bad(t("engine.curve.fall", { i: i + 1 }));
    out.push(q);
  }
  if (!(out[out.length - 1].thrustG > 0)) return bad(t("engine.curve.none"));
  return { curve: { name: typeof raw.name === "string" ? raw.name.replace(/[\x00-\x1f\x7f-\x9f]/g, "").trim().slice(0, 60) : "", points: out } };
}
const cpick = (p) => ({ pct: p.pct, thrustG: p.thrustG, currentA: p.currentA, voltageV: p.voltageV });
/** Linear interpolation at throttle pct (clamped to the curve's ends): { pct, thrustG, currentA, voltageV }. pts = curveOf().curve.points. */
export function curveAtPct(pts, pct) {
  const x = Math.min(pts[pts.length - 1].pct, Math.max(pts[0].pct, pct));
  let i = 1;
  while (i < pts.length - 1 && pts[i].pct < x) i++;
  const a = pts[i - 1], b = pts[i], t = (x - a.pct) / (b.pct - a.pct), L = (u, v) => u + (v - u) * t;
  return { pct: x, thrustG: L(a.thrustG, b.thrustG), currentA: L(a.currentA, b.currentA), voltageV: L(a.voltageV, b.voltageV) };
}
/** The inverse: the point where the curve gives thrust g (one motor): { pct, thrustG, currentA, voltageV, over } with over = g is beyond the curve's maximum (then the last point). */
export function curveAtThrust(pts, g) {
  const first = pts[0], last = pts[pts.length - 1];
  if (g >= last.thrustG) return { ...cpick(last), over: g > last.thrustG };
  if (g <= first.thrustG) return { ...cpick(first), over: false };
  let i = 1;
  while (pts[i].thrustG < g) i++; // ends: the last point is above g
  const a = pts[i - 1], b = pts[i], t = (g - a.thrustG) / (b.thrustG - a.thrustG), L = (u, v) => u + (v - u) * t; // a < g <= b, so b > a
  return { pct: L(a.pct, b.pct), thrustG: g, currentA: L(a.currentA, b.currentA), voltageV: L(a.voltageV, b.voltageV), over: false };
}
// The curve's figures for the converged build r: all N motors at full throttle and, for a hovering airframe, at the hover thrust (sea-level equivalent: the curve is
// rated like the model's thrust). Pack current = N x motor current + avionics. A fixed wing has no hover: only the full-throttle figures.
function measuredFigures(c, m, r, N, dr, fw) {
  const P = c.curve.points, last = P[P.length - 1], k = r.k, o = { name: c.curve.name, points: P.length, motors: N, maxThrustG: N * last.thrustG, maxCurrentA: N * last.currentA,
    peakA: N * last.currentA + m.avionicsW / k.vnom, standV: last.voltageV, hoverPct: null, hoverPackA: null, hoverMotorG: null, overCapacity: false };
  if (!fw) {
    const need = (r.auw * 1000 * (k.vt ? VT.download : 1)) / N / dr, h = curveAtThrust(P, need);
    Object.assign(o, { hoverMotorG: need, hoverPct: h.pct, hoverMotorA: h.currentA, hoverPackA: N * h.currentA + m.avionicsW / k.vnom, overCapacity: h.over });
  }
  return o;
}

function validate(input) {
  const errors = [];
  if (!input || typeof input !== "object") return { errors: [t("engine.err.input")] };
  if (!Object.hasOwn(MISSIONS, input.mission)) errors.push(t("engine.err.mission", { list: Object.keys(MISSIONS).join(", ") }));
  { const e = rangeErr("targetFlightMin", input.targetFlightMin); if (e) errors.push(e); }
  if (!Object.hasOwn(MATERIALS, input.frameMaterial)) errors.push(t("engine.err.material", { list: Object.keys(MATERIALS).join(", ") }));
  if (!Object.hasOwn(NMOT, input.configuration)) errors.push(t("engine.err.config", { list: Object.keys(NMOT).join(", ") }));
  const m = MISSIONS[input.mission];
  let payload = input.payloadKg;
  if (payload === undefined || payload === null || payload === "") payload = m ? m.defaultPayloadKg : 0;
  { const e = rangeErr("payloadKg", payload); if (e) errors.push(e); }
  const e = input.environment ?? {};
  const env = { altitudeM: e.altitudeM ?? 0, tempC: e.tempC ?? 15, windMs: e.windMs ?? 0 };
  for (const f of ["altitudeM", "tempC", "windMs"]) { const e = rangeErr(f, env[f]); if (e) errors.push(e); }
  let budget = input.budgetUsd;
  if (budget === undefined || budget === null || budget === "") budget = null;
  else { const e = rangeErr("budgetUsd", budget); if (e) errors.push(e); }
  // optional battery inputs: absent / null / "" = not set (age 0, no calibration)
  const bi = input.battery ?? {}, unset = (x) => x === undefined || x === null || x === "";
  const age = unset(bi.ageFadePct) ? 0 : bi.ageFadePct, measA = unset(bi.measuredHoverA) ? null : bi.measuredHoverA;
  { const e = rangeErr("ageFadePct", age); if (e) errors.push(e); }
  if (measA !== null) { const e = rangeErr("measuredHoverA", measA); if (e) errors.push(e); }
  // optional measured thrust curve (v6): absent / null = the model
  let curve = null;
  if (input.thrustCurve !== undefined && input.thrustCurve !== null) { const v = curveOf(input.thrustCurve); if (v.error) errors.push(t("engine.err.curve", { error: v.error })); else curve = v.curve; }
  if (errors.length) return { errors };
  const bf = batteryFactors(env.tempC, age);
  // fpv: size class (missing/invalid -> "5", no error) and always a quad
  const fpv = input.mission === "fpv", fpvClass = fpv ? (Object.hasOwn(FPV_CLASSES, String(input.fpvClass)) ? String(input.fpvClass) : "5") : null;
  let config = input.configuration;
  const pre = [];
  if (fpv && config !== "quad") {
    pre.push(t("warn.fpvConfig", { config: CONFIGURATIONS[config].label }));
    config = "quad";
  }
  return { errors, cfg: { mission: input.mission, target: input.targetFlightMin, payload, material: input.frameMaterial, config, env, budget, fpvClass, pre,
    age, measA, cap: bf.cap, rF: bf.res, curve } };
}

const snapProp = (inch) => PROPS.reduce((a, b) => (Math.abs(b - inch) < Math.abs(a - inch) ? b : a));
const firstAtLeast = (list, x) => list.find((v) => v >= x);
// Figure of merit 0.6 (<=7in) .. 0.7 (>=12in); static thrust coefficient CT (T = CT rho n^2 D^4, n rev/s) by prop size.
const fm = (inch) => (inch <= 7 ? 0.6 : inch >= 12 ? 0.7 : 0.6 + (0.1 * (inch - 7)) / 5);
const ctOf = (inch) => (inch <= 5 ? 0.18 : inch >= 9 ? 0.1 : 0.18 - 0.02 * (inch - 5)); // 5in tri-blade ~0.18, 10in two-blade ~0.1 (stand data)
// Frame mass vs carbon: density ratio * thickness penalty for lower stiffness (equal-stiffness cube-root rule), unless frameRel is given.
const matFactor = (mat) => mat.frameRel ?? (mat.densityGcc / 1.6) * Math.pow(10 / mat.stiffness, 1 / 3);
// Momentum theory: electrical power (W) for total thrust T (N) on n props of `inch` diameter, / FM / drivetrain efficiency.
const rotorW = (T, n, inch, rho) => { const d = inch * 0.0254; return (T * Math.sqrt(T / (2 * rho * n * Math.PI * d * d / 4))) / (fm(inch) * ETA); };
const gs = (V, w) => (V > w ? (V * V - w * w) / V : 0); // out-and-back mean ground speed at airspeed V in wind w
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
// Pack mass (kg) for energy wh: invert wh = m * WH_KG(m) by fixed-point iteration (contracts fast, Wh/kg varies slowly with m).
const packKg = (wh, chem) => { let m = wh / 150; for (let i = 0; i < 20; i++) m = wh / WH_KG[chem](m); return m; };
const stallMs = (W, vt, rho) => Math.sqrt((2 * W) / (rho * vt.S * VT.clMax));
// Wing drag coefficient: parabolic polar CD0 + CL^2 / (pi e AR) plus the near-stall rise; and level-flight electrical power (no avionics).
// vt.cd0 / vt.eta per type: quadplane VT.cd0 / VT.etaPush, tiltrotor VT.cd0 / TR.eta, fixed wing FW.cd0 / FW.eta.
const wingCd = (CL, vt) => vt.cd0 + vt.kInd * CL * CL + VT.stallDrag * Math.max(0, CL / VT.clMax - 0.7) ** 2;
const wingW = (V, W, vt, rho) => { const q = 0.5 * rho * V * V, CL = W / (q * vt.S); return (q * vt.S * wingCd(CL, vt) * V * VT.maneuver) / vt.eta; };
// v4 R4: thrust (N) the cruise motor needs so its full-throttle static power (rotorW x 1.1 droop, as the bench sweep draws it) covers cruise power with
// 20% margin (checks stay under 85% after the AUW rise). A fixed-pitch prop draws its most current standing still, so a fast wing (interceptor: 30 m/s) whose cruise power beat the static
// power of a 0.6 W / 0.4 W thrust motor could not cruise at all. rotorW ~ T^1.5 at fixed prop and density, so the fix is one power law.
const SWEEP_K = 1 - MOTOR_IDLE * (1 - Math.pow(2, -1.5)); // the sweep's full-throttle power vs rotorW x 1.1 (its reference point is half the static thrust)
const cruiseT = (T, inch, cruiseW, rho) => { const full = rotorW(T, 1, inch, rho) * 1.1 * SWEEP_K, need = cruiseW / 0.8; return full >= need ? T : T * Math.pow(need / full, 2 / 3); };
// Wing geometry at AUW: area from the wing-loading rule wlK x AUW^(1/3), AR from material stiffness.
// Vm (fixed wing): mission cruise speed. v4: a fast wing (cruise CL under FW.clMin on the wlK wing) is shrunk until CL = clMin, but not
// below the area that keeps a hand-launch stall (FW.handStall): an interceptor wing at 30 m/s flew at CL 0.07 and L/D 1.9 before.
const wingOf = (auw, mat, wlK, cd0, eta, Vm) => {
  const ar = VT.arBase + VT.arStiff * mat.stiffness, W = auw * G, S0 = (auw * 1000) / (wlK * Math.cbrt(auw)) / 100; // m^2
  const S = Vm ? Math.min(S0, Math.max(W / (0.5 * RHO0 * Vm * Vm * FW.clMin), W / (0.5 * RHO0 * FW.handStall ** 2 * VT.clMax))) : S0;
  return { S, ar, kInd: 1 / (Math.PI * VT.e * ar), span: Math.sqrt(ar * S), cd0, eta };
};
// Cruise-motor KV from pitch speed: full-throttle pitch speed `mult` x cruise on a P/D `pd` prop (fixed-wing rule 1.5-2.5x, P/D 0.55).
// v4: cruise-prop pitch/diameter 0.55 up to 20 m/s cruise; fast wings fly higher-pitch props (race wings 6x4.5 on 2200KV 4S), so P/D
// rises 0.025 per m/s to 0.8 at 30 m/s and KV falls with it (0.55 everywhere asked an interceptor wing for a 3500KV 2312 on a 7in prop).
const cruisePD = (Vc) => Math.min(0.8, Math.max(0.55, 0.55 + 0.025 * (Vc - 20)));
const pitchKv = (mult, Vc, inch, vnom, pd = 0.55) => Math.max(10, Math.round((mult * Vc * 60) / (pd * inch * 0.0254) / (vnom * KV_LOAD) / 10) * 10);

/** Multirotor level-flight electrical power (W, no avionics) at airspeed V for weight W (N); equals rotorW(W) at V = 0. */
function mrW(V, W, k, rho) {
  const d = k.inch * 0.0254, A = (k.N * Math.PI * d * d) / 4, vh = Math.sqrt(W / (2 * rho * A));
  const p0 = W * vh * (1 / k.FM - MR.kappa); // profile power
  const tip = Math.PI * d * Math.sqrt(W / k.N / (k.CT * rho * Math.pow(d, 4))); // hover tip speed, m/s
  const D = 0.5 * rho * MR.dragK * Math.pow(W / G, 2 / 3) * V * V, T = Math.hypot(W, D), h2 = T / (2 * rho * A);
  const vi = Math.sqrt((2 * h2 * h2) / (Math.sqrt(V ** 4 + 4 * h2 * h2) + V * V)); // Glauert induced velocity in level flight
  return (MR.kappa * T * vi + p0 * (1 + MR.prof * (V / tip) ** 2) + D * V) / ETA;
}

/** Best-endurance (min power) and best-range (max ground distance, wind included) airspeeds by dense search. */
function bestSpeeds(c, m, k, rho, W) {
  const w = c.env.windMs, vt = k.vt, lo = vt ? VT.minVs * stallMs(W, vt, rho) : 0, hi = vt ? 4 * lo + w : 60;
  let e = lo, r = lo, pe = Infinity, gr = -1;
  for (let i = 0; i <= 300; i++) {
    const V = lo + ((hi - lo) * i) / 300, p = (vt ? wingW(V, W, vt, rho) : mrW(V, W, k, rho)) + m.avionicsW, g = gs(V, w) / p;
    if (p < pe) { pe = p; e = V; }
    if (g > gr) { gr = g; r = V; }
  }
  return { enduranceMs: e, rangeMs: r };
}

/** Everything that depends on AUW but not on battery energy. */
function comps(c, m, N, rho, auw, lockInch) {
  const rr = rho / RHO0, W = auw * G;
  const inch = lockInch ?? m.propInch ?? snapProp(Math.sqrt((4 * W) / (N * Math.PI * m.diskLoad * Math.pow(auw, 0.25))) / 0.0254);
  const d = inch * 0.0254;
  const frameSizeMm = Math.round((inch * 25.4 * FRAME_K[c.config]) / 5) * 5;
  // Carbon reference: 5in (225 mm) quad frame ~95 g, mass ~ size^1.6, + arms for hex/octo, + 8%/kg payload structure.
  const frameG = 95 * Math.pow(frameSizeMm / 225, 1.6) * Math.sqrt(N / 4) * (1 + 0.08 * c.payload) * matFactor(MATERIALS[c.material]);
  // Thrust is sized so that thrust at THIS air density gives minTWR; rated (sea-level) thrust is higher at altitude/heat.
  const thrustPerMotorG = (auw * 1000 * m.minTWR) / N / rr;
  let si = LIFT_STATORS.findIndex((s) => inch <= s[0]);
  while (si < LIFT_STATORS.length - 1 && LIFT_STATORS[si][2] < thrustPerMotorG) si++;
  const stator = m.stator ? [m.stator, m.statorMaxG] : LIFT_STATORS[si].slice(1); // FPV classes fix the stator band
  // FPV classes: stock motors of the class (statorMaxG) set mass and KV, not the minimum thrust: 2306 ~35 g 1900KV, 2807 ~53 g 1300KV, 3115 ~72 g 900KV on 6S.
  // Other lift motors weigh at least their stator class (heavy low-KV motors: MN3508 ~106 g where 0.022 g/g thrust gives ~30 g).
  const motorG = N * Math.max(0.022 * Math.max(thrustPerMotorG, m.statorMaxG ?? 0) + 5, m.stator ? 0 : stator[2]);
  const FM = fm(inch);
  const pProp = rotorW(W, N, inch, rho);
  const wind = 1 + 0.004 * c.env.windMs * c.env.windMs; // extra power from headwind / tilt
  const hoverPowerW = pProp + m.avionicsW;
  const avgPowerW = pProp * m.powerMult * wind + m.avionicsW;
  const peakP = pProp * Math.pow(m.minTWR, 1.5) * 1.1; // P ~ T^1.5, +10% for efficiency droop at full throttle
  // Voltage: bigger per-motor power -> more cells; W per cell per motor = 160 - 4.5 x inch (floor 65), min 4S.
  // 6S minimum from 12in props. (v1 used 140/60, v2 150; raised so the heavier calibrated packs and stator-class motor
  // masses keep a 5 kg-payload 800 mm hex on 12S like real builds.)
  const perMotorW = peakP / N, div = Math.max(65, 160 - 4.5 * inch), ampLimit = 4 * inch + 10;
  const CL = inch >= 12 ? CELLS.filter((s) => s !== 8) : CELLS;
  let ci = CL.findIndex((s) => s >= Math.max(m.minCells ?? (inch >= 12 ? 6 : 4), perMotorW / div)); // 12in+ lift motors are 6S+ in practice; FPV classes 6S
  if (ci < 0) ci = CL.length - 1;
  const capI = c.payload > 1 || !m.maxCells ? CL.length - 1 : CL.filter((s) => s <= m.maxCells).length - 1; // CL is ascending; findLastIndex needs Chrome 97 / Safari 15.4
  ci = Math.min(ci, capI);
  const vcell = c.liion ? VCELL.liion : VCELL.lipo;
  while (ci < capI && perMotorW / (CL[ci] * vcell) > ampLimit) ci++;
  const cells = CL[ci], vnom = cells * vcell;
  const perMotorA = perMotorW / vnom, peakCurrentA = (peakP + m.avionicsW) / vnom;
  const escContinuousA = firstAtLeast(ESC_A, perMotorA) ?? Math.ceil(perMotorA / 50) * 50;
  const escBurstA = Math.round(escContinuousA * 1.3);
  const escG = N * (2 + 0.15 * escContinuousA + 0.3 * Math.max(0, escContinuousA - 50));
  const propG = N * 0.278 * Math.pow(inch, 1.73); // 5in ~4.5 g, 15in ~30 g
  const otherG = m.otherBaseG; // cameras, gimbal, pump, release gear (wiring is in hardwareG)
  // Motor KV: static thrust T = CT*rho*n^2*D^4 at full throttle gives rpm; KV = rpm / (Vnom * KV_LOAD).
  const CT = ctOf(inch);
  const rpm = 60 * Math.sqrt(Math.max((W * m.minTWR) / N, ((m.statorMaxG ?? 0) / 1000) * G) / (CT * rho * Math.pow(d, 4)));
  const kv = Math.max(10, Math.round(rpm / (vnom * KV_LOAD) / 10) * 10);
  const dryG = frameG + motorG + escG + m.fcG + propG + otherG;
  return { N, inch, CT, FM, frameSizeMm, frameG, motorG, escG, fcG: m.fcG, propG, otherG, servosG: 0, tiltG: 0, dryG, thrustPerMotorG, hoverPowerW, avgPowerW,
    peakCurrentA, cells, vnom, escContinuousA, escBurstA, kv, stator: stator[0], statorMax: stator[1] };
}

/** VTOL parts at AUW: the lift system is a quad (comps) at liftTWR; adds wing, pusher (quadplane) or tilt mechanism (tiltrotor),
 *  servos, and replaces the multirotor frame. */
function vtolComps(c, m, rho, auw, lock) {
  const rr = rho / RHO0, W = auw * G, mat = MATERIALS[c.material], tilt = c.config === "tiltrotor";
  const k = comps({ ...c, config: "quad" }, { ...m, minTWR: VT.liftTWR }, 4, rho, auw, lock?.inch);
  const vt = wingOf(auw, mat, VT.wlK, VT.cd0, tilt ? TR.eta : VT.etaPush);
  Object.assign(vt, { tilt, transS: tilt ? TR.transS : VT.transS, transP: tilt ? TR.transP : VT.transP });
  vt.cruise = Math.max(VT.cruiseVs * stallMs(W, vt, rho), bestSpeeds(c, m, { vt }, rho, W).rangeMs, m.cruiseMs);
  vt.servoCount = vt.span * 1000 > VT.flapSpanMm ? 6 : 4;
  const frameG = (VT.afFix + VT.afArea * vt.S + VT.afLoad * auw) * 1000 * matFactor(mat);
  // weights: servosG = control-surface servos, tiltG = tilt mechanism (tiltrotor), otherG = sensors, GPS mast, skids (wiring: hardwareG)
  const servosG = vt.servoCount * (VT.servoG + VT.servoKg * auw);
  const avG = m.otherBaseG + VT.sysG + VT.sysKg * auw;
  const hoverPowerW = rotorW(W * VT.download, 4, k.inch, rho) + m.avionicsW;
  if (tilt) { // no pusher: the hover motors also cruise, KV must also reach the cruise pitch speed; + tilt mechanism mass
    vt.pusher = null;
    const kv = Math.max(k.kv, pitchKv(TR.cruisePitch, vt.cruise, k.inch, k.vnom, TR.maxPD)), tiltG = 4 * (TR.tiltG + TR.tiltKg * auw);
    return { ...k, kv, vt, frameSizeMm: Math.round(vt.span * 1000), frameG, otherG: avG, servosG, tiltG, hoverPowerW,
      dryG: frameG + k.motorG + k.escG + k.fcG + k.propG + avG + servosG + tiltG };
  }
  // Pusher: static thrust pushTW x weight (rated at sea level like the lift motors), prop from its disk loading, KV from static rpm.
  const pT0 = VT.pushTW * W, pInch = lock?.pInch ?? snapProp(Math.sqrt((4 * pT0) / (Math.PI * VT.pushDL)) / 0.0254);
  const pT = cruiseT(pT0, pInch, wingW(vt.cruise, W, vt, rho) + m.avionicsW, rho), thrustG = ((pT / G) * 1000) / rr, thrustG0 = ((pT0 / G) * 1000) / rr; // raised when cruise beats the static power
  const pA = (rotorW(pT, 1, pInch, rho) * 1.1) / k.vnom, escA = firstAtLeast(ESC_A, pA) ?? Math.ceil(pA / 50) * 50;
  const stator = PUSHER_STATORS.find((s) => s[1] >= Math.max(1.5 * thrustG0, thrustG)) ?? PUSHER_STATORS[PUSHER_STATORS.length - 1];
  // KV from pitch speed: full-throttle pitch speed 2x cruise (fixed-wing rule 1.5-2.5x; margin for climb and transition)
  // on a pitch/diameter 0.55 cruise prop (12x6.5, 10x5.5), higher for fast cruise (cruisePD).
  vt.pusher = { statorMm: stator[0], kv: pitchKv(2, vt.cruise, pInch, k.vnom, cruisePD(vt.cruise)), thrustG, propInch: pInch, escA };
  const motorG = k.motorG + stator[2];
  const escG = k.escG + 2 + 0.15 * escA + 0.3 * Math.max(0, escA - 50);
  const propG = k.propG + 0.278 * Math.pow(pInch, 1.73);
  return { ...k, vt, frameSizeMm: Math.round(vt.span * 1000), frameG, motorG, escG, propG, otherG: avG, servosG, hoverPowerW,
    dryG: frameG + motorG + escG + k.fcG + propG + avG + servosG };
}

/** Fixed-wing parts at AUW: wing (FW rules), one cruise motor sized like the quadplane pusher, servos, no lift system. */
function fwComps(c, m, rho, auw, lock) {
  const rr = rho / RHO0, W = auw * G, mat = MATERIALS[c.material];
  const vt = wingOf(auw, mat, FW.wlK, FW.cd0, FW.eta, m.cruiseMs);
  vt.fw = true;
  vt.cruise = Math.max(VT.cruiseVs * stallMs(W, vt, rho), bestSpeeds(c, m, { vt }, rho, W).rangeMs, m.cruiseMs);
  vt.servoCount = FW.servoCount;
  const cruiseW = wingW(vt.cruise, W, vt, rho) + m.avionicsW, T0 = FW.tw * W; // static thrust 0.6 W at least: hand launch and climb
  const inch = lock?.inch ?? snapProp(Math.sqrt((4 * T0) / (Math.PI * FW.dl)) / 0.0254);
  vt.tw = Math.ceil((100 * cruiseT(T0, inch, cruiseW, rho)) / W - 1e-6) / 100; // static T:W, raised for a fast wing so the motor can draw cruise power
  const T = vt.tw * W, thrustG = ((T / G) * 1000) / rr, thrustG0 = ((T0 / G) * 1000) / rr; // static thrust, rated at sea level
  const fullW = rotorW(T, 1, inch, rho) * 1.1; // full-throttle static electrical power, +10% droop
  const vcell = c.liion ? VCELL.liion : VCELL.lipo, capI = c.payload > 1 || !m.maxCells ? CELLS.length - 1 : CELLS.filter((s) => s <= m.maxCells).length - 1;
  let ci = CELLS.findIndex((s) => s >= FW.minCells && fullW / (s * vcell) <= FW.packA);
  ci = Math.min(ci < 0 ? CELLS.length - 1 : ci, capI);
  const cells = CELLS[ci], vnom = cells * vcell, amps = fullW / vnom;
  const escA = firstAtLeast(ESC_A, amps) ?? Math.ceil(amps / 50) * 50;
  const stator = PUSHER_STATORS.find((s) => s[1] >= Math.max(1.5 * thrustG0, thrustG)) ?? PUSHER_STATORS[PUSHER_STATORS.length - 1]; // class by launch thrust; the cruise raise stays inside its rating
  const frameG = (FW.afFix + FW.afArea * vt.S + FW.afLoad * auw) * 1000 * matFactor(mat);
  const motorG = stator[2], escG = 2 + 0.15 * escA + 0.3 * Math.max(0, escA - 50), propG = 0.278 * Math.pow(inch, 1.73);
  const servosG = vt.servoCount * (VT.servoG + VT.servoKg * auw), otherG = m.otherBaseG + FW.sysG + FW.sysKg * auw;
  const kv = pitchKv(2, vt.cruise, inch, vnom, cruisePD(vt.cruise));
  vt.pusher = { statorMm: stator[0], kv, thrustG, propInch: inch, escA };
  return { N: 1, inch, CT: ctOf(inch), FM: fm(inch), vt, fullW, frameSizeMm: Math.round(vt.span * 1000), frameG, motorG, escG, fcG: m.fcG, propG, otherG, servosG, tiltG: 0,
    dryG: frameG + motorG + escG + m.fcG + propG + otherG + servosG, thrustPerMotorG: thrustG, hoverPowerW: cruiseW, avgPowerW: cruiseW, // no hover: level cruise
    peakCurrentA: (fullW + m.avionicsW) / vnom, cells, vnom, escContinuousA: escA, escBurstA: Math.round(escA * 1.3), kv, stator: stator[0], statorMax: stator[1] };
}

/** Hardware and harness for parts k: motor/ESC/servo/sensor counts from the build, plus the wiring list for the UI. */
function harness(c, m, k) {
  const fam = CONFIGURATIONS[c.config].family, vt = k.vt;
  const motors = fam === "wing" ? 1 : k.N + (vt?.pusher ? 1 : 0); // quadplane: 4 lift + pusher; tiltrotor: 4 tilting; fixed wing: 1
  const jst = k.fcG < 15 ? "JST-SH" : k.fcG < 30 ? "JST-ZH" : "JST-GH"; // FC port by flight controller size: micro FPV, mid, Pixhawk class
  const cam = cameraReq(c.mission, m, c.payload).kind;
  const gps = vt || m.needsGps ? 1 : 0, servos = vt ? vt.servoCount + (vt.tilt ? 4 : 0) : 0; // tiltrotor: + 4 tilt servos
  const arm = Math.max(50, Math.round(((fam === "multirotor" ? 0.4 : 0.25) * k.frameSizeMm) / 10) * 10); // lead length ~ arm length, mm
  const fpv = c.mission === "fpv", H = fpv ? { ...HARDWARE, ...HARDWARE.fpv } : HARDWARE, escLinks = fpv ? 1 : motors; // FPV: one 4-in-1 ESC
  // Battery plug by continuous rating (XT30 30 A, XT60 60 A, XT90 90 A, AS150 above): the sustained draw (multirotor mission average,
  // VTOL hover, wing cruise), or the full-throttle peak / 1.5 (climbs and gusts last long on heavy builds) / 3 on FPV (bursts of seconds)
  const amps = Math.max((vt ? k.hoverPowerW : k.avgPowerW) / k.vnom, Math.round(k.peakCurrentA) / (fpv ? 3 : 1.5)); // rounded like result.peakCurrentA
  const plug = amps <= 30 && !fpv ? "XT30" : amps <= 60 ? "XT60" : amps <= 90 ? "XT90" : "AS150"; // FPV 5-10in packs ship XT60
  const rows = [
    fpv ? { id: "escSignal", name: t("wire.e.escSignal.name"), connector: t("wire.e.escSignal.connFpv", { jst }), count: 1, lengthMm: 40 }
      : { id: "escSignal", name: t("wire.e.escSignal.name"), connector: t("wire.e.escSignal.conn", { jst }), count: motors, lengthMm: arm },
    fpv ? { id: "escPower", name: t("wire.e.escPower.name"), connector: t("wire.e.escPower.connFpv"), count: 1, lengthMm: 40 }
      : { id: "escPower", name: t("wire.e.escPower.name"), connector: t("wire.e.escPower.conn"), count: motors, lengthMm: arm },
    fpv && { id: "motorLeads", name: t("wire.e.motorLeads.name"), connector: t("wire.e.motorLeads.conn"), count: motors, lengthMm: arm },
    { id: "fcLink", name: t("wire.e.fcLink.name"), connector: t("wire.e.fcLink.conn", { jst }), count: 1, lengthMm: 150 },
    gps && { id: "gps", name: t("wire.e.gps.name"), connector: t("wire.e.gps.conn"), count: gps, lengthMm: 200 },
    vt && { id: "can", name: t("wire.e.can.name"), connector: t("wire.e.can.conn"), count: 1, lengthMm: 300 },
    { id: "rx", name: t("wire.e.rx.name"), connector: t("wire.e.rx.conn", { jst }), count: 1, lengthMm: 150 },
    cam === "fpv" && { id: "vtx", name: t("wire.e.vtx.name"), connector: t("wire.e.vtx.conn", { jst }), count: 1, lengthMm: 120 },
    cam && { id: "camera", name: t("wire.e.camera.name"), connector: cam === "fpv" ? t("wire.e.camera.connFpv", { jst }) : t("wire.e.camera.conn"), count: 1, lengthMm: 200 },
    { id: "battery", name: t("wire.e.battery.name"), connector: plug, count: 1, lengthMm: 150 },
    { id: "buzzer", name: t("wire.e.buzzer.name"), connector: t("wire.e.buzzer.conn", { jst }), count: 1, lengthMm: 150 },
    servos && { id: "servo", name: t("wire.e.servo.name"), connector: t("wire.e.servo.conn", { jst }), count: servos, lengthMm: arm }
  ].filter(Boolean);
  // ESC links priced per link; motor leads come with the motors; battery connector priced on its own
  const jstPairs = rows.filter((r) => !r.id.startsWith("esc") && r.id !== "motorLeads" && r.id !== "battery").reduce((a, r) => a + r.count, 0);
  const batteryG = { XT30: H.xt30G, XT60: H.xt60G, XT90: H.xt90G, AS150: H.as150G }[plug];
  const hardwareG = motors * (H.boltG + H.standoffG + H.tieG) + escLinks * H.escLinkG + (gps + (vt ? 1 : 0)) * H.sensorG
    + jstPairs * H.pairG + batteryG + H.harnessG;
  return { hardwareG, wiring: rows.map(({ id, name, connector, count, lengthMm }) => ({ id, name, connector, count, lengthMm })) };
}

/** Flight time of hardware k at mass auw (kg) on a pack of wh. vtol: hover/transition profile + cruise at V (default: design cruise).
 *  fixedwing: launch, climb, cruise, loiter (best-endurance speed), descent; with V given, all en-route time is cruise at V. */
function flight(c, m, k, rho, auw, wh, V) {
  const W = auw * G, wind = 1 + 0.004 * c.env.windMs * c.env.windMs; // extra power from headwind / tilt while hovering
  const E0 = wh * USABLE * (1 - m.reserve) * 3600; // J for the flight; the reserve stays in the pack
  // v5: E = E0 x capacity factor (cold, age) x change in resistive loss at the sustained draw p (model watts) / kap. A calibrated hover current scales every
  // power by kap, and flight time is linear in E / power, so E / kap at model powers is the same flight time. eK is that factor (1 with no cold, age or
  // calibration); the performance sweeps reuse it, and kap scales the powers back for display (avg, profile).
  const kap = c.kappa ?? 1, ek = (p) => (c.cap * drawEff(c, k, wh, p * kap)) / kap;
  if (!k.vt) { const avg = rotorW(W, k.N, k.inch, rho) * m.powerMult * wind + m.avionicsW, eK = ek(avg); return { flightMin: (E0 * eK) / avg / 60, avg: avg * kap, eK, kap }; }
  const vt = k.vt, Vc = V ?? Math.max(vt.cruise, VT.minVs * stallMs(W, vt, rho)), cr = wingW(Vc, W, vt, rho) + m.avionicsW;
  if (vt.fw) {
    const eK = ek(cr), E = E0 * eK;
    const Vl = V ?? bestSpeeds(c, m, k, rho, W).enduranceMs, lo = wingW(Vl, W, vt, rho) + m.avionicsW;
    const pL = k.fullW + m.avionicsW, pc = cr + (W * FW.climbMs) / vt.eta, pd = m.avionicsW + FW.descP * (cr - m.avionicsW);
    const fixS = FW.launchS + FW.climbS + FW.descS, fixJ = FW.launchS * pL + FW.climbS * pc + FW.descS * pd;
    const sc = Math.min(1, E / fixJ), rest = Math.max(0, E - fixJ), lf = V === undefined ? FW.loiter[c.mission] ?? FW.loiterDef : 0;
    const cruiseS = (rest * (1 - lf)) / cr, loiterS = (rest * lf) / lo, t = fixS * sc + cruiseS + loiterS;
    return { flightMin: t / 60, avg: (E / t) * kap, cr, lo, pL, pc, pd, Vc, Vl, sc, cruiseS, loiterS, eK, kap };
  }
  const hov = rotorW(W * VT.download, 4, k.inch, rho) * wind + m.avionicsW, tr = hov * vt.transP, eK = ek(hov), E = E0 * eK;
  const fixS = 2 * (VT.hoverS + vt.transS), fixJ = 2 * (VT.hoverS * hov + vt.transS * tr);
  const sc = Math.min(1, E / fixJ), cruiseS = Math.max(0, E - fixJ) / cr, t = fixS * sc + cruiseS; // sc < 1: pack too small for the profile
  return { flightMin: t / 60, avg: (E / t) * kap, hov, tr, cr, Vc, sc, cruiseS, eK, kap };
}

function build(c, m, N, rho, mb, lock, chem) {
  const fam = CONFIGURATIONS[c.config].family;
  const parts = (auw) => {
    const k = fam === "vtol" ? vtolComps(c, m, rho, auw, lock) : fam === "wing" ? fwComps(c, m, rho, auw, lock) : comps(c, m, N, rho, auw, lock?.inch);
    const h = harness(c, m, k); // hardware counts follow the parts (motors, ESCs, servos, sensors), so it sits inside the AUW loop
    return { ...k, ...h, dryG: k.dryG + h.hardwareG };
  };
  let auw = mb + c.payload + 0.8, k;
  for (let i = 0; i < 14; i++) { // inner loop: components depend on AUW, AUW depends on components
    k = parts(auw);
    const nu = mb + c.payload + k.dryG / 1000;
    const done = Math.abs(nu - auw) < 1e-5;
    auw = done ? nu : (auw + nu) / 2;
    if (done) break;
  }
  k = parts(auw);
  auw = mb + c.payload + k.dryG / 1000;
  const wh = mb * WH_KG[chem](mb), mah = (wh / k.vnom) * 1000;
  const f = flight(c, m, k, rho, auw, wh);
  return { auw, k, mb, wh, mah, f, flightMin: f.flightMin };
}

export function estimate(input) {
  try {
    const v = validate(input);
    if (v.errors.length) return { ok: false, errors: v.errors };
    return solve(v.cfg);
  } catch (err) {
    return { ok: false, errors: [t("engine.err.internal", { message: err && err.message })] };
  }
}

// Camera requirement by mission. Inspection picks by payload capacity: 4K gimbal (<0.2 kg), thermal (0.2-0.5 kg), zoom/hybrid
// gimbal (>=0.5 kg). Inspection and mapping cameras are the payload, or the camera allowance inside otherBaseG.
function cameraReq(mission, m, payloadKg) {
  const g = Math.max(Math.round(payloadKg * 1000), m.otherBaseG);
  if (mission === "inspection") return { kind: payloadKg >= 0.5 ? "zoom" : payloadKg >= 0.2 ? "thermal" : "gimbal4k", maxWeightG: g };
  if (mission === "mapping") return { kind: "survey", maxWeightG: g };
  if (mission === "agriculture") return { kind: null, maxWeightG: 0 }; // spray rigs fly preplanned routes; camera optional
  return { kind: "fpv", maxWeightG: FPV_CAM_G }; // fpv, interceptor, delivery (drop-zone view)
}

/** result.performance: sweeps around the converged build with its hardware fixed (motors, props, wing, pusher). */
function performance(c, m, k, rho, r, chem) {
  const W = r.auw * G, w = c.env.windMs, vt = k.vt, f0 = r.f, kap = f0.kap, E = r.wh * USABLE * (1 - m.reserve) * 3600 * f0.eK; // E, sweep powers: model scale, x kap shown
  const fly = (auw, wh, V) => flight(c, m, k, rho, auw, wh, V), best = bestSpeeds(c, m, k, rho, W);
  const fw = !!vt?.fw; // fixed wing: speed stall..1.8x cruise; throttle = the cruise motor's static thrust
  const speed = (vt ? lin(stallMs(W, vt, rho), (fw ? 1.8 : 1.6) * f0.Vc, 16) : lin(0, Math.max(1.6 * m.cruiseMs, 1.2 * best.rangeMs), 16)).map((V) => {
    let p, t, cs;
    if (vt) { const f = fly(r.auw, r.wh, V); p = f.cr; t = f.flightMin; cs = f.cruiseS; }
    else { p = mrW(V, W, k, rho) + m.avionicsW; t = E / p / 60; cs = t * 60; } // steady level flight, still-air power
    return { ms: r2(V), powerW: r1(p * kap), currentA: r2((p * kap) / k.vnom), flightMin: r2(t), rangeKm: r2((gs(V, w) * cs) / 1000) };
  });
  const tmaxG = k.thrustPerMotorG * k.N * (rho / RHO0); // (lift / fixed-wing static) thrust available at this air density, g
  const payload = lin(0, Math.max(1.5 * c.payload, 0.5), 11).map((kg) => {
    const auw = r.auw - c.payload + kg;
    return { kg: r3(kg), flightMin: r2(fly(auw, r.wh).flightMin), twr: r2(tmaxG / (auw * 1000)) };
  });
  // v4: 0.5x up to 6x the pack (at least 2x), stopping where the hardware can no longer carry it: hover TWR 1.3 (multirotor/VTOL)
  // or 1.5x the design AUW (wing loading/stall). Fixed hardware flies longest near battery = 2x the rest, so heavy-TWR builds show the peak.
  const minTw = fw ? vt.tw : vt ? VT.liftTWR : m.minTWR; // the T:W the build was sized for (fixed wing: static thrust)
  const auwMax = fw ? 1.5 * r.auw : tmaxG / 1000 / 1.3, mbMax = Math.max(0, auwMax - (r.auw - r.mb));
  const pt = (wh) => { const auw = r.auw - r.mb + packKg(wh, chem), tw = tmaxG / (auw * 1000);
    return { wh: r1(wh), flightMin: r2(fly(auw, wh).flightMin), auwKg: r3(auw), twr: r2(tw), feasible: tw >= minTw - 1e-9 }; };
  const hi = Math.max(2 * r.wh, Math.min(6 * r.wh, mbMax * WH_KG[chem](mbMax))), battery = lin(0.5 * r.wh, hi, 13).map(pt);
  // v4: best pack = longest flight among packs still carried at the build's T:W; the T:W boundary pack (twr falls as the pack grows)
  // is a candidate too, since the engine sizes thrust to exactly minTw at the design pack, which sits between sweep points
  const mbB = tmaxG / 1000 / minTw - (r.auw - r.mb), whB = mbB > 0 ? mbB * WH_KG[chem](mbB) : 0, edge = whB > 0 && whB < hi ? pt(whB) : null;
  const bp = [...(edge ? [edge] : []), ...battery.filter((p) => p.feasible && !(edge && p.wh >= 0.999 * edge.wh))].reduce((a, p) => (!a || p.flightMin > a.flightMin ? p : a), null);
  const batteryBest = bp && { wh: bp.wh, mah: Math.round((bp.wh / k.vnom) * 1000), flightMin: bp.flightMin, mult: r2(bp.wh / r.wh), twr: bp.twr,
    reason: bp === edge ? "twrLimit" : bp === battery.at(-1) ? "rangeEnd" : "peak" };
  // (Lift) rotor throttle sweep, propulsion only: thrust ~ throttle^2, power ~ thrust^1.5 + idle loss, droop to +10% at full throttle.
  // Fixed wing: static thrust of the cruise motor, reference point (droop onset) at half the static thrust (~70% throttle).
  const thG = fw ? 0.5 * tmaxG : r.auw * 1000 * (vt ? VT.download : 1), ph = rotorW((thG / 1000) * G, k.N, k.inch, rho), xh = Math.sqrt(thG / tmaxG);
  const throttle = lin(10, 100, 10).map((pct) => {
    const x = pct / 100, T = tmaxG * x * x;
    const p = ph * ((1 - MOTOR_IDLE) * Math.pow(T / thG, 1.5) + MOTOR_IDLE) * (1 + 0.1 * Math.max(0, (x - xh) / (1 - xh)));
    return { pct, thrustG: Math.round(T), powerW: r1(p), currentA: r2(p / k.vnom), gPerW: r2(T / p) };
  });
  const resJ = r.wh * USABLE * m.reserve * 3600 * f0.eK; // reserve energy, shown as extra time at loiter (vtol cruise) or hover power
  let seq;
  if (fw) seq = [["launch", FW.launchS * f0.sc, f0.pL], ["climb", FW.climbS * f0.sc, f0.pc], ["cruise", f0.cruiseS, f0.cr],
    ["loiter", f0.loiterS, f0.lo], ["descent", FW.descS * f0.sc, f0.pd], ["reserve", resJ / f0.cr, f0.cr]];
  else if (vt) seq = [["takeoff", VT.hoverS * f0.sc, f0.hov], ["transition", vt.transS * f0.sc, f0.tr], ["cruise", f0.cruiseS, f0.cr],
    ["transition", vt.transS * f0.sc, f0.tr], ["landing", VT.hoverS * f0.sc, f0.hov], ["reserve", resJ / f0.cr, f0.cr]];
  else {
    const T = f0.flightMin * 60, ts = Math.min(MR.toS, T / 6), hov = k.hoverPowerW, pTo = hov * MR.toP, pLd = hov * MR.landP;
    seq = [["takeoff", ts, pTo], [c.mission === "inspection" ? "hover" : "cruise", T - 2 * ts, (E - (pTo + pLd) * ts) / (T - 2 * ts)],
      ["landing", ts, pLd], ["reserve", resJ / hov, hov]]; // middle-phase power keeps total energy = usable energy
  }
  let at = 0;
  const profile = seq.map(([phase, d, p]) => { const o = { phase, startS: r1(at), durationS: r1(d), powerW: r1(p * kap) }; at += d; return o; });
  return { speed, payload, battery, batteryBest, throttle, profile, bestSpeed: { enduranceMs: r2(best.enduranceMs), rangeMs: r2(best.rangeMs) } };
}

// Li-ion C limits: continuous ~10C (21700 high-drain cells: 45 A on 4.2-4.5 Ah), bursts ~20C for a few seconds; continuous draw
// gets a 1.25 margin. Sustained draw = flight average (multirotor), hover phase (VTOL) or climb (fixed wing).
const LIION = { contC: 10, burstC: 20, margin: 1.25, minC: 2 };
const contA = (r) => (r.k.vt?.fw ? r.f.pc * r.f.kap : r.k.vt ? r.f.hov * r.f.kap : r.f.avg) / r.k.vnom; // kap: hover calibration (1 when off)
const liionAh = (r) => Math.max((LIION.margin * contA(r)) / LIION.contC, r.k.peakCurrentA / LIION.burstC); // smallest pack (Ah) the cells allow

/** Battery-mass iteration until flight time hits the target (best effort, capped). Returns the best build. */
function iterate(c, m, N, rho, chem) {
  const goal = c.target * 1.003; // aim a hair above target so result lands at/above it
  let mb = 0.15 + 0.4 * (c.payload + 0.3), lock = null, best = null, iters = 0, lo = 0, hi = Infinity;
  for (; iters < 100; iters++) {
    const r = build(c, m, N, rho, mb, lock, chem);
    const err = Math.abs(r.flightMin - goal) / goal, ok = r.flightMin >= c.target * 0.99;
    if (!best || (ok && !best.ok) || (ok === best.ok && err < best.err)) best = { r, err, ok }; // prefer builds that meet the target
    if (err < 0.003) break;
    if (iters === 12) { lock = { inch: r.k.inch, pInch: r.k.vt?.pusher?.propInch }; lo = 0; hi = Infinity; } // freeze prop sizes so snapping cannot oscillate
    if (r.flightMin < goal) lo = Math.max(lo, mb); else hi = Math.min(hi, mb);
    // once bracketed, bisect (log scale): flight time vs pack has kinks (vtol hover phases, discrete parts) that defeat the power-law step
    let nb = lo > 0 && hi < Infinity ? Math.sqrt(lo * hi) : mb * Math.pow(goal / r.flightMin, 0.8);
    const other = r.auw - mb; // cap: battery <= MAX_BATT_FRAC of AUW
    nb = Math.min(nb, (MAX_BATT_FRAC * other) / (1 - MAX_BATT_FRAC));
    nb = Math.max(nb, 0.02);
    if (Math.abs(nb - mb) / mb < 1e-5) break;
    mb = nb;
  }
  return { r: best.r, iters, lock };
}

function solve(c) {
  const m = c.fpvClass ? { ...MISSIONS.fpv, ...FPV_CLASSES[c.fpvClass] } : MISSIONS[c.mission]; // fpv: size class overrides
  const N = NMOT[c.config], env = c.env, rho = airDensity(env.altitudeM, env.tempC), vtol = c.config === "vtol";
  const fam = CONFIGURATIONS[c.config].family, tilt = c.config === "tiltrotor", fwc = fam === "wing", vfam = fam === "vtol";
  // Li-ion for long-endurance low-thrust missions (>=25 min; FPV 7/10 in from liionFromMin); fixed up-front so the iteration cannot flip-flop.
  c.liion = m.liionOK && (m.liionFromMin ? c.target >= m.liionFromMin : c.target >= 25 && m.minTWR <= 3);
  let chem = c.liion ? "liion" : "lipo";
  let { r, iters, lock } = iterate(c, m, N, rho, chem);
  // Li-ion packs (21700 P42A/P45B class) deliver ~10C continuous and ~20C for seconds. If the sustained draw (x1.25) or the
  // full-throttle burst needs more, add parallel cells (pack grows, flight time rises above target, up to the 60% battery cap);
  // if that cannot fix it, use LiPo.
  for (let i = 0; c.liion && i < 8 && liionAh(r) > (r.mah / 1000) * 1.001; i++) {
    const mb = packKg(liionAh(r) * r.k.vnom * 1.01, "liion");
    if (mb > (MAX_BATT_FRAC * (r.auw - r.mb)) / (1 - MAX_BATT_FRAC)) break;
    r = build(c, m, N, rho, mb, lock, chem);
  }
  if (c.liion && liionAh(r) > (r.mah / 1000) * 1.001) { c.liion = false; chem = "lipo"; ({ r, iters, lock } = iterate(c, m, N, rho, chem)); }
  // v4: 12S/14S heavy-lift LiPo ships in few capacities: round the pack up to the next real size and rebuild (flight time rises above
  // target); kept only when the cell count holds and the pack stays within the battery cap.
  const hl = !c.liion && r.k.cells >= 12 && HL_MAH.find((a) => a >= r.mah * 0.999);
  if (hl && hl > r.mah * 1.001) {
    const mb = packKg((hl / 1000) * r.k.vnom, chem), r2 = build(c, m, N, rho, mb, lock ?? { inch: r.k.inch, pInch: r.k.vt?.pusher?.propInch }, chem);
    if (r2.k.cells === r.k.cells && mb <= (MAX_BATT_FRAC * (r2.auw - mb)) / (1 - MAX_BATT_FRAC)) r = r2;
  }
  // v5 hover calibration: factor = measured hover current / predicted (engine hover power at nominal volts). The pack stays as sized; its power, current and
  // flight time rescale by the factor. A wing has no hover: its level-cruise current is the one to measure.
  const predA = r.k.hoverPowerW / r.k.vnom, uncalMin = r.flightMin;
  // v6: with a measured thrust curve the hover current comes from it; an explicit measured hover current (ha) on the real build beats the curve's. Either way the factor is limited to KAPPA.
  const dr = rho / RHO0, mcv = c.curve ? measuredFigures(c, m, r, N, dr, fwc) : null, measA = c.measA !== null ? c.measA : mcv?.hoverPackA ?? null;
  const kRaw = measA === null ? 1 : measA / predA, kLim = kRaw < KAPPA[0] ? 1 : Math.min(KAPPA[1], kRaw), src = c.measA !== null ? "hover" : "curve";
  if (measA !== null) { c.kappa = kLim; const f2 = flight(c, m, r.k, rho, r.auw, r.wh); r = { ...r, f: f2, flightMin: f2.flightMin }; }
  const k = r.k, f = r.f, vt = k.vt, peakA = mcv ? mcv.peakA : k.peakCurrentA; // peakA: full-throttle pack current, the curve's when there is one
  const meetsTarget = r.flightMin >= c.target * 0.99;
  const cruiseMs = vt ? f.Vc : m.cruiseMs;

  // wids: the id of each warning, in step with warnings (result.warningIds), so the page can find one without reading its text (text: warn.<id>).
  const warnings = [...c.pre], wids = c.pre.map(() => "fpvConfig");
  const warn = (id, params) => { warnings.push(t("warn." + id, params)); wids.push(id); };
  if (!meetsTarget && measA !== null) warn("measuredShort", { src: t("warn.src." + src), kappa: r2(c.kappa), min: r1(r.flightMin), target: c.target });
  else if (!meetsTarget) warn("unreachable", { target: c.target, min: r1(r.flightMin), mission: m.label, max: m.maxFlightMin, pct: MAX_BATT_FRAC * 100 });
  if (c.config === "quad" && c.payload > 3) warn("quadPayload");
  if (vfam && c.mission === "interceptor") warn("vtolInterceptor", { config: CONFIGURATIONS[c.config].label, mission: m.label });
  if (fwc && c.mission === "inspection") warn("wingInspection");
  if (fwc && c.mission === "interceptor") warn("wingInterceptor");
  if (fwc && (c.mission === "delivery" || c.mission === "agriculture")) warn("wingHover", { mission: m.label.toLowerCase() });
  if (fam === "multirotor" && c.material === "foam") warn("matFoam");
  if (fam === "multirotor" && c.material === "balsa") warn("matBalsa");
  if (c.material === "titanium" && (fam !== "multirotor" || c.mission === "fpv")) warn("matTitanium", { x: r1(matFactor(MATERIALS.titanium)) });
  if (c.material === "petg" && (c.mission === "fpv" || c.mission === "interceptor")) warn("matPetg");
  if (c.liion && peakA / (r.mah / 1000) > LIION.contC) warn("liionDraw", { c: Math.round(peakA / (r.mah / 1000)) });
  if (rho / RHO0 < 0.8) warn("thinAir", { density: r2(rho / RHO0), pct: Math.round((RHO0 / rho - 1) * 100) });
  if (env.windMs > 0.5 * cruiseMs) warn("windHalf");
  if (vfam && env.windMs > VT.hoverWindMs) warn("windVtol", { ms: VT.hoverWindMs });
  if (r.auw > 25) warn("auwHeavy");
  else if (r.auw > 0.25) warn("auwReg");
  if (k.statorMax < k.thrustPerMotorG) warn("statorMax");
  if (k.cells >= 14) warn("highVoltage");
  if (kRaw !== kLim) warn(kLim === 1 ? "measuredMismatchKept" : "measuredMismatchLimit", { src: t("warn.src." + src), kraw: r2(kRaw), pred: r1(predA), limit: kLim });
  // v5 battery: sag at the hover draw (calibrated) and at full throttle (engine peak current), loaded cell volts against the chemistry floor.
  // Hover breaches always warn; a full-throttle breach warns only when the cold, age or calibration derate causes it (a new warm pack would clear the floor).
  const bAh = r.mah / 1000, bKap = f.kap, hoverA = (k.hoverPowerW * bKap) / k.vnom, maxA = peakA, floorV = BATT.floor[chem];
  const hoverV = loadedCellV(chem, k.cells, bAh, c.rF, hoverA), maxV = loadedCellV(chem, k.cells, bAh, c.rF, maxA), maxV0 = loadedCellV(chem, k.cells, bAh, 1, maxA);
  const hoverW = hoverV < floorV && t("warn.sagHover", { v: r2(hoverV), floor: floorV }),
    maxW = maxV < floorV && t("warn.sagMax", { v: r2(maxV), floor: floorV });
  if (hoverW) { warnings.push(hoverW); wids.push("sagHover"); }
  if (maxV0 >= floorV && maxW) { warnings.push(maxW); wids.push("sagMax"); }
  if (mcv) {
    if (mcv.overCapacity) warn("curveOver", { hover: Math.round(mcv.hoverMotorG), peak: Math.round(mcv.maxThrustG / N), n: N });
    if (Math.abs(mcv.standV / k.vnom - 1) > 0.25) warn("curveVolt", { standV: r1(mcv.standV), vnom: r1(k.vnom), cells: k.cells });
    if (fwc) warn("curveWing");
  }

  // Rough parts-cost model (USD) used only for the budget warning; matcher gives real prices.
  const mat = MATERIALS[c.material];
  const estCostUsd = Math.round(
    k.frameG * (fwc ? 0.4 : vt ? 1.2 : 0.35) * mat.costRel + // molded VTOL airframes (wing, fuselage, booms) cost more per gram; foam wing kits less
    N * (10 + 0.03 * k.thrustPerMotorG) +
    N * (5 + 0.25 * k.escContinuousA) +
    (c.mission === "fpv" ? 60 : 180) +
    r.wh * (c.liion ? 0.4 : 0.3) +
    N * 0.02 * Math.pow(k.inch, 2.2) +
    (vt ? 15 * vt.servoCount + 40 : 0) + // control servos, airspeed sensor
    (vt?.pusher && !fwc ? 15 + 0.03 * vt.pusher.thrustG + 0.25 * vt.pusher.escA : 0) + // quadplane pusher + ESC (fixed wing: in N terms)
    (tilt ? 4 * 30 : 0)); // tilt servos and brackets
  if (c.budget !== null && estCostUsd > c.budget) warn("budget", { cost: estCostUsd, budget: Math.round(c.budget) });

  // fixed wing: cruise throttle = sqrt(cruise thrust / static thrust); cruise thrust = cruise propulsion power x eta / V
  const hoverThrottle = mcv?.hoverPct ?? (fwc ? 100 * Math.sqrt(Math.min(1, ((f.cr - m.avionicsW) * vt.eta) / f.Vc / ((k.thrustPerMotorG / 1000) * G * (rho / RHO0))))
    : 100 * Math.sqrt(vt ? VT.download / VT.liftTWR : 1 / m.minTWR));
  const maxThrustG = mcv ? mcv.maxThrustG : k.thrustPerMotorG * N;
  // minC: Li-ion from the sustained draw (realistic 2-10C packs), LiPo from the full-throttle peak (LiPo labels are burst-style ratings)
  const ah = r.mah / 1000, burstC = Math.ceil(peakA / ah);
  // v5: a cold or aged pack (resistance x c.rF) delivers less current for its label, so the label C needed rises by the same factor
  const cRating = c.liion ? Math.max(LIION.minC, Math.ceil((LIION.margin * contA(r) * c.rF) / ah)) : Math.max(5, Math.ceil(burstC * c.rF));
  const mahR = Math.round(r.mah / 10) * 10;
  const weights = { frameG: Math.round(k.frameG), motorsG: Math.round(k.motorG), escG: Math.round(k.escG), fcG: Math.round(k.fcG),
    batteryG: Math.round(r.mb * 1000), propsG: Math.round(k.propG), payloadG: Math.round(c.payload * 1000), otherG: Math.round(k.otherG),
    servosG: Math.round(k.servosG), tiltG: Math.round(k.tiltG), hardwareG: Math.round(k.hardwareG) }; // vtol/fixedwing: frameG = airframe (wing, fuselage, tail, booms); 0 when absent
  // multirotor: v1 out-and-back range over the whole flight at mission cruise; vtol: cruise leg only
  const rangeKm = r2(vt ? (gs(f.Vc, env.windMs) * f.cruiseS) / 1000 : (gs(m.cruiseMs, env.windMs) * r.flightMin * 60) / 1000);
  let vtolOut = null, fixedWing = null;
  if (vt) {
    const Wf = r.auw * G, CL = Wf / (0.5 * rho * f.Vc * f.Vc * vt.S), p = vt.pusher;
    const wing = { wingspanMm: Math.round(vt.span * 1000), wingAreaDm2: r1(vt.S * 100), aspectRatio: r1(vt.ar),
      wingLoadingGdm2: r1((r.auw * 1000) / (vt.S * 100)), liftToDrag: r1(CL / wingCd(CL, vt)), // at cruise
      stallMs: r1(stallMs(Wf, vt, rho)), cruiseMs: r1(f.Vc) };
    const motor = p && { statorMm: p.statorMm, kv: p.kv, thrustG: Math.round(p.thrustG), propInch: p.propInch };
    if (fwc) {
      const st = wing.stallMs, launch = r.auw < FW.handKg ? "hand" : r.auw <= 5 ? (st <= FW.handStall ? "hand" : "bungee") : r.auw <= FW.bungeeKg ? "bungee" : "runway";
      fixedWing = { ...wing, launch, motor, rangeKm, endurance: r1(r.flightMin) }; // endurance: mission flight time, min
    } else {
      vtolOut = { type: tilt ? "tiltrotor" : "quadplane", ...wing, liftMotorCount: 4, pusher: tilt ? null : motor,
        tilt: tilt ? { motorCount: 4, servoCount: 4, tiltTimeS: r1(TR.angleDeg / TR.rateDegS), transitionAngleDeg: TR.angleDeg } : null,
        hoverS: r1(2 * VT.hoverS * f.sc), transitionS: r1(2 * vt.transS * f.sc), cruiseMin: r1(f.cruiseS / 60), rangeKm, servoCount: vt.servoCount };
    }
  }
  const fpvClass = c.fpvClass;
  const pusherReq = vt?.pusher ? { statorMm: vt.pusher.statorMm, kvMin: Math.round(vt.pusher.kv * 0.8), kvMax: Math.round(vt.pusher.kv * 1.2),
    minThrustG: Math.round(vt.pusher.thrustG), propInch: vt.pusher.propInch, cells: k.cells } : null;

  // v4 R3: one T:W limit for the page (hover T:W for lift rotors, static thrust:weight for a fixed wing's cruise motor)
  const minTwr = fwc ? vt.tw : vt ? VT.liftTWR : m.minTWR, twrOut = r2((maxThrustG * (rho / RHO0)) / (r.auw * 1000)), perf = performance(c, m, mcv ? { ...k, thrustPerMotorG: mcv.maxThrustG / N } : k, rho, r, chem); // measured: the sweeps carry the curve's thrust
  if (mcv) { // the throttle sweep is the measured curve (all motors, at this air density); the model's own sweep stays as throttleModel, the overlay
    perf.throttleModel = performance(c, m, k, rho, r, chem).throttle;
    perf.throttle = c.curve.points.map((q) => { const T = N * q.thrustG * dr, P = N * (q.powerW ?? q.voltageV * q.currentA); return { pct: q.pct, thrustG: Math.round(T), powerW: r1(P), currentA: r2(N * q.currentA), gPerW: P > 0 ? r2(T / P) : 0 }; });
  }
  const bb = perf.batteryBest; // boundary pack within 5% of the design pack is the design pack: report the page's own numbers
  if (bb?.reason === "twrLimit" && Math.abs(bb.wh / r.wh - 1) <= 0.05) perf.batteryBest = { ...bb, wh: r1(r.wh), mah: mahR, flightMin: r1(r.flightMin), mult: 1, twr: twrOut };
  return {
    ok: true,
    auwKg: r3(r.auw), dryWeightKg: r3(k.dryG / 1000), // dry = airframe+propulsion+avionics, excludes battery and payload
    // vtol/fixedwing: frameSizeMm = span; vtol: lift (tiltrotor: tilting) rotors; fixedwing: the cruise motor and prop
    weights, wiring: k.wiring, frameSizeMm: k.frameSizeMm, propInch: k.inch, motorCount: N, motorKv: k.kv, motorStatorMm: k.stator,
    thrustPerMotorG: Math.round(mcv ? mcv.maxThrustG / N : k.thrustPerMotorG), maxThrustG: Math.round(maxThrustG),
    twr: twrOut, minTwr, twrKind: fwc ? "static" : "hover", hoverThrottlePct: r1(hoverThrottle), // fixedwing: static TWR, cruise throttle
    batteryCells: k.cells, batteryMah: mahR, batteryWh: r1(r.wh), batteryCRating: cRating, batteryChemistry: chem,
    escContinuousA: k.escContinuousA, escBurstA: k.escBurstA,
    hoverPowerW: Math.round(k.hoverPowerW * f.kap), avgPowerW: Math.round(f.avg), peakCurrentA: Math.round(peakA), // fixedwing hoverPowerW: level cruise power
    estFlightMin: r1(r.flightMin), rangeKm, cruiseMs: vt ? r1(cruiseMs) : cruiseMs, // vtol estFlightMin includes the hover phases
    airDensity: r3(rho), estCostUsd, iterations: iters + 1,
    warnings, warningIds: wids, meetsTarget,
    fpvClass,
    vtol: vtolOut,
    fixedWing,
    performance: perf,
    ...(mcv ? { measuredCurve: { name: mcv.name, points: mcv.points, motors: N, maxThrustG: Math.round(mcv.maxThrustG), maxCurrentA: r1(mcv.maxCurrentA), peakA: r1(mcv.peakA), standV: mcv.standV,
      hoverPct: mcv.hoverPct === null ? null : r1(mcv.hoverPct), hoverA: mcv.hoverPackA === null ? null : r1(mcv.hoverPackA), overCapacity: mcv.overCapacity, flightTime: !fwc } } : {}), // v6: absent = modelled
    // v5: voltage sag at the hover and full-throttle draw, cold/age derate and hover calibration; every figure is an estimate (BATT)
    battery: { estimate: true, chemistry: chem, cells: k.cells, nominalAh: r3(bAh), effectiveAh: r3(bAh * c.cap), capacityFactor: r3(c.cap), resistanceFactor: r3(c.rF), tempC: env.tempC, ageFadePct: c.age,
      cellMOhm: r2((1000 * packOhm(chem, k.cells, bAh, c.rF)) / k.cells), packMOhm: r1(1000 * packOhm(chem, k.cells, bAh, c.rF)), floorV,
      hoverA: r1(hoverA), hoverCellV: r2(hoverV), hoverPackV: r1(hoverV * k.cells), maxA: r1(maxA), maxCellV: r2(maxV), maxPackV: r1(maxV * k.cells),
      calibration: measA === null ? null : { measuredA: c.measA ?? r2(measA), predictedA: r2(predA), factor: r3(c.kappa), kind: fwc ? "cruise" : "hover", uncalibratedFlightMin: r1(uncalMin),
        ...(kRaw !== kLim ? { requestedFactor: r3(kRaw), limited: true } : {}), ...(c.measA === null ? { source: "curve" } : {}) },
      warnings: [hoverW, maxW].filter(Boolean) },
    requirements: {
      fpvClass,
      frame: vt ? null : { minSizeMm: Math.round(k.frameSizeMm * 0.85), maxSizeMm: Math.round(k.frameSizeMm * 1.2), material: c.material, configuration: c.config },
      // fixedwing: no lift motors, the cruise motor is requirements.pusher
      motor: fwc ? null : { statorMm: k.stator, kvMin: Math.round(k.kv * (1 - KV_BAND)), kvMax: Math.round(k.kv * (1 + KV_BAND)), minThrustG: Math.round(k.thrustPerMotorG), count: N, cells: k.cells },
      // esc cell range = acceptable ESC max-cell rating (must cover the pack, not hugely oversized)
      esc: { minContinuousA: k.escContinuousA, minCells: k.cells, maxCells: k.cells + 2, protocol: "DShot600" },
      battery: { cells: k.cells, minMah: mahR, maxMah: Math.round((mahR * 1.5) / 10) * 10, minC: cRating, burstC, chemistry: chem }, // minC continuous, burstC peak
      prop: { inch: k.inch },
      // outputs: quadplane lift + pusher + servos; tiltrotor 4 motors + 4 tilt servos + servos; fixedwing motor + servos
      fc: { minMotorOutputs: fwc ? 1 + vt.servoCount : tilt ? N + 4 + vt.servoCount : vt ? N + 1 + vt.servoCount : N, needsGps: !!vt || m.needsGps },
      camera: cameraReq(c.mission, m, c.payload),
      // vtol airframe: span window (kits come in few sizes), min wing area (wing loading may rise <=11%), maxAuwKg = MTOW it must carry
      vtol: vfam ? { minSpanMm: Math.round(vt.span * 800), maxSpanMm: Math.round(vt.span * 1250), minAreaDm2: r1(vt.S * 90),
        maxAuwKg: Math.ceil(r.auw * 10) / 10, servoCount: vt.servoCount, frameG: Math.round(k.frameG), auwKg: r3(r.auw) } : null,
      // frameG = structure estimate, auwKg = takeoff mass: the matcher ranks heavy kits down and rejects any heavier than the aircraft
      wing: fwc ? { minSpanMm: Math.round(vt.span * 800), maxSpanMm: Math.round(vt.span * 1250), minAreaDm2: r1(vt.S * 90), maxAuwKg: Math.ceil(r.auw * 10) / 10, frameG: Math.round(k.frameG), auwKg: r3(r.auw) } : null,
      pusher: pusherReq, // quadplane pusher; fixedwing main motor; null otherwise
      servo: fwc ? { count: vt.servoCount } : null,
      tilt: tilt ? { servoCount: 4, minTorqueKgcm: Math.max(TR.torqueMin, Math.ceil((TR.torqueK * k.thrustPerMotorG) / 1000)) } : null
    }
  };
}
