// F8 measured thrust curve: CSV parsing (units, hostile cells, caps), interpolation, the engine using the curve, the `mc` share-link id, storage, markup,
// and the red-team fixes that ride with it (custom parts in the PDF, invisible names, age validation, calibration limit, import confirmation).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as C from '../js/catalog.js';
import * as M from '../js/matcher.js';
import * as PERF from '../js/ui/perf.js';
import * as CHK from '../js/checks.js';
import { createState, cleanName, MC, mcOf } from '../js/ui/state.js';
import { createCustom } from '../js/ui/custom.js';
import { mountIO, replaceMsg, CSV_EXT } from '../js/ui/io.js';
import { esc } from '../js/ui/parts.js';
import { parseThrustCsv, readThrustFile, createCurves, downsample, measuredHtml, mountMeasured, roleOf, ui, CSV_MAX_BYTES, CSV_MAX_ROWS, CURVES_KEY, CURVES_MAX, CURVE_ID } from '../js/ui/measured.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const EVIL = '<img src=x onerror=alert(1)>"\'&';
// A linear stand curve for ONE motor: gPer grams and aPer amps per throttle percent, at a fixed stand voltage.
const lin = (gPer, aPer, V = 15, name = 'Lin') => ({ name, points: Array.from({ length: 11 }, (_, i) => ({ pct: i * 10, thrustG: gPer * i * 10, currentA: aPer * i * 10, voltageV: V })) });
// Generic stand CSV (throttle %, thrust g, current A, volts) from a curve, any thrust scale or header.
const toCsv = (c, { head = 'Throttle (%),Thrust (g),Current (A),Voltage (V)', k = 1, d = ',', eol = '\n' } = {}) =>
  [head, ...c.points.map((p) => [p.pct, p.thrustG * k, p.currentA, p.voltageV].join(d))].join(eol);
const fresh = (store = mem()) => { const CRV = createCurves(store), X = createState({ E, C, M, PERF, CHK, CURVES: CRV }); return { CRV, X, store }; };
const HASH0 = '#s=3&m=mapping&t=30';

// ---- parser
test('parse: generic CSV, every thrust unit gives the same grams', () => {
  const c = lin(10, 0.1), g = parseThrustCsv(toCsv(c), 'my motor.csv');
  assert.equal(g.error, undefined); assert.equal(g.curve.name, 'my motor'); assert.equal(g.curve.points.length, 11); assert.equal(g.rows, 11);
  assert.deepEqual(g.curve.points[10], { pct: 100, thrustG: 1000, currentA: 10, voltageV: 15 }); assert.match(g.notes.join(' '), /Thrust unit: g\./);
  for (const [unit, k, tol] of [['kgf', 0.001, 0.2], ['N', 9.80665 / 1000, 0.2], ['lbf', 1 / 453.59237, 0.3]]) {
    const r = parseThrustCsv(toCsv(c, { head: `Throttle (%),Thrust (${unit}),Current (A),Voltage (V)`, k }), 'a.csv');
    assert.equal(r.error, undefined, unit); assert.ok(Math.abs(r.curve.points[10].thrustG - 1000) <= tol, `${unit}: ${r.curve.points[10].thrustG}`); assert.match(r.notes.join(' '), new RegExp(`Thrust unit: ${unit}\\.`));
  }
  const none = parseThrustCsv(toCsv(c, { head: 'Throttle (%),Thrust,Current (A),Voltage (V)' }), 'a.csv');
  assert.equal(none.curve.points[10].thrustG, 1000); assert.match(none.notes.join(' '), /no unit, so grams-force was assumed/);
  const ma = parseThrustCsv('Throttle (%),Thrust (g),Current (mA),Voltage (mV)\n0,0,0,16000\n50,400,5000,15800\n100,1000,10000,15000', 'a.csv');
  assert.deepEqual(ma.curve.points[2], { pct: 100, thrustG: 1000, currentA: 10, voltageV: 15 }, 'mA and mV are scaled');
});

test('parse: RCbenchmark style (ESC microseconds, kgf, repeated samples averaged, rpm and power kept)', () => {
  const head = 'Time (s),ESC signal (µs),Torque (N·m),Thrust (kgf),Voltage (V),Current (A),Motor Electrical Power (W),Motor Optical Speed (RPM),Electrical Efficiency (g/W)';
  const rows = [];
  for (const us of [1000, 1250, 1500, 1750, 2000]) for (const j of [-1, 0, 1]) { const f = (us - 1000) / 1000; rows.push([rows.length, us, 0.01, (1.2 * f * f + j * 0.001).toFixed(4), (16 - 2 * f).toFixed(2), (30 * f * f).toFixed(2), (16 * 30 * f * f).toFixed(1), Math.round(20000 * f), 1].join(',')); }
  const r = parseThrustCsv([head, ...rows].join('\r\n'), 'Tyto test 1.csv');
  assert.equal(r.error, undefined); assert.deepEqual(r.curve.points.map((p) => p.pct), [0, 25, 50, 75, 100], 'µs map to percent, 3 samples per step averaged');
  assert.equal(r.curve.points[4].thrustG, 1200); assert.equal(r.curve.points[4].currentA, 30); assert.equal(r.curve.points[4].rpm, 20000); assert.equal(r.curve.points[4].powerW, 480); assert.equal(r.curve.points[4].voltageV, 14);
  assert.equal(roleOf('Torque (N·m)'), null, 'torque is not thrust'); assert.equal(roleOf('Thrust (kgf)'), 'thrust'); assert.equal(roleOf('Motor Optical Speed (RPM)'), 'rpm');
  assert.match(parseThrustCsv(['Time,ESC signal (µs),Thrust (g),Voltage (V),Current (A)', '0,700,0,16,0', '1,1500,500,15,10', '2,2000,900,14,20'].join('\n'), 'a').error, /Row 2: the ESC signal 700 µs is outside 800 to 2200/);
});

test('parse: BOM, CRLF, semicolon and tab delimiters, quoted header, comment lines', () => {
  const c = lin(10, 0.1), want = parseThrustCsv(toCsv(c), 'a.csv').curve.points;
  assert.deepEqual(parseThrustCsv('﻿' + toCsv(c, { eol: '\r\n' }) + '\r\n', 'a.csv').curve.points, want, 'BOM + CRLF + trailing blank line');
  assert.deepEqual(parseThrustCsv(toCsv(c, { d: ';', head: 'Throttle (%);Thrust (g);Current (A);Voltage (V)' }), 'a.csv').curve.points, want, 'semicolon');
  assert.deepEqual(parseThrustCsv(toCsv(c, { d: '\t', head: 'Throttle (%)\tThrust (g)\tCurrent (A)\tVoltage (V)' }), 'a.csv').curve.points, want, 'tab');
  assert.deepEqual(parseThrustCsv('sep=,\n# exported by a stand\n"Throttle (%)","Thrust (g)","Current (A)","Voltage (V)"\n' + toCsv(c).split('\n').slice(1).join('\n'), 'a.csv').curve.points, want, 'sep line, comment, quoted header');
});

test('parse: caps (bytes, rows), empty and binary input', async () => {
  const sweep = (n) => ['Throttle (%),Thrust (g),Current (A),Voltage (V)', ...Array.from({ length: n }, (_, i) => `${(i / n) * 100},${i},${i / 100},15`)].join('\n');
  const ok = parseThrustCsv(sweep(CSV_MAX_ROWS), 'a.csv');
  assert.equal(ok.error, undefined, 'exactly the row cap is accepted'); assert.equal(ok.curve.points.length, 50, 'thinned to 50 points'); assert.match(ok.notes.join(' '), /Thinned from 5000 to 50/);
  assert.equal(ok.curve.points[0].pct, 0); assert.ok(ok.curve.points[49].pct > 99.9, 'first and last kept');
  assert.match(parseThrustCsv(sweep(CSV_MAX_ROWS + 1), 'a.csv').error, /more than 5000 data rows/);
  assert.match(parseThrustCsv('x'.repeat(CSV_MAX_BYTES + 1), 'a.csv').error, /larger than 512 KB/);
  assert.match(parseThrustCsv('Throttle (%),Thrust (g)\n' + '1,1\n'.repeat(140000), 'a.csv').error, /larger than 512 KB/);
  assert.match(parseThrustCsv('', 'a.csv').error, /empty/); assert.match(parseThrustCsv('\n\n# c\n', 'a.csv').error, /empty/);
  assert.match(parseThrustCsv(null).error, /could not be read/);
  assert.match(parseThrustCsv('PK\u0003\u0004\u0000\u0000binary', 'a.csv').error, /not a text CSV/);
  assert.match(parseThrustCsv('H Product:Blackbox flight data recorder by Nicholas Sherlock\nH Data version:2\n', 'a.csv').error, /not a text CSV/);
  // the size is checked before the file is read
  let read = 0; const big = { size: CSV_MAX_BYTES + 1, name: 'a.csv', text: async () => { read++; return ''; } };
  assert.match((await readThrustFile(big)).error, /larger than 512 KB/); assert.equal(read, 0, 'an oversize file is never read');
  assert.match((await readThrustFile(null)).error, /larger than|could not/); assert.match((await readThrustFile({ size: 5, name: 'x.csv', text: async () => { throw new Error('nope'); } })).error, /could not be read/);
  assert.equal((await readThrustFile(new File([toCsv(lin(10, 0.1))], 'real.csv'))).curve.name, 'real');
});

test('parse: hostile and non-numeric cells are rejected, never evaluated or echoed', () => {
  const c = lin(10, 0.1), good = toCsv(c).split('\n');
  const withCell = (row, col, v) => { const r = good.slice(); const cells = r[row].split(','); cells[col] = v; r[row] = cells.join(','); return r.join('\n'); };
  for (const bad of ['=CMD()', '=1+1', '+SUM(A1)', '@A1', 'NaN', 'Infinity', '-Infinity', '1e999', '0x10', '1,5', '1 2', '', 'abc', '<script>alert(1)</script>', '1e5000', '9'.repeat(30)]) {
    const r = parseThrustCsv(withCell(4, 1, bad.replace(',', ' ')), 'a.csv'); // (a comma inside would only shift columns)
    assert.match(r.error ?? '', /^Row 5: the thrust cell is not a number, so nothing was imported\.$/, JSON.stringify(bad));
    assert.ok(!(r.error ?? '').includes(bad) || bad === '', 'the cell text is not echoed');
  }
  assert.match(parseThrustCsv(withCell(2, 2, 'NaN'), 'a.csv').error, /Row 3: the current cell/); assert.match(parseThrustCsv(withCell(2, 3, '=1'), 'a.csv').error, /Row 3: the voltage cell/); assert.match(parseThrustCsv(withCell(2, 0, 'x'), 'a.csv').error, /Row 3: the throttle cell/);
  // a bad optional column is dropped, not fatal
  const opt = parseThrustCsv('Throttle (%),Thrust (g),Current (A),Voltage (V),RPM\n0,0,0,16,=CMD()\n50,400,5,15,1000\n100,1000,10,14,2000', 'a.csv');
  assert.equal(opt.error, undefined); assert.ok(opt.curve.points.every((p) => !('rpm' in p))); assert.match(opt.notes.join(' '), /RPM column had cells that are not valid numbers/);
  // hostile header text and file name only ever reach the message / name as stripped, shortened text
  const h = parseThrustCsv(`=HYPERLINK("http://evil.example")${'x'.repeat(100)},b,c\n1,2,3\n4,5,6\n7,8,9`, 'a.csv');
  assert.match(h.error, /No throttle \(%\), thrust .* column found/); assert.ok(h.error.length < 400); assert.ok(!h.error.includes('x'.repeat(30)));
  const n = parseThrustCsv(toCsv(c), `${EVIL}‮\u0000.csv`); assert.ok(!/[‮\u0000]/.test(n.curve.name)); assert.ok(n.curve.name.length <= 40);
});

test('parse: bounds, monotonic throttle, falling thrust, missing columns, units that cannot be right', () => {
  const c = lin(10, 0.1), lines = toCsv(c).split('\n');
  assert.match(parseThrustCsv(lines.slice(0, 1).concat(lines.slice(1).reverse()).join('\n'), 'a.csv').error, /Row 3: throttle falls from 100\.0 to 90\.0 %.*one upward throttle sweep/);
  assert.match(parseThrustCsv(lines.join('\n').replace('\n50,', '\n150,'), 'a.csv').error, /throttle 150 is outside 0 to 100 %/);
  assert.match(parseThrustCsv(lines.join('\n').replace(',15\n', ',150\n'), 'a.csv').error, /voltage 150\.0 V is outside 1 to 100 V/);
  assert.match(parseThrustCsv(lines.join('\n').replace(',10,15', ',1000,15'), 'a.csv').error, /current 1,000\.0 A is outside 0 to 500 A/);
  assert.match(parseThrustCsv('Throttle (%),Thrust (kgf),Current (A),Voltage (V)\n0,0,0,16\n50,1500,5,15\n100,3000,10,14', 'a.csv').error, /outside the possible range for one motor\. Check the thrust unit/);
  // thrust that falls by more than noise is a different kind of file; a dip of 5% of the maximum or less is smoothed flat
  assert.match(parseThrustCsv('Throttle (%),Thrust (g),Current (A),Voltage (V)\n0,0,0,16\n40,800,5,15\n70,500,8,15\n100,1000,10,14', 'a.csv').error, /Thrust falls as throttle rises \(near 70.0 % throttle\)/);
  assert.match(parseThrustCsv('Throttle (%),Thrust (g),Current (A),Voltage (V)\n0,0,0,16\n40,300,5,15\n70,200,8,15\n100,1000,10,14', 'a.csv').error ?? '', /Thrust falls/);
  const dip = parseThrustCsv('Throttle (%),Thrust (g),Current (A),Voltage (V)\n0,0,0,16\n40,520,5,15\n70,500,8,15\n100,1000,10,14', 'a.csv');
  assert.equal(dip.error, undefined); assert.deepEqual(dip.curve.points.map((p) => p.thrustG), [0, 520, 520, 1000], 'a 2% dip is held at the running maximum');
  assert.match(parseThrustCsv('Throttle (%),Thrust (g),Current (A),Voltage (V)\n0,0,0,16\n50,0,5,15\n100,0,10,14', 'a.csv').error, /Thrust is zero everywhere/);
  assert.match(parseThrustCsv('Throttle (%),Thrust (g),Current (A),Voltage (V)\n0,0,0,16\n50,2,20,15\n100,4,40,14', 'a.csv').error, /implausibly low .* Check the thrust unit/);
  assert.match(parseThrustCsv('Throttle (%),Thrust (g),Current (A),Voltage (V)\n0,0,0.5,16\n50,9000,10,15\n100,20000,20,14', 'a.csv').error, /implausibly high for the power drawn \(over 30 g per watt\)/);
  // missing columns: the message names what is missing and what was found
  const m = parseThrustCsv('Throttle (%),Thrust (g),Voltage (V)\n1,2,3\n4,5,6\n7,8,9', 'a.csv');
  assert.match(m.error, /^No current \(A\) column found\. The columns are: Throttle \(%\), Thrust \(g\), Voltage \(V\)\.$/);
  assert.match(parseThrustCsv('a,b,c\n1,2,3\n4,5,6\n7,8,9', 'a.csv').error, /No throttle \(%\), thrust \(g, kgf or N\), current \(A\), voltage \(V\) column found/);
  assert.match(parseThrustCsv('Throttle (%),Thrust (g),Current (A),Voltage (V)\n0,0,0,16\n100,1000,10,14', 'a.csv').error, /at least 3 data rows/);
  assert.match(parseThrustCsv('Throttle (%),Thrust (g),Current (A),Voltage (V)\n0,0,0,16\n50,500,5,15\n50,520,6,15', 'a.csv').error, /2 different throttle levels; a curve needs at least 3/);
  const avg = parseThrustCsv('Throttle (%),Thrust (g),Current (A),Voltage (V)\n0,0,0,16\n50,400,5,15\n50,600,7,15\n100,1000,10,14', 'a.csv');
  assert.deepEqual(avg.curve.points[1], { pct: 50, thrustG: 500, currentA: 6, voltageV: 15 }, 'equal throttle rows are averaged');
});

test('downsample: at most 50 points, ends kept, order kept', () => {
  const a = Array.from({ length: 1234 }, (_, i) => i), d = downsample(a, 50);
  assert.equal(d.length, 50); assert.equal(d[0], 0); assert.equal(d[49], 1233); assert.ok(d.every((v, i) => !i || v > d[i - 1]));
  assert.equal(downsample([1, 2, 3], 50).length, 3); assert.equal(downsample(a).length, 50);
});

// ---- engine: validation, interpolation
test('curveOf validates and rebuilds a curve from anything', () => {
  const ok = E.curveOf({ name: 'A\u0000\n', points: [{ pct: 0, thrustG: 0, currentA: 0, voltageV: 16, evil: 1, __proto__: { x: 1 } }, { pct: 50, thrustG: 400, currentA: 5, voltageV: 15, rpm: 9000 }, { pct: 100, thrustG: 1000, currentA: 10, voltageV: 14, powerW: 140 }] });
  assert.equal(ok.error, undefined); assert.equal(ok.curve.name, 'A'); assert.deepEqual(Object.keys(ok.curve.points[0]), ['pct', 'thrustG', 'currentA', 'voltageV'], 'unknown keys dropped'); assert.equal(ok.curve.points[1].rpm, 9000);
  const P = (...p) => ({ points: p.map(([pct, thrustG, currentA, voltageV = 15]) => ({ pct, thrustG, currentA, voltageV })) });
  const bad = [[null, /list of points/], [{}, /list of points/], [{ points: 'x' }, /list of points/], [P([0, 0, 0], [50, 1, 1]), /3 to 50 points, not 2/], [{ points: Array.from({ length: 51 }, (_, i) => ({ pct: i, thrustG: i, currentA: i, voltageV: 15 })) }, /not 51/],
    [P([0, 0, 0], [50, 400, 5], [50, 500, 6]), /throttle must rise/], [P([0, 0, 0], [50, 400, 5], [40, 500, 6]), /throttle must rise/], [P([0, 0, 0], [50, 400, 5], [60, 300, 6]), /must not fall/], [P([0, 0, 0], [50, 400, 5], [60, 500, 4]), /must not fall/],
    [P([0, 0, 0], [50, 400, NaN], [60, 500, 6]), /currentA must be between/], [P([0, 0, 0], [50, 400, 5], [60, Infinity, 6]), /thrustG must be between/], [P([0, 0, 0], [50, 400, 5], [101, 500, 6]), /pct must be between/], [P([0, 0, 0], [50, 400, 5], [60, 500, 6, 0.5]), /voltageV must be between/],
    [P([0, 0, 0], [50, 0, 5], [60, 0, 6]), /never produces thrust/], [{ points: [{ pct: 0, thrustG: 0, currentA: 0 }, { pct: 1, thrustG: 1, currentA: 1, voltageV: 1 }, { pct: 2, thrustG: 2, currentA: 2, voltageV: 1 }] }, /point 1 has no voltageV/], [{ points: [1, 2, 3] }, /not a point/],
    [P([0, '0', 0], [50, 400, 5], [60, 500, 6]), /thrustG must be between/]];
  for (const [raw, re] of bad) assert.match(E.curveOf(raw).error ?? 'accepted', re, JSON.stringify(raw)?.slice(0, 80));
});

test('curveAtPct and curveAtThrust interpolate, clamp and flag a curve that is too weak', () => {
  const pts = E.curveOf({ points: [[0, 0, 0, 16], [50, 400, 5, 15], [50.5, 400, 5.5, 15], [100, 1000, 10, 14]].map(([pct, thrustG, currentA, voltageV]) => ({ pct, thrustG, currentA, voltageV })) }).curve.points;
  const a = E.curveAtPct(pts, 25); assert.deepEqual([a.pct, a.thrustG, a.currentA, a.voltageV], [25, 200, 2.5, 15.5]);
  assert.equal(E.curveAtPct(pts, -5).thrustG, 0, 'below the first point: its value'); assert.equal(E.curveAtPct(pts, 250).thrustG, 1000, 'above the last: its value');
  assert.equal(E.curveAtPct(pts, 0).thrustG, 0); assert.equal(E.curveAtPct(pts, 100).currentA, 10);
  const b = E.curveAtThrust(pts, 200); assert.deepEqual([b.pct, b.currentA, b.over], [25, 2.5, false]);
  assert.equal(E.curveAtThrust(pts, 0).pct, 0); assert.equal(E.curveAtThrust(pts, -9).over, false);
  assert.deepEqual([E.curveAtThrust(pts, 1000).pct, E.curveAtThrust(pts, 1000).over], [100, false]); const o = E.curveAtThrust(pts, 1500); assert.deepEqual([o.pct, o.thrustG, o.over], [100, 1000, true], 'beyond the curve: its end, flagged');
  const flat = E.curveAtThrust(pts, 400); assert.equal(flat.pct, 50, 'a flat stretch resolves to its first throttle, no division by zero'); assert.ok(Number.isFinite(E.curveAtThrust(pts, 400.0001).pct));
});

// ---- engine through the state layer: the curve drives hover current, thrust, T:W, flight time
test('engine uses the measured curve: figures follow the curve, and a build without one is untouched', () => {
  const { CRV, X } = fresh(), id = CRV.add(lin(10, 0.1)).id;
  const base = X.run(X.parse(HASH0).S), S = X.parse(`${HASH0}&mc=${id}`).S, r = X.run(S);
  assert.equal(base.measuredCurve, undefined, 'no curve, no measuredCurve field'); assert.equal(r.ok, true);
  const mc = r.measuredCurve; assert.deepEqual([mc.name, mc.points, mc.motors, mc.maxThrustG, mc.maxCurrentA, mc.standV, mc.overCapacity, mc.flightTime], ['Lin', 11, 4, 4000, 40, 15, false, true]);
  assert.equal(r.maxThrustG, 4000, 'motors x the curve maximum'); assert.ok(r.twr > 4000 * 0.95 / (r.auwKg * 1000) && r.twr <= 4000 / (r.auwKg * 1000), `T:W ${r.twr} (thrust is air-density corrected, 20 C is ~2% thin)`); assert.equal(r.thrustPerMotorG, 1000);
  assert.equal(r.peakCurrentA, 41, '4 x 10 A plus avionics'); assert.equal(r.battery.maxA, 40.8);
  // hover: thrust per motor = weight / 4, current read off the curve (10 g and 0.1 A per percent)
  // (10 g per percent: the throttle in percent is the thrust per motor / 10; the density correction lifts it ~2% above weight / 4)
  const need = mc.hoverPct * 10, hoverPack = 4 * need * 0.01 + 0.8; assert.ok(Math.abs(mc.hoverA - hoverPack) < 0.2, `${mc.hoverA} vs ${hoverPack}`); assert.ok(Math.abs(need - (r.auwKg * 1000) / 4) < 0.03 * need, `${need} g per motor vs weight / 4`);
  assert.equal(r.battery.calibration.source, 'curve'); assert.ok(r.battery.calibration.factor > 1 && r.battery.calibration.factor <= 2);
  assert.ok(r.estFlightMin < base.estFlightMin, 'a hungrier measured motor shortens the flight');
  assert.deepEqual(Object.keys(r.performance.throttle[0]).sort(), ['currentA', 'gPerW', 'pct', 'powerW', 'thrustG'], 'measured rows'); assert.ok(r.performance.throttle.at(-1).thrustG > 3900 && r.performance.throttle.at(-1).thrustG <= 4000, 'N x the curve, air-density corrected like T:W'); assert.ok(r.performance.throttleModel.length >= 3, 'the model sweep is kept for the overlay');
  // an explicit measured hover current beats the curve's
  const withHa = X.run(X.parse(`${HASH0}&mc=${id}&ha=20`).S); assert.equal(withHa.battery.calibration.measuredA, 20); assert.equal(withHa.battery.calibration.source, undefined);
  // the same curve on the same build is deterministic
  assert.deepEqual(X.run(S), r);
  // results() and the PDF say Measured
  const R = X.results(S, r), doc = X.pdfDoc(R, S, '2026-11-14'); assert.ok(doc.specs.some(([k, v]) => k === 'Thrust data' && /^Measured: Lin, 11 points, 4 motors, 4,?000 g at full throttle$/.test(v)), JSON.stringify(doc.specs));
  assert.ok(X.pdfDoc(X.results(X.parse(HASH0).S, base), X.parse(HASH0).S, '2026-11-14').specs.some(([k, v]) => k === 'Thrust data' && v === 'Modelled'));
});

test('engine: weak curve, voltage mismatch, fixed wing, invalid curve', () => {
  const { CRV, X } = fresh();
  const weak = X.run(X.parse(`${HASH0}&mc=${CRV.add(lin(2, 0.05)).id}`).S);
  assert.equal(weak.measuredCurve.overCapacity, true); assert.ok(weak.warnings.some((w) => /hover needs \d+ g per motor but the curve peaks at 200 g, so 4 of these motors cannot lift/.test(w)));
  const hv = X.run(X.parse(`${HASH0}&mc=${CRV.add(lin(10, 0.1, 30)).id}`).S); assert.ok(hv.warnings.some((w) => /recorded at 30 V under load; this build's pack is [\d.]+ V nominal \(4S\)/.test(w)));
  const fm = X.run(X.parse('#s=3&m=mapping&t=30&cfg=fixedwing').S), fw = X.run(X.parse(`#s=3&m=mapping&t=30&cfg=fixedwing&mc=${CRV.add(lin(10, 0.1)).id}`).S);
  assert.equal(fw.estFlightMin, fm.estFlightMin, 'a wing keeps its modelled flight time'); assert.equal(fw.measuredCurve.flightTime, false); assert.equal(fw.measuredCurve.hoverA, null); assert.equal(fw.maxThrustG, 1000);
  assert.ok(fw.warnings.some((w) => /a fixed wing has no hover, so the curve sets static thrust : weight and full-throttle current only/.test(w)));
  const bad = E.estimate({ mission: 'mapping', targetFlightMin: 30, frameMaterial: 'carbon', configuration: 'quad', thrustCurve: { name: 'x', points: [{ pct: 0, thrustG: 0, currentA: 0, voltageV: 15 }, { pct: 50, thrustG: 500, currentA: 5, voltageV: 15 }, { pct: 40, thrustG: 600, currentA: 6, voltageV: 15 }] } });
  assert.equal(bad.ok, false); assert.deepEqual(bad.errors, ['Thrust curve: throttle must rise from point to point (point 3)']);
  assert.equal(E.estimate({ mission: 'mapping', targetFlightMin: 30, frameMaterial: 'carbon', configuration: 'quad', thrustCurve: null }).ok, true, 'null = no curve');
});

// ---- the `mc` link parameter
test('mc hash param: id only, bounded, validated, absent when empty', () => {
  const { X } = fresh();
  for (const ok of ['abcd', 'a1b2c3d4', 'abcdefghijkl', '0000']) assert.equal(X.parse(`${HASH0}&mc=${ok}`).S.mc, ok, ok);
  for (const bad of ['abc', 'abcdefghijklm', 'ABCDEF', 'a-b-c-d', 'ab cd', '<script>', 'ab%00cd', '../../x', 'abcd\n', '']) assert.equal(X.parse(`${HASH0}&mc=${encodeURIComponent(bad)}`).S.mc, '', JSON.stringify(bad));
  assert.ok(MC.test('a1b2c3d4') && !MC.test('A1B2C3D4') && !MC.test('abc')); assert.equal(mcOf('a1b2c3d4'), 'a1b2c3d4'); assert.equal(mcOf('abc'), null); assert.equal(mcOf(5), null); assert.equal(mcOf(null), null);
  const S = X.parse(`${HASH0}&ha=18.25&mc=a1b2c3d4`).S; assert.equal(X.hashOf(S, 3), `${HASH0}&mat=carbon&cfg=quad&alt=0&tmp=20&w=3&cur=USD&ha=18.25&mc=a1b2c3d4`, 'written after ha');
  assert.deepEqual(X.parse(X.hashOf(S, 3)).S, S, 'round trip'); assert.ok(!X.hashOf({ ...S, mc: '' }, 3).includes('mc='), 'absent when empty'); assert.ok(!X.hashOf({ ...S, mc: '<img>' }, 3).includes('mc='), 'an invalid id is never written');
  assert.equal(X.hashOf(X.parse(`${HASH0}&mc=${'a'.repeat(5000)}`).S, 3).length < 200, true);
});

test('old share links stay byte-identical (golden hashes from before the curve and flight-log work)', () => {
  const GOLD = [
    ['#s=3&m=mapping&t=30', '#s=3&m=mapping&t=30&mat=carbon&cfg=quad&alt=0&tmp=20&w=3&cur=USD'],
    ['#s=3&m=delivery&t=25&p=1.5&cfg=hex&alt=500&b=800&cur=USD&n=My%20Hex', '#s=3&m=delivery&t=25&p=1.5&mat=carbon&cfg=hex&alt=500&tmp=20&w=3&b=800&cur=USD&n=My%20Hex'],
    ['#s=3&m=fpv&fc=7&t=12', '#s=3&m=fpv&t=12&mat=carbon&cfg=quad&fc=7&alt=0&tmp=20&w=3&cur=USD'],
    ['#s=3&m=mapping&t=60&cfg=vtol&age=12.5&ha=18.25&mw=2400', '#s=3&m=mapping&t=60&mat=carbon&cfg=vtol&alt=0&tmp=20&w=3&cur=USD&mw=2400&age=12.5&ha=18.25'],
    ['#s=3&m=inspection&t=20&sel=motor:motor-velox-v3-1750&tmp=-5&w=6', '#s=3&m=inspection&t=20&mat=carbon&cfg=quad&alt=0&tmp=-5&w=6&cur=USD&sel=motor%3Amotor-velox-v3-1750'],
  ];
  const plain = createState({ E, C, M, PERF, CHK }), { X } = fresh();
  for (const [from, to] of GOLD) for (const x of [plain, X]) assert.equal(x.hashOf(x.parse(from).S, 3), to, from);
  // and a build with no curve gives the same results as before: nothing added to the result
  const r = X.run(X.parse(GOLD[0][0]).S); for (const k of ['measuredCurve']) assert.ok(!(k in r));
  assert.deepEqual(plain.run(plain.parse(GOLD[0][0]).S), r);
});

test('missing curve in a link: the model is used, with a note', () => {
  const { X } = fresh(), createStatePlain = createState({ E, C, M, PERF, CHK });
  for (const x of [X, createStatePlain]) {
    const S = x.parse(`${HASH0}&mc=zzzzzzzz`).S, S0 = x.parse(HASH0).S, r = x.run(S), R = x.results(S, r);
    assert.equal(S.mc, 'zzzzzzzz'); assert.deepEqual(r, x.run(S0), 'the same result as the modelled build'); assert.equal(r.measuredCurve, undefined);
    assert.match(R.note, /This link names a measured thrust curve that is not on this device, so the modelled thrust and current are used\./);
    assert.ok(!/measured thrust curve/.test(x.results(S0, x.run(S0)).note || ''));
  }
});

// ---- storage
test('createCurves: cap of 10, thinned to 50 points, ids, removal, key', () => {
  const store = mem(), CRV = createCurves(store, () => 1700000000000);
  const big = { name: 'Big', points: Array.from({ length: 200 }, (_, i) => ({ pct: i / 2, thrustG: i * 5, currentA: i / 20, voltageV: 15 })) };
  const a = CRV.add(big); assert.equal(a.ok, true); assert.match(a.id, /^[a-z0-9]{8}$/); assert.ok(CURVE_ID.test(a.id) && MC.test(a.id));
  const got = CRV.get(a.id); assert.equal(got.points.length, 50); assert.equal(got.points[0].pct, 0); assert.equal(got.points[49].pct, 99.5); assert.equal(got.savedAt, 1700000000000); assert.equal(got.name, 'Big');
  assert.equal(CURVES_KEY, 'dronecalc:curves'); assert.ok(store.m.has(CURVES_KEY)); assert.equal(CRV.get('nope'), null); assert.equal(CRV.get('../x'), null);
  const ids = [a.id]; for (let i = 1; i < CURVES_MAX; i++) { const r = CRV.add(lin(10, 0.1, 15, 'C' + i)); assert.equal(r.ok, true); ids.push(r.id); }
  assert.equal(new Set(ids).size, 10, 'ids are unique'); assert.equal(CRV.list().length, CURVES_MAX);
  const over = CRV.add(lin(10, 0.1)); assert.deepEqual(over, { ok: false, error: 'Limit of 10 saved curves: delete one first.' }); assert.equal(CRV.list().length, 10);
  assert.equal(CRV.remove(ids[3]), true); assert.equal(CRV.list().length, 9); assert.equal(CRV.get(ids[3]), null); assert.equal(CRV.add(lin(10, 0.1)).ok, true);
  assert.ok(!CRV.add({ name: 'x', points: [] }).ok); assert.match(CRV.add({ name: 'x', points: [] }).error, /not usable/); assert.equal(CRV.add(null).ok, false);
  assert.equal(createCurves({ getItem: () => null, setItem: () => { throw new Error('quota'); } }).add(lin(10, 0.1)).ok, false); assert.match(createCurves({ getItem: () => null, setItem: () => { throw new Error('q'); } }).add(lin(10, 0.1)).error, /storage is unavailable/);
  assert.deepEqual(createCurves(null).list(), []); assert.deepEqual(createCurves({ getItem: () => { throw new Error('denied'); } }).list(), []);
});

test('createCurves: every load is validated (poisoned storage)', () => {
  const good = (id, extra = {}) => ({ id, name: 'ok', savedAt: 5, points: lin(10, 0.1).points, ...extra });
  const load = (raw) => createCurves(mem({ [CURVES_KEY]: typeof raw === 'string' ? raw : JSON.stringify(raw) })).list();
  for (const raw of ['not json', '{"a":1}', 'null', '5', '"x"', '[', '', 'x'.repeat(400000)]) assert.deepEqual(load(raw), [], String(raw).slice(0, 20));
  const L = load([good('goodgood'), good('../evil'), good('ABCDEFGH'), good('ab'), good('abcdefghijklm'), good('goodgood'), good(5), null, 5, 'x', { id: 'nopoints1' }, good('badpts12', { points: lin(10, 0.1).points.slice(0, 2) }),
    good('nonmono1', { points: [...lin(10, 0.1).points.slice(0, 3)].reverse() }), good('nanpoint', { points: lin(10, 0.1).points.map((p, i) => (i === 4 ? { ...p, thrustG: null } : p)) }), good('proto123', { points: lin(10, 0.1).points.map((p) => ({ ...p, __proto__: { x: 1 }, evil: '<b>' })) }), good('namehtml', { name: EVIL + '‮' }), good('nonum123', { savedAt: 'x' })]);
  assert.deepEqual(L.map((c) => c.id), ['goodgood', 'proto123', 'namehtml', 'nonum123'], 'only valid, unique, well-formed entries survive');
  assert.ok(L.every((c) => c.points.every((p) => Object.keys(p).join() === 'pct,thrustG,currentA,voltageV'))); assert.ok(!L[2].name.includes('‮') && L[2].name.length <= 40); assert.equal(L[3].savedAt, 0);
  assert.equal(load(Array.from({ length: 30 }, (_, i) => good('cap' + String(i).padStart(5, '0')))).length, CURVES_MAX, 'a poisoned list is capped at 10');
  // 120 points are valid for the engine only up to 50: a stored curve over 50 points is refused
  assert.deepEqual(load([good('toolong1', { points: Array.from({ length: 51 }, (_, i) => ({ pct: i, thrustG: i, currentA: i / 10, voltageV: 15 })) })]), []);
  // the list is re-read when storage changes under us
  const store = mem(), CRV = createCurves(store); assert.equal(CRV.list().length, 0); store.m.set(CURVES_KEY, JSON.stringify([good('later123')])); assert.equal(CRV.list().length, 1);
});

// ---- the page card
test('measuredHtml: states, escaping, and no inline handlers', () => {
  const base = { curves: [], attached: '', missing: false, mc: null, msg: '', logMsg: '', log: null, confirm: false };
  const h0 = measuredHtml(base); assert.match(h0, /<h3 id="h-meas">/); assert.ok(h0.includes('<b>Thrust data: Modelled</b>')); assert.match(h0, /data-ml="delete" disabled>/); assert.ok(h0.includes('id="mc-file"') && h0.includes('id="fl-file"')); assert.ok(!h0.includes('Clear log'));
  const mc = { name: EVIL, points: 11, motors: 4, maxThrustG: 4000, hoverA: 18.6 };
  const h = measuredHtml({ ...base, curves: [{ id: 'abcd1234', name: EVIL }, { id: 'zzzz9999', name: 'Other' }], attached: 'abcd1234', mc, msg: EVIL, logMsg: EVIL, missing: true, confirm: true });
  assert.ok(h.includes('<b>Thrust data: Measured</b>') && h.includes('4 motors') && h.includes('hover 18.6 A')); assert.ok(h.includes('<option value="abcd1234" selected>')); assert.ok(h.includes('Confirm delete') && !/data-ml="delete" disabled/.test(h));
  assert.ok(h.includes('This link names a measured thrust curve that is not on this device'));
  assert.ok(!h.includes(EVIL) && h.includes(esc(EVIL)), 'hostile text only appears escaped');
  for (const tag of h.match(/<[a-z][^<>]*>/g)) assert.ok(!/\son\w+=/i.test(tag.replace(/"[^"]*"/g, '""')), 'no inline handler: ' + tag.slice(0, 60));
  const hostileOpt = measuredHtml({ ...base, curves: [{ id: '"><script>', name: 'x' }] }); assert.ok(!hostileOpt.includes('<script>'), 'an id is escaped too');
});

test('importing a thrust CSV on the page: saved, attached by id, message shown; failures change nothing', async () => {
  const { CRV, X } = fresh(), S = X.parse(HASH0).S, set = [], el = { innerHTML: '', l: {}, addEventListener(t, f) { this.l[t] = f; }, querySelector: () => ({ click() { el.clicked = (el.clicked || 0) + 1; } }) };
  Object.assign(ui, { msg: '', logMsg: '', log: null, confirm: false });
  const api = mountMeasured(el, { CRV, state: () => S, result: () => X.run(S), setCurve: (id) => { set.push(id); S.mc = id; }, setHa: () => {} });
  assert.ok(el.innerHTML.includes('Thrust data: Modelled'));
  const msg = await api.importCsv(new File([toCsv(lin(10, 0.1))], 'My 2306 motor.csv'));
  assert.match(msg, /^Imported "My 2306 motor": 11 points from 11 rows, attached to this build\./); assert.equal(CRV.list().length, 1); assert.deepEqual(set, [CRV.list()[0].id]);
  assert.equal(X.run(S).measuredCurve.name, 'My 2306 motor'); assert.equal(X.hashOf(S, 3).includes(`mc=${CRV.list()[0].id}`), true); assert.ok(!X.hashOf(S, 3).includes('My%202306'), 'the link carries the id, never the data');
  for (const [text, re] of [['Throttle (%),Thrust (g),Voltage (V)\n1,2,3\n4,5,6\n7,8,9', /No current \(A\) column found/], [toCsv(lin(10, 0.1)).replace('\n50,', '\n=1+1,'), /Row 7: the throttle cell is not a number/]]) { const m = await api.importCsv(new File([text], 'bad.csv')); assert.match(m, re); }
  assert.equal(CRV.list().length, 1, 'a rejected file saves nothing'); assert.equal(set.length, 1);
  assert.match(el.innerHTML, /Row 7: the throttle cell/, 'the message is on the card');
  for (let i = 0; i < 9; i++) CRV.add(lin(10, 0.1)); const full = await api.importCsv(new File([toCsv(lin(10, 0.1))], 'one more.csv')); assert.equal(full, 'Limit of 10 saved curves: delete one first.');
  // delete asks twice
  const click = (a) => el.l.click({ target: { closest: () => ({ dataset: { ml: a } }) } }), id = S.mc;
  click('delete'); assert.equal(CRV.get(id) !== null, true); assert.match(ui.msg, /Press Confirm delete/); click('delete'); assert.equal(CRV.get(id), null); assert.equal(S.mc, '', 'the build falls back to the model'); click('import-curve'); assert.equal(el.clicked, 1);
  // the picker attaches a saved curve
  const keep = CRV.list()[0].id; el.l.change({ target: { id: 'mc-pick', value: keep } }); assert.equal(S.mc, keep);
  Object.assign(ui, { msg: '', logMsg: '', log: null, confirm: false });
});

// ---- red-team fixes that ship with this work
test('M2: a custom part in the PDF is marked unverified (bom rows and option lists)', () => {
  const store = mem(), CUS = createCustom(C, store), X = createState({ E, C, M, PERF, CHK });
  const evil = '=HYPERLINK("http://evil.example","x")', id = CUS.add({ category: 'motor', name: evil, brand: '+cmd', priceUsd: 0.01, weightG: 30, specs: { statorMm: '2306', kv: 1800, maxThrustG: 1500, maxCurrentA: 40, minCells: 4, maxCells: 6 } }).id;
  const S = { ...X.parse(`#s=3&m=mapping&sel=motor:${id}`).S, name: 'T' }, R = X.results(S, X.run(S));
  const row = X.pdfDoc(R, S, '2026-11-14').bom.rows.find((x) => x.part === evil + ' (custom, unverified)');
  assert.ok(row, 'BOM row name carries the suffix'); assert.equal(row.note, 'Custom part (unverified), no store link'); assert.deepEqual(row.links, []);
  const S2 = { ...S, sel: {} }, doc2 = X.pdfDoc(X.results(S2, X.run(S2)), S2, '2026-11-14');
  const items = (doc2.options || []).flatMap((o) => o.items), custom = items.filter((i) => i.part.includes('(custom, unverified)'));
  assert.ok(custom.length >= 1 || !items.some((i) => i.part.includes(evil)), 'a custom option is never listed without the marker'); assert.ok(custom.every((i) => i.note === 'Custom part (unverified), no store link' && i.links.length === 0));
  assert.ok(!items.some((i) => i.part === evil), 'no bare custom name');
  C.CUSTOM.length = 0; // leave the shared catalog as found
});

test('L5: names of only invisible characters end up empty; others keep their visible text', () => {
  const u = (...c) => String.fromCharCode(...c), tags = String.fromCodePoint(0xe0041, 0xe0042, 0xe007f);
  for (const inv of [u(0x061c), u(0x2060, 0x2061, 0x2062, 0x2063, 0x2064), u(0x206a, 0x206b, 0x206c, 0x206d, 0x206e, 0x206f), u(0xad), u(0x34f), u(0x3164), u(0xffa0), u(0x115f, 0x1160), tags, u(0x2028, 0x2029), u(0x200b, 0x200c, 0x200d, 0x200e, 0x200f), u(0x202a, 0x202e, 0x2066, 0x2069), u(0xfeff), u(0x00, 0x1f, 0x7f, 0x85), u(0xd800), ' \t ', u(0x061c) + ' ' + u(0x2060) + tags])
    assert.equal(cleanName(inv), '', 'invisible only: ' + [...inv].map((c) => c.codePointAt(0).toString(16)).join(' '));
  assert.equal(cleanName('a' + u(0x2060) + 'b' + tags + 'c'), 'abc'); assert.equal(cleanName(`  ${u(0x3164)}Wing${u(0xffa0)} `), 'Wing'); assert.equal(cleanName('Fly \u{1f600}'), 'Fly \u{1f600}'); assert.equal(cleanName('x'.repeat(100)).length, 40);
  const { X } = fresh(); assert.ok(!X.hashOf({ ...X.parse(HASH0).S, name: u(0x2060, 0x3164) }, 3).includes('n='), 'an all-invisible name is not written to the link');
});

test('L6: validation and parsing agree on the battery age', () => {
  const { X } = fresh(), S = X.parse(`${HASH0}&age=12.34`).S;
  assert.equal(S.age, '', 'the link parser drops a second decimal'); assert.match(X.errs({ ...S, age: 12.34 }).age, /at most one decimal place, like 12\.5\./);
  for (const ok of [12.3, 12, 0, 40, '']) assert.equal(X.errs({ ...S, age: ok }).age, undefined, String(ok));
  assert.ok(X.errs({ ...S, age: 41 }).age); assert.ok(X.errs({ ...S, age: -1 }).age);
});

test('L7: the calibration factor is limited to 0.5 to 2 and the user is told', () => {
  const { X } = fresh(), run = (h) => X.run(X.parse(h).S), base = run('#s=3&m=mapping&t=30&age=40');
  const low = run('#s=3&m=mapping&age=40&ha=0.1'), c = low.battery.calibration;
  assert.equal(c.factor, 1, 'a low reading is not applied'); assert.equal(c.limited, true); assert.ok(c.requestedFactor < 0.5); assert.ok(low.estFlightMin <= base.estFlightMin, 'a low reading never lengthens the flight'); assert.ok(low.estFlightMin < 60, `was ${low.estFlightMin}`);
  assert.ok(low.warnings.some((w) => /Measured hover current is 0\.01x the predicted [\d.]+ A: recheck the measurement.*left unadjusted: do not rely on them/.test(w)));
  const hi = run('#s=3&m=mapping&t=30&age=40&ha=60'); assert.equal(hi.battery.calibration.factor, 2); assert.equal(hi.battery.calibration.limited, true); assert.ok(hi.battery.calibration.requestedFactor > 3);
  assert.ok(hi.estFlightMin <= base.estFlightMin / 1.9, `${hi.estFlightMin} vs ${base.estFlightMin}`); assert.ok(hi.warnings.some((w) => /use the limit of 2x: do not rely on them/.test(w)));
  const ok = run('#s=3&m=mapping&t=30&ha=20'); assert.equal(ok.battery.calibration.limited, undefined); assert.equal(ok.battery.calibration.requestedFactor, undefined); assert.ok(ok.battery.calibration.factor > 1 && ok.battery.calibration.factor < 2);
  assert.equal(run('#s=3&m=mapping&t=30').battery.calibration, null, 'no ha, no calibration');
});

test('L9: importing one build over a build in progress asks first', async () => {
  const g = globalThis, saved = { document: g.document, setTimeout: g.setTimeout }, urlFns = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }, on = {}, made = [];
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  const el = () => { const e = { style: {}, className: '', attrs: {}, classList: { add: (c) => (e.className += ` ${c}`), remove: (c) => (e.className = e.className.replace(c, '')) }, setAttribute: (k, v) => (e.attrs[k] = v), click() {}, remove() {} }; made.push(e); return e; };
  g.document = { createElement: el, body: { appendChild() {} }, addEventListener: (t, f) => (on[t] = f) }; g.setTimeout = () => 0;
  try {
    const { X } = fresh(), libEl = { addEventListener() {}, querySelector: () => ({ click() {} }) }, opened = [], asked = [], csv = [];
    const S = X.parse('#s=3&m=mapping&n=Wing').S; let answer = false;
    mountIO({ X, LIB: null, libEl, state: () => S, label: () => 'x', date: () => '2026-11-14', open: (h) => opened.push(h), changed() {}, ask: (m) => (asked.push(m), answer), csv: async (f) => { csv.push(f.name); } });
    const toast = made[0], file = (hash, name = 'b.json') => new File([JSON.stringify({ app: 'DroneCalc', format: 1, builds: [{ name: 'Other', hash, savedAt: 1700000000000 }] })], name);
    const drop = async (f) => { on.drop({ dataTransfer: { types: ['Files'], files: [f] }, preventDefault() {} }); await settle(); };
    const other = X.hashOf(X.parse('#s=3&m=delivery&t=25').S, 3);
    await drop(file(other)); assert.deepEqual(asked, [replaceMsg('Other')]); assert.deepEqual(opened, [], 'declined: nothing opened'); assert.equal(toast.textContent, 'Import cancelled. The build you are working on was not changed.');
    answer = true; await drop(file(other)); assert.equal(asked.length, 2); assert.deepEqual(opened, [other], 'accepted: opened'); assert.match(toast.textContent, /^Imported 1 build/);
    await drop(file(X.hashOf(S, 3))); assert.equal(asked.length, 2, 'the same build: no prompt'); assert.equal(opened.length, 2);
    S.mission = ''; await drop(file(other)); assert.equal(asked.length, 2, 'no build in progress: no prompt'); assert.equal(opened.length, 3);
    assert.match(replaceMsg('A'), /replace the build you are working on\?/);
    // dropped CSV files go to the measured-data handler, not the build importer; a name that only ends in "csv" is a build file
    for (const n of ['sweep.csv', 'flight.CSV', 'x.txt', 'log.bbl', 'a.BIN', 'p.ulg', 'p.tlog']) await drop(new File(['x'], n));
    assert.deepEqual(csv, ['sweep.csv', 'flight.CSV', 'x.txt', 'log.bbl', 'a.BIN', 'p.ulg', 'p.tlog']); assert.equal(opened.length, 3);
    await drop(new File(['{ nope'], 'xcsv')); assert.match(toast.textContent, /not valid JSON/); assert.equal(csv.length, 7);
    assert.ok(CSV_EXT.test('a.csv') && !CSV_EXT.test('acsv') && !CSV_EXT.test('a.json'));
  } finally { Object.assign(g, saved); Object.assign(URL, urlFns); if (saved.document === undefined) delete g.document; }
});
