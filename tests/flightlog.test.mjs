// F10 flight-log compare: CSV formats, streaming, hostile files, the stats on a synthetic log with known answers, the comparison with the prediction,
// the calibration hand-off (the only thing a log may put in a share link), and that nothing from a log is stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as C from '../js/catalog.js';
import * as M from '../js/matcher.js';
import * as PERF from '../js/ui/perf.js';
import * as CHK from '../js/checks.js';
import { createState, haOf, HA } from '../js/ui/state.js';
import { parseFlightLog, logStats, compareLog, logChart, compareHtml, measuredHtml, mountMeasured, createCurves, sniffKind, ui, LOG_MAX_BYTES, LOG_MAX_POINTS, binaryMsg } from '../js/ui/measured.js';

const EVIL = '<img src=x onerror=alert(1)>"\'&';
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (+-${tol})`);
// ---- a 10 Hz, 120 s synthetic flight with known answers
//   k 0-99 idle 0.2 A | 100-199 climb 30 A (one 55 A spike at k=150) | 200-999 hover 20 A | 1000-1099 descent 10 A | 1100-1200 idle 0.2 A.  Volts = 16 - 0.02 * A.
const N = 1201, cur = (k) => (k === 150 ? 55 : k >= 1100 || k < 100 ? 0.2 : k < 200 ? 30 : k < 1000 ? 20 : 10), volt = (k) => 16 - 0.02 * cur(k);
const mah = (() => { const m = []; let s = 0; for (let k = 0; k < N; k++) { s += (cur(k) * 0.1) / 3.6; m.push(s); } return m; })();
const rows = (fn) => Array.from({ length: N }, (_, k) => fn(k));
const BF = ['loopIteration, time (us), axisP[0], vbatLatest (V), amperageLatest (A), energyCumulative (mAh), rcCommand[3]', ...rows((k) => `${k}, ${k * 100000}, 5, ${volt(k).toFixed(3)}, ${cur(k).toFixed(2)}, ${mah[k].toFixed(3)}, 1500`)].join('\n');
const AP = ['TimeUS,Volt,VoltR,Curr,CurrTot,EnrgTot,Temp', ...rows((k) => `${k * 100000},${volt(k).toFixed(3)},${volt(k).toFixed(3)},${cur(k).toFixed(2)},${mah[k].toFixed(3)},9,20`)].join('\r\n');
const GEN = ['Time (s),Pack voltage (V),Current (A)', ...rows((k) => `${(k / 10).toFixed(1)},${volt(k).toFixed(3)},${cur(k).toFixed(2)}`)].join('\n');
// What the numbers must be (worked out from the piecewise-constant current, independent of the code under test).
const T = 99.9, QI = 0.1 * (97 * 30 + 2 * 42.5 + 25 + 799 * 20 + 15 + 99 * 10), AVG_A = QI / T, MAH_INT = QI / 3.6, MAH_LOG = (0.1 / 3.6) * (98 * 30 + 55 + 800 * 20 + 100 * 10);
const file = (text, name = 'log.csv') => new File([text], name);

test('parses Betaflight, ArduPilot and generic CSV to the same flight', async () => {
  for (const [label, text, hasMah] of [['betaflight', BF, true], ['ardupilot', AP, true], ['generic', GEN, false]]) {
    const p = await parseFlightLog(file(text, label + '.csv'));
    assert.equal(p.error, undefined, label); const L = p.log;
    assert.equal(L.rows, N, label); assert.equal(L.skipped, 0); assert.equal(L.peakI, 55); near(L.minV, 14.9, 1e-9, label); assert.equal(L.hasMah, hasMah, label); assert.equal(L.t.length, N);
    near(L.t[N - 1], 120, 1e-6, label + ' time in seconds'); assert.equal(L.t[0], 0); assert.ok(L.t.every((t, i) => !i || t > L.t[i - 1]));
    const s = logStats(L, 4);
    assert.equal(s.error, undefined, label); near(s.flightS, T, 1e-6, label + ' flight window'); near(s.from, 10, 1e-6); near(s.to, 109.9, 1e-6);
    near(s.avgA, AVG_A, 1e-6, label + ' average current'); assert.equal(s.peakA, 55); near(s.avgV, 16 - 0.02 * AVG_A, 1e-6, label + ' average volts'); near(s.avgCellV, (16 - 0.02 * AVG_A) / 4, 1e-6);
    near(s.minV, 14.9, 1e-9); near(s.minCellV, 3.725, 1e-9, label + ' min volts per cell'); assert.equal(s.hoverA, 20, label + ' hover = median of the steady stretches'); assert.ok(s.steadyN > 500);
    if (hasMah) { assert.equal(s.mahFrom, 'log'); near(s.mah, MAH_LOG, 0.05, label + ' mAh from the log counter'); } else { assert.equal(s.mahFrom, 'integral'); near(s.mah, MAH_INT, 0.01, label + ' mAh integrated'); }
    assert.deepEqual(s.warn, []);
  }
  // cells come from the build: 4S volts read as 3S are 5.2 V per cell, as 8S 1.95: neither is this pack
  const L = (await parseFlightLog(file(GEN))).log;
  assert.match(logStats(L, 3).warn[0], /average voltage is 5\.20 V per cell for 3 cells: it does not look like this build's pack/); assert.equal(logStats(L, 8).warn.length, 1);
});

test('units: ms and us time, mV and mA, unlabelled time, BOM, CRLF, semicolons, tabs, quoted header', async () => {
  const mk = (head, fn, eol = '\n') => [head, ...Array.from({ length: 300 }, (_, k) => fn(k))].join(eol);
  const base = { t: (k) => k, v: (k) => 15.5 + (k % 5) * 0.01, i: (k) => (k < 20 ? 0.1 : 12 + (k % 3) * 0.1) };
  const ref = logStats((await parseFlightLog(file(mk('time (s),Voltage (V),Current (A)', (k) => `${base.t(k)},${base.v(k)},${base.i(k)}`)))).log, 4);
  const same = async (text, name = 'a.csv') => { const p = await parseFlightLog(file(text, name)); assert.equal(p.error, undefined, text.slice(0, 40)); const s = logStats(p.log, 4); near(s.avgA, ref.avgA, 1e-6, text.slice(0, 40)); near(s.avgV, ref.avgV, 1e-6); near(s.flightS, ref.flightS, 1e-6); return p; };
  await same(mk('time (ms),Voltage (mV),Current (mA)', (k) => `${base.t(k) * 1000},${base.v(k) * 1000},${base.i(k) * 1000}`));
  await same(mk('TimeUS,Volt,Curr', (k) => `${base.t(k) * 1e6},${base.v(k)},${base.i(k)}`));
  await same(mk('Time,Volt,Curr', (k) => `${base.t(k)},${base.v(k)},${base.i(k)}`)); // no unit: seconds fit a 300 s log
  const un = await same(mk('Time,Volt,Curr', (k) => `${base.t(k) * 1000},${base.v(k)},${base.i(k)}`)); assert.match(un.log.notes.join(' '), /no unit; milliseconds fit the log length/);
  await same('﻿' + mk('time (s),Voltage (V),Current (A)', (k) => `${base.t(k)},${base.v(k)},${base.i(k)}`, '\r\n'));
  await same(mk('time (s);Voltage (V);Current (A)', (k) => `${base.t(k)};${base.v(k)};${base.i(k)}`)); await same(mk('time (s)\tVoltage (V)\tCurrent (A)', (k) => `${base.t(k)}\t${base.v(k)}\t${base.i(k)}`));
  await same(mk('"time (s)","Voltage (V)","Current (A)"', (k) => `"${base.t(k)}","${base.v(k)}","${base.i(k)}"`)); await same('sep=,\n# a note\n\n' + mk('time (s),Voltage (V),Current (A)', (k) => `${base.t(k)},${base.v(k)},${base.i(k)}`));
  assert.match((await parseFlightLog(file(mk('Time,Volt,Curr', (k) => `${k * 1e9},${base.v(k)},${base.i(k)}`)))).error, /Could not tell the time unit/);
  assert.match((await parseFlightLog(file(mk('time (s),Voltage (V),Current (A)', (k) => `${k / 1000},${base.v(k)},${base.i(k)}`)))).error, /less than one second/);
});

test('a binary or native log is refused with a message that says to export CSV', async () => {
  let touched = 0; const fake = (name, size = 10) => ({ name, size, slice: () => { touched++; throw new Error('read'); }, text: async () => { touched++; return ''; } });
  for (const n of ['flight.bbl', 'flight.BFL', 'x.bin', 'x.ulg', 'x.ulog', 'x.tlog', '00000001.LOG']) { const p = await parseFlightLog(fake(n)); assert.equal(p.error, binaryMsg(), n); }
  assert.equal(touched, 0, 'refused by name, never read'); assert.match(binaryMsg(), /CSV only|reads CSV only/); assert.match(binaryMsg(), /blackbox_decode.*Mission Planner.*ulog2csv/);
  for (const [txt, name] of [['time,volt,curr\n1,2,3\u0000\u0000binary', 'a.csv'], ['H Product:Blackbox flight data recorder\nH Data version:2\n', 'a.csv'], ['ULog\u0001\u00125', 'a.csv'], ['FMT, 128, 89, FMT, BBnNZ\n', 'a.csv'], ['�����'.repeat(30), 'a.csv']])
    assert.equal((await parseFlightLog(file(txt, name))).error, binaryMsg(), txt.slice(0, 12));
  assert.equal((await parseFlightLog(file('\u0000'.repeat(100) + GEN, 'real.csv'))).error, binaryMsg());
});

test('size: over 20 MB is refused without reading; a big CSV streams in chunks', async () => {
  let read = 0; const big = { name: 'a.csv', size: LOG_MAX_BYTES + 1, slice: () => { read++; return { arrayBuffer: async () => new ArrayBuffer(0) }; }, text: async () => { read++; return ''; } };
  assert.match((await parseFlightLog(big)).error, /larger than 20 MB, so it was not opened/); assert.equal(read, 0); assert.match((await parseFlightLog(null)).error, /larger than/); assert.match((await parseFlightLog({ name: 'x.csv' })).error, /larger than/, 'no size, no read');
  // 120,000 rows at 100 Hz is ~2.6 MB: three 1 MB chunks, so lines are cut mid-row at every boundary; every row must still be read whole
  const n = 120000, parts = ['Time (ms),Voltage (V),Current (A)'];
  for (let k = 0; k < n; k++) parts.push(`${k * 10},${(15.6 - (k % 11) * 0.001).toFixed(3)},${k < 200 ? '0.30' : k === 99999 ? '77.70' : (20 + (k % 7) * 0.01).toFixed(2)}`);
  const text = parts.join('\n'), f = file(text, 'big.csv'); assert.ok(f.size > 2 * 1024 * 1024, 'spans several chunks');
  const p = await parseFlightLog(f), L = p.log;
  assert.equal(p.error, undefined); assert.equal(L.rows, n, 'no row lost or split at a chunk edge'); assert.equal(L.skipped, 0); assert.equal(L.peakI, 77.7, 'the exact peak survives the thinning (it is not on a kept row)');
  near(L.minV, 15.59, 1e-9); assert.ok(L.t.length <= 4000 && L.t.length >= 2000, `kept ${L.t.length} rows`); assert.ok(L.t.every((t, i) => !i || t > L.t[i - 1])); near(L.t[0], 0, 0); assert.ok(L.t.at(-1) > 1190);
  const s = logStats(L, 4); near(s.peakA, 77.7, 1e-9); assert.ok(s.flightS > 1190 && s.avgA > 19.9 && s.avgA < 20.2, `avg ${s.avgA}`);
  const svg = logChart(L, 20); assert.ok(svg && svg.length < 250000, 'the chart stays small');
  for (const d of svg.match(/<path class="cv" d="[^"]*"/g)) assert.ok((d.match(/[MLCQ]/g) || []).length <= LOG_MAX_POINTS + 2, 'at most 2000 points per curve');
  // a header only after a long preamble is not found (60 lines)
  assert.match((await parseFlightLog(file('# x\n'.repeat(5) + 'a,b\n'.repeat(70) + GEN))).error, /No time, voltage and current columns found in the first lines/);
});

test('hostile and broken rows: skipped when few, refused when many; nothing is evaluated', async () => {
  const lines = GEN.split('\n'), at = (n, cell) => lines.map((l, i) => (i === n ? l.split(',').map((c, j) => (j === 2 ? cell : c)).join(',') : l)).join('\n');
  for (const bad of ['=CMD()', '+SUM(1)', '@x', 'NaN', 'Infinity', '-Infinity', '1e999', '0x1F', '1,5', 'abc', '', '<script>alert(1)</script>', '99999', '-50']) {
    const p = await parseFlightLog(file(at(500, bad.replace(',', ' ')))); assert.equal(p.error, undefined, JSON.stringify(bad)); assert.equal(p.log.skipped, 1, JSON.stringify(bad)); assert.equal(p.log.rows, N - 1);
    assert.equal(p.log.peakI, 55, 'a hostile cell never becomes the peak');
  }
  const many = lines.map((l, i) => (i % 3 === 1 ? l.replace(/,[^,]*$/, ',=BAD()') : l)).join('\n');
  assert.match((await parseFlightLog(file(many))).error, /^\d+ of \d+ rows could not be used \(not numbers, or time going backwards\), so the file was not accepted\.$/);
  // time going backwards: those rows are dropped, the rest stands
  const back = [...lines.slice(0, 600), lines[100], lines[101], ...lines.slice(600)].join('\n'), b = await parseFlightLog(file(back)); assert.equal(b.error, undefined); assert.equal(b.log.skipped, 2); assert.equal(b.log.rows, N, 'the two repeated rows are dropped, every original stays');
  assert.equal((await parseFlightLog(file(['time (s),Voltage (V),Current (A)', ...lines.slice(1, 9)].join('\n')))).error, 'That file has fewer than 10 usable rows (numbers for time, voltage and current).');
  // missing columns
  const m = await parseFlightLog(file('time (s),Pack voltage (V)\n1,2\n2,3\n3,4')); assert.match(m.error, /^No time, voltage and current columns found\. The columns are: time \(s\), Pack voltage \(V\)\./);
  assert.match((await parseFlightLog(file('a,b,c\n1,2,3'))).error, /No time, voltage and current columns found\. The columns are: a, b, c\./);
  const h = await parseFlightLog(file(`${EVIL.repeat(20)},b\n1,2`)); assert.ok(h.error.length < 500 && !h.error.includes(EVIL.repeat(2)), 'header text is shortened in the message');
  assert.match((await parseFlightLog(file(''))).error, /No time, voltage and current columns/); assert.match((await parseFlightLog(file('\n\n'))).error, /No time, voltage and current columns/);
});

test('stats: no flight, short logs, unsteady flight has no hover estimate', async () => {
  const mk = (fn, n = 300) => ['t (s),Voltage (V),Current (A)', ...Array.from({ length: n }, (_, k) => `${k / 10},15.5,${fn(k)}`)].join('\n');
  const idle = (await parseFlightLog(file(mk(() => 0.2)))).log; assert.match(logStats(idle, 4).error, /No flight found: the current never stays above 0\.5 A/);
  const ramp = (await parseFlightLog(file(mk((k) => (k % 20 < 10 ? 5 : 25))))).log, s = logStats(ramp, 4); assert.equal(s.hoverA, null, 'a current swinging between 5 and 25 A every second has no steady stretch'); assert.ok(s.flightS > 25);
  const steady = (await parseFlightLog(file(mk((k) => (k < 20 ? 0.1 : 8))))).log; assert.equal(logStats(steady, 4).hoverA, 8);
  // negative current readings (a bad sensor offset) are clamped to zero, never counted as charge used
  const neg = (await parseFlightLog(file(mk((k) => (k < 20 ? -0.5 : 8))))).log; assert.ok(neg.i.every((x) => x >= 0));
});

test('compare with the prediction: % error against the build', async () => {
  const L = (await parseFlightLog(file(GEN))).log, s = logStats(L, 4);
  const r = { battery: { hoverA: 16, maxA: 50, hoverCellV: 3.9, maxCellV: 3.6 }, avgPowerW: 300, batteryWh: 60, batteryMah: 4000, estFlightMin: 2 };
  const rows = Object.fromEntries(compareLog(s, r).map((x) => [x.key, x]));
  assert.deepEqual(Object.keys(rows), ['hover', 'avg', 'time', 'peak', 'avgv', 'minv', 'mah']);
  near(rows.hover.err, ((20 - 16) / 16) * 100, 1e-9); assert.equal(rows.hover.pred, 16); assert.equal(rows.hover.got, 20);
  near(rows.avg.pred, 20, 1e-9, '300 W at 15 V nominal'); near(rows.avg.err, ((AVG_A - 20) / 20) * 100, 1e-6);
  near(rows.time.got, T / 60, 1e-9); near(rows.time.err, ((T / 60 - 2) / 2) * 100, 1e-6); near(rows.peak.err, 10, 1e-9); near(rows.avgv.err, ((s.avgCellV - 3.9) / 3.9) * 100, 1e-6); near(rows.minv.err, ((3.725 - 3.6) / 3.6) * 100, 1e-6);
  assert.equal(rows.mah.pred, null); assert.equal(rows.mah.err, null); assert.equal(rows.mah.note, 'Integrated from the current.');
  assert.equal(compareLog({ ...s, hoverA: null }, r)[0].err, null, 'no hover found: no error shown');
  assert.equal(compareLog(s, { ...r, fixedWing: {} })[0].label, 'Cruise current, steady');
  // against a real result
  const X = createState({ E, C, M, PERF, CHK }), res = X.run(X.parse('#s=3&m=mapping&t=30').S), real = compareLog(s, res);
  assert.ok(real.every((x) => Number.isFinite(x.got)) && real.slice(0, 6).every((x) => Number.isFinite(x.pred) && Number.isFinite(x.err)), JSON.stringify(real.map((x) => [x.key, x.pred])));
  const h = compareHtml(real); assert.match(h, /^<dl class="bat">/); assert.match(h, /predicted 14\.5 A \(\+38%\)/);
  assert.ok(!compareHtml([{ label: EVIL, unit: EVIL, note: EVIL, d: 1, got: 1, pred: 2, err: -50 }]).includes(EVIL), 'labels are escaped');
});

test('chart: voltage and current against time with the predicted hover line; escaped; null when too short', async () => {
  const L = (await parseFlightLog(file(GEN))).log, svg = logChart(L, 16.04);
  assert.match(svg, /^<svg class="pf-svg" role="img" aria-label="Flight log: pack voltage and current against time, with the predicted hover current of 16\.0 A as a dashed line." aria-describedby="fl-cap" viewBox="0 0 560 \d+" width="560" height="\d+">/);
  assert.match(svg, /PREDICTED HOVER 16\.0 A/i); assert.match(svg, /PACK VOLTAGE/i); assert.match(svg, /CURRENT/i); assert.match(svg, /TIME/i); assert.equal((svg.match(/<path class="cv"/g) || []).length, 2, 'one curve per panel');
  assert.ok(!/<script|onerror|javascript:/i.test(svg)); assert.ok(!logChart(L, NaN).includes('Predicted hover'), 'no prediction, no line'); assert.match(logChart(L, NaN), /aria-label="Flight log: pack voltage and current against time\."/);
  assert.equal(logChart({ t: [0, 1], v: [1, 2], i: [1, 2] }, 5), null);
  // a series that is not strictly rising in time never reaches the chart (the parser drops those rows), but the builder must not throw on a flat one
  assert.doesNotThrow(() => logChart({ t: [0, 1, 2, 3], v: [15, 15, 15, 15], i: [5, 5, 5, 5] }, 5));
});

test('calibration hand-off: the measured hover current sets the existing ha, and only that', async () => {
  const store = { gets: 0, sets: 0, m: new Map(), getItem(k) { this.gets++; return this.m.get(k) ?? null; }, setItem(k, v) { this.sets++; this.m.set(k, v); } };
  const CRV = createCurves(store), X = createState({ E, C, M, PERF, CHK, CURVES: CRV }), S = X.parse('#s=3&m=mapping&t=30').S;
  const l = {}, el = { innerHTML: '', addEventListener(t, f) { l[t] = f; }, querySelector: () => ({ click() {} }) }, calls = { ha: [], curve: [] };
  Object.assign(ui, { msg: '', logMsg: '', log: null, confirm: false });
  const view = () => X.run(S), api = mountMeasured(el, { CRV, state: () => S, result: view, setCurve: (id) => calls.curve.push(id), setHa: (a) => { calls.ha.push(a); S.ha = a; } });
  assert.ok(!el.innerHTML.includes('Use measured hover current for calibration') && !el.innerHTML.includes('class="pf-sec"'), 'no log yet');
  const sets0 = store.sets, msg = await api.importCsv(file(BF, 'flight.csv'));
  assert.equal(msg, `Read ${N} rows.`); assert.equal(await sniffKind(file(BF)), 'log'); assert.equal(await sniffKind(file('Throttle (%),Thrust (g),Current (A),Voltage (V)\n1,2,3,4')), 'curve');
  assert.ok(el.innerHTML.includes('Use measured hover current for calibration') && el.innerHTML.includes('data-ml="calibrate"') && el.innerHTML.includes('class="pf-sec"') && /predicted hover/i.test(el.innerHTML), 'stats, chart and button are shown');
  assert.ok(el.innerHTML.includes('Hover current, steady') && el.innerHTML.includes('Average current') && el.innerHTML.includes('Minimum voltage per cell') && el.innerHTML.includes('Charge used'));
  assert.ok(el.innerHTML.includes('Sets the measured hover current to 20.00 A'));
  const click = (a) => l.click({ target: { closest: () => ({ dataset: { ml: a } }) } });
  click('calibrate'); assert.deepEqual(calls.ha, [20]); assert.equal(haOf(calls.ha[0]), 20); assert.ok(calls.ha[0] >= HA.min && calls.ha[0] <= HA.max);
  assert.ok(X.hashOf(S, 3).endsWith('&ha=20'), 'the link carries ha and nothing else from the log'); assert.ok(!/flight|log|20\.0/.test(X.hashOf(S, 3).replace('&ha=20', '').replace('t=30', '')));
  const cal = X.run(S).battery.calibration; assert.equal(cal.measuredA, 20); assert.equal(cal.source, undefined); assert.ok(cal.factor > 1 && cal.factor <= 2); assert.ok(X.run(S).estFlightMin < X.run(X.parse('#s=3&m=mapping&t=30').S).estFlightMin);
  assert.equal(store.sets, sets0, 'nothing from the log was written to storage'); assert.deepEqual(calls.curve, []); assert.equal(ui.log.rows, N, 'kept in memory only');
  click('clear-log'); assert.equal(ui.log, null); assert.ok(!el.innerHTML.includes('Use measured hover current'));
  // a log that gives no usable hover figure offers no button
  const ramp = ['t (s),Voltage (V),Current (A)', ...Array.from({ length: 300 }, (_, k) => `${k / 10},15.5,${k % 20 < 10 ? 5 : 25}`)].join('\n'); await api.importCsv(file(ramp, 'ramp.csv'));
  assert.ok(!el.innerHTML.includes('Use measured hover current for calibration') && el.innerHTML.includes('No steady hover stretch was found'), 'no steady stretch: no button, a reason instead');
  const calls0 = calls.ha.length; click('calibrate'); assert.equal(calls.ha.length, calls0, 'the handler refuses too');
  // a hover outside the ha bounds (a 700 A log) cannot be handed over
  const huge = ['t (s),Voltage (V),Current (A)', ...Array.from({ length: 300 }, (_, k) => `${k / 10},15.5,${k < 20 ? 0.1 : 700}`)].join('\n'); await api.importCsv(file(huge, 'huge.csv'));
  assert.ok(!el.innerHTML.includes('data-ml="calibrate"')); assert.equal(haOf(700), null);
  // errors show on the card and leave nothing attached
  assert.match(await api.importCsv(file('x', 'flight.bbl')), /export the log to CSV first/); assert.equal(ui.log, null); assert.match(el.innerHTML, /export the log to CSV first/);
  assert.equal(store.sets, sets0); Object.assign(ui, { msg: '', logMsg: '', log: null, confirm: false });
});

test('card markup with a log: hostile strings are escaped', () => {
  const log = { stats: { warn: [EVIL], flightS: 99.9 }, rows: [{ key: 'x', label: EVIL, unit: EVIL, d: 1, got: 2, pred: 3, err: -33, note: EVIL }], chart: null, canCal: true, calA: 20 };
  const h = measuredHtml({ curves: [], attached: '', missing: false, mc: null, msg: EVIL, logMsg: EVIL, log, confirm: false });
  assert.ok(!h.includes(EVIL) && h.includes('&lt;img src=x onerror=alert(1)&gt;')); for (const tag of h.match(/<[a-z][^<>]*>/g)) assert.ok(!/\son\w+=/i.test(tag.replace(/"[^"]*"/g, '""')), tag.slice(0, 60));
  assert.ok(h.includes('Clear log') && h.includes('data-ml="calibrate"') && !h.includes('class="pf-sec"'));
});
