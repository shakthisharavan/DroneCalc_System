// Wiring and connectors: one list for the Components section and the PDF. Pure string and row builders.
// Uses result.wiring [{name, connector, count, lengthMm}] when the engine sends it; otherwise derives a basic list from the build.
import { esc } from './parts.js';

const fin = Number.isFinite;
const cnt = (v) => (fin(v) ? String(Math.round(v)) : '-');

// -> { rows: [{name, connector, count, lengthMm}], derived: bool }. rows is [] when there is nothing to show.
// bat = the picked battery item: its specs.connector replaces the battery lead's estimated connector.
export function wiringRows(r, mission, bat) {
  const out = base(r, mission), c = bat?.specs?.connector;
  if (c) out.rows = out.rows.map((w) => (/^battery/i.test(w.name) ? { ...w, connector: `${c} (picked battery)` } : w));
  return out;
}
function base(r, mission) {
  if (!r?.ok) return { rows: [], derived: false };
  if (Array.isArray(r.wiring) && r.wiring.length) {
    const rows = r.wiring.filter((w) => w && w.name).map((w) => ({ name: String(w.name), connector: String(w.connector || '-'), count: fin(w.count) ? w.count : '-', lengthMm: fin(w.lengthMm) ? w.lengthMm : '-' }));
    return { rows, derived: false };
  }
  // Derived: basic harness for the build. Lengths are estimates; the engine's list replaces this when it ships.
  const motors = r.motorCount ?? 4, fixed = !!r.fixedWing, v = r.vtol, gps = !!r.requirements?.fc?.needsGps;
  const servos = (v?.servoCount ?? (fixed ? 2 : 0)) + (v?.tilt?.servoCount ?? 0);
  const rows = [
    { name: 'ESC power, per motor', connector: 'Solder or 4 mm bullet', count: motors, lengthMm: 120 },
    { name: 'ESC signal, per motor', connector: 'Signal lead (DShot)', count: motors, lengthMm: 200 },
    ...(v?.pusher ? [{ name: 'Pusher ESC, power and signal', connector: 'Solder and signal lead', count: 1, lengthMm: 150 }] : []),
    ...(servos > 0 ? [{ name: 'Servo signal, control surfaces and tilt', connector: 'Servo lead, 3-pin', count: servos, lengthMm: 250 }] : []),
    { name: 'Flight controller, main bus', connector: 'JST GH 6-pin', count: 1, lengthMm: 120 },
    { name: 'Flight controller, telemetry', connector: 'JST SH 4-pin', count: 1, lengthMm: 200 },
    ...(gps ? [{ name: 'GPS and compass', connector: 'JST GH 6-pin', count: 1, lengthMm: 250 }, { name: 'CAN bus', connector: 'JST GH 4-pin', count: 1, lengthMm: 300 }] : []),
    { name: 'Receiver, SBUS', connector: 'JST SH 3-pin', count: 1, lengthMm: 250 },
    ...(mission === 'fpv' || mission === 'interceptor' ? [{ name: 'Video transmitter', connector: 'JST SH 4-pin', count: 1, lengthMm: 120 }] : []),
    ...(mission !== 'agriculture' ? [{ name: 'Camera', connector: 'JST GH 4-pin (power, video)', count: 1, lengthMm: 150 }] : []),
    { name: 'Battery lead', connector: fin(r.peakCurrentA) && r.peakCurrentA > 60 ? 'XT90' : 'XT60', count: 1, lengthMm: 150 },
  ];
  return { rows, derived: true };
}

// Section block for the Components list; empty string when there are no rows.
export function wiringHtml({ rows, derived }) {
  if (!rows.length) return '';
  return `<section class="wiring" id="wiring" tabindex="-1" aria-labelledby="h-wiring"><h4 id="h-wiring">Wiring and connectors</h4>
<p class="need">${derived ? 'Estimated from this build. Check lengths on the bench.' : 'From the build calculation.'}</p>
<table class="wt"><thead><tr><th scope="col">Item</th><th scope="col">Connector</th><th scope="col" class="n">Count</th><th scope="col" class="n">Length (mm)</th></tr></thead>
<tbody>${rows.map((w) => `<tr><th scope="row" class="p">${esc(w.name)}</th><td class="c" data-l="Connector">${esc(w.connector)}</td><td class="n" data-l="Count">${esc(cnt(w.count))}</td><td class="n" data-l="Length (mm)">${esc(cnt(w.lengthMm))}</td></tr>`).join('')}</tbody></table></section>`;
}

// PDF table in the same shape as the perf tables: {title, columns, rows} with display strings.
export function wiringTable({ rows }) {
  if (!rows.length) return null;
  return { title: 'Wiring and connectors', columns: ['Item', 'Connector', 'Count', 'Length (mm)'], rows: rows.map((w) => [w.name, w.connector, cnt(w.count), cnt(w.lengthMm)]) };
}
