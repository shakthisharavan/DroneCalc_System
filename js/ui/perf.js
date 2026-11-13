// Performance section (PERF). SHELL wraps the output in its own <section><h3>Performance</h3><div id="perf">.
// renderPerformance(result, ctx) -> HTML string (pure, node-safe). ctx = { missionLabel, mission?, minTWR? }.
// Airframes: multirotor, VTOL quadplane (result.vtol), tiltrotor (result.vtol.type "tiltrotor"), fixed wing (result.fixedWing).
// bindPerformance(root) -> live figures: redrawn at true pixel width (crisp 11 px text at any column width),
// crosshair, tooltips, arrow keys on a focused figure, table toggles, Copy CSV. Idempotent.
// perfTables(result) -> [{title, columns, rows}]: display strings, units in the column titles (PDF + on-screen tables).
// A missing or partial series skips its figure with a short note; nothing here throws on odd input.
import * as C from './charts.js';
import { n as kn } from './state.js'; // the KPI tiles' formatter (toFixed), so strip and tiles never round differently
// MISSIONS and FPV_CLASSES only (minimum thrust-to-weight, class labels); a broken or missing engine leaves the figures working
const E = await import('../engine.js').catch(() => ({}));

const { esc, fmt, PAL } = C;
const fin = Number.isFinite;
const sum = (a) => a.reduce((s, v) => s + v, 0);
const up = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Finite rows only, sorted by the first key, duplicate x dropped (the curve needs strictly increasing x).
function clean(a, keys) {
  const rows = (Array.isArray(a) ? a : []).filter((r) => r && keys.every((k) => fin(r[k]))).sort((p, q) => p[keys[0]] - q[keys[0]]);
  return rows.filter((r, i) => !i || r[keys[0]] > rows[i - 1][keys[0]]);
}
const table = (title, cols, rows) => ({ title, columns: cols.map((c) => c[1]), rows: rows.map((r) => cols.map(([k, , d]) => fmt(r[k], d))) });
const near = (rows, k, x) => (fin(x) ? rows.reduce((b, r, i) => (Math.abs(r[k] - x) < Math.abs(rows[b][k] - x) ? i : b), 0) : -1);
const dur = (s) => (s < 120 ? `${fmt(s)} s` : `${fmt(s / 60, 1)} min`);
const K = { // legend keys
  ln: (t) => `<li><i class="k-ln"></i>${esc(t)}</li>`, bd: (t) => `<li><i class="k-bd"></i>${esc(t)}</li>`,
  rf: (t) => `<li><i class="k-rf"></i>${esc(t)}</li>`, lm: (t) => `<li><i class="k-lm"></i>${esc(t)}</li>`,
  hz: (t) => `<li><i class="k-hz"></i>${esc(t)}</li>`, hr: (t) => `<li><i class="k-hr"></i>${esc(t)}</li>`,
  sw: (t, c, st) => `<li><i class="k-sw${st ? ' st' : ''}" style="--c:${c}"></i>${esc(t)}</li>`,
};

// [key, column title, decimals]
const COLS = {
  speed: [['ms', 'Speed (m/s)', 1], ['powerW', 'Power (W)', 0], ['currentA', 'Current (A)', 1], ['flightMin', 'Flight time (min)', 1], ['rangeKm', 'Range (km)', 2]],
  payload: [['kg', 'Payload (kg)', 2], ['flightMin', 'Flight time (min)', 1], ['twr', 'Thrust : weight', 2]],
  battery: [['wh', 'Battery (Wh)', 0], ['flightMin', 'Flight time (min)', 1], ['auwKg', 'Takeoff mass (kg)', 2]],
  throttle: [['pct', 'Throttle (%)', 0], ['thrustG', 'Thrust (g)', 0], ['powerW', 'Power (W)', 0], ['currentA', 'Current (A)', 1], ['gPerW', 'Efficiency (g/W)', 2]],
};
const xTips = (rows, xk, head, ys) => rows.map((r) => ({ x: fmt(r[xk], head[1]), h: `${fmt(r[xk], head[1])} ${head[0]}`, r: ys.filter(([k]) => fin(r[k])).map(([k, l, u, d]) => [`${fmt(r[k], d)}${u ? ' ' + u : ''}`, l]) }));
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
const and = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// FPV class label ("5 in freestyle"): the engine's FPV_CLASSES when it has them, else SPEC-v3 1.3
const FPV = { 5: ['5 in freestyle', 7], 7: ['7 in long range', 4], 10: ['10 in long range heavy', 3] };
const fpvOf = (r) => {
  const k = r?.fpvClass == null ? '' : String(r.fpvClass), e = E.FPV_CLASSES?.[k];
  return FPV[k] || e ? { label: e?.label || FPV[k][0], minTWR: fin(e?.minTWR) ? e.minTWR : FPV[k]?.[1] } : null;
};

function speed(r, P, v, w) {
  const rows = clean(P.speed, ['ms', 'powerW', 'flightMin', 'rangeKm']);
  if (rows.length < 3) return null;
  const top = (k) => rows.reduce((a, b) => (b[k] > a[k] ? b : a)).ms;
  const be = fin(P.bestSpeed?.enduranceMs) ? P.bestSpeed.enduranceMs : top('flightMin');
  const br = fin(P.bestSpeed?.rangeMs) ? P.bestSpeed.rangeMs : top('rangeKm');
  const a = w || v, e = dif(r) ? r.estAir : null, cr = fin(e?.cruiseMs) ? e.cruiseMs : fin(a?.cruiseMs) ? a.cruiseMs : r.cruiseMs, stall = fin(e?.stallMs) ? e.stallMs : a?.stallMs; // measured: the sweep, stall zone and cruise marker all stay at the estimated mass
  const pn = [{ key: 'powerW', label: 'Power', unit: 'W', d: 0 }, { key: 'flightMin', label: 'Flight time', unit: 'min', d: 1 }, { key: 'rangeKm', label: 'Range', unit: 'km', d: 1 }];
  const at = (k, x) => C.curve(rows, 'ms', k).f(x), vals = (x) => pn.map((p) => `${fmt(at(p.key, x), p.d)} ${p.unit}`);
  const marks = [{ x: be, label: `Endurance ${fmt(be, 1)}`, kind: 'ref', dots: [1] }, { x: br, label: `Range ${fmt(br, 1)}`, kind: 'ref', dots: [2] }];
  const same = close(cr, br) ? 'Range' : close(cr, be) ? 'Endurance' : '';
  if (same) marks.splice(same === 'Range' ? 1 : 0, 1);
  if (fin(cr)) marks.push({ x: cr, label: same ? `${same} = Cruise ${fmt(cr, 1)}` : `Cruise ${fmt(cr, 1)}`, kind: 'build', vals: vals(cr) });
  if (w && fin(stall)) marks.push({ x: stall, label: `Stall ${fmt(stall, 1)}`, kind: 'lim' }); // no hover to fall back on: a hard floor
  const zones = fin(stall) ? [{ x0: 0, x1: stall, label: 'Stall' }] : [];
  const c = vals(cr);
  const cap = `Power, flight time and range against airspeed. Endurance peaks at ${fmt(be, 1)} m/s (${fmt(at('flightMin', be), 1)} min); range peaks at ${fmt(br, 1)} m/s (${fmt(at('rangeKm', br), 1)} km).` +
    (fin(cr) ? ` At the ${fmt(cr, 1)} m/s cruise, steady level flight, still air, full pack: ${c.join(', ')}. The headline figures above are the whole-mission estimate (${a ? 'launch, climb' : 'takeoff, landing'} and reserve).` : '') +
    (!fin(stall) ? '' : w ? ` Below the ${fmt(stall, 1)} m/s stall boundary (hatched) the wing cannot fly: a fixed wing has no hover.`
      : ` Below ${fmt(stall, 1)} m/s the wing stalls (hatched): the ${v?.type === 'tiltrotor' ? 'rotors tilt back up and' : 'lift motors'} carry it.`);
  return lineFig({
    n: 1, key: 'speed', title: 'Speed polar', cap,
    spec: { rows, x: { key: 'ms', label: 'Airspeed', unit: 'm/s', ...(fin(stall) ? { lo: stall * 0.8 } : {}) }, panels: pn, marks, zones },
    legend: K.ln('Model curve') + (fin(cr) ? K.bd(`Cruise ${fmt(cr, 1)} m/s, steady level`) : '') + K.rf('Best-endurance and best-range speeds') +
      (w && fin(stall) ? K.lm(`Stall boundary ${fmt(stall, 1)} m/s`) : '') + (fin(stall) ? K.hz('Below stall') : ''),
    tips: xTips(rows, 'ms', ['m/s', 1], [['powerW', 'Power', 'W', 0], ['currentA', 'Current', 'A', 1], ['flightMin', 'Flight time', 'min', 1], ['rangeKm', 'Range', 'km', 2]]),
    start: near(rows, 'ms', fin(cr) ? cr : be), table: table('Fig 1. Speed sweep', COLS.speed, rows),
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
  const t = C.curve(rows, 'kg', 'flightMin').f, wc = C.curve(rows, 'kg', 'twr').f, w = (x) => (fin(r.twr) && fin(kg) && x === kg ? r.twr : wc(x)); // at the build's own point, the result's T:W (tile, band, Fig 4 say the same number)
  const per100 = ((rows[0].flightMin - last.flightMin) / (last.kg - rows[0].kg)) * 0.1;
  const lim = fmt(minTWR, 1);
  const tn = wing ? 'static thrust-to-weight' : 'thrust-to-weight';
  const cap = `Flight time and ${tn} against payload, same ${fmt(r.batteryWh)} Wh pack throughout. Each extra 100 g costs ${per100 < 0.05 ? 'less than 0.1 min' : `about ${fmt(per100, 1)} min`}.` +
    (fin(mk) ? ` Your measured ${fmt(r.measuredG)} g flies like ${fmt(mk, 2)} kg of payload on this build${fin(kg) ? `: ${fmt(t(kg), 1)} min, ${tn} ${fmt(w(kg), 2)}` : ', outside this sweep'}.`
      : fin(kg) ? ` At your ${fmt(kg, 2)} kg: ${fmt(t(kg), 1)} min, ${tn} ${fmt(w(kg), 2)}.` : '') +
    (fin(cross) ? ` From ${fmt(cross, 2)} kg up, thrust-to-weight is below the ${mn || 'mission'} minimum of ${lim} (hatched).` : '') +
    (wing ? ' The wing carries the weight in flight, so there is no thrust-to-weight floor; static thrust matters for the launch.' : '');
  const spec = {
    rows, x: { key: 'kg', label: 'Payload', unit: 'kg' },
    panels: [{ key: 'flightMin', label: 'Flight time', unit: 'min', w: 2 }, { key: 'twr', label: wing ? 'Static thrust : weight' : 'Thrust : weight', w: 1, refs: fin(minTWR) ? [{ y: minTWR, label: `Min ${lim}`, kind: 'lim' }] : [] }],
    marks: fin(kg) ? [{ x: kg, label: fin(mk) ? `Measured ${fmt(kg, 2)}` : `Payload ${fmt(kg, 2)}`, kind: 'build', vals: [`${fmt(t(kg), 1)} min`, fmt(w(kg), 2)] }] : [],
    zones: fin(cross) ? [{ x0: cross, x1: last.kg, label: `TWR < ${lim}` }] : [],
  };
  // the measured marker can land beside the "Min" label: right, left, then bare number on each side
  const vs = fin(minTWR) ? [[`Min ${lim}`, 'r'], [`Min ${lim}`, 'l'], [lim, 'r'], [lim, 'l']].map(([label, at]) => withP(spec, 1, (p) => ({ ...p, refs: [{ ...p.refs[0], label, at }] }))) : [spec];
  return lineFig({
    n: 2, key: 'payload', title: 'Payload sweep', cap, spec, render: fit(vs),
    legend: K.ln('Model curve') + (fin(kg) ? K.bd(fin(mk) ? `Measured weight, as ${fmt(kg, 2)} kg payload` : `Your payload ${fmt(kg, 2)} kg`) : '') + (fin(minTWR) ? K.hz(`Thrust : weight below ${lim}`) : ''),
    tips: xTips(rows, 'kg', ['kg payload', 2], [['flightMin', 'Flight time', 'min', 1], ['twr', 'Thrust : weight', '', 2]]).map((tp, i) => (fin(minTWR) && rows[i].twr < minTWR ? { ...tp, r: [...tp.r, ['Below', `mission min ${lim}`]] } : tp)),
    start: near(rows, 'kg', kg), table: table('Fig 2. Payload sweep (same pack)', COLS.payload, rows),
  });
}

function battery(r, P, minTWR) {
  const rows = clean(P.battery, ['wh', 'flightMin', 'auwKg']);
  if (rows.length < 3) return null;
  const wh = r.batteryWh, last = rows[rows.length - 1], t = C.curve(rows, 'wh', 'flightMin').f;
  const slope = (x) => { const h = (last.wh - rows[0].wh) / 50; return ((t(Math.min(last.wh, x + h)) - t(Math.max(rows[0].wh, x - h))) / (Math.min(last.wh, x + h) - Math.max(rows[0].wh, x - h))) * 10; };
  const ok = fin(wh) && wh > 0, gain = ok ? (last.flightMin / t(wh) - 1) * 100 : NaN, ratio = ok ? last.wh / wh : NaN;
  const own = !dif(r) && fin(r.estFlightMin) ? r.estFlightMin : ok ? t(wh) : NaN; // matches the KPI; a measured build's Fig 3 is labelled estimate
  // Feasibility (engine: point.feasible, batteryBest): past the T:W limit the pack is too heavy to fly, so that stretch is hatched and never recommended.
  const B = P.batteryBest, bad = rows.findIndex((q) => q.feasible === false), hasF = rows.some((q) => typeof q.feasible === 'boolean');
  const M = B?.reason === 'twrLimit' && fin(B.twr) ? B.twr : minTWR, a = rows[bad - 1], b = rows[bad];
  const limX = bad < 0 ? NaN : B?.reason === 'twrLimit' && fin(B.wh) ? B.wh : !a ? b.wh : fin(a.twr) && fin(b.twr) && fin(M) && a.twr !== b.twr ? a.wh + ((b.wh - a.wh) * (a.twr - M)) / (a.twr - b.twr) : (a.wh + b.wh) / 2;
  const lim = fin(limX), k = lim && ok ? limX / wh : NaN, mt = fin(M) ? String(+M.toFixed(2)) : '';
  const cap = `Flight time and takeoff mass against pack energy, same payload. The pack carries its own weight, so returns diminish.` +
    (ok ? ` Your ${fmt(wh)} Wh pack gives ${fmt(own, 1)} min; there each extra 10 Wh adds ${fmt(slope(wh), 1)} min.` : '') +
    (lim ? ` Bigger packs would fly longer only with stronger motors: past ${fin(k) && Math.abs(k - 1) <= 0.05 ? `this pack (${fmt(limX)} Wh)` : fin(k) ? `${fmt(k, 2)}x the pack (${fmt(limX)} Wh)` : `${fmt(limX)} Wh`} thrust : weight drops below ${mt || 'the mission minimum'} (hatched).`
      : ok ? ` At ${fmt(last.wh)} Wh only ${fmt(slope(last.wh), 1)} min. ${fmt(ratio, 1)}x the pack buys ${fmt(gain)}% more time.` : '');
  return lineFig({
    n: 3, key: 'battery', title: 'Battery sweep', cap,
    spec: {
      rows, x: { key: 'wh', label: 'Battery energy', unit: 'Wh' },
      panels: [{ key: 'flightMin', label: 'Flight time', unit: 'min', w: 2, end: !lim && ok && gain > 0 ? `+${fmt(gain)}% at ${fmt(ratio, 1)}x pack` : '' }, { key: 'auwKg', label: 'Takeoff mass', unit: 'kg', w: 1 }],
      marks: [...(ok ? [{ x: wh, label: `Pack ${fmt(wh)} Wh`, kind: 'build', vals: [`${fmt(own, 1)} min`, `${fmt(C.curve(rows, 'wh', 'auwKg').f(wh), 2)} kg`] }] : []),
        ...(lim ? [{ x: limX, label: `T:W below ${mt} past here`, kind: 'lim' }] : [])],
      zones: lim ? [{ x0: limX, x1: last.wh, label: `T:W < ${mt}` }] : [],
    },
    legend: K.ln('Model curve') + (ok ? K.bd(`Your pack ${fmt(wh)} Wh`) : '') + (lim ? K.lm(`T:W limit ${fmt(limX)} Wh`) + K.hz(`Too heavy to fly: T:W below ${mt}`) : ''),
    tips: xTips(rows, 'wh', ['Wh pack', 0], [['flightMin', 'Flight time', 'min', 1], ['auwKg', 'Takeoff mass', 'kg', 2]]).map((tp, i) => (rows[i].feasible === false ? { ...tp, r: [...tp.r, ['Does not fly', `T:W below ${mt}`]] } : tp)),
    start: near(rows, 'wh', wh),
    table: ((tb) => (hasF ? { ...tb, columns: [...tb.columns, 'Flies?'], rows: tb.rows.map((x, i) => [...x, rows[i].feasible === false ? 'no' : 'yes']) } : tb))(table('Fig 3. Battery sweep (same payload)', COLS.battery, rows)),
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
  const hv = w ? atPower(rows, cruW) : r.hoverThrottlePct, hn = w ? 'Cruise' : 'Hover', st = w ? ' static' : '', em = w && dif(r) ? ' (estimate)' : ''; // wing cruise power comes from the estimated mission, the weight line is measured
  const twr = fin(r.twr) ? r.twr : ((per ? N : 1) * last.thrustG) / auwG, who = w ? 'Cruise motor, static thrust. ' : tilt ? 'Tilting rotors, hover thrust. ' : v ? 'Lift motors. ' : '';
  const cap = `${who}Thrust and efficiency against throttle.` +
    (fin(hv) ? (w ? ` Cruise draws about ${fmt(cruW)} W${em ? ' at the estimated mass' : ''}. On a static test stand that is about ${fmt(hv)}% throttle${fin(r.hoverThrottlePct) && r.hoverThrottlePct < hv ? `; in flight the airspeed unloads the propeller, so the cruise setting on the headline tile (${fmt(r.hoverThrottlePct)}%) is lower.` : '.'}` : ` Hover at ${fmt(hv)}% throttle (${fmt(T(hv))} g${per ? ' per motor' : ''}) runs at ${fmt(G(hv), 1)} g/W.`) : '') +
    ` Full throttle gives ${fmt(last.thrustG)} g${per ? ' per motor' : st} (thrust : weight ${fmt(twr, 2)}) at ${fmt(last.gPerW, 1)} g/W.` +
    (w ? ' In flight the propeller unloads, so thrust falls with airspeed.' : '');
  const spec = {
    rows, x: { key: 'pct', label: 'Throttle', unit: '%', lo: 0, hi: 100 },
    panels: [{ key: 'thrustG', label: per ? 'Thrust per motor' : 'Total thrust', unit: 'g', w: 2, end: `Max ${fmt(last.thrustG)} g`, refs: fin(wl) ? [{ y: wl, label: per ? `Weight / ${N}` : 'Takeoff weight', at: 'l' }] : [] }, { key: 'gPerW', label: 'Efficiency', unit: 'g/W', w: 1 }],
    marks: fin(hv) ? [{ x: hv, label: w ? `${fmt(hv)}% bench throttle${em}` : `${hn} ${fmt(hv)}%`, kind: 'build', vals: [`${fmt(T(hv))} g`, `${fmt(G(hv), 1)} g/W`] }] : [],
  };
  // The build point sits on the weight line, so its value tag can print over the line's label, and a measured weight can put it under the "Max" note:
  // try the weight label left, right, short left, short right, each with the full, the bare-number, then no end note.
  const vs = [];
  if (fin(wl)) for (const end of [spec.panels[0].end, `${fmt(last.thrustG)} g`, undefined]) for (const [label, at] of [[spec.panels[0].refs[0].label, 'l'], [spec.panels[0].refs[0].label, 'r'], [per ? 'Weight' : 'Takeoff', 'l'], [per ? 'Weight' : 'Takeoff', 'r']]) vs.push(withP(spec, 0, (p) => ({ ...p, end, refs: [{ ...p.refs[0], label, at }] })));
  return lineFig({
    n: 4, key: 'throttle', title: w ? 'Cruise motor' : tilt ? 'Tilt-rotor throttle' : v ? 'Lift throttle' : 'Throttle curve', cap, spec, render: fit(vs.length ? vs : [spec]),
    legend: K.ln(w ? 'Model curve, static' : 'Model curve') + (fin(hv) ? K.bd(w ? `Bench throttle at cruise power ${fmt(hv)}%${em}` : `${hn} throttle ${fmt(hv)}%`) : '') + (fin(wl) ? K.rf(per ? `Takeoff weight / ${N} motors, ${fmt(wl)} g` : `Takeoff weight ${fmt(wl)} g`) : ''),
    tips: xTips(rows, 'pct', ['% throttle', 0], [['thrustG', 'Thrust', 'g', 0], ['powerW', 'Power', 'W', 0], ['currentA', 'Current', 'A', 1], ['gPerW', 'Efficiency', 'g/W', 2]]),
    start: near(rows, 'pct', hv), table: table(`Fig 4. Throttle sweep${w ? ' (cruise motor, static)' : tilt ? ' (tilting rotors)' : v ? ' (lift motors)' : ''}`, COLS.throttle, rows),
  });
}

// [label, colour, striped]: blue = vertical flight, ochre = short high-power transients, teal = level flight;
// stripes mark the low-power variant, so each phase of one profile gets its own mark.
const PH = {
  takeoff: ['Takeoff', 'blue'], hover: ['Hover', 'blue'], landing: ['Landing', 'blue'], climb: ['Climb', 'blue'], descent: ['Descent', 'blue', 1],
  launch: ['Launch', 'ochre'], transition: ['Transition', 'ochre'], cruise: ['Cruise', 'teal'], loiter: ['Loiter', 'teal', 1], reserve: ['Reserve', ''],
};
const HEAVY = new Set(['takeoff', 'hover', 'landing', 'transition', 'launch', 'climb']);
function profile(r, P, mn) {
  const raw = (Array.isArray(P.profile) ? P.profile : []).filter((p) => p && typeof p.phase === 'string' && fin(p.startS) && fin(p.durationS) && p.durationS > 0 && fin(p.powerW) && p.powerW >= 0);
  if (!raw.length) return null;
  const ph = raw.sort((a, b) => a.startS - b.startS).map((p) => {
    const [label, c, st] = PH[p.phase] || [up(p.phase), 'blue'];
    return { key: p.phase, label, color: PAL[c] || '', st: !!st, reserve: p.phase === 'reserve', t0: p.startS / 60, t1: (p.startS + p.durationS) / 60, w: p.powerW, s: p.durationS, wh: (p.powerW * p.durationS) / 3600, start: p.startS };
  });
  const tot = sum(ph.map((p) => p.wh)) || 1, flown = ph.filter((p) => !p.reserve), tf = sum(flown.map((p) => p.s)) || 1;
  const fly = fin(r.estFlightMin) ? r.estFlightMin : flown.length ? flown[flown.length - 1].t1 : NaN;
  const lift = flown.filter((p) => HEAVY.has(p.key)), cru = ph.find((p) => p.key === 'cruise'), loi = ph.find((p) => p.key === 'loiter'), hi = ph.reduce((a, b) => (b.w > a.w ? b : a));
  const share = (a, k) => fmt((sum(a.map((p) => p[k])) / (k === 's' ? tf : tot)) * 100), names = [...new Set(lift.map((p) => p.label.toLowerCase()))];
  const cap = `Electrical power through the ${mn ? `${mn} ` : ''}mission, phase by phase. Peak draw ${fmt(hi.w)} W (${hi.label.toLowerCase()}).` +
    (lift.length && cru ? ` ${up(and(names))} take${names.length > 1 ? '' : 's'} ${share(lift, 's')}% of the flight time ${Math.abs(share(lift, 's') - share(lift, 'wh')) <= 1 ? 'and' : 'but'} ${share(lift, 'wh')}% of the energy; cruise runs at ${fmt(cru.w)} W${loi ? `, loiter at ${fmt(loi.w)} W` : ''}.` : '') +
    (ph.some((p) => p.reserve) ? ' The reserve (hatched) stays in the pack.' : '');
  const kinds = new Map(); // one legend entry per mark, in flight order
  for (const p of ph) if (!p.reserve) { const k = `${p.color}|${p.st ? 1 : ''}`; kinds.set(k, [...(kinds.get(k) || []), p.label]); }
  return {
    n: 5, key: 'profile', title: 'Mission profile', kind: 'seg', cap,
    render: (w, id) => C.phases({ phases: ph, mark: fin(fly) ? { x: fly, label: `Flight ${fmt(fly, 1)} min` } : null, x: { label: 'Mission time', unit: 'min' } }, w, id),
    legend: [...kinds].map(([k, l]) => K.sw([...new Set(l)].join(', '), k.split('|')[0], k.endsWith('1'))).join('') + (ph.some((p) => p.reserve) ? K.hr('Reserve, not flown') : '') + (fin(fly) ? K.bd(`Flight time ${fmt(fly, 1)} min`) : ''),
    tips: ph.map((p) => ({ h: p.label, c: p.color, st: p.st, r: [[`${fmt(p.w)} W`, 'Power'], [dur(p.s), 'Duration'], [`${fmt(p.wh, 1)} Wh`, 'Energy'], [`${fmt((p.wh / tot) * 100)}%`, 'Share of energy']] })),
    start: Math.max(0, ph.findIndex((p) => p.key === 'cruise')),
    table: { title: 'Fig 5. Mission profile', columns: ['Phase', 'Start (s)', 'Duration (s)', 'Power (W)', 'Energy (Wh)'], rows: ph.map((p) => [p.label, fmt(p.start), fmt(p.s), fmt(p.w), fmt(p.wh, 1)]) },
  };
}

const WN = { measuredExtraG: 'Measured, not in the estimate', frameG: 'Frame', airframeG: 'Airframe', motorsG: 'Motors', escG: 'ESC', fcG: 'FC', propsG: 'Props', servosG: 'Servos', tiltG: 'Tilt mechanism', hardwareG: 'Screws, wiring and hardware', otherG: 'Other', payloadG: 'Payload', batteryG: 'Battery' };
const wname = (k, v, w) => (k === 'frameG' && v && !w?.airframeG ? 'Airframe' : WN[k] || up(k.replace(/G$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()));
function weights(r, v) { // v: any wing data (vtol or fixed wing) -> the frame is an airframe
  const w = r.weights && typeof r.weights === 'object' ? r.weights : {};
  const all = Object.entries(w).filter(([, g]) => fin(g) && g > 0);
  if (!all.length) return null;
  const dry = all.filter(([k]) => k !== 'payloadG' && k !== 'batteryG').sort((a, b) => (a[0] === 'measuredExtraG') - (b[0] === 'measuredExtraG') || b[1] - a[1]); // the measured excess last
  const parts = [...dry.map(([k, g]) => ({ label: wname(k, v, w), g, color: PAL.blue, grp: 'Dry weight' })),
    ...all.filter(([k]) => k === 'payloadG').map(([, g]) => ({ label: 'Payload', g, color: PAL.teal, grp: 'Payload' })),
    ...all.filter(([k]) => k === 'batteryG').map(([, g]) => ({ label: 'Battery', g, color: PAL.ochre, grp: 'Battery' }))];
  const total = sum(parts.map((p) => p.g)), pc = (g) => fmt((g / total) * 100);
  const groups = [];
  let a = 0;
  for (const p of parts) { const g = groups[groups.length - 1]; if (g?.grp === p.grp) g.b += p.g; else groups.push({ grp: p.grp, label: p.grp === 'Dry weight' ? 'Dry' : p.grp, a, b: a + p.g }); a += p.g; }
  const cap = `Takeoff mass ${fmt(total)} g: ${groups.map((g) => `${g.grp.toLowerCase()} ${fmt(g.b - g.a)} g (${pc(g.b - g.a)}%)`).join(', ')}.` +
    (w.batteryG > 0 ? ` The battery is ${pc(w.batteryG)}% of takeoff mass.` : '') +
    (dif(r) ? (w.measuredExtraG > 0 ? ` The measured ${fmt(r.measuredG)} g is ${fmt(w.measuredExtraG)} g over the estimate.` : ` The measured ${fmt(r.measuredG)} g is ${fmt(r.estG - r.measuredG)} g under the estimate; the breakdown is the estimate's.`) : '');
  return {
    n: 6, key: 'weights', title: dif(r) && !(w.measuredExtraG > 0) ? 'Weight statement (estimate)' : 'Weight statement', kind: 'seg', cap,
    render: (wd) => C.massBar({ parts, groups, total }, wd),
    legend: groups.map((g) => K.sw(g.grp, parts.find((p) => p.grp === g.grp).color)).join(''),
    extra: `<ol class="pf-ws">${parts.map((p) => `<li><i class="k-sw" style="--c:${p.color}"></i><span>${esc(p.label)}</span><b>${fmt(p.g)} g</b><small>${pc(p.g)}%</small></li>`).join('')}</ol>`,
    tips: parts.map((p) => ({ h: p.label, c: p.color, r: [[`${fmt(p.g)} g`, 'Mass'], [`${pc(p.g)}%`, 'of takeoff mass'], [p.grp, 'Group']] })),
    start: 0,
    table: { title: 'Fig 6. Weight breakdown', columns: ['Component', 'Mass (g)', 'Share (%)'], rows: parts.map((p) => [p.label, fmt(p.g), pc(p.g)]) },
  };
}

// Key figures, [label, value, unit, note]. Quadplane and tiltrotor share the VTOL rows; the tiltrotor adds its tilt mechanism.
const wingRows = (v) => [
  ['Span', fin(v.wingspanMm) && fmt(v.wingspanMm / 1000, 2), 'm', fin(v.aspectRatio) ? `aspect ratio ${fmt(v.aspectRatio, 1)}${fin(v.wingAreaDm2) ? `, ${fmt(v.wingAreaDm2, 1)} dm²` : ''}` : ''],
  ['Wing loading', fin(v.wingLoadingGdm2) && fmt(v.wingLoadingGdm2), 'g/dm²', ''],
  ['Lift : drag', fin(v.liftToDrag) && fmt(v.liftToDrag, 1), '', fin(v.liftToDrag) ? `glides ${fmt(v.liftToDrag)} m per m of height` : ''],
  ['Stall', fin(v.stallMs) && fmt(v.stallMs, 1), 'm/s', ''],
  ['Cruise', fin(v.cruiseMs) && fmt(v.cruiseMs, 1), 'm/s', fin(v.cruiseMs) && fin(v.stallMs) && v.stallMs > 0 ? `${fmt(v.cruiseMs / v.stallMs, 2)}x stall` : ''],
];
const LAUNCH = { hand: 'Hand', bungee: 'Bungee', runway: 'Runway' };
function keyRows(r) {
  const w = r?.fixedWing, v = r?.vtol;
  if (w && typeof w === 'object') {
    const rows = [...wingRows(w),
      ['Launch', typeof w.launch === 'string' && (LAUNCH[w.launch] || up(w.launch)), '', dif(r) ? 'type at estimated mass' : fin(r.auwKg) ? `takeoff mass ${fmt(r.auwKg, 2)} kg` : ''],
      ['Endurance', fin(r.estFlightMin) && kn(r.estFlightMin, 1), 'min', 'at cruise speed'], // same figure as the KPI tile
      ['Range', fin(r.rangeKm) && kn(r.rangeKm, 1), 'km', fin(w.cruiseMs) ? `at ${fmt(w.cruiseMs, 1)} m/s` : ''],
    ].filter((c) => c[1]);
    return { kind: 'wing', tag: 'Fixed wing', title: 'Wing / tilt', rows, a: w };
  }
  if (!v || typeof v !== 'object') return null;
  const hs = (fin(v.hoverS) ? v.hoverS : 0) + (fin(v.transitionS) ? v.transitionS : 0), t = v.type === 'tiltrotor' && v.tilt && typeof v.tilt === 'object' ? v.tilt : null;
  const rows = [...wingRows(v),
    ['Hover vs cruise', hs > 0 && fin(v.cruiseMin) && `${fmt(hs / 60, 1)} / ${fmt(v.cruiseMin, 1)}`, 'min', dif(r) ? 'at estimated mass' : fin(v.hoverS) && fin(v.transitionS) ? `${fmt(v.hoverS)} s hover, ${fmt(v.transitionS)} s transition` : ''],
    ...(t ? [
      ['Tilt servos', fin(t.servoCount) && fmt(t.servoCount), '', fin(t.motorCount) ? `${fmt(t.motorCount)} tilting motors, no pusher` : ''],
      ['Tilt time', fin(t.tiltTimeS) && fmt(t.tiltTimeS, 1), 's', 'hover to cruise'],
      ['Transition angle', fin(t.transitionAngleDeg) && `${fmt(t.transitionAngleDeg)}°`, '', 'rotor tilt from vertical thrust'],
    ] : []),
  ].filter((c) => c[1]);
  return v.type === 'tiltrotor' ? { kind: 'tilt', tag: 'Tiltrotor', title: 'Wing / tilt', rows, a: v, tilt: t } : { kind: 'quadplane', tag: 'VTOL', title: 'VTOL key figures', rows, a: v };
}
function keyStrip(r) {
  const k = keyRows(r);
  if (!k?.rows.length) return '';
  const v = k.a, ga = fin(v.wingspanMm) && fin(v.wingAreaDm2) && v.wingspanMm > 0 && v.wingAreaDm2 > 0;
  const bar = k.kind !== 'wing' && fin(v.hoverS) && fin(v.cruiseMin) ? `<span class="pf-hb" aria-hidden="true">${[[v.hoverS, PAL.blue], [v.transitionS, PAL.ochre], [v.cruiseMin * 60, PAL.teal]].filter(([s]) => fin(s) && s > 0).map(([s, c]) => `<i style="flex:${s.toFixed(1)};--c:${c}"></i>`).join('')}</span>` : '';
  const svg = () => C.planform(v, { kind: k.kind, liftIn: r.propInch, pushIn: v.pusher?.propInch, propIn: v.motor?.propInch ?? r.propInch, tiltDeg: k.tilt?.transitionAngleDeg });
  const note = { wing: 'fuselage, tail and motor schematic.', tilt: 'booms schematic; tilt axes dash-dotted, the inset shows the rotor tilt.', quadplane: 'fuselage and booms schematic.' }[k.kind];
  let fig = '';
  try { fig = ga ? `<figure class="pf-ga">${svg()}<figcaption>Planform to scale from span and wing area; ${note}</figcaption></figure>` : ''; } catch { fig = ''; }
  return `<div class="pf-vt"><h4 class="pf-t"><em>${esc(k.tag.toUpperCase())}</em>Key figures</h4><div class="pf-vt-in">${fig}` +
    `<dl class="pf-kf">${k.rows.map(([l, val, u, s]) => { const hv = l === 'Hover vs cruise' && bar; return `<div${hv ? ' class="hv"' : ''}><dt>${esc(l)}</dt><dd>${esc(val)}${u ? `<small>${esc(u)}</small>` : ''}</dd>${s ? `<dd class="s">${esc(s)}</dd>` : ''}${hv ? bar : ''}</div>`; }).join('')}</dl></div></div>`;
}

const TITLES = ['Speed polar', 'Payload sweep', 'Battery sweep', 'Throttle curve', 'Mission profile', 'Weight statement'];
// Mission name for captions; an FPV class names itself once: "FPV · 5 in freestyle / racing".
const missionName = (r, ctx) => { const f = fpvOf(r); return f ? `FPV · ${f.label}` : ctx.missionLabel || ''; };
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
  const tag = (m) => (m && !m.miss && est?.has(m.key) ? { ...m, title: `${m.title} (estimate)`, cap: `At the estimated ${fmt(r.estG)} g takeoff mass, not the measured ${fmt(r.measuredG)} g. ${m.cap}` } : m);
  return make.map((f, i) => { try { return tag(f()) || { n: i + 1, miss: TITLES[i] }; } catch { return { n: i + 1, miss: TITLES[i] }; } });
}

export function perfTables(result) {
  const t = figures(result).filter((f) => f.table).map((f) => f.table), k = result && typeof result === 'object' ? keyRows(result) : null;
  return k?.rows.length ? [...t, { title: k.title, columns: ['Quantity', 'Value', 'Note'], rows: k.rows.map(([l, val, u, s]) => [l, u ? `${val} ${u}` : val, s || '']) }] : t;
}

const REG = new Map(); // figure id -> model, waiting for bindPerformance (render runs before the DOM exists)
let SEQ = 0;
const tableHtml = (t, hi) => `<div class="pf-tw"><table><caption class="pf-sr">${esc(t.title)}</caption><thead><tr>${t.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((row, i) => `<tr${i === hi ? ' class="hi"' : ''}>${row.map((c, j) => (j ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;

export function renderPerformance(result, ctx = {}) {
  const figs = figures(result, ctx || {});
  if (!figs.length) return '<p class="pf-note">Performance figures appear once the build calculates.</p>';
  const uid = `pf${(++SEQ).toString(36)}`, W0 = ctx?.width >= 160 ? ctx.width : 560; // ctx.width: tests draw at narrow plot widths
  const miss = (n) => `<div class="pf pf-miss"><p><em>FIG ${n}</em>${esc(TITLES[n - 1])}: this series is not in the result yet.</p></div>`;
  const body = figs.map((m) => {
    if (m.miss) return miss(m.n);
    let o;
    try { o = m.render(W0, `${uid}-${m.key}`); } catch { return miss(m.n); }
    const id = `${uid}-${m.key}`, aria = `Figure ${m.n}, ${m.title}. ${m.cap}${m.kind === 'x' ? ' Arrow keys step through the data points.' : ' Arrow keys step through the segments.'}`;
    Object.assign(m, { id, w: W0, geo: o.geo, idx: null });
    REG.set(id, m);
    return `<figure class="pf" data-uid="${id}"><div class="pf-box"><div class="pf-head"><h4 class="pf-t"><em>FIG ${m.n}</em>${esc(m.title)}</h4>` +
      `<div class="pf-tools"><button type="button" class="pf-btn" data-pf="table" aria-expanded="false" aria-controls="${id}-t">Table</button><button type="button" class="pf-btn" data-pf="csv">Copy CSV</button></div></div>` +
      `<ul class="pf-key">${m.legend}</ul><div class="pf-plot"><svg class="pf-svg" role="img" tabindex="0" aria-label="${esc(aria)}" viewBox="0 0 ${o.w} ${o.h}" width="${o.w}" height="${o.h}">${o.inner}</svg><div class="pf-tip" aria-hidden="true"></div></div>` +
      `${m.extra || ''}<div class="pf-tbl" id="${id}-t" hidden>${tableHtml(m.table, m.kind === 'x' ? m.start : -1)}</div></div>` +
      `<figcaption><b>Fig ${m.n}.</b> ${esc(m.cap)}</figcaption><p class="pf-sr" aria-live="polite"></p></figure>`;
  }).join('');
  while (REG.size > 48) REG.delete(REG.keys().next().value);
  const mn = missionName(result, ctx || {}), who = mn ? ` for this ${esc(mn)} build` : '';
  return `<div class="pf-sec"><p class="pf-lede">Model curves${who}. Point at, tap or focus a figure, then use the arrow keys for exact values.</p>${keyStrip(result)}<div class="pf-grid">${body}</div></div>`;
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
  b.textContent = ok ? 'Copied' : 'Copy failed';
  if (live) live.textContent = ok ? 'CSV copied to the clipboard.' : 'Copy failed. Open the table to select the values.';
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.textContent = 'Copy CSV'; }, 1800);
}
