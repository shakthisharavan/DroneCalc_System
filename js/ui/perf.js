// Performance section (PERF). SHELL wraps the output in its own <section><h3>Performance</h3><div id="perf">.
// renderPerformance(result, ctx) -> HTML string (pure, node-safe). ctx = { missionLabel, mission?, minTWR? }.
// Airframes: multirotor, VTOL quadplane (result.vtol), tiltrotor (result.vtol.type "tiltrotor"), fixed wing (result.fixedWing).
// bindPerformance(root) -> live figures: redrawn at true pixel width (crisp 11 px text at any column width),
// crosshair, tooltips, arrow keys on a focused figure, table toggles, Copy CSV. Idempotent.
// perfTables(result) -> [{title, columns, rows}]: display strings, units in the column titles (PDF + on-screen tables).
// A missing or partial series skips its figure with a short note; nothing here throws on odd input.
import * as C from './charts.js';
import * as U from './units.js';
import { n as kn } from './state.js'; // the KPI tiles' formatter (toFixed), so strip and tiles never round differently
import { t as tr, lazyMap } from '../i18n/i18n.js';
// MISSIONS and FPV_CLASSES only (minimum thrust-to-weight, class labels); a broken or missing engine leaves the figures working
const E = await import('../engine.js').catch(() => ({}));

const { esc, fmt, PAL } = C;
const fin = Number.isFinite;
// Display units (units.js): the model and the sweeps stay SI; every figure's text and axes are converted at the edge.
// fq = number in display units (charts' en-US format), sq = with the unit label. q = a units.js quantity.
const fq = (q, v, d = 0) => fmt(U.toDisplay(q, v), d + U.dx(q)), sq = (q, v, d = 0) => `${fq(q, v, d)} ${U.label(q)}`;
const sum = (a) => a.reduce((s, v) => s + v, 0);
const up = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Finite rows only, sorted by the first key, duplicate x dropped (the curve needs strictly increasing x).
function clean(a, keys) {
  const rows = (Array.isArray(a) ? a : []).filter((r) => r && keys.every((k) => fin(r[k]))).sort((p, q) => p[keys[0]] - q[keys[0]]);
  return rows.filter((r, i) => !i || r[keys[0]] > rows[i - 1][keys[0]]);
}
const table = (title, cols, rows) => ({ title, columns: cols.map((c) => c[1]), rows: rows.map((r) => cols.map(([k, , d, q]) => (q ? fq(q, r[k], d) : fmt(r[k], d)))) });
const near = (rows, k, x) => (fin(x) ? rows.reduce((b, r, i) => (Math.abs(r[k] - x) < Math.abs(rows[b][k] - x) ? i : b), 0) : -1);
const dur = (s) => (s < 120 ? `${fmt(s)} s` : `${fmt(s / 60, 1)} min`);
const K = { // legend keys
  ln: (t) => `<li><i class="k-ln"></i>${esc(t)}</li>`, bd: (t) => `<li><i class="k-bd"></i>${esc(t)}</li>`,
  rf: (t) => `<li><i class="k-rf"></i>${esc(t)}</li>`, lm: (t) => `<li><i class="k-lm"></i>${esc(t)}</li>`,
  hz: (t) => `<li><i class="k-hz"></i>${esc(t)}</li>`, hr: (t) => `<li><i class="k-hr"></i>${esc(t)}</li>`,
  sw: (t, c, st) => `<li><i class="k-sw${st ? ' st' : ''}" style="--c:${c}"></i>${esc(t)}</li>`,
};

// [key, column title, decimals, quantity]; a function, so the unit labels follow the display units
const COLS = () => ({
  speed: [['ms', tr('perf.col.speed', { unit: U.label('ms') }), 1, 'ms'], ['powerW', tr('perf.col.power'), 0], ['currentA', tr('perf.col.current'), 1], ['flightMin', tr('perf.col.flight'), 1], ['rangeKm', tr('perf.col.range', { unit: U.label('km') }), 2, 'km']],
  payload: [['kg', tr('perf.col.payload', { unit: U.label('kg') }), 2, 'kg'], ['flightMin', tr('perf.col.flight'), 1], ['twr', tr('perf.col.twr'), 2]],
  battery: [['wh', tr('perf.col.battery'), 0], ['flightMin', tr('perf.col.flight'), 1], ['auwKg', tr('perf.col.mass', { unit: U.label('kg') }), 2, 'kg']],
  throttle: [['pct', tr('perf.col.throttle'), 0], ['thrustG', tr('perf.col.thrust', { unit: U.label('g') }), 0, 'g'], ['powerW', tr('perf.col.power'), 0], ['currentA', tr('perf.col.current'), 1], ['gPerW', tr('perf.col.eff', { unit: U.label('gw') }), 2, 'gw']],
});
const xTips = (rows, xk, head, ys) => rows.map((r) => { const x = head[2] ? fq(head[2], r[xk], head[1]) : fmt(r[xk], head[1]); return { x, h: `${x} ${head[0]}`, r: ys.filter(([k]) => fin(r[k])).map(([k, l, u, d, q]) => [q ? sq(q, r[k], d) : `${fmt(r[k], d)}${u ? ' ' + u : ''}`, l]) }; });
const lineFig = (o) => ({ kind: 'x', render: (w, id) => C.panels(o.spec, w, id), ...o });
// measured weight that differs from the estimate by at least a gram; same gram = nothing to say about "estimate" vs "measured"
const dif = (r) => fin(r.measuredG) && Math.round(r.measuredG) !== Math.round(r.estG);
// Marker value tags sit wherever the data is, and a measured weight moves the marker next to a fixed label (reference line, "Max" end note).
// So those labels are placed by trial: render each variant (most wanted first), count text/text and text/marker-line overlaps
// (0.6 em mono advance, as charts.panels sets it), keep the first clean one, else the least bad.
const TXT = /<text x="([\d.-]+)" y="([\d.-]+)" class="((?:rl|el|vb)[^"]*)"( text-anchor="end")?>([^<]*)<\/text>/g, MARK = /<path class="bd" d="M([\d.-]+) ([\d.-]+)V([\d.-]+)"\/>/g;
const hits = (svg) => {
  const T = [...svg.matchAll(TXT)].map(([, x, y, c, e, t]) => { const w = t.length * (c[0] === 'v' ? 6.6 : 6.3), x0 = e ? x - w : +x; return { c: c.slice(0, 2), x0, x1: x0 + w, y0: y - 10, y1: +y + 2 }; });
  const M = [...svg.matchAll(MARK)].map(([, x, a, b]) => ({ x: +x, y0: +a, y1: +b }));
  let n = 0;
  T.forEach((a, i) => {
    T.slice(i + 1).forEach((b) => { if (a.x0 < b.x1 + 2 && b.x0 < a.x1 + 2 && a.y0 < b.y1 && b.y0 < a.y1) n++; });
    if (a.c !== 'vb') n += M.filter((m) => m.x > a.x0 - 3 && m.x < a.x1 + 3 && m.y0 <= a.y1 && m.y1 >= a.y0).length;
  });
  return n;
};
export const overlaps = hits; // one figure's svg markup -> number of label collisions (tests)
const fit = (vs) => (W, id) => { let best, bn = Infinity; for (const sp of vs) { const o = C.panels(sp, W, id), n = hits(o.inner); if (n < bn) { best = o; bn = n; if (!n) break; } } return best; };
const withP = (sp, i, f) => ({ ...sp, panels: sp.panels.map((p, j) => (j === i ? f(p) : p)) });
const close = (a, b) => fin(a) && fin(b) && Math.abs(a - b) <= 0.03 * Math.max(a, b); // flags this close would stack: merge them
const and = (a) => (a.length < 2 ? a.join('') : tr('perf.and', { list: a.slice(0, -1).join(', '), last: a[a.length - 1] }));
// FPV class label ("5 in freestyle"): the engine's FPV_CLASSES when it has them, else SPEC-v3 1.3
const FPV_TWR = { 5: 7, 7: 4, 10: 3 }; // fallback minimum thrust : weight per class
const fpvOf = (r) => {
  const k = r?.fpvClass == null ? '' : String(r.fpvClass), e = E.FPV_CLASSES?.[k];
  return Object.hasOwn(FPV_TWR, k) || e ? { label: e?.label || tr(`fpv.${k}.label`), minTWR: fin(e?.minTWR) ? e.minTWR : FPV_TWR[k] } : null;
};

function speed(r, P, v, w) {
  const rows = clean(P.speed, ['ms', 'powerW', 'flightMin', 'rangeKm']);
  if (rows.length < 3) return null;
  const top = (k) => rows.reduce((a, b) => (b[k] > a[k] ? b : a)).ms;
  const be = fin(P.bestSpeed?.enduranceMs) ? P.bestSpeed.enduranceMs : top('flightMin');
  const br = fin(P.bestSpeed?.rangeMs) ? P.bestSpeed.rangeMs : top('rangeKm');
  const a = w || v, e = dif(r) ? r.estAir : null, cr = fin(e?.cruiseMs) ? e.cruiseMs : fin(a?.cruiseMs) ? a.cruiseMs : r.cruiseMs, stall = fin(e?.stallMs) ? e.stallMs : a?.stallMs; // measured: the sweep, stall zone and cruise marker all stay at the estimated mass
  const pn = [{ key: 'powerW', label: tr('perf.power'), unit: 'W', d: 0 }, { key: 'flightMin', label: tr('perf.flightTime'), unit: 'min', d: 1 }, { key: 'rangeKm', label: tr('perf.range'), unit: 'km', d: 1, q: 'km' }];
  const at = (k, x) => C.curve(rows, 'ms', k).f(x), vals = (x) => pn.map((p) => (p.q ? sq(p.q, at(p.key, x), p.d) : `${fmt(at(p.key, x), p.d)} ${p.unit}`));
  const marks = [{ x: be, label: tr('perf.mark.endurance', { v: fq('ms', be, 1) }), kind: 'ref', dots: [1] }, { x: br, label: tr('perf.mark.range', { v: fq('ms', br, 1) }), kind: 'ref', dots: [2] }];
  const same = close(cr, br) ? 'range' : close(cr, be) ? 'endurance' : '';
  if (same) marks.splice(same === 'range' ? 1 : 0, 1);
  if (fin(cr)) marks.push({ x: cr, label: same ? tr('perf.mark.sameCruise', { name: tr(`perf.${same}`), v: fq('ms', cr, 1) }) : tr('perf.mark.cruise', { v: fq('ms', cr, 1) }), kind: 'build', vals: vals(cr) });
  if (w && fin(stall)) marks.push({ x: stall, label: tr('perf.mark.stall', { v: fq('ms', stall, 1) }), kind: 'lim' }); // no hover to fall back on: a hard floor
  const zones = fin(stall) ? [{ x0: 0, x1: stall, label: tr('perf.stall') }] : [];
  const c = vals(cr);
  const cap = tr('perf.speed.cap', { be: sq('ms', be, 1), bm: fmt(at('flightMin', be), 1), br: sq('ms', br, 1), brk: sq('km', at('rangeKm', br), 1) }) +
    (fin(cr) ? ' ' + tr('perf.speed.cruise', { cr: sq('ms', cr, 1), vals: c.join(', '), phases: tr(a ? 'perf.speed.launchClimb' : 'perf.speed.takeoffLanding') }) : '') +
    (!fin(stall) ? '' : ' ' + (w ? tr('perf.speed.stallWing', { s: sq('ms', stall, 1) }) : tr(v?.type === 'tiltrotor' ? 'perf.speed.stallTilt' : 'perf.speed.stallVtol', { s: sq('ms', stall, 1) })));
  return lineFig({
    n: 1, key: 'speed', title: tr('perf.title.speed'), cap,
    spec: { rows, q: { ms: 'ms', rangeKm: 'km' }, x: { key: 'ms', label: tr('perf.airspeed'), unit: 'm/s', ...(fin(stall) ? { lo: stall * 0.8 } : {}) }, panels: pn, marks, zones },
    legend: K.ln(tr('perf.legend.model')) + (fin(cr) ? K.bd(tr('perf.legend.cruise', { v: sq('ms', cr, 1) })) : '') + K.rf(tr('perf.legend.best')) +
      (w && fin(stall) ? K.lm(tr('perf.legend.stall', { v: sq('ms', stall, 1) })) : '') + (fin(stall) ? K.hz(tr('perf.legend.belowStall')) : ''),
    tips: xTips(rows, 'ms', [U.label('ms'), 1, 'ms'], [['powerW', tr('perf.power'), 'W', 0], ['currentA', tr('perf.current'), 'A', 1], ['flightMin', tr('perf.flightTime'), 'min', 1], ['rangeKm', tr('perf.range'), 'km', 2, 'km']]),
    start: near(rows, 'ms', fin(cr) ? cr : be), table: table(tr('perf.speed.table'), COLS().speed, rows),
  });
}

function payload(r, P, minTWR, mn, wing) {
  const rows = clean(P.payload, ['kg', 'flightMin', 'twr']);
  if (rows.length < 3) return null;
  // measured weight: the sweep holds hardware and pack fixed, so the measured mass sits on it at an equivalent payload
  const mk = fin(r.measuredPayloadKg) ? r.measuredPayloadKg : NaN, last = rows[rows.length - 1];
  const kg = fin(mk) ? (mk >= rows[0].kg && mk <= last.kg ? mk : NaN) : (r.weights?.payloadG ?? NaN) / 1000;
  let cross = NaN;
  if (fin(minTWR)) {
    const i = rows.findIndex((p) => p.twr < minTWR), a = rows[i - 1], b = rows[i];
    cross = i < 0 ? NaN : !i ? rows[0].kg : a.kg + ((b.kg - a.kg) * (a.twr - minTWR)) / (a.twr - b.twr || 1);
  }
  const ft = C.curve(rows, 'kg', 'flightMin').f, wc = C.curve(rows, 'kg', 'twr').f, w = (x) => (fin(r.twr) && fin(kg) && x === kg ? r.twr : wc(x)); // at the build's own point, the result's T:W (tile, band, Fig 4 say the same number)
  const per100 = ((rows[0].flightMin - last.flightMin) / (last.kg - rows[0].kg)) * 0.1;
  const lim = fmt(minTWR, 1);
  const tn = tr(wing ? 'perf.tw.static' : 'perf.tw');
  const cap = tr('perf.payload.cap', { tn, wh: fmt(r.batteryWh), g100: sq('g', 100), cost: per100 < 0.05 ? tr('perf.payload.costLess') : tr('perf.payload.costAbout', { m: fmt(per100, 1) }) }) +
    (fin(mk) ? ' ' + tr('perf.payload.measured', { mg: sq('g', r.measuredG), mk: sq('kg', mk, 2), tail: fin(kg) ? tr('perf.payload.measuredIn', { min: fmt(ft(kg), 1), tn, twr: fmt(w(kg), 2) }) : tr('perf.payload.measuredOut') })
      : fin(kg) ? ' ' + tr('perf.payload.at', { kg: sq('kg', kg, 2), min: fmt(ft(kg), 1), tn, twr: fmt(w(kg), 2) }) : '') +
    (fin(cross) ? ' ' + tr('perf.payload.below', { kg: sq('kg', cross, 2), mn: mn || tr('perf.missionWord'), lim }) : '') +
    (wing ? ' ' + tr('perf.payload.wing') : '');
  const spec = {
    rows, q: { kg: 'kg' }, x: { key: 'kg', label: tr('perf.payloadWord'), unit: 'kg' },
    panels: [{ key: 'flightMin', label: tr('perf.flightTime'), unit: 'min', w: 2 }, { key: 'twr', label: tr(wing ? 'perf.staticTwr' : 'perf.twr'), w: 1, refs: fin(minTWR) ? [{ y: minTWR, label: tr('perf.min', { v: lim }), kind: 'lim' }] : [] }],
    marks: fin(kg) ? [{ x: kg, label: tr(fin(mk) ? 'perf.mark.measured' : 'perf.mark.payload', { v: fq('kg', kg, 2) }), kind: 'build', vals: [`${fmt(ft(kg), 1)} min`, fmt(w(kg), 2)] }] : [],
    zones: fin(cross) ? [{ x0: cross, x1: last.kg, label: tr('perf.zone.twr', { lim }) }] : [],
  };
  // the measured marker can land beside the "Min" label: right, left, then bare number on each side
  const vs = fin(minTWR) ? [[tr('perf.min', { v: lim }), 'r'], [tr('perf.min', { v: lim }), 'l'], [lim, 'r'], [lim, 'l']].map(([label, at]) => withP(spec, 1, (p) => ({ ...p, refs: [{ ...p.refs[0], label, at }] }))) : [spec];
  return lineFig({
    n: 2, key: 'payload', title: tr('perf.title.payload'), cap, spec, render: fit(vs),
    legend: K.ln(tr('perf.legend.model')) + (fin(kg) ? K.bd(fin(mk) ? tr('perf.legend.measured', { v: sq('kg', kg, 2) }) : tr('perf.legend.yourPayload', { v: sq('kg', kg, 2) })) : '') + (fin(minTWR) ? K.hz(tr('perf.legend.twrBelow', { lim })) : ''),
    tips: xTips(rows, 'kg', [tr('perf.tip.payload', { unit: U.label('kg') }), 2, 'kg'], [['flightMin', tr('perf.flightTime'), 'min', 1], ['twr', tr('perf.twr'), '', 2]]).map((tp, i) => (fin(minTWR) && rows[i].twr < minTWR ? { ...tp, r: [...tp.r, [tr('perf.tip.below'), tr('perf.tip.missionMin', { lim })]] } : tp)),
    start: near(rows, 'kg', kg), table: table(tr('perf.payload.table'), COLS().payload, rows),
  });
}

function battery(r, P, minTWR) {
  const rows = clean(P.battery, ['wh', 'flightMin', 'auwKg']);
  if (rows.length < 3) return null;
  const wh = r.batteryWh, last = rows[rows.length - 1], ft = C.curve(rows, 'wh', 'flightMin').f;
  const slope = (x) => { const h = (last.wh - rows[0].wh) / 50; return ((ft(Math.min(last.wh, x + h)) - ft(Math.max(rows[0].wh, x - h))) / (Math.min(last.wh, x + h) - Math.max(rows[0].wh, x - h))) * 10; };
  const ok = fin(wh) && wh > 0, gain = ok ? (last.flightMin / ft(wh) - 1) * 100 : NaN, ratio = ok ? last.wh / wh : NaN;
  const own = !dif(r) && fin(r.estFlightMin) ? r.estFlightMin : ok ? ft(wh) : NaN; // matches the KPI; a measured build's Fig 3 is labelled estimate
  // Feasibility (engine: point.feasible, batteryBest): past the T:W limit the pack is too heavy to fly, so that stretch is hatched and never recommended.
  const B = P.batteryBest, bad = rows.findIndex((q) => q.feasible === false), hasF = rows.some((q) => typeof q.feasible === 'boolean');
  const M = B?.reason === 'twrLimit' && fin(B.twr) ? B.twr : minTWR, a = rows[bad - 1], b = rows[bad];
  const limX = bad < 0 ? NaN : B?.reason === 'twrLimit' && fin(B.wh) ? B.wh : !a ? b.wh : fin(a.twr) && fin(b.twr) && fin(M) && a.twr !== b.twr ? a.wh + ((b.wh - a.wh) * (a.twr - M)) / (a.twr - b.twr) : (a.wh + b.wh) / 2;
  const lim = fin(limX), k = lim && ok ? limX / wh : NaN, mt = fin(M) ? String(+M.toFixed(2)) : '';
  // v5: say when the sweep's flight times carry the engine's cold/age derate or the hover calibration (r.battery)
  const bt = r.battery, dr = and([bt?.capacityFactor < 1 && tr('perf.battery.derate', { pct: fmt(bt.capacityFactor * 100) }), bt?.calibration && tr('perf.battery.calib', { factor: fmt(bt.calibration.factor, 2) })].filter(Boolean));
  const past = fin(k) && Math.abs(k - 1) <= 0.05 ? tr('perf.battery.pastThis', { wh: fmt(limX) }) : fin(k) ? tr('perf.battery.pastX', { k: fmt(k, 2), wh: fmt(limX) }) : `${fmt(limX)} Wh`;
  const cap = tr('perf.battery.cap') + (dr ? ' ' + tr('perf.battery.incl', { what: dr }) : '') +
    (ok ? ' ' + tr('perf.battery.own', { wh: fmt(wh), min: fmt(own, 1), per: fmt(slope(wh), 1) }) : '') +
    (lim ? ' ' + tr('perf.battery.limit', { past, mt: mt || tr('perf.battery.missionMin') })
      : ok ? ' ' + tr('perf.battery.more', { wh: fmt(last.wh), per: fmt(slope(last.wh), 1), ratio: fmt(ratio, 1), gain: fmt(gain) }) : '');
  return lineFig({
    n: 3, key: 'battery', title: tr('perf.title.battery'), cap,
    spec: {
      rows, q: { auwKg: 'kg' }, x: { key: 'wh', label: tr('perf.battery.energy'), unit: 'Wh' },
      panels: [{ key: 'flightMin', label: tr('perf.flightTime'), unit: 'min', w: 2, end: !lim && ok && gain > 0 ? tr('perf.battery.end', { gain: fmt(gain), ratio: fmt(ratio, 1) }) : '' }, { key: 'auwKg', label: tr('perf.mass'), unit: 'kg', w: 1 }],
      marks: [...(ok ? [{ x: wh, label: tr('perf.battery.pack', { wh: fmt(wh) }), kind: 'build', vals: [`${fmt(own, 1)} min`, sq('kg', C.curve(rows, 'wh', 'auwKg').f(wh), 2)] }] : []),
        ...(lim ? [{ x: limX, label: tr('perf.battery.twrPast', { mt }), kind: 'lim' }] : [])],
      zones: lim ? [{ x0: limX, x1: last.wh, label: tr('perf.battery.zone', { mt }) }] : [],
    },
    legend: K.ln(tr('perf.legend.model')) + (ok ? K.bd(tr('perf.battery.yours', { wh: fmt(wh) })) : '') + (lim ? K.lm(tr('perf.battery.limitLegend', { wh: fmt(limX) })) + K.hz(tr('perf.battery.tooHeavy', { mt })) : ''),
    tips: xTips(rows, 'wh', [tr('perf.tip.whPack'), 0], [['flightMin', tr('perf.flightTime'), 'min', 1], ['auwKg', tr('perf.mass'), 'kg', 2, 'kg']]).map((tp, i) => (rows[i].feasible === false ? { ...tp, r: [...tp.r, [tr('perf.battery.noFly'), tr('perf.battery.twrBelow', { mt })]] } : tp)),
    start: near(rows, 'wh', wh),
    table: ((tb) => (hasF ? { ...tb, columns: [...tb.columns, tr('perf.battery.flies')], rows: tb.rows.map((x, i) => [...x, rows[i].feasible === false ? tr('perf.no') : tr('perf.yes')]) } : tb))(table(tr('perf.battery.table'), COLS().battery, rows)),
  });
}

// Throttle at which the sweep draws pw watts (linear between points); NaN when out of range.
function atPower(rows, pw) {
  if (!fin(pw)) return NaN;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (fin(a.powerW) && fin(b.powerW) && a.powerW !== b.powerW && (pw - a.powerW) * (pw - b.powerW) <= 0) return a.pct + ((b.pct - a.pct) * (pw - a.powerW)) / (b.powerW - a.powerW);
  }
  return NaN;
}
function throttle(r, P, v, w) {
  const rows = clean(P.throttle, ['pct', 'thrustG', 'gPerW']);
  if (rows.length < 3) return null;
  const tilt = v?.type === 'tiltrotor', N = w ? 1 : v?.liftMotorCount || r.motorCount || 4, auwG = r.auwKg * 1000, last = rows[rows.length - 1];
  // the sweep may be total or per-motor thrust: compare full throttle with both engine figures
  const per = !w && (fin(r.maxThrustG) && fin(r.thrustPerMotorG) ? Math.abs(last.thrustG - r.thrustPerMotorG) < Math.abs(last.thrustG - r.maxThrustG) : last.thrustG < 0.6 * auwG);
  const T = C.curve(rows, 'pct', 'thrustG').f, G = C.curve(rows, 'pct', 'gPerW').f, wl = per ? auwG / N : auwG;
  // fixed wing: no hover; the build point is cruise, where the sweep draws the cruise phase's power
  const cp = (Array.isArray(P.profile) ? P.profile : []).find((p) => p?.phase === 'cruise')?.powerW, cruW = fin(cp) ? cp : r.avgPowerW;
  const hv = w ? atPower(rows, cruW) : r.hoverThrottlePct, hn = tr(w ? 'perf.cruise' : 'perf.hover'), st = w ? ' ' + tr('perf.static') : '', em = w && dif(r) ? ' ' + tr('perf.estimateParen') : ''; // wing cruise power comes from the estimated mission, the weight line is measured
  const twr = fin(r.twr) ? r.twr : ((per ? N : 1) * last.thrustG) / auwG, who = w ? tr('perf.who.wing') + ' ' : tilt ? tr('perf.who.tilt') + ' ' : v ? tr('perf.who.lift') + ' ' : '', pm = ' ' + tr('perf.perMotor');
  // measured thrust curve (engine v6): the rows are the thrust-stand curve scaled to all motors, the model's own sweep is the overlay
  const mc = r.measuredCurve && typeof r.measuredCurve === 'object' ? r.measuredCurve : null, mod = mc ? clean(P.throttleModel, ['pct', 'thrustG', 'gPerW']) : [], hasOv = mod.length >= 3;
  const cap = who + tr('perf.throttle.cap') + (mc ? ' ' + tr('perf.throttle.measured', { count: mc.motors, name: mc.name ? ` "${mc.name}"` : '', points: fmt(mc.points), motors: fmt(mc.motors), dashed: hasOv ? tr('perf.throttle.dashed') : '' }) : '') +
    (fin(hv) ? (w ? ' ' + tr('perf.throttle.cruise', { w: fmt(cruW), est: em ? ' ' + tr('perf.throttle.atEst') : '', hv: fmt(hv), tail: fin(r.hoverThrottlePct) && r.hoverThrottlePct < hv ? tr('perf.throttle.tailLow', { pct: fmt(r.hoverThrottlePct) }) : '.' })
      : ' ' + tr('perf.throttle.hover', { hv: fmt(hv), thrust: sq('g', T(hv)) + (per ? pm : ''), eff: sq('gw', G(hv), 1) })) : '') +
    ' ' + tr('perf.throttle.full', { thrust: sq('g', last.thrustG) + (per ? pm : st), twr: fmt(twr, 2), eff: sq('gw', last.gPerW, 1) }) +
    (w ? ' ' + tr('perf.throttle.wing') : '');
  const spec = {
    rows, q: { thrustG: 'g', gPerW: 'gw' }, x: { key: 'pct', label: tr('perf.throttleWord'), unit: '%', lo: 0, hi: 100 }, ...(hasOv ? { over: { rows: mod } } : {}),
    panels: [{ key: 'thrustG', label: tr(per ? 'perf.thrustPerMotor' : 'perf.totalThrust'), unit: 'g', w: 2, end: tr('perf.max', { v: sq('g', last.thrustG) }), refs: fin(wl) ? [{ y: wl, label: per ? tr('perf.weightN', { n: N }) : tr('perf.takeoffWeight'), at: 'l' }] : [] }, { key: 'gPerW', label: tr('perf.efficiency'), unit: 'g/W', w: 1 }],
    marks: fin(hv) ? [{ x: hv, label: w ? tr('perf.throttle.bench', { hv: fmt(hv), est: em }) : `${hn} ${fmt(hv)}%`, kind: 'build', vals: [sq('g', T(hv)), sq('gw', G(hv), 1)] }] : [],
  };
  // The build point sits on the weight line, so its value tag can print over the line's label, and a measured weight can put it under the "Max" note:
  // try the weight label left, right, short left, short right, each with the full, the bare-number, then no end note.
  const vs = [];
  if (fin(wl)) for (const end of [spec.panels[0].end, sq('g', last.thrustG), undefined]) for (const [label, at] of [[spec.panels[0].refs[0].label, 'l'], [spec.panels[0].refs[0].label, 'r'], [tr(per ? 'perf.short.weight' : 'perf.short.takeoff'), 'l'], [tr(per ? 'perf.short.weight' : 'perf.short.takeoff'), 'r']]) vs.push(withP(spec, 0, (p) => ({ ...p, end, refs: [{ ...p.refs[0], label, at }] })));
  return lineFig({
    n: 4, key: 'throttle', title: tr(w ? 'perf.title.cruiseMotor' : tilt ? 'perf.title.tiltThrottle' : v ? 'perf.title.liftThrottle' : 'perf.title.throttle') + (mc ? ' ' + tr('perf.measuredParen') : ''), cap, spec, render: fit(vs.length ? vs : [spec]),
    legend: (mc ? K.ln(tr('perf.legend.measuredCurve')) + (hasOv ? K.sw(tr('perf.legend.modelledCurve'), PAL.ochre, true) : '') : K.ln(tr(w ? 'perf.legend.modelStatic' : 'perf.legend.model'))) + (fin(hv) ? K.bd(w ? tr('perf.legend.bench', { hv: fmt(hv), est: em }) : tr('perf.legend.hoverThrottle', { hn, hv: fmt(hv) })) : '') + (fin(wl) ? K.rf(per ? tr('perf.legend.weightN', { n: N, g: sq('g', wl) }) : tr('perf.legend.weight', { g: sq('g', wl) })) : ''),
    tips: xTips(rows, 'pct', [tr('perf.tip.throttle'), 0], [['thrustG', tr('perf.thrust'), 'g', 0, 'g'], ['powerW', tr('perf.power'), 'W', 0], ['currentA', tr('perf.current'), 'A', 1], ['gPerW', tr('perf.efficiency'), 'g/W', 2, 'gw']])
      .map((tp, i) => (hasOv ? { ...tp, r: [...tp.r, [sq('g', C.curve(mod, 'pct', 'thrustG').f(rows[i].pct)), tr('perf.tip.modelledThrust')]] } : tp)),
    start: near(rows, 'pct', hv), table: table(tr('perf.throttle.table') + (mc ? ' ' + tr('perf.measuredParen') : '') + (w ? ' ' + tr('perf.throttle.tblWing') : tilt ? ' ' + tr('perf.throttle.tblTilt') : v ? ' ' + tr('perf.throttle.tblLift') : ''), COLS().throttle, rows),
  });
}

// [label, colour, striped]: blue = vertical flight, ochre = short high-power transients, teal = level flight;
// stripes mark the low-power variant, so each phase of one profile gets its own mark.
const PH = {
  takeoff: ['takeoff', 'blue'], hover: ['hover', 'blue'], landing: ['landing', 'blue'], climb: ['climb', 'blue'], descent: ['descent', 'blue', 1],
  launch: ['launch', 'ochre'], transition: ['transition', 'ochre'], cruise: ['cruise', 'teal'], loiter: ['loiter', 'teal', 1], reserve: ['reserve', ''],
};
const HEAVY = new Set(['takeoff', 'hover', 'landing', 'transition', 'launch', 'climb']);
function profile(r, P, mn) {
  const raw = (Array.isArray(P.profile) ? P.profile : []).filter((p) => p && typeof p.phase === 'string' && fin(p.startS) && fin(p.durationS) && p.durationS > 0 && fin(p.powerW) && p.powerW >= 0);
  if (!raw.length) return null;
  const ph = raw.sort((a, b) => a.startS - b.startS).map((p) => {
    const [id, c, st] = PH[p.phase] || [null, 'blue'], label = id ? tr(`perf.phase.${id}`) : up(p.phase); // text: perf.phase.<id>
    return { key: p.phase, label, color: PAL[c] || '', st: !!st, reserve: p.phase === 'reserve', t0: p.startS / 60, t1: (p.startS + p.durationS) / 60, w: p.powerW, s: p.durationS, wh: (p.powerW * p.durationS) / 3600, start: p.startS };
  });
  const tot = sum(ph.map((p) => p.wh)) || 1, flown = ph.filter((p) => !p.reserve), tf = sum(flown.map((p) => p.s)) || 1;
  const fly = fin(r.estFlightMin) ? r.estFlightMin : flown.length ? flown[flown.length - 1].t1 : NaN;
  const lift = flown.filter((p) => HEAVY.has(p.key)), cru = ph.find((p) => p.key === 'cruise'), loi = ph.find((p) => p.key === 'loiter'), hi = ph.reduce((a, b) => (b.w > a.w ? b : a));
  const share = (a, k) => fmt((sum(a.map((p) => p[k])) / (k === 's' ? tf : tot)) * 100), names = [...new Set(lift.map((p) => p.label.toLowerCase()))];
  const cap = tr(mn ? 'perf.profile.cap' : 'perf.profile.capPlain', { mission: mn, w: fmt(hi.w), phase: hi.label.toLowerCase() }) +
    (lift.length && cru ? ' ' + tr('perf.profile.lift', { count: names.length, names: up(and(names)), ts: share(lift, 's'), joint: tr(Math.abs(share(lift, 's') - share(lift, 'wh')) <= 1 ? 'perf.profile.and' : 'perf.profile.but'), es: share(lift, 'wh'), cw: fmt(cru.w), loiter: loi ? tr('perf.profile.loiter', { w: fmt(loi.w) }) : '' }) : '') +
    (ph.some((p) => p.reserve) ? ' ' + tr('perf.profile.reserveNote') : '');
  const kinds = new Map(); // one legend entry per mark, in flight order
  for (const p of ph) if (!p.reserve) { const k = `${p.color}|${p.st ? 1 : ''}`; kinds.set(k, [...(kinds.get(k) || []), p.label]); }
  return {
    n: 5, key: 'profile', title: tr('perf.title.profile'), kind: 'seg', cap,
    render: (w, id) => C.phases({ phases: ph, mark: fin(fly) ? { x: fly, label: tr('perf.profile.flight', { min: fmt(fly, 1) }) } : null, x: { label: tr('perf.profile.time'), unit: 'min' } }, w, id),
    legend: [...kinds].map(([k, l]) => K.sw([...new Set(l)].join(', '), k.split('|')[0], k.endsWith('1'))).join('') + (ph.some((p) => p.reserve) ? K.hr(tr('perf.profile.notFlown')) : '') + (fin(fly) ? K.bd(tr('perf.profile.flightTime', { min: fmt(fly, 1) })) : ''),
    tips: ph.map((p) => ({ h: p.label, c: p.color, st: p.st, r: [[`${fmt(p.w)} W`, tr('perf.power')], [dur(p.s), tr('perf.profile.duration')], [`${fmt(p.wh, 1)} Wh`, tr('perf.profile.energy')], [`${fmt((p.wh / tot) * 100)}%`, tr('perf.profile.share')]] })),
    start: Math.max(0, ph.findIndex((p) => p.key === 'cruise')),
    table: { title: tr('perf.profile.table'), columns: [tr('perf.profile.phase'), tr('perf.profile.start'), tr('perf.profile.durationS'), tr('perf.col.power'), tr('perf.profile.energyWh')], rows: ph.map((p) => [p.label, fmt(p.start), fmt(p.s), fmt(p.w), fmt(p.wh, 1)]) },
  };
}

const WN = new Set(['measuredExtraG', 'frameG', 'airframeG', 'motorsG', 'escG', 'fcG', 'propsG', 'servosG', 'tiltG', 'hardwareG', 'otherG', 'payloadG', 'batteryG']); // text: perf.w.<id>
const wname = (k, v, w) => (k === 'frameG' && v && !w?.airframeG ? tr('perf.w.airframeG') : WN.has(k) ? tr(`perf.w.${k}`) : up(k.replace(/G$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()));
function weights(r, v) { // v: any wing data (vtol or fixed wing) -> the frame is an airframe
  const w = r.weights && typeof r.weights === 'object' ? r.weights : {};
  const all = Object.entries(w).filter(([, g]) => fin(g) && g > 0);
  if (!all.length) return null;
  const dry = all.filter(([k]) => k !== 'payloadG' && k !== 'batteryG').sort((a, b) => (a[0] === 'measuredExtraG') - (b[0] === 'measuredExtraG') || b[1] - a[1]); // the measured excess last
  const parts = [...dry.map(([k, g]) => ({ label: wname(k, v, w), g, color: PAL.blue, grp: 'dry' })),
    ...all.filter(([k]) => k === 'payloadG').map(([, g]) => ({ label: tr('perf.grp.payload'), g, color: PAL.teal, grp: 'payload' })),
    ...all.filter(([k]) => k === 'batteryG').map(([, g]) => ({ label: tr('perf.grp.battery'), g, color: PAL.ochre, grp: 'battery' }))];
  const total = sum(parts.map((p) => p.g)), pc = (g) => fmt((g / total) * 100);
  const groups = [];
  let a = 0;
  for (const p of parts) { const g = groups[groups.length - 1]; if (g?.grp === p.grp) g.b += p.g; else groups.push({ grp: p.grp, name: tr(`perf.grp.${p.grp}`), label: tr(p.grp === 'dry' ? 'perf.grp.dryShort' : `perf.grp.${p.grp}`), a, b: a + p.g }); a += p.g; }
  const cap = tr('perf.weights.cap', { total: sq('g', total), groups: groups.map((g) => tr('perf.weights.group', { name: g.name.toLowerCase(), g: sq('g', g.b - g.a), pc: pc(g.b - g.a) })).join(', ') }) +
    (w.batteryG > 0 ? ' ' + tr('perf.weights.battery', { pc: pc(w.batteryG) }) : '') +
    (dif(r) ? ' ' + (w.measuredExtraG > 0 ? tr('perf.weights.over', { m: sq('g', r.measuredG), x: sq('g', w.measuredExtraG) }) : tr('perf.weights.under', { m: sq('g', r.measuredG), x: sq('g', r.estG - r.measuredG) })) : '');
  return {
    n: 6, key: 'weights', title: tr(dif(r) && !(w.measuredExtraG > 0) ? 'perf.weights.titleEst' : 'perf.title.weights'), kind: 'seg', cap,
    render: (wd) => C.massBar({ parts, groups, total }, wd),
    legend: groups.map((g) => K.sw(g.name, parts.find((p) => p.grp === g.grp).color)).join(''),
    extra: `<ol class="pf-ws">${parts.map((p) => `<li><i class="k-sw" style="--c:${p.color}"></i><span>${esc(p.label)}</span><b>${sq('g', p.g)}</b><small>${pc(p.g)}%</small></li>`).join('')}</ol>`,
    tips: parts.map((p) => ({ h: p.label, c: p.color, r: [[sq('g', p.g), tr('perf.weights.mass')], [`${pc(p.g)}%`, tr('perf.weights.ofMass')], [tr(`perf.grp.${p.grp}`), tr('perf.weights.group2')]] })),
    start: 0,
    table: { title: tr('perf.weights.table'), columns: [tr('perf.weights.component'), tr('perf.weights.massCol', { unit: U.label('g') }), tr('perf.weights.share')], rows: parts.map((p) => [p.label, fq('g', p.g), pc(p.g)]) },
  };
}

// Key figures, [label, value, unit, note]. Quadplane and tiltrotor share the VTOL rows; the tiltrotor adds its tilt mechanism.
const wingRows = (v) => [
  [tr('perf.kf.span'), fin(v.wingspanMm) && fq('m', v.wingspanMm / 1000, 2), U.label('m'), fin(v.aspectRatio) ? tr('perf.kf.aspect', { ar: fmt(v.aspectRatio, 1) }) + (fin(v.wingAreaDm2) ? `, ${sq('dm2', v.wingAreaDm2, 1)}` : '') : ''],
  [tr('perf.kf.loading'), fin(v.wingLoadingGdm2) && fq('gdm2', v.wingLoadingGdm2), U.label('gdm2'), ''],
  [tr('perf.kf.ld'), fin(v.liftToDrag) && fmt(v.liftToDrag, 1), '', fin(v.liftToDrag) ? tr('perf.kf.glides', { n: fmt(v.liftToDrag) }) : ''],
  [tr('perf.stall'), fin(v.stallMs) && fq('ms', v.stallMs, 1), U.label('ms'), ''],
  [tr('perf.cruise'), fin(v.cruiseMs) && fq('ms', v.cruiseMs, 1), U.label('ms'), fin(v.cruiseMs) && fin(v.stallMs) && v.stallMs > 0 ? tr('perf.kf.xStall', { x: fmt(v.cruiseMs / v.stallMs, 2) }) : ''],
];
const LAUNCH = lazyMap('perf.launch.', ['hand', 'bungee', 'runway']);
function keyRows(r) {
  const w = r?.fixedWing, v = r?.vtol;
  if (w && typeof w === 'object') {
    const rows = [...wingRows(w),
      [tr('perf.kf.launch'), typeof w.launch === 'string' && (LAUNCH[w.launch] || up(w.launch)), '', dif(r) ? tr('perf.kf.typeEst') : fin(r.auwKg) ? tr('perf.kf.takeoffMass', { m: sq('kg', r.auwKg, 2) }) : ''],
      [tr('perf.endurance'), fin(r.estFlightMin) && kn(r.estFlightMin, 1), 'min', tr('perf.kf.atCruise')], // same figure as the KPI tile
      [tr('perf.range'), fin(r.rangeKm) && U.num('km', r.rangeKm, 1), U.label('km'), fin(w.cruiseMs) ? tr('perf.kf.at', { v: sq('ms', w.cruiseMs, 1) }) : ''],
    ].filter((c) => c[1]);
    return { kind: 'wing', tag: tr('perf.kf.tagWing'), title: tr('perf.kf.titleWing'), rows, a: w };
  }
  if (!v || typeof v !== 'object') return null;
  const hs = (fin(v.hoverS) ? v.hoverS : 0) + (fin(v.transitionS) ? v.transitionS : 0), t = v.type === 'tiltrotor' && v.tilt && typeof v.tilt === 'object' ? v.tilt : null;
  const rows = [...wingRows(v),
    [tr('perf.kf.hoverCruise'), hs > 0 && fin(v.cruiseMin) && `${fmt(hs / 60, 1)} / ${fmt(v.cruiseMin, 1)}`, 'min', dif(r) ? tr('perf.kf.atEst') : fin(v.hoverS) && fin(v.transitionS) ? tr('perf.kf.hoverTrans', { h: fmt(v.hoverS), t: fmt(v.transitionS) }) : ''],
    ...(t ? [
      [tr('perf.kf.tiltServos'), fin(t.servoCount) && fmt(t.servoCount), '', fin(t.motorCount) ? tr('perf.kf.tiltMotors', { n: fmt(t.motorCount) }) : ''],
      [tr('perf.kf.tiltTime'), fin(t.tiltTimeS) && fmt(t.tiltTimeS, 1), 's', tr('perf.kf.hoverToCruise')],
      [tr('perf.kf.transAngle'), fin(t.transitionAngleDeg) && `${fmt(t.transitionAngleDeg)}°`, '', tr('perf.kf.rotorTilt')],
    ] : []),
  ].filter((c) => c[1]);
  return v.type === 'tiltrotor' ? { kind: 'tilt', tag: tr('perf.kf.tagTilt'), title: tr('perf.kf.titleWing'), rows, a: v, tilt: t } : { kind: 'quadplane', tag: tr('perf.kf.tagVtol'), title: tr('perf.kf.titleVtol'), rows, a: v };
}
function keyStrip(r) {
  const k = keyRows(r);
  if (!k?.rows.length) return '';
  const v = k.a, ga = fin(v.wingspanMm) && fin(v.wingAreaDm2) && v.wingspanMm > 0 && v.wingAreaDm2 > 0;
  const bar = k.kind !== 'wing' && fin(v.hoverS) && fin(v.cruiseMin) ? `<span class="pf-hb" aria-hidden="true">${[[v.hoverS, PAL.blue], [v.transitionS, PAL.ochre], [v.cruiseMin * 60, PAL.teal]].filter(([s]) => fin(s) && s > 0).map(([s, c]) => `<i style="flex:${s.toFixed(1)};--c:${c}"></i>`).join('')}</span>` : '';
  const svg = () => C.planform(v, { kind: k.kind, liftIn: r.propInch, pushIn: v.pusher?.propInch, propIn: v.motor?.propInch ?? r.propInch, tiltDeg: k.tilt?.transitionAngleDeg });
  const note = tr({ wing: 'perf.kf.noteWing', tilt: 'perf.kf.noteTilt', quadplane: 'perf.kf.noteQuad' }[k.kind]);
  let fig = '';
  try { fig = ga ? `<figure class="pf-ga">${svg()}<figcaption>${esc(tr('perf.kf.planform', { note }))}</figcaption></figure>` : ''; } catch { fig = ''; }
  return `<div class="pf-vt"><h4 class="pf-t"><em>${esc(k.tag.toUpperCase())}</em>${esc(tr('perf.kf.title'))}</h4><div class="pf-vt-in">${fig}` +
    `<dl class="pf-kf">${k.rows.map(([l, val, u, s]) => { const hv = l === tr('perf.kf.hoverCruise') && bar; return `<div${hv ? ' class="hv"' : ''}><dt>${esc(l)}</dt><dd>${esc(val)}${u ? `<small>${esc(u)}</small>` : ''}</dd>${s ? `<dd class="s">${esc(s)}</dd>` : ''}${hv ? bar : ''}</div>`; }).join('')}</dl></div></div>`;
}

const TKEYS = ['speed', 'payload', 'battery', 'throttle', 'profile', 'weights'], TITLE = (i) => tr(`perf.title.${TKEYS[i]}`);
// Mission name for captions; an FPV class names itself once: "FPV · 5 in freestyle / racing".
const missionName = (r, ctx) => { const f = fpvOf(r); return f ? tr('perf.fpvMission', { label: f.label }) : ctx.missionLabel || ''; };
function figures(r, ctx = {}) {
  if (!r || typeof r !== 'object' || r.ok === false) return [];
  const P = r.performance && typeof r.performance === 'object' ? r.performance : {}, v = r.vtol && typeof r.vtol === 'object' ? r.vtol : null;
  const w = r.fixedWing && typeof r.fixedWing === 'object' ? r.fixedWing : null;
  const M = E.MISSIONS || {}, mis = M[ctx.mission] || Object.values(M).find((m) => m.label === ctx.missionLabel), fc = fpvOf(r);
  const minTWR = w ? NaN : fin(ctx.minTWR) ? ctx.minTWR : fin(r.minTwr) ? r.minTwr : fin(fc?.minTWR) ? fc.minTWR : mis?.minTWR; // the result's own floor first, as the card, Fig 3 and the tiles use it // a wing has no thrust-to-weight floor
  const mn = missionName(r, ctx);
  const make = [() => speed(r, P, v, w), () => payload(r, P, minTWR, mn, !!w), () => battery(r, P, minTWR), () => throttle(r, P, v, w), () => profile(r, P, mn), () => weights(r, w || v)];
  // Measured weight: speed polar, battery sweep and mission profile cannot be re-derived from one mass, so they say they are the estimate's.
  const est = dif(r) ? new Set(['speed', 'battery', 'profile']) : null;
  const tag = (m) => (m && !m.miss && est?.has(m.key) ? { ...m, title: `${m.title} ${tr('perf.estimateParen')}`, cap: `${tr('perf.estCap', { est: sq('g', r.estG), meas: sq('g', r.measuredG) })} ${m.cap}` } : m);
  return make.map((f, i) => { try { return tag(f()) || { n: i + 1, miss: TITLE(i) }; } catch { return { n: i + 1, miss: TITLE(i) }; } });
}

export function perfTables(result) {
  const t = figures(result).filter((f) => f.table).map((f) => f.table), k = result && typeof result === 'object' ? keyRows(result) : null;
  return k?.rows.length ? [...t, { title: k.title, columns: [tr('perf.kf.quantity'), tr('perf.kf.value'), tr('perf.kf.note')], rows: k.rows.map(([l, val, u, s]) => [l, u ? `${val} ${u}` : val, s || '']) }] : t;
}

const REG = new Map(); // figure id -> model, waiting for bindPerformance (render runs before the DOM exists)
let SEQ = 0;
const tableHtml = (t, hi) => `<div class="pf-tw"><table><caption class="pf-sr">${esc(t.title)}</caption><thead><tr>${t.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((row, i) => `<tr${i === hi ? ' class="hi"' : ''}>${row.map((c, j) => (j ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;

export function renderPerformance(result, ctx = {}) {
  const figs = figures(result, ctx || {});
  if (!figs.length) return `<p class="pf-note">${esc(tr('perf.empty'))}</p>`;
  const uid = `pf${(++SEQ).toString(36)}`, W0 = ctx?.width >= 160 ? ctx.width : 560; // ctx.width: tests draw at narrow plot widths
  const miss = (n) => `<div class="pf pf-miss"><p><em>${esc(tr('perf.fig', { n }))}</em>${esc(tr('perf.missing', { title: TITLE(n - 1) }))}</p></div>`;
  const body = figs.map((m) => {
    if (m.miss) return miss(m.n);
    let o;
    try { o = m.render(W0, `${uid}-${m.key}`); } catch { return miss(m.n); }
    const id = `${uid}-${m.key}`, aria = tr('perf.aria', { n: m.n, title: m.title, what: tr(m.kind === 'x' ? 'perf.aria.points' : 'perf.aria.segments') }); // the long summary is the visible figcaption, tied by aria-describedby
    Object.assign(m, { id, w: W0, geo: o.geo, idx: null });
    REG.set(id, m);
    return `<figure class="pf" data-uid="${id}"><div class="pf-box"><div class="pf-head"><h4 class="pf-t"><em>${esc(tr('perf.fig', { n: m.n }))}</em>${esc(m.title)}</h4>` +
      `<div class="pf-tools"><button type="button" class="pf-btn" data-pf="table" aria-expanded="false" aria-controls="${id}-t">${esc(tr('perf.table'))}</button><button type="button" class="pf-btn" data-pf="csv">${esc(tr('perf.copyCsv'))}</button></div></div>` +
      `<ul class="pf-key">${m.legend}</ul><div class="pf-plot"><svg class="pf-svg" role="img" tabindex="0" aria-label="${esc(aria)}" aria-describedby="${id}-c" viewBox="0 0 ${o.w} ${o.h}" width="${o.w}" height="${o.h}">${o.inner}</svg><div class="pf-tip" aria-hidden="true"></div></div>` +
      `${m.extra || ''}<div class="pf-tbl" id="${id}-t" hidden>${tableHtml(m.table, m.kind === 'x' ? m.start : -1)}</div></div>` +
      `<figcaption id="${id}-c"><b>${esc(tr('perf.figDot', { n: m.n }))}</b> ${esc(m.cap)}</figcaption><p class="pf-sr" aria-live="polite"></p></figure>`;
  }).join('');
  while (REG.size > 48) REG.delete(REG.keys().next().value);
  const mn = missionName(result, ctx || {});
  return `<div class="pf-sec"><p class="pf-lede">${esc(mn ? tr('perf.ledeFor', { mission: mn }) : tr('perf.lede'))}</p>${keyStrip(result)}<div class="pf-grid">${body}</div></div>`;
}

// ---------- interaction (browser only) ----------
let RO;
export function bindPerformance(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const fig of root.querySelectorAll('.pf[data-uid]')) {
    if (fig._pf) continue;
    const m = REG.get(fig.dataset.uid);
    if (!m) continue;
    REG.delete(fig.dataset.uid);
    fig._pf = m;
    draw(fig);
    if (typeof ResizeObserver === 'function') (RO ||= new ResizeObserver(onResize)).observe(fig.querySelector('.pf-plot'));
  }
  if (root._pfOn) return;
  root._pfOn = true;
  root.addEventListener('click', onClick);
  root.addEventListener('pointermove', onPoint);
  root.addEventListener('pointerdown', onPoint);
  root.addEventListener('pointerleave', onLeave, true);
  root.addEventListener('keydown', onKey);
  root.addEventListener('focusin', onFocus);
  root.addEventListener('focusout', onBlur);
}
// Redraw at the plot's real width so text and strokes keep their true pixel size.
function draw(fig) {
  const m = fig._pf, plot = fig.querySelector('.pf-plot'), svg = plot?.querySelector('.pf-svg'), w = Math.round(plot?.clientWidth || 0);
  if (!svg || w < 160 || w === m.w) return;
  let o;
  try { o = m.render(w, m.id); } catch { return; } // keep the previous drawing
  svg.setAttribute('viewBox', `0 0 ${o.w} ${o.h}`);
  svg.setAttribute('width', o.w);
  svg.setAttribute('height', o.h);
  svg.innerHTML = o.inner;
  Object.assign(m, { w, geo: o.geo });
  if (m.idx != null) show(fig, m.idx);
}
// rAF: redrawing inside the observer callback would resize the observed box and trip the RO loop error
const onResize = (es) => es.forEach(({ target }) => {
  if (!target.isConnected) return RO.unobserve(target);
  const fig = target.closest('.pf');
  if (fig?._pf && !fig._pfRaf) fig._pfRaf = requestAnimationFrame(() => { fig._pfRaf = 0; draw(fig); });
});
const figOf = (el) => { const svg = el?.closest?.('.pf-svg'), fig = svg?.closest('.pf'); return fig?._pf?.geo ? { fig, svg, m: fig._pf } : null; };
function pick(m, x) {
  const g = m.geo;
  if (m.kind === 'x') return g.xs.reduce((b, v, i) => (Math.abs(v - x) < Math.abs(g.xs[b] - x) ? i : b), 0);
  // segments: thin ones get a 24 px hit zone and win near their centre
  let best = -1, bw = Infinity;
  g.segs.forEach((s, i) => { const w = s.x1 - s.x0; if (x >= Math.min(s.x0, s.cx - 12) && x <= Math.max(s.x1, s.cx + 12) && w < bw) { best = i; bw = w; } });
  return best >= 0 ? best : g.segs.reduce((b, s, i) => (Math.abs(s.cx - x) < Math.abs(g.segs[b].cx - x) ? i : b), 0);
}
function onPoint(e) {
  const f = figOf(e.target);
  if (!f) { if (e.type === 'pointerdown') e.currentTarget.querySelectorAll?.('.pf').forEach(hide); return; }
  const b = f.svg.getBoundingClientRect(), k = f.m.geo.w / (b.width || 1);
  show(f.fig, pick(f.m, (e.clientX - b.left) * k), false, (e.clientY - b.top) * k);
}
function onLeave(e) {
  if (e.pointerType !== 'mouse' || !e.target.classList?.contains('pf-svg') || document.activeElement === e.target) return;
  hide(e.target.closest('.pf'));
}
function onKey(e) {
  const f = figOf(e.target);
  if (!f || e.target !== f.svg) return;
  const n = f.m.tips.length, i = f.m.idx ?? f.m.start, d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
  if (e.key === 'Escape') return hide(f.fig);
  const j = d ? i + d : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
  if (j == null) return;
  e.preventDefault();
  show(f.fig, j, true);
}
function onFocus(e) { const f = figOf(e.target); if (f && e.target === f.svg) show(f.fig, f.m.idx ?? f.m.start, true); }
function onBlur(e) { const f = figOf(e.target); if (f && e.target === f.svg) hide(f.fig); }
function show(fig, i, say, py) {
  const m = fig._pf, g = m.geo, svg = fig.querySelector('.pf-svg'), tip = fig.querySelector('.pf-tip'), n = m.tips.length;
  if (!g || !svg || !tip || !n) return;
  i = Math.max(0, Math.min(n - 1, i));
  m.idx = i;
  const t = m.tips[i];
  let ax;
  if (m.kind === 'x') {
    ax = g.xs[i];
    const xh = svg.querySelector('.xh'), r = xh?.querySelector('rect'), tx = xh?.querySelector('text');
    if (xh) {
      xh.style.display = '';
      xh.querySelector('.xhl').setAttribute('d', `M${ax} ${g.top}V${g.bot}`);
      xh.querySelectorAll('.xhd').forEach((c, j) => { c.setAttribute('cx', ax); c.setAttribute('cy', g.ys[j][i]); });
      const bw = t.x.length * 6.6 + 12, bx = Math.max(2, Math.min(g.w - bw - 2, ax - bw / 2));
      tx.textContent = t.x;
      r.setAttribute('x', bx); r.setAttribute('y', g.bot + 3); r.setAttribute('width', bw);
      tx.setAttribute('x', bx + bw / 2); tx.setAttribute('y', g.bot + 15.5);
    }
  } else {
    svg.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
    ax = g.segs[i].cx;
  }
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
  const head = el('b', '', t.h);
  if (t.c) head.prepend(Object.assign(el('i', t.st ? 'k-sw st' : 'k-sw'), { style: `--c:${t.c}` }));
  tip.replaceChildren(head, ...t.r.map(([v, l]) => { const row = el('span', 'r'); row.append(el('em', '', v), el('span', '', l)); return row; }));
  tip.classList.add('on');
  const s = (svg.getBoundingClientRect().width || g.w) / g.w, pw = tip.parentElement.clientWidth, ph = tip.parentElement.clientHeight, tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = ax * s + 16;
  if (left + tw > pw - 2) left = ax * s - 16 - tw;
  const top = py != null ? py * s - th / 2 : (m.kind === 'x' ? g.top : g.bot + 12) * s;
  tip.style.left = `${Math.max(2, left)}px`;
  tip.style.top = `${Math.max(0, Math.min(ph - th, top))}px`;
  if (say) fig.querySelector('.pf-sr[aria-live]').textContent = `${t.h}: ${t.r.map(([v, l]) => `${l} ${v}`).join(', ')}`;
}
function hide(fig) {
  const m = fig?._pf;
  if (!m) return;
  m.idx = null;
  const svg = fig.querySelector('.pf-svg'), xh = svg?.querySelector('.xh');
  if (xh) xh.style.display = 'none';
  svg?.querySelectorAll('.on').forEach((el) => el.classList.remove('on'));
  fig.querySelector('.pf-tip')?.classList.remove('on');
}
// CSV from the rendered table, so it works even when a figure never got its model.
const csvOf = (tbl) => [...tbl.rows].map((tr) => [...tr.cells].map((c) => {
  let v = c.textContent.trim();
  if (/^-?[\d,]+(\.\d+)?$/.test(v)) v = v.replace(/,/g, '');
  else if (/^[=+\-@]/.test(v)) v = "'" + v; // formula guard; plain negative numbers stay numbers
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}).join(',')).join('\n');
async function onClick(e) {
  const b = e.target.closest?.('[data-pf]'), fig = b?.closest('.pf');
  if (!fig) return;
  if (b.dataset.pf === 'table') {
    const box = fig.querySelector('.pf-tbl'), open = box.hidden;
    box.hidden = !open;
    b.setAttribute('aria-expanded', String(open));
    return;
  }
  const tbl = fig.querySelector('.pf-tbl table'), live = fig.querySelector('.pf-sr[aria-live]');
  if (!tbl) return;
  const text = csvOf(tbl);
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  b.textContent = ok ? tr('perf.copied') : tr('perf.copyFailed');
  if (live) live.textContent = ok ? tr('perf.copiedLive') : tr('perf.copyFailedLive');
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.textContent = tr('perf.copyCsv'); }, 1800);
}
