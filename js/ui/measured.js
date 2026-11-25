// Measured data. F8: a thrust-stand CSV becomes a thrust curve for this build's motor and prop (kept in localStorage on this device, named in a share link by a short id only).
// F10: a flight-log CSV is compared with the build's prediction; nothing from a log is stored or shared, except the optional hover-current calibration (the `ha` hash value).
// Both kinds of file are UNTRUSTED: size and row caps before and while reading, strict numeric parsing with physical bounds, no formula is ever evaluated, hostile cells are never
// kept, and every string that reaches the page goes through esc(). Pure apart from mountMeasured(); node can import it.
import { curveOf, CURVE_LIMITS } from '../engine.js';
import { esc } from './parts.js';
import { text } from './custom.js';
import { HA, haOf } from './state.js';
import * as CH from './charts.js';
import * as U from './units.js';
import { t as tr, tf } from '../i18n/i18n.js';

export const CSV_MAX_BYTES = 512 * 1024, CSV_MAX_ROWS = 5000;
export const LOG_MAX_BYTES = 20 * 1024 * 1024, LOG_MAX_POINTS = 2000;
const LOG_KEEP = 4000, LOG_CHUNK = 1 << 20; // the log is read in 1 MB chunks and only a thinned series (never more than LOG_KEEP rows) is held
export const CURVES_KEY = 'dronecalc:curves', CURVES_MAX = 10, CURVE_POINTS = CURVE_LIMITS.points[1];
export const CURVE_ID = /^[a-z0-9]{4,12}$/; // the same rule as state.js mcOf
const RAW_MAX = 300000; // chars: ten 50-point curves are ~40 KB; anything past this is not ours

const rnd = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
const fmt = CH.fmt;
const KB = (b) => `${b / 1024} KB`;
const MB = (b) => `${b / (1024 * 1024)} MB`;
// File text echoed in a message (a header name): control and invisible characters stripped, short, never markup-trusted (the page escapes it too).
const shown = (s) => text(String(s), 24) || tr('meas.blank');

// ---- CSV basics
const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d{1,3})?$/;
// Strict number: a plain decimal (optional exponent) and nothing else. NaN, Infinity, hex, a decimal comma, =FORMULA(), markup: all NaN. Never evaluates anything.
const num = (s) => { s = String(s ?? '').trim(); const v = s.length <= 24 && NUM.test(s) ? Number(s) : NaN; return Number.isFinite(v) ? v : NaN; };
const delimOf = (line) => { const c = [',', ';', '\t'].map((d) => line.split(d).length); return c[0] >= c[1] && c[0] >= c[2] ? ',' : c[1] >= c[2] ? ';' : '\t'; };
// One line -> cells. Quotes group a cell (so "a,b" stays one); a doubled quote is a literal one. Columns past 400 are ignored.
function splitLine(line, d) {
  if (!line.includes('"')) return line.split(d, 400).map((c) => c.trim());
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length && out.length < 400; i++) {
    const ch = line[i];
    if (q) { if (ch !== '"') cur += ch; else if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
    else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (ch === d) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
const looksBinary = (s) => s.includes('\u0000') || (s.match(/[\u0001-\u0008\u000e-\u001f�]/g)?.length ?? 0) > s.length * 0.02 || /^(H Product:|ULog|FMT,\s)/.test(s);
const notText = () => tr('meas.notText');
// Header name -> what the column holds. Names are matched loosely on letters and digits (case, spaces, underscores and the unit in brackets do not matter).
const base = (h) => h.toLowerCase().replace(/[(\[][^)\]]*[)\]]/g, ' ').replace(/[^a-z0-9µμ]+/g, ' ').trim();
const unitOf = (h) => (/[(\[]\s*([^)\]]*?)\s*[)\]]/.exec(h)?.[1] ?? '').toLowerCase().replace('μ', 'µ');
const ROLES = [
  ['mah', (c, u) => /mah|currtot|energycum|consumed|capacityused|currenttotal|totalcurrent/.test(c.replace(/ /g, '')) || u === 'mah'],
  ['thrust', (c) => /thrust|force/.test(c) && !/eff|torque|vib|limit/.test(c)],
  ['throttle', (c) => /throttle|esc signal|escsignal|esc pwm|escpwm|^pwm\b|duty/.test(c)],
  ['rpm', (c, u) => /\brpm\b|motor speed|rotor speed/.test(c) || u === 'rpm'],
  ['power', (c) => (/elec/.test(c) && /power/.test(c)) || /^(power|motor power|pwr)$/.test(c)],
  ['volt', (c) => /volt|vbat/.test(c.replace(/ /g, '')) && !/cell|min|max|servo|bec|rail|vcc|ref|ripple|rest|voltr$/.test(c.replace(/ /g, ''))],
  ['curr', (c) => /\b(current|curr|amps?|amperage\w*|ibat)\b/.test(c) && !/total|tot|limit|max|min|offset|scale|mult|rate/.test(c)],
  ['time', (c) => /^(time|timestamp|t|seconds|secs?|elapsed|timeus|timems)\b/.test(c) && !/left|remain|armed|flight|since/.test(c)],
];
export const roleOf = (h) => { const c = base(h), u = unitOf(h); return ROLES.find(([, f]) => f(c, u))?.[0] ?? null; };
const rolesOf = (cells) => { const o = {}; cells.forEach((h, i) => { const r = roleOf(h); if (r && !(r in o)) o[r] = i; }); return o; };
const lower = (h) => h.toLowerCase().replace(/[_.]/g, ' ');

// ---- F8: thrust-stand CSV -> curve
const REQ = ['throttle', 'thrust', 'curr', 'volt']; // column labels: meas.req.<role>
// Keep at most `max` points, evenly spaced by index, first and last always kept.
export const downsample = (pts, max = CURVE_POINTS) => (pts.length <= max ? pts : Array.from({ length: max }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (max - 1))]));

/** thrust-stand CSV text -> { curve: { name, points }, notes, rows } or { error }. RCbenchmark / Tyto exports (ESC signal in microseconds, thrust in kgf or gf) and generic files
 *  (Throttle (%), Thrust (g, kgf or N), Current (A), Voltage (V); RPM and electrical power optional). One upward throttle sweep; rows with the same throttle are averaged. */
export function parseThrustCsv(txt, name = '') {
  const E = (error) => ({ error });
  if (typeof txt !== 'string') return E(tr('io.unreadable'));
  if (new TextEncoder().encode(txt).length > CSV_MAX_BYTES) return E(tr('meas.tooBig', { size: KB(CSV_MAX_BYTES) }));
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  if (looksBinary(txt.slice(0, 4096))) return E(notText());
  const lines = txt.split(/\r\n|\r|\n/);
  let h = 0;
  while (h < lines.length && (!lines[h].trim() || /^sep=/i.test(lines[h]) || lines[h].startsWith('#'))) h++;
  if (h >= lines.length) return E(tr('meas.empty'));
  const d = delimOf(lines[h]), head = splitLine(lines[h], d), idx = rolesOf(head);
  const miss = REQ.filter((k) => !(k in idx));
  if (miss.length) return E(tr('meas.noCols', { missing: miss.map((k) => tr(`meas.req.${k}`)).join(', '), columns: head.slice(0, 12).map(shown).join(', ') + (head.length > 12 ? ', ...' : '') }));
  const at = [];
  for (let i = h + 1; i < lines.length; i++) if (lines[i].trim()) at.push(i);
  if (at.length > CSV_MAX_ROWS) return E(tr('meas.tooManyRows', { max: CSV_MAX_ROWS }));
  if (at.length < 3) return E(tr('meas.fewRows'));
  // units, from the headers
  const th = lower(head[idx.thrust]), notes = [];
  const [tUnit, tK] = /kgf|\bkg\b/.test(th) ? ['kgf', 1000] : /\blbf?\b/.test(th) ? ['lbf', 453.59237] : /\bn\b|newton/.test(th) ? ['N', 1000 / 9.80665] : /\bgf?\b|gram/.test(th) ? ['g', 1] : [null, 1];
  if (!tUnit) notes.push(tr('meas.noUnit'));
  const iK = /\bma\b/.test(lower(head[idx.curr])) ? 0.001 : 1, vK = /\bmv\b/.test(lower(head[idx.volt])) ? 0.001 : 1;
  const us = /µs|μs|\bus\b|escsignal|esc signal|pwm/.test(lower(head[idx.throttle]));
  const rows = [], bad = { rpm: false, power: false };
  for (const i of at) {
    const c = splitLine(lines[i], d), n = i + 1, v = (k) => num(c[idx[k]]);
    const f = Object.fromEntries(['throttle', 'thrust', 'curr', 'volt'].map((k) => [k, v(k)]));
    for (const k of Object.keys(f)) if (!Number.isFinite(f[k])) return E(tr('meas.cellNaN', { row: n, field: tr(`meas.field.${k}`) }));
    let pct = f.throttle;
    if (us) { if (pct < 800 || pct > 2200) return E(tr('meas.escRange', { row: n, value: fmt(pct) })); pct = Math.min(100, Math.max(0, (pct - 1000) / 10)); }
    else if (pct < 0 || pct > 100) return E(tr('meas.thrRange', { row: n, value: fmt(pct) }));
    const T = f.thrust * tK, I = f.curr * iK, V = f.volt * vK;
    if (T < -5 || T > CURVE_LIMITS.thrustG[1]) return E(tr('meas.thrustRange', { row: n, value: fmt(T) }));
    if (I < -0.5 || I > CURVE_LIMITS.currentA[1]) return E(tr('meas.currRange', { row: n, value: fmt(I, 1), max: CURVE_LIMITS.currentA[1] }));
    if (V < CURVE_LIMITS.voltageV[0] || V > CURVE_LIMITS.voltageV[1]) return E(tr('meas.voltRange', { row: n, value: fmt(V, 1), min: CURVE_LIMITS.voltageV[0], max: CURVE_LIMITS.voltageV[1] }));
    const r = { pct, thrustG: Math.max(0, T), currentA: Math.max(0, I), voltageV: V, n };
    for (const k of ['rpm', 'power']) if (k in idx) { const x = v(k), [a, b] = CURVE_LIMITS[k === 'power' ? 'powerW' : 'rpm']; if (Number.isFinite(x) && x >= a && x <= b) r[k] = x; else bad[k] = true; }
    rows.push(r);
  }
  for (let i = 1; i < rows.length; i++) if (rows[i].pct < rows[i - 1].pct) return E(tr('meas.notSweep', { row: rows[i].n, from: fmt(rows[i - 1].pct, 1), to: fmt(rows[i].pct, 1) }));
  // rows with the same throttle (steady steps, repeated samples) -> their mean
  const groups = [];
  for (const r of rows) { const g = groups[groups.length - 1]; if (g && g.pct === r.pct) g.rs.push(r); else groups.push({ pct: r.pct, rs: [r] }); }
  if (groups.length < 3) return E(tr('meas.levels', { count: groups.length }));
  const mean = (g, k) => g.rs.reduce((a, r) => a + r[k], 0) / g.rs.length;
  const pts = groups.map((g) => {
    const p = { pct: g.pct, thrustG: mean(g, 'thrustG'), currentA: mean(g, 'currentA'), voltageV: mean(g, 'voltageV') };
    if (!bad.rpm && 'rpm' in idx) p.rpm = mean(g, 'rpm');
    if (!bad.power && 'power' in idx) p.powerW = mean(g, 'power');
    return p;
  });
  for (const k of ['rpm', 'power']) if (bad[k]) notes.push(tr('meas.badCol', { column: tr(`meas.col.${k}`) }));
  // thrust and current must rise with throttle; noise up to 5% of the maximum is smoothed (held at the running maximum), a real fall is a different kind of file
  for (const k of ['thrustG', 'currentA']) {
    const what = tr(`meas.what.${k}`);
    const top = Math.max(...pts.map((p) => p[k]));
    if (!(top > 0)) return E(tr('meas.allZero', { what }));
    let run = 0;
    for (const p of pts) { if (p[k] < run - 0.05 * top) return E(tr('meas.falls', { what, pct: fmt(p.pct, 1) })); run = Math.max(run, p[k]); p[k] = run; }
  }
  // physical sanity: thrust per electrical watt (real props make about 1 to 20 g/W); far outside means the unit is wrong
  const hi = pts.reduce((a, p) => (p.voltageV * p.currentA >= 10 ? Math.max(a, p.thrustG / (p.voltageV * p.currentA)) : a), 0), last = pts[pts.length - 1];
  if (hi > 30) return E(tr('meas.tooHigh'));
  if (last.voltageV * last.currentA >= 10 && last.thrustG / (last.voltageV * last.currentA) < 0.1) return E(tr('meas.tooLow'));
  const thin = downsample(pts);
  if (thin.length < pts.length) notes.push(tr('meas.thinned', { from: pts.length, to: thin.length }));
  const out = thin.map((p) => ({ pct: rnd(p.pct, 3), thrustG: rnd(p.thrustG, 1), currentA: rnd(p.currentA, 2), voltageV: rnd(p.voltageV, 2),
    ...(p.rpm !== undefined ? { rpm: Math.round(p.rpm) } : {}), ...(p.powerW !== undefined ? { powerW: rnd(p.powerW, 1) } : {}) }));
  const v = curveOf({ name: text(String(name).replace(/\.[^.]*$/, ''), 40) || tr('meas.defaultName'), points: out });
  if (v.error) return E(tr('meas.notUsable', { error: v.error }));
  return { curve: v.curve, notes: [...(tUnit ? [tr('meas.unit', { unit: tUnit })] : []), ...notes], rows: rows.length };
}
/** File (File or any { size, name, text() }) -> parseThrustCsv result. The size is checked before the file is read. */
export async function readThrustFile(file) {
  if (!(file?.size <= CSV_MAX_BYTES)) return { error: tr('meas.tooBig', { size: KB(CSV_MAX_BYTES) }) };
  let t;
  try { t = await file.text(); } catch { return { error: tr('io.unreadable') }; }
  return parseThrustCsv(t, file.name || '');
}

// ---- F8 storage: curves in localStorage (untrusted on every load)
/** store = { getItem, setItem } (localStorage, every access guarded). Curves are { id, name, savedAt, points }; a share link only ever names the id. */
export function createCurves(store, now = () => Date.now(), rand = Math.random) {
  let cache = { raw: null, list: [] };
  const list = () => {
    try {
      const s = store?.getItem(CURVES_KEY);
      if (s === cache.raw) return cache.list;
      const a = s && s.length <= RAW_MAX ? JSON.parse(s) : [], seen = new Set(), out = [];
      if (Array.isArray(a)) {
        for (const e of a.slice(0, CURVES_MAX * 4)) {
          const id = e && typeof e.id === 'string' && CURVE_ID.test(e.id) ? e.id : null, v = id ? curveOf({ name: e.name, points: e.points }) : null;
          if (v?.curve && !seen.has(id) && out.length < CURVES_MAX) { seen.add(id); out.push({ id, name: text(v.curve.name, 40), savedAt: Number.isFinite(e.savedAt) ? e.savedAt : 0, points: v.curve.points }); }
        }
      }
      cache = { raw: s ?? null, list: out };
      return out;
    } catch { return []; }
  };
  const write = (a) => { try { store.setItem(CURVES_KEY, JSON.stringify(a)); return true; } catch { return false; } };
  const fresh = (cur) => { let id; do id = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]).join(''); while (cur.some((c) => c.id === id)); return id; };
  return {
    list, get: (id) => list().find((c) => c.id === id) || null,
    // -> { ok, id } or { ok: false, error }. Points are thinned to CURVE_POINTS and re-validated.
    add(raw) {
      const cur = list(), v = curveOf({ name: raw?.name, points: Array.isArray(raw?.points) ? downsample(raw.points) : raw?.points });
      if (!v.curve) return { ok: false, error: tr('meas.curveNotUsable', { error: v.error }) };
      if (cur.length >= CURVES_MAX) return { ok: false, error: tr('meas.limit', { max: CURVES_MAX }) };
      const id = fresh(cur);
      return write([...cur, { id, name: text(v.curve.name, 40) || tr('meas.defaultName'), savedAt: now(), points: v.curve.points }]) ? { ok: true, id } : { ok: false, error: tr('io.storage') };
    },
    remove: (id) => write(list().filter((c) => c.id !== id)),
  };
}

// ---- F10: flight-log CSV
const BIN_EXT = /\.(bbl|bfl|bin|ulg|ulog|tlog|log)$/i;
export const binaryMsg = () => tr('meas.binary');
class LogErr { constructor(m) { this.m = m; } }
async function* chunks(file) {
  if (typeof file.slice !== 'function') { yield await file.text(); return; }
  const dec = new TextDecoder('utf-8');
  for (let o = 0; o < file.size; o += LOG_CHUNK) yield dec.decode(await file.slice(o, Math.min(file.size, o + LOG_CHUNK)).arrayBuffer(), { stream: o + LOG_CHUNK < file.size });
}
const tScale = (h) => { const u = unitOf(h), b = base(h).replace(/ /g, ''); return /^(us|µs)$/.test(u) || /us$/.test(b) ? 1e-6 : u === 'ms' || /ms$/.test(b) ? 1e-3 : /^(s|sec|secs|seconds)$/.test(u) ? 1 : null; };

/** Flight-log CSV file -> { log } or { error }. Betaflight Blackbox (blackbox_decode CSV: time (us), vbatLatest (V), amperageLatest (A), energyCumulative (mAh)), ArduPilot / Mission Planner
 *  CSV (TimeUS, Volt, Curr, CurrTot) or any CSV with time, voltage and current columns. Read in chunks: the exact peak current and lowest voltage are kept for every row, the rest as a thinned series of
 *  at most 4000 rows (halved whenever it fills). log = { rows, skipped, t (s), v (V), i (A), m (mAh or NaN), peakI, minV, hasMah, notes }. */
export async function parseFlightLog(file) {
  if (!file || !(file.size <= LOG_MAX_BYTES)) return { error: tr('meas.tooBig', { size: MB(LOG_MAX_BYTES) }) };
  if (BIN_EXT.test(file.name || '')) return { error: binaryMsg() };
  const st = { idx: null, d: ',', scan: 0, first: null, rows: 0, bad: 0, back: 0, buf: [], stride: 1, k: 0, peakI: -Infinity, minV: Infinity, t0: null, tPrev: -Infinity, vK: 1, iK: 1, tK: null, tn: '' };
  const row = (line) => {
    if (!line.trim()) return;
    if (!st.idx) {
      if (++st.scan > 60) throw new LogErr(tr('meas.noLogColsEarly'));
      const d = delimOf(line), cells = splitLine(line, d), idx = rolesOf(cells);
      if ('time' in idx && 'volt' in idx && 'curr' in idx) {
        Object.assign(st, { idx, d, vK: /\bmv\b/.test(lower(cells[idx.volt])) ? 0.001 : 1, iK: /\bma\b/.test(lower(cells[idx.curr])) ? 0.001 : 1, tK: tScale(cells[idx.time]), tn: cells[idx.time] });
      } else if (st.scan === 1) st.first = cells;
      return;
    }
    const c = st.d === ',' && !line.includes('"') ? line.split(',', 400) : splitLine(line, st.d), x = st.idx;
    const tm = num(c[x.time]), v = num(c[x.volt]) * st.vK, i = num(c[x.curr]) * st.iK, m = x.mah === undefined ? NaN : num(c[x.mah]);
    if (!Number.isFinite(tm) || !Number.isFinite(v) || !Number.isFinite(i) || v < 0 || v > 130 || i < -20 || i > 2000) { st.bad++; return; }
    if (tm <= st.tPrev) { st.back++; return; }
    if (st.t0 === null) st.t0 = tm;
    st.tPrev = tm; st.rows++;
    if (i > st.peakI) st.peakI = i;
    if (v >= 1 && v < st.minV) st.minV = v;
    if (st.k++ % st.stride === 0) {
      st.buf.push([tm, v, Math.max(0, i), m >= 0 && m <= 5e6 ? m : NaN]);
      if (st.buf.length >= LOG_KEEP) { st.buf = st.buf.filter((_, j) => !(j & 1)); st.stride *= 2; } // thin: keep every other row, so the series stays evenly spaced
    }
  };
  try {
    let carry = '', first = true;
    for await (let part of chunks(file)) {
      if (first) { first = false; if (part.charCodeAt(0) === 0xfeff) part = part.slice(1); if (looksBinary(part.slice(0, 4096))) throw new LogErr(binaryMsg()); }
      const lines = (carry + part).split(/\r\n|\r|\n/);
      carry = lines.pop();
      if (carry.length > 1e6) throw new LogErr(tr('meas.lineLong'));
      for (const l of lines) row(l);
    }
    if (carry) row(carry);
  } catch (e) {
    if (e instanceof LogErr) return { error: e.m };
    return { error: tr('io.unreadable') };
  }
  if (!st.idx) return { error: tr('meas.noLogCols', { columns: (st.first || []).slice(0, 12).map(shown).join(', ') || tr('meas.none') }) };
  const total = st.rows + st.bad + st.back;
  if (st.rows < 10) return { error: tr('meas.fewUsable') };
  if (st.bad + st.back > 0.2 * total) return { error: tr('meas.badRows', { bad: st.bad + st.back, total }) };
  const span = st.tPrev - st.t0, notes = [];
  let tK = st.tK;
  if (tK === null) { tK = [1, 1e-3, 1e-6].find((k) => span * k >= 5 && span * k <= 14400) ?? null; if (tK === null) return { error: tr('meas.timeUnit') }; notes.push(tr('meas.timeNoUnit', { unit: tr(tK === 1 ? 'meas.tu.s' : tK === 1e-3 ? 'meas.tu.ms' : 'meas.tu.us') })); }
  if (span * tK < 1) return { error: tr('meas.short') };
  const b = st.buf;
  return { log: { rows: st.rows, skipped: st.bad + st.back, t: b.map((r) => (r[0] - st.t0) * tK), v: b.map((r) => r[1]), i: b.map((r) => r[2]), m: b.map((r) => r[3]),
    peakI: Math.max(0, st.peakI), minV: Number.isFinite(st.minV) ? st.minV : 0, hasMah: b.some((r) => Number.isFinite(r[3])), notes } };
}

const med = (a) => { const s = [...a].sort((p, q) => p - q), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
/** log (parseFlightLog) + the build's cell count -> stats, or { error }. Flight = from the first to the last sample with current at or above max(0.5 A, 10% of the peak).
 *  Averages are time-weighted over the flight. Hover estimate = median current over the steady stretches (within +-1 s the current stays within 15% and above half the typical flight current). */
export function logStats(log, cells) {
  const { t, v, i, m } = log, n = t.length, thr = Math.max(0.5, 0.1 * log.peakI);
  let a0 = -1, a1 = -1;
  for (let k = 0; k < n; k++) if (i[k] >= thr) { if (a0 < 0) a0 = k; a1 = k; }
  if (a0 < 0 || a1 <= a0) return { error: tr('meas.noFlight', { value: fmt(thr, 1) }) };
  const T = t[a1] - t[a0];
  let qi = 0, qv = 0;
  for (let k = a0 + 1; k <= a1; k++) { const dt = t[k] - t[k - 1]; qi += (dt * (i[k] + i[k - 1])) / 2; qv += (dt * (v[k] + v[k - 1])) / 2; }
  const avgA = qi / T, avgV = qv / T, fromLog = Number.isFinite(m[a0]) && Number.isFinite(m[a1]) && m[a1] >= m[a0];
  const typ = med(i.slice(a0, a1 + 1).filter((x) => x >= thr)), steady = [];
  for (let k = a0, lo = a0, hi = a0; k <= a1; k++) {
    while (t[k] - t[lo] > 1) lo++;
    while (hi < a1 && t[hi + 1] - t[k] <= 1) hi++;
    if (hi - lo < 2) continue;
    const w = i.slice(lo, hi + 1), md = med(w);
    if (md >= 0.5 * typ && Math.max(...w) - Math.min(...w) <= 0.15 * md) steady.push(i[k]);
  }
  const s = { cells, flightS: T, from: t[a0], to: t[a1], avgA, peakA: log.peakI, avgV, avgCellV: avgV / cells, minV: log.minV, minCellV: log.minV / cells,
    mah: fromLog ? m[a1] - m[a0] : qi / 3.6, mahFrom: fromLog ? 'log' : 'integral', hoverA: steady.length >= 5 ? med(steady) : null, steadyN: steady.length, warn: [] };
  if (!(s.avgCellV >= 2.5 && s.avgCellV <= 4.4)) s.warn.push(tr('meas.warnCell', { value: fmt(s.avgCellV, 2), cells }));
  return s;
}
/** Log stats vs the build's result: rows { key, label, unit, d, got, pred, err (% of predicted, or null), note }. The prediction is what the page shows now. */
export function compareLog(s, r) {
  const b = r?.battery, nomV = r.batteryWh / (r.batteryMah / 1000);
  const row = (key, label, unit, d, got, pred, note = '') => ({ key, label, unit, d, got, pred: Number.isFinite(pred) ? pred : null, err: Number.isFinite(pred) && pred !== 0 && Number.isFinite(got) ? ((got - pred) / pred) * 100 : null, note });
  return [
    row('hover', tr(r?.fixedWing ? 'meas.cmp.cruise' : 'meas.cmp.hover'), 'A', 1, s.hoverA ?? NaN, b?.hoverA),
    row('avg', tr('meas.cmp.avg'), 'A', 1, s.avgA, r?.avgPowerW / nomV),
    row('time', tr('meas.cmp.time'), 'min', 1, s.flightS / 60, r?.estFlightMin, tr('meas.note.time')),
    row('peak', tr('meas.cmp.peak'), 'A', 1, s.peakA, b?.maxA, tr('meas.note.peak')),
    row('avgv', tr('meas.cmp.avgv'), 'V', 2, s.avgCellV, b?.hoverCellV, tr('meas.note.avgv')),
    row('minv', tr('meas.cmp.minv'), 'V', 2, s.minCellV, b?.maxCellV, tr('meas.note.minv')),
    row('mah', tr('meas.cmp.mah'), 'mAh', 0, s.mah, NaN, tr(s.mahFrom === 'log' ? 'meas.note.log' : 'meas.note.integral')),
  ];
}
/** Voltage and current over time, with the predicted hover current as a reference line: an <svg> string (charts.panels), thinned to LOG_MAX_POINTS. null when the log is too short. */
export function logChart(log, predHover, W = 560, id = 'flog') {
  const n = log.t.length, step = Math.max(1, Math.ceil(n / LOG_MAX_POINTS)), rows = [];
  for (let k = 0; k < n; k += step) rows.push({ t: log.t[k], v: log.v[k], i: log.i[k] });
  if (rows.length < 3) return null;
  const o = CH.panels({ rows, x: { key: 't', label: tr('meas.chart.time'), unit: 's' }, marks: [], zones: [],
    panels: [{ key: 'v', label: tr('meas.chart.voltage'), unit: 'V', w: 1 }, { key: 'i', label: tr('meas.chart.current'), unit: 'A', w: 1, refs: Number.isFinite(predHover) ? [{ y: predHover, label: tr('meas.chart.pred', { value: fmt(predHover, 1) }), kind: 'ref', at: 'l' }] : [] }] }, W, id);
  const aria = Number.isFinite(predHover) ? tr('meas.chart.ariaRef', { value: fmt(predHover, 1) }) : tr('meas.chart.aria');
  return `<svg class="pf-svg" role="img" aria-label="${esc(aria)}" aria-describedby="fl-cap" viewBox="0 0 ${o.w} ${o.h}" width="${o.w}" height="${o.h}">${o.inner}</svg>`;
}

// ---- CSV router: which kind of file is this (the first lines tell)
export async function sniffKind(file) {
  let head = '';
  try { head = typeof file.slice === 'function' ? await file.slice(0, 8192).text() : String(await file.text()).slice(0, 8192); } catch { return 'log'; }
  if (head.charCodeAt(0) === 0xfeff) head = head.slice(1);
  for (const l of head.split(/\r\n|\r|\n/).slice(0, 12)) if (l.trim() && !l.startsWith('#')) { const r = rolesOf(splitLine(l, delimOf(l))); if ('thrust' in r && 'throttle' in r) return 'curve'; }
  return 'log';
}

// ---- the card: pure html builders, then a DOM mount
const pct = (e) => (e == null ? '' : `${e > 0 ? '+' : ''}${fmt(e, 0)}%`);
/** One comparison as <dl class="bat"> tiles. rows = compareLog(). */
export function compareHtml(rows) {
  return `<dl class="bat">${rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${fmt(r.got, r.d)}<small>${esc(r.unit)}${r.pred != null ? `${esc(tr('meas.predicted', { value: fmt(r.pred, r.d), unit: r.unit }))}${r.err != null ? ` (${esc(pct(r.err))})` : ''}` : ''}${r.note ? ` &middot; ${esc(r.note)}` : ''}</small></dd></div>`).join('')}</dl>`;
}
/** v = { curves: [{ id, name }], attached: id or '', missing, mc: result.measuredCurve or null, msg, logMsg, log: { stats, rows, chart, canCal, calA, hv } or null, confirm, saveOk }. Every dynamic string is escaped here. */
export function measuredHtml(v) {
  const mc = v.mc, row = 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 6px;align-items:end';
  const st = mc ? tf('meas.stMeasured', { count: mc.motors, name: mc.name || tr('meas.curveLower'), points: mc.points, motors: mc.motors, thrust: fmt(U.toDisplay('g', mc.maxThrustG), U.dx('g')), unit: U.label('g'), hover: mc.hoverA != null ? tr('meas.stHover', { value: fmt(mc.hoverA, 1) }) : '' }) : tf('meas.stModelled');
  const L = v.log;
  return `<h3 id="h-meas"><em>MEAS</em>${esc(tr('meas.title'))}</h3>
<p class="meas-st" id="mc-st">${st}</p>
${v.missing ? `<p class="bat-flag" data-lvl="warn">${esc(tr('meas.missing'))}</p>` : ''}
<div class="field"><label for="mc-pick">${esc(tr('meas.pick'))}</label><div class="inp"><select id="mc-pick" data-ml="pick"><option value="">${esc(tr('meas.modelled'))}</option>${v.curves.map((c) => `<option value="${esc(c.id)}"${c.id === v.attached ? ' selected' : ''}>${esc(c.name || tr('meas.defaultName'))}</option>`).join('')}</select></div></div>
<div style="${row}"><button type="button" class="btn sm" data-ml="import-curve">${esc(tr('meas.importCurve'))}</button><input type="file" id="mc-file" accept=".csv,text/csv,text/plain" hidden aria-label="${esc(tr('meas.curveAria'))}">
<button type="button" class="btn sm" data-ml="delete"${v.attached && v.curves.some((c) => c.id === v.attached) ? '' : ' disabled'}>${esc(tr(v.confirm ? 'custom.confirmDelete' : 'meas.deleteCurve'))}</button></div>
<p class="hint">${esc(tr('meas.curveHint', { size: KB(CSV_MAX_BYTES), rows: CSV_MAX_ROWS, max: CURVES_MAX }))}</p>
<p class="hint" id="mc-msg">${esc(U.text(v.msg))}</p>
<h4 class="meas-h">${esc(tr('meas.logTitle'))}</h4>
<div style="${row}"><button type="button" class="btn sm" data-ml="import-log">${esc(tr('meas.chooseLog'))}</button><input type="file" id="fl-file" accept=".csv,text/csv,text/plain" hidden aria-label="${esc(tr('meas.logAria'))}">${L ? `<button type="button" class="btn sm" data-ml="clear-log">${esc(tr('meas.clearLog'))}</button>` : ''}</div>
<p class="hint">${esc(tr('meas.logHint', { size: MB(LOG_MAX_BYTES) }))}</p>
<p class="hint" id="fl-msg">${esc(v.logMsg)}</p>
${L ? `${compareHtml(L.rows)}${L.stats.warn.map((w) => `<p class="bat-flag" data-lvl="warn">${esc(w)}</p>`).join('')}
${L.chart ? `<div class="pf-sec"><figure class="pf"><div class="pf-box"><div class="pf-plot">${L.chart}</div></div><figcaption id="fl-cap">${tf('meas.chartCap', { secs: fmt(L.stats.flightS, 0) })}</figcaption></figure></div>` : ''}
${L.canCal ? `<div style="${row}"><button type="button" class="btn sm pri" data-ml="calibrate">${esc(tr('meas.calibrate'))}</button></div><p class="hint">${esc(tr('meas.calibHint', { value: fmt(L.calA, 2) }))}</p>`
  : `<p class="hint">${esc(tr('meas.noHover'))}</p>`}` : ''}`;
}

const MAX_CAL = (a) => (haOf(rnd(a, 2)) != null ? rnd(a, 2) : null);
// The card's own state: module-level so it survives the page redrawing the results (the log stays in memory only, never stored).
export const ui = { msg: '', logMsg: '', log: null, confirm: false };
/** el = the card's container, env = { CRV (createCurves), state() -> S, result() -> the displayed engine result, setCurve(id), setHa(a) }. Returns { importCsv(file) -> Promise<message> }. */
export function mountMeasured(el, env) {
  if (!el) return null;
  const view = () => {
    const S = env.state(), r = env.result(), cur = env.CRV?.get(S.mc) || null;
    let log = null;
    if (ui.log && r) {
      const stats = logStats(ui.log, r.batteryCells);
      if (!stats.error) {
        const calA = stats.hoverA == null ? null : MAX_CAL(stats.hoverA);
        log = { stats, rows: compareLog(stats, r), chart: logChart(ui.log, r.battery?.hoverA), canCal: calA != null, calA };
      } else ui.logMsg = stats.error;
    }
    el.innerHTML = measuredHtml({ curves: (env.CRV?.list() || []).map(({ id, name }) => ({ id, name })), attached: cur ? S.mc : '', missing: !!S.mc && !cur, mc: r?.measuredCurve || null, msg: ui.msg, logMsg: ui.logMsg, log, confirm: ui.confirm });
  };
  async function importCsv(file) {
    ui.confirm = false;
    const kind = BIN_EXT.test(file?.name || '') ? 'log' : await sniffKind(file);
    if (kind === 'curve') {
      const p = await readThrustFile(file);
      if (p.error) { ui.msg = p.error; view(); return p.error; }
      const a = env.CRV?.add(p.curve) || { ok: false, error: tr('meas.noCurves') };
      if (!a.ok) { ui.msg = a.error; view(); return a.error; }
      ui.msg = tr('meas.imported', { name: p.curve.name, points: p.curve.points.length, rows: p.rows, notes: p.notes.join(' ') }).trim();
      env.setCurve(a.id); // redraws the page, and with it this card
      return ui.msg;
    }
    const p = await parseFlightLog(file);
    if (p.error) { ui.log = null; ui.logMsg = p.error; view(); return p.error; }
    ui.log = p.log;
    ui.logMsg = tr('meas.read', { rows: p.log.rows, skipped: p.log.skipped ? tr('meas.skipped', { n: p.log.skipped }) : '', notes: p.log.notes.join(' ') }).trim();
    view();
    return ui.logMsg;
  }
  const say = (m) => env.say?.(m); // the card is redrawn on every change, so its own text cannot be a live region: the page's one polite region speaks
  const run = (f) => f && importCsv(f).then(say).catch((e) => { ui.msg = tr('io.importFailed', { message: e?.message || e }); view(); });
  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'mc-pick') { ui.msg = ''; ui.confirm = false; env.setCurve(t.value); return; }
    const f = (t.id === 'mc-file' || t.id === 'fl-file') && t.files[0];
    if (f) { t.value = ''; run(f); } // reset so the same file can be picked again
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ml]');
    if (!b) return;
    const a = b.dataset.ml, S = env.state();
    if (a !== 'delete') ui.confirm = false;
    if (a === 'import-curve') return el.querySelector('#mc-file').click();
    if (a === 'import-log') return el.querySelector('#fl-file').click();
    if (a === 'clear-log') { ui.log = null; ui.logMsg = ''; return view(); }
    if (a === 'delete') {
      if (!ui.confirm) { ui.confirm = true; ui.msg = tr('meas.confirmMsg'); view(); return say(ui.msg); }
      const id = S.mc; ui.confirm = false; ui.msg = tr('meas.deleted');
      env.CRV?.remove(id); env.setCurve(''); return say(ui.msg);
    }
    if (a === 'calibrate' && ui.log) {
      const r = env.result(), s = r && logStats(ui.log, r.batteryCells), v = s && !s.error && s.hoverA != null ? MAX_CAL(s.hoverA) : null;
      if (v == null) return;
      ui.logMsg = tr('meas.calSet', { value: fmt(v, 2), min: HA.min, max: HA.max });
      env.setHa(v); say(ui.logMsg);
    }
  });
  view();
  return { importCsv };
}
