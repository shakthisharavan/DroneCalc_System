// Performance figures: pure inline-SVG drawing kit (strings in, strings out, no DOM). Owner: PERF.
// Look: flight-manual chart paper. Ink curves on a fine major/minor grid, one rust build point, dashed reference
// lines, hatched "avoid" zones (the H-V diagram idiom), labels haloed in the paper colour so grid lines never cut them.
// Two measures never share one plot: they stack as small multiples on a single shared x axis.

// Identity colours (first three categorical slots only), validated with the dataviz validate_palette.js on the
// #f3efe2 figure surface, all pairs: CVD dE >= 11.5, normal-vision dE >= 16.6, contrast >= 3.9:1.
// Labels set inside these fills are white (APCA |Lc| >= 72).
export const PAL = { blue: '#1f66ad', ochre: '#b07208', teal: '#14907c' };

const fin = Number.isFinite;
const q = (v) => (fin(v) ? Math.round(v * 10) / 10 : 0); // svg coordinate, never NaN
// Caps for the leading words only, so units keep their case ("MAX 4,770 g", not "G").
const caps = (s) => String(s).replace(/^[^\d+<>-]*/, (w) => w.toUpperCase());
const tw = (s, px = 10.5) => String(s).length * px * 0.6; // --mono (JetBrains Mono, IBM Plex Mono, Consolas) advance is 0.6 em
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Display number: fixed decimals, en-US grouping, '-' when not finite. */
export function fmt(v, d = 0) {
  if (!fin(v)) return '-';
  return (Math.abs(v) < 0.5 / 10 ** d ? 0 : v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Round axis: step 1/2/5 x 10^k, ends snapped to whole steps; minor = step / 5 (or / 4 for a 2-step). */
export function nice(lo, hi, n = 5) {
  if (!(hi > lo)) hi = lo + 1;
  const raw = (hi - lo) / Math.max(1, n), p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  const k = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10, step = k * p;
  return { lo: Math.floor(lo / step + 1e-9) * step, hi: Math.ceil(hi / step - 1e-9) * step, step, minor: step / (k === 2 ? 4 : 5) };
}
const steps = (a, s) => { const o = [], b = Math.ceil(a.lo / s - 1e-6) * s; for (let i = 0; b + i * s <= a.hi + s * 1e-6; i++) o.push(+(b + i * s).toPrecision(12)); return o; };
const dec = (s) => Math.max(0, -Math.floor(Math.log10(s) + 1e-9));
const tick = (v, a) => (a.hi >= 1e4 && v ? fmt(v / 1e3, dec(a.step / 1e3)) + 'k' : fmt(v, dec(a.step)));

/** Monotone cubic through every point (Steffen 1990, as d3.curveMonotoneX): smooth, never invents extrema.
 *  Returns { f(x) -> y on the drawn curve, path(X, Y) -> svg path in pixels }. xs strictly increasing. */
export function mono(xs, ys) {
  const n = xs.length, m = new Array(n).fill(0), s = (i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  for (let i = 1; i < n - 1; i++) {
    const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i], s0 = s(i - 1), s1 = s(i), p = (s0 * h1 + s1 * h0) / (h0 + h1);
    m[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  const end = (sd, t) => { const v = (3 * sd - t) / 2; return Math.sign(v) !== Math.sign(sd) ? 0 : Math.abs(v) > 3 * Math.abs(sd) ? 3 * sd : v; };
  if (n === 2) m[0] = m[1] = s(0);
  else if (n > 2) { m[0] = end(s(0), m[1]); m[n - 1] = end(s(n - 2), m[n - 2]); }
  const f = (x) => {
    if (n < 2) return ys[0];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = Math.min(1, Math.max(0, (x - xs[i]) / h)), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (3 * t2 - 2 * t3) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
  const path = (X, Y) => xs.map((x, i) => {
    if (!i) return `M${q(X(x))} ${q(Y(ys[0]))}`;
    const h = (x - xs[i - 1]) / 3;
    return `C${q(X(xs[i - 1] + h))} ${q(Y(ys[i - 1] + m[i - 1] * h))} ${q(X(x - h))} ${q(Y(ys[i] - m[i] * h))} ${q(X(x))} ${q(Y(ys[i]))}`;
  }).join('');
  return { f, path };
}
export const curve = (rows, xk, yk) => mono(rows.map((r) => r[xk]), rows.map((r) => r[yk]));

// Lane packing for labels that sit above the plot. items [{x0, w}] -> [{x0, lane}]; lane -1 = no room (legend + tooltip carry it).
function pack(items, lo, hi, max = 3) {
  const ends = [], out = [];
  items.map((it, i) => ({ ...it, i })).sort((a, b) => a.x0 - b.x0).forEach((it) => {
    const x0 = Math.max(lo, Math.min(it.x0, hi - it.w));
    let k = ends.findIndex((e) => x0 >= e + 8);
    if (k < 0) k = ends.length < max ? ends.push(0) - 1 : -1;
    if (k >= 0) ends[k] = x0 + it.w;
    out[it.i] = { x0, lane: k };
  });
  return { pos: out, n: ends.length };
}
// A flag label beside its pole: right of the pole when it fits, else left.
const flagAt = (x, w, W) => ({ x0: x + 4 + w > W - 2 ? x - 4 - w : x + 4, w });
const text = (x, y, s, cls, a = '') => `<text x="${q(x)}" y="${q(y)}" class="${cls}"${a}>${s}</text>`;
const unit = (u) => (u ? `<tspan class="u"> ${esc(u)}</tspan>` : '');
const defs = (id) => `<defs><pattern id="${id}-z" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path class="hz" stroke="#a3231a" d="M0 0V5"/></pattern><pattern id="${id}-r" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><path class="hr" stroke="#14181c" d="M0 0V5"/></pattern></defs>`;
const xAxis = (xa, X, y, W, L, R, H, x) => steps(xa, xa.step).map((v) => text(X(v), y + 14, tick(v, xa), 'tk', ' text-anchor="middle"')).join('') +
  text((L + W - R) / 2, H - 5, esc(x.label.toUpperCase()) + unit(x.unit), 'xt', ' text-anchor="middle"');
const bug = '<g class="xb"><rect height="17" rx="2"/><text text-anchor="middle"></text></g>';

/**
 * Small multiples on one shared x axis (line figures 1-4).
 * s = { rows, x:{key,label,unit,lo?,hi?},
 *       panels:[{key,label,unit,w,refs:[{y,label,kind:'ref'|'lim',at:'l'|'r'}],end?}],
 *       marks:[{x,label,kind:'build'|'ref'|'lim',dots?:[panel idx],vals?:[label per panel]}], zones:[{x0,x1,label}] }
 * -> { inner, w, h, geo:{ w, xs, ys, top, bot, L, R } }  (geo drives crosshair and hit testing)
 */
export function panels(s, W, id) {
  const narrow = W < 440, L = narrow ? 46 : 52, R = narrow ? 12 : 18, B = 36, ROW = 19, rows = s.rows, xk = s.x.key;
  const X0 = rows[0][xk], X1 = rows[rows.length - 1][xk];
  const xa = nice(s.x.lo ?? (X0 <= 0.35 * X1 ? 0 : X0), s.x.hi ?? X1, Math.max(3, Math.round((W - L - R) / 84)));
  if (s.x.hi == null) xa.hi = X1; // the frame ends with the data; ticks stay on round values inside it
  if (s.x.lo > 0) xa.lo = s.x.lo;
  const X = (v) => L + ((Math.min(xa.hi, Math.max(xa.lo, v)) - xa.lo) / (xa.hi - xa.lo)) * (W - L - R);
  const marks = (s.marks || []).filter((m) => fin(m.x) && m.x >= xa.lo && m.x <= xa.hi);
  const labs = marks.map((m) => esc(caps(m.label)));
  // limit flags (stall) sit left of their pole, away from the curve's build point, when there is room
  const { pos, n } = pack(marks.map((m) => { const x = X(m.x), w = tw(m.label) + 2; return m.kind === 'lim' && x - 4 - w >= 2 ? { x0: x - 4 - w, w } : flagAt(x, w, W); }), 2, W - 2);
  const P = s.panels, sw = P.reduce((a, p) => a + (p.w || 1), 0), top = 6 + n * 15;
  const H = Math.round(Math.max(Math.min(Math.max(W * 0.62, 260), 400), top + B + P.length * ROW + sw * 62));
  const avail = H - top - B - P.length * ROW, xt = steps(xa, xa.step), xm = X(xa.lo + xa.minor) - L >= 7 ? steps(xa, xa.minor) : [];
  let y = top, grid = '', zone = '', body = '', over = '';
  const ys = [], fx = [];
  P.forEach((p, j) => {
    const h = (avail * (p.w || 1)) / sw, y0 = y + ROW, y1 = y0 + h;
    y = y1;
    const vals = rows.map((r) => r[p.key]), refs = (p.refs || []).filter((r) => fin(r.y));
    const ya = nice(Math.min(0, ...vals), Math.max(...vals, ...refs.map((r) => r.y)) * (p.end ? 1.2 : 1.08) || 1, Math.max(2, Math.floor(h / 30)));
    const Y = (v) => y1 - ((v - ya.lo) / (ya.hi - ya.lo)) * h;
    const ym = Y(ya.lo) - Y(ya.lo + ya.minor) >= 6 ? steps(ya, ya.minor) : [];
    grid += xm.map((v) => `<path class="mn" d="M${q(X(v))} ${q(y0)}V${q(y1)}"/>`).join('') + ym.map((v) => `<path class="mn" d="M${L} ${q(Y(v))}H${W - R}"/>`).join('') +
      xt.map((v) => `<path class="mj" d="M${q(X(v))} ${q(y0)}V${q(y1)}"/>`).join('') +
      steps(ya, ya.step).map((v) => `<path class="mj" d="M${L} ${q(Y(v))}H${W - R}"/>` + text(L - 6, Y(v) + 4, tick(v, ya), 'tk', ' text-anchor="end"')).join('') +
      `<rect class="fr" x="${L}" y="${q(y0)}" width="${W - L - R}" height="${q(h)}"/>`;
    for (const z of s.zones || []) {
      const a = X(Math.max(xa.lo, z.x0)), b = X(Math.min(xa.hi, z.x1));
      if (b - a < 1) continue;
      zone += `<rect class="zw" x="${q(a)}" y="${q(y0)}" width="${q(b - a)}" height="${q(h)}"/><rect x="${q(a)}" y="${q(y0)}" width="${q(b - a)}" height="${q(h)}" fill="url(#${id}-z)"/>`;
      if (!j && z.label && b - a >= tw(z.label) + 12) over += text(b - 6, y1 - 7, esc(z.label.toUpperCase()), 'zl h', ' text-anchor="end"');
    }
    const c = curve(rows, xk, p.key);
    body += `<path class="cv" d="${c.path(X, Y)}"/>`;
    for (const r of refs) {
      const ry = Y(r.y), left = r.at === 'l';
      body += `<path class="${r.kind === 'lim' ? 'lm' : 'rf'}" d="M${L} ${q(ry)}H${W - R}"/>`;
      over += text(left ? L + 6 : W - R - 6, ry - 5, esc(caps(r.label)), `rl h${r.kind === 'lim' ? ' lim' : ''}`, left ? '' : ' text-anchor="end"');
    }
    if (p.end) { // end-of-curve note, set above-left of the last point where the curve leaves room
      const ex = X(rows[rows.length - 1][xk]), ey = Y(vals[vals.length - 1]), lw = tw(p.end) + 8;
      // above the end point unless the curve runs through that box (concave ends), then below it
      const inv = (px) => xa.lo + ((px - L) / (W - L - R)) * (xa.hi - xa.lo);
      const clear = [0.25, 0.5, 0.75, 1].every((k) => Y(c.f(inv(ex - k * lw))) > ey - 6);
      over += text(ex - 8, clear && ey - y0 > 26 ? ey - 9 : ey + 17, esc(caps(p.end)), 'el h', ' text-anchor="end"');
    }
    over += text(L, y0 - 6, esc(p.label.toUpperCase()) + unit(p.unit), 'pl h');
    ys.push(vals.map(Y));
    fx.push({ c, Y, y0, y1 });
  });
  const span = xa.hi - xa.lo;
  let mk = '', dots = '';
  marks.forEach((m, i) => {
    const x = X(m.x), { x0, lane } = pos[i], b = m.kind === 'build', lim = m.kind === 'lim', base = top - 6 - Math.max(0, lane) * 15;
    mk += `<path class="${b ? 'bd' : lim ? 'lm' : 'rf'}" d="M${q(x)} ${q(lane < 0 ? top + ROW : base - 8)}V${q(y)}"/>`;
    if (lane >= 0) over += text(x0 + 1, base, labs[i], `fl h${b ? ' b' : lim ? ' lim' : ''}`);
    (m.dots || (b ? P.map((_, j) => j) : [])).forEach((j) => {
      const F = fx[j];
      if (!F) return;
      const yv = F.c.f(m.x), py = F.Y(yv);
      dots += `<circle class="${b ? 'db' : 'dr'}" cx="${q(x)}" cy="${q(py)}" r="${b ? 5 : 4}"/>`;
      const v = b && m.vals?.[j];
      if (!v) return;
      // label on the side the curve leaves empty: rising curve -> left of the point, falling -> right
      const d = span / 100, rising = F.c.f(m.x + d) > F.c.f(m.x - d), w = tw(v, 11);
      let left = rising;
      if (!left && x + 9 + w > W - R - 2) left = true;
      if (left && x - 9 - w < L + 2) left = false;
      over += text(left ? x - 9 : x + 9, py - F.y0 > 20 ? py - 8 : py + 17, esc(v), 'vb h', left ? ' text-anchor="end"' : '');
    });
  });
  const xh = `<g class="xh" style="display:none"><path class="xhl"/>${P.map(() => '<circle class="xhd" r="4.5"/>').join('')}${bug}</g>`;
  return {
    inner: defs(id) + grid + zone + body + mk + xAxis(xa, X, y, W, L, R, H, s.x) + over + dots + xh,
    w: W, h: H, geo: { w: W, xs: rows.map((r) => X(r[xk])), ys, top: top + ROW, bot: y, L, R },
  };
}

/**
 * Mission profile: electrical power against time with a solid phase strip under the plot (figure 5).
 * s = { phases:[{label,t0,t1,w,color,reserve,st}] (t in min, w in W; st = striped variant of the colour), mark?:{x,label}, x:{label,unit} }
 */
export function phases(s, W, id) {
  const narrow = W < 440, L = narrow ? 46 : 52, R = narrow ? 12 : 18, BAND = 7, B = 36 + BAND + 4, ROW = 19, ph = s.phases;
  const xa = nice(0, Math.max(...ph.map((p) => p.t1)), Math.max(3, Math.round((W - L - R) / 84)));
  xa.hi = Math.max(...ph.map((p) => p.t1));
  const X = (v) => L + (Math.min(xa.hi, Math.max(0, v)) / xa.hi) * (W - L - R);
  const lab = ph.map((p) => esc(p.label.toUpperCase()));
  const inside = ph.map((p, i) => X(p.t1) - X(p.t0) >= tw(p.label) + 14);
  const items = [], who = [];
  ph.forEach((p, i) => { if (!inside[i]) { items.push(flagAt(X((p.t0 + p.t1) / 2), tw(p.label) + 2, W)); who.push(i); } });
  if (s.mark && fin(s.mark.x)) { items.push(flagAt(X(s.mark.x), tw(s.mark.label) + 2, W)); who.push(-1); }
  const { pos, n } = pack(items, 2, W - 2, 4), top = 6 + n * 15; // 4 lanes: a wing profile has up to 6 short phases
  const H = Math.round(Math.min(Math.max(W * 0.62, 260), 400)), y0 = top + ROW, y1 = H - B, h = y1 - y0;
  const ya = nice(0, Math.max(...ph.map((p) => p.w)) * 1.12, Math.max(2, Math.floor(h / 30)));
  const Y = (v) => y1 - (v / ya.hi) * h;
  const xt = steps(xa, xa.step), xm = X(xa.minor) - L >= 7 ? steps(xa, xa.minor) : [], ym = Y(0) - Y(ya.minor) >= 6 ? steps(ya, ya.minor) : [];
  const stc = [...new Set(ph.filter((p) => p.st && !p.reserve).map((p) => p.color))];
  const stripes = stc.map((c, k) => `<pattern id="${id}-s${k}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M1 0V4" stroke="${c}" stroke-width="2"/></pattern>`).join('');
  let out = defs(id).replace('</defs>', `${stripes}</defs>`) + xm.map((v) => `<path class="mn" d="M${q(X(v))} ${y0}V${q(y1)}"/>`).join('') + ym.map((v) => `<path class="mn" d="M${L} ${q(Y(v))}H${W - R}"/>`).join('') +
    xt.map((v) => `<path class="mj" d="M${q(X(v))} ${y0}V${q(y1)}"/>`).join('') +
    steps(ya, ya.step).map((v) => `<path class="mj" d="M${L} ${q(Y(v))}H${W - R}"/>` + text(L - 6, Y(v) + 4, tick(v, ya), 'tk', ' text-anchor="end"')).join('');
  let trace = '', dash = '', over = '';
  const segs = ph.map((p, i) => {
    const a = X(p.t0), b = X(p.t1), wd = Math.max(1.5, b - a - 2), x0 = (a + b) / 2 - wd / 2, ty = Y(p.w);
    const st = p.st && !p.reserve, fill = p.reserve ? `fill="url(#${id}-r)"` : st ? `fill="url(#${id}-s${stc.indexOf(p.color)})"` : `fill="${p.color}"`;
    const cls = p.reserve ? ' rs' : st ? ' st' : '';
    out += `<rect class="pw${cls}" data-i="${i}" x="${q(x0)}" y="${q(ty)}" width="${q(wd)}" height="${q(y1 - ty)}" ${fill}/>` +
      `<rect class="pb${cls}" data-i="${i}" x="${q(x0)}" y="${q(y1 + 4)}" width="${q(wd)}" height="${BAND}" rx="1.5" ${fill}${st ? ` stroke="${p.color}"` : ''}/>`;
    const seg = `${i && !p.reserve ? 'V' : `M${q(a)} ${q(i ? Y(ph[i - 1].w) : ty)}V`}${q(ty)}H${q(b)}`;
    if (p.reserve) dash += seg; else trace += seg;
    if (inside[i]) {
      const room = y1 - ty >= 38;
      over += text(x0 + 7, room ? ty + 16 : ty - 20, lab[i], 'phl h') + text(x0 + 7, room ? ty + 30 : ty - 7, `${fmt(p.w)} W`, 'phv h');
    }
    return { x0: a, x1: b, cx: (a + b) / 2, top: ty };
  });
  out += `<rect class="fr" x="${L}" y="${y0}" width="${W - L - R}" height="${q(h)}"/><path class="cv" d="${trace}"/>${dash ? `<path class="cv dsh" d="${dash}"/>` : ''}`;
  who.forEach((i, k) => {
    const { x0, lane } = pos[k];
    if (lane < 0) return;
    const base = top - 6 - lane * 15, b = i < 0, x = b ? X(s.mark.x) : segs[i].cx;
    out += `<path class="${b ? 'bd' : 'ld'}" d="M${q(x)} ${q(base - 8)}V${q(b ? y1 : segs[i].top)}"/>`;
    over += text(x0 + 1, base, b ? esc(caps(s.mark.label)) : lab[i], `fl h${b ? ' b' : ''}`);
  });
  out += xAxis(xa, X, y1 + BAND + 4, W, L, R, H, s.x) + text(L, y0 - 6, 'POWER' + unit('W'), 'pl h') + over;
  return { inner: out, w: W, h: H, geo: { w: W, segs, top: y0, bot: y1 } };
}

/**
 * Weight statement: one tall segmented bar (28 px), group brackets above, mass scale below (figure 6).
 * s = { parts:[{label,g,color}], groups:[{label,a,b}] (a..b in grams from the left), total }
 */
export function massBar(s, W) {
  const L = 2, R = 16, BAR = 28, X = (g) => L + (g / s.total) * (W - L - R);
  const gl = s.groups.map((g) => `${g.label} ${fmt(g.b - g.a)} g`);
  const { pos, n } = pack(s.groups.map((g, i) => ({ x0: (X(g.a) + X(g.b)) / 2 - (tw(gl[i]) + 2) / 2, w: tw(gl[i]) + 2 })), 2, W - R);
  const by = 14 + n * 15, H = by + BAR + 42;
  let out = '', a = 0;
  s.groups.forEach((g, i) => {
    const xa = X(g.a) + 1, xb = X(g.b) - 1, { x0, lane } = pos[i], base = by - 12 - Math.max(0, lane) * 15, cx = (xa + xb) / 2;
    out += `<path class="br" d="M${q(xa)} ${by - 3}V${by - 8}H${q(xb)}V${by - 3}"/>`;
    if (lane < 0) return;
    if (lane > 0) out += `<path class="ld" d="M${q(cx)} ${q(base + 3)}V${by - 8}"/>`;
    out += text(x0 + 1, base, esc(caps(gl[i])), 'fl h');
  });
  const segs = s.parts.map((p, i) => {
    const x0 = X(a), x1 = X(a + p.g), wd = Math.max(1.5, x1 - x0 - 2), pct = `${fmt((p.g / s.total) * 100)}%`;
    a += p.g;
    out += `<rect class="sg" data-i="${i}" x="${q(x0 + 1)}" y="${by}" width="${q(wd)}" height="${BAR}" rx="3" fill="${p.color}"/>`;
    const full = `${p.label.toUpperCase()} ${pct}`, t = wd >= tw(full) + 12 ? full : wd >= tw(pct) + 10 ? pct : '';
    if (t) out += text(x0 + 7, by + 18, esc(t), 'sl');
    return { x0, x1, cx: (x0 + x1) / 2, top: by };
  });
  const ga = nice(0, s.total, Math.max(2, Math.round((W - L - R) / 90))), end = X(s.total);
  out += steps(ga, ga.step).filter((v) => v < s.total && X(v) < end - 60).map((v) => `<path class="tm" d="M${q(X(v))} ${by + BAR + 2}v5"/>` +
    text(Math.max(X(v), L + 4), by + BAR + 18, tick(v, ga), 'tk', v ? ' text-anchor="middle"' : '')).join('') +
    `<path class="bd" d="M${q(end - 0.75)} ${by - 2}V${by + BAR + 9}"/>` + text(end, by + BAR + 34, `TAKEOFF ${fmt(s.total)} g`, 'vb', ' text-anchor="end"');
  return { inner: out, w: W, h: H, geo: { w: W, segs, top: by, bot: by + BAR } };
}

/** General arrangement, top view (nose up), to scale from span and wing area; fuselage, booms and tail are schematic.
 *  o = { kind:'quadplane'|'tilt'|'wing', liftIn (rotor prop), pushIn (pusher prop), propIn (wing motor prop), tiltDeg, W } */
export function planform(v, o = {}) {
  const W = o.W || 260, kind = o.kind || 'quadplane', span = v.wingspanMm, s = (W - 20) / span, cx = W / 2, c = ((v.wingAreaDm2 * 1e4) / span) * s, hx = (span / 2) * s;
  const dim = (wy) => `<path class="ext" d="M${q(cx - hx)} ${q(wy - 3)}V8M${q(cx + hx)} ${q(wy - 3)}V8"/><path class="dim" d="M${q(cx - hx)} 13H${q(cx + hx)}M${q(cx - hx - 4)} 17l8 -8M${q(cx + hx - 4)} 17l8 -8"/>` +
    text(cx, 10, `SPAN ${fmt(span)} mm`, 'fl h', ' text-anchor="middle"');
  const svg = (H, body) => `<svg class="pf-ga-svg" viewBox="0 0 ${W} ${Math.round(H)}" width="${W}" height="${Math.round(H)}" role="img" aria-label="Planform to scale: span ${fmt(span)} mm, mean chord ${fmt(c / s)} mm, aspect ratio ${fmt(v.aspectRatio, 1)}.">${body}</svg>`;
  const wing = (wy) => `<rect class="wg" x="${q(cx - hx)}" y="${q(wy)}" width="${q(2 * hx)}" height="${q(c)}" rx="2"/>`;
  if (kind === 'wing') { // conventional layout: fuselage ~0.6 span, wing at a quarter of it, tail at the end, tractor prop at the nose
    const fl = 0.6 * span * s, fw = Math.max(5, 0.05 * span * s), ny = 30, wy = ny + 0.22 * fl, tc = 0.7 * c, th = 0.17 * span * s, ty = ny + fl - tc;
    const pw = Math.max(10, (o.propIn || 10) * 25.4 * s);
    return svg(ny + fl + 10, dim(wy) + wing(wy) +
      `<rect class="wg" x="${q(cx - th)}" y="${q(ty)}" width="${q(2 * th)}" height="${q(tc)}" rx="1.5"/>` +
      `<rect class="fs" x="${q(cx - fw / 2)}" y="${q(ny + 2)}" width="${q(fw)}" height="${q(fl - 2)}" rx="${q(fw / 2)}"/>` +
      `<path class="fn" d="M${q(cx)} ${q(ty - 0.4 * tc)}V${q(ny + fl + 4)}"/><path class="pu" d="M${q(cx - pw / 2)} ${q(ny)}H${q(cx + pw / 2)}"/>`);
  }
  const rr = Math.max(4, ((o.liftIn || 12) * 25.4 * s) / 2), bx = 0.3 * hx, fw = Math.max(5, 0.065 * span * s);
  const fy = 28 + rr, wy = fy + rr + 6, ry = wy + c + 6 + rr, H = ry + rr + 8, ty = ry + rr * 0.7;
  const pos = [[-1, fy], [1, fy], [-1, ry], [1, ry]];
  let body = dim(wy) + wing(wy) + `<path class="bm" d="M${q(cx - bx)} ${q(fy)}V${q(ry)}M${q(cx + bx)} ${q(fy)}V${q(ry)}"/>` +
    `<rect class="fs" x="${q(cx - fw / 2)}" y="${q(fy - rr * 0.5)}" width="${q(fw)}" height="${q(ty - fy + rr * 0.5)}" rx="${q(fw / 2)}"/>` +
    pos.map(([k, yy]) => `<circle class="rt" cx="${q(cx + k * bx)}" cy="${q(yy)}" r="${q(rr)}"/><circle class="hb" cx="${q(cx + k * bx)}" cy="${q(yy)}" r="2"/>`).join('');
  if (kind !== 'tilt') {
    const pw = Math.max(8, (o.pushIn || 10) * 25.4 * s);
    return svg(H, body + `<path class="pu" d="M${q(cx - pw / 2)} ${q(ty + 3)}H${q(cx + pw / 2)}"/>`);
  }
  // tilt axes through each rotor pair, then a side-view inset: rotor disc at hover (ghost) and tilted by tiltDeg toward the nose (left)
  body += [fy, ry].map((yy) => `<path class="ax" d="M${q(cx - bx - rr - 6)} ${q(yy)}H${q(cx + bx + rr + 6)}"/>`).join('');
  const deg = fin(o.tiltDeg) ? Math.max(0, Math.min(120, o.tiltDeg)) : 90, a = (deg * Math.PI) / 180, px = cx - 30, py = H + 52, L = 26, R2 = 20;
  const tip = [px - L * Math.sin(a), py - L * Math.cos(a)], disc = (x, y, ang) => `M${q(x - R2 * Math.cos(ang))} ${q(y + R2 * Math.sin(ang))}L${q(x + R2 * Math.cos(ang))} ${q(y - R2 * Math.sin(ang))}`;
  const arc = `M${q(px)} ${q(py - 15)}A15 15 0 0 0 ${q(px - 15 * Math.sin(a))} ${q(py - 15 * Math.cos(a))}`;
  body += `<path class="ext" d="M8 ${q(H + 4)}H${W - 8}"/><path class="wg" d="M${q(px - 6)} ${q(py + 4)}H${q(px + 44)}"/>` +
    `<path class="ext" d="M${q(px)} ${q(py)}V${q(py - L)}"/><path class="rt" d="${disc(px, py - L, 0)}"/>` +
    `<path class="bm" d="M${q(px)} ${q(py)}L${q(tip[0])} ${q(tip[1])}"/><path class="pu" d="${disc(tip[0], tip[1], a)}"/><path class="dim" d="${arc}"/><circle class="hb" cx="${q(px)}" cy="${q(py)}" r="2.5"/>` +
    text(px + 52, py - 16, `TILT ${fmt(deg)}°`, 'fl h') + text(px + 52, py - 2, 'SIDE VIEW', 'fl h');
  return svg(py + 26, body);
}
