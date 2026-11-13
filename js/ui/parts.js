// Parts list, option expanders, BOM table and BOM dock. Pure string builders; every text value is escaped.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Display order (SPEC-v3 4): frame, airframe (vtol / fixedwing / tilt), motor, pusher, esc, fc, battery, prop, servo, camera, extras, then any other category.
export const ORDER = ['frame', 'vtol', 'fixedwing', 'tilt', 'motor', 'pusher', 'esc', 'fc', 'battery', 'prop', 'servo', 'camera', 'extras'];
const LABEL = { frame: 'Frame', vtol: 'VTOL airframe', fixedwing: 'Fixed-wing airframe', tilt: 'Tilt mechanism and servos', motor: 'Motors', pusher: 'Pusher motor', esc: 'ESC', fc: 'Flight controller', battery: 'Battery', prop: 'Propellers', servo: 'Servos', camera: 'Camera', extras: 'Extras', vtx: 'Video transmitter', gps: 'GPS', radio: 'Radio link', payload: 'Payload gear', sensor: 'Sensors' };
// Category colour, one tone per family (main.css tokens): airframe slate, propulsion blue, electronics teal, power mustard, payload rust, extras ink.
export const TONE = { frame: "slate", vtol: "slate", fixedwing: "slate", tilt: "slate", servo: "slate", motor: "blue", pusher: "blue", prop: "blue", esc: "teal", fc: "teal", battery: "mustard", camera: "accent", vtx: "accent", gps: "accent", radio: "accent", sensor: "accent", payload: "accent" };
const tone = (k) => (Object.hasOwn(TONE, k) ? TONE[k] : "ink");
// Headings that depend on the airframe kind: 'multi' | 'vtol' | 'tiltrotor' | 'fixedwing' (true still means vtol).
const BY_KIND = {
  vtol: { motor: 'Lift motors', servo: 'Control-surface servos' },
  tiltrotor: { vtol: 'Tiltrotor airframe', motor: 'Tilting motors (hover and cruise)', servo: 'Control-surface servos' },
  fixedwing: { motor: 'Motor', pusher: 'Main motor', prop: 'Propeller', servo: 'Control-surface servos' },
};
export const catLabel = (k, kind) => { const by = BY_KIND[kind === true ? 'vtol' : kind]; return (by && Object.hasOwn(by, k) && by[k]) || (Object.hasOwn(LABEL, k) && LABEL[k]) || k.charAt(0).toUpperCase() + k.slice(1); };
// Pack-sold parts (item.packOf > 1): qty counts packs, item.units the pieces needed. null for single parts.
const NOUN = { prop: 'props', motor: 'motors', servo: 'servos', tilt: 'servos', esc: 'ESCs', battery: 'packs' };
export function pack(it, q, key) {
  if (!(it?.packOf > 1)) return null;
  const n = q * it.packOf, need = Number.isFinite(it.units) && it.units !== n ? `, ${it.units} needed` : '';
  return { sets: `set of ${it.packOf}`, pcs: `${n} ${NOUN[key] || 'pieces'}${need}` };
}

function need(key, rq) {
  const q = rq && (key === 'servo' ? rq.servo || rq.vtol : key === 'fixedwing' ? rq.wing : rq[key]);
  if (!q) return '';
  const r = Math.round;
  const m = {
    frame: () => `${q.minSizeMm}-${q.maxSizeMm} mm, ${q.material}, ${q.configuration}`,
    vtol: () => `${r(q.minSpanMm)}-${r(q.maxSpanMm)} mm span, ≥ ${q.minAreaDm2} dm² wing, AUW ≤ ${q.maxAuwKg} kg`,
    fixedwing: () => `${r(q.minSpanMm)}-${r(q.maxSpanMm)} mm span, ≥ ${q.minAreaDm2} dm² wing, AUW ≤ ${q.maxAuwKg} kg`,
    tilt: () => `${q.servoCount} tilt servos${Number.isFinite(q.minTorqueKgcm) ? `, ≥ ${q.minTorqueKgcm} kg·cm torque` : ''}`,
    motor: () => `${q.statorMm} stator class, ${q.kvMin}-${q.kvMax} KV, ≥ ${r(q.minThrustG)} g thrust each, x${q.count}`,
    pusher: () => `${q.statorMm} stator class, ${q.kvMin}-${q.kvMax} KV, ≥ ${r(q.minThrustG)} g thrust, ${q.propInch} in prop`,
    esc: () => `≥ ${r(q.minContinuousA)} A, ${q.minCells}-${q.maxCells}S, ${q.protocol}`,
    battery: () => `${q.cells}S, ${r(q.minMah)}-${r(q.maxMah)} mAh, ≥ ${q.minC}C, ${q.chemistry}`,
    prop: () => `${q.inch} inch`,
    fc: () => `≥ ${q.minMotorOutputs} motor outputs${q.needsGps ? ', GPS' : ''}`,
    servo: () => `${q.count ?? q.servoCount} servos`,
    camera: () => `${q.kind || 'any'} camera, ≤ ${r(q.maxWeightG)} g`,
  }[key];
  return m ? m() : '';
}

// Matcher may flag a category as unfilled via rec.incomplete / rec.missing (array of cats or {cat: reason}) and rec.closest[cat].
const flag = (x, k) => (Array.isArray(x) ? x.includes(k) : x && typeof x === 'object' ? !!x[k] : false);
function gaps(rec, k) {
  if (!rec) return { miss: false, reason: '', items: [] };
  const miss = flag(rec.incomplete, k) || flag(rec.missing, k);
  const r = rec.missing && rec.missing[k];
  const reason = typeof r === 'string' ? r : Array.isArray(r) ? r.join('; ') : '';
  const cl = rec.closest && rec.closest[k];
  return { miss, reason, items: Array.isArray(cl) && cl.length ? cl : miss ? rec[k] || [] : [] };
}

const AIR = ['frame', 'vtol', 'fixedwing', 'tilt', 'motor', 'pusher'];
// Section keys: recommended categories (main), the extras' own categories, then option-only categories from listOptions.
export function sections(rec, opts) {
  // ESC stays a main category whenever the build has motors: a motor swap can drop a built-in ESC (SPEC-v4 round 1 #1).
  const main = ORDER.filter((k) => k !== 'extras' && (rec?.[k]?.length || gaps(rec, k).miss || (k === 'esc' && (rec?.motor?.length || rec?.pusher?.length))));
  const extra = [...new Set((rec?.extras || []).map((i) => i.category))];
  const rest = Object.keys(opts || {}).filter((k) => !main.includes(k) && opts[k]?.length);
  // Airframe and motor categories the matcher left out belong to another configuration: list them, never select them.
  const offK = (k) => !!rec && AIR.includes(k) && !extra.includes(k);
  const other = rest.filter((k) => !offK(k)), off = rest.filter(offK);
  return { main, other, off, all: [...new Set([...main, ...extra, ...other])] };
}

export const listed = (it) => it.localListing ?? (it.links || []).some((l) => l.local && l.kind === 'product');

// One link per store, no near-identical URLs. localLinks already orders: local product, local search, global.
export function links(list, max = 3) {
  const seenS = new Set(), seenU = new Set();
  return (list || []).filter((l) => {
    const u = String(l.url).toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, ''), st = String(l.store).toLowerCase();
    if (seenU.has(u) || seenS.has(st)) return false;
    seenU.add(u); seenS.add(st); return true;
  }).slice(0, max);
}
export const linkLabel = (l) => (l.kind === 'search' ? 'Search ' : '') + l.store;
const linkBtns = (list, max) => `<span class="lk">${links(list, max).map((l) => `<a class="btn sm buy" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(linkLabel(l))}<span class="sr"> (opens in new tab)</span></a>`).join('')}</span>`;
const linkTxt = (list, max) => `<span class="lk lt"><span class="lt-h">Buy:</span>${links(list, max).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(linkLabel(l))}<span class="sr"> (opens in new tab)</span></a>`).join('')}</span>`;
const badge = (it, c) => (listed(it) ? `<span class="badge on">Listed ${esc(c.where)}</span>` : `<span class="badge">Search ${esc(c.where)}</span>`);
const selBtn = (key, it, on) => `<button type="button" class="sel" data-cat="${esc(key)}" data-id="${esc(it.id)}" aria-pressed="${on}" aria-label="Select ${esc(it.brand)} ${esc(it.name)}"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13"/><path d="M4.5 8.2l2.4 2.4 4.6-5.2"/></svg>Select</button>`;
export const CHEV = '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5"/></svg>';

// Plain-language explainers (SPEC-v4 9): [term for the "What is ..?" label, 1-2 sentences].
export const GLOSSARY = {
  kv: ['KV', 'KV is how many RPM a motor turns per volt with no load. Low KV spins big props slowly and efficiently; high KV spins small props fast.'],
  cells: ['S (cells)', 'S is the number of battery cells in series: 1S is about 3.7 V, so a 6S pack is about 22 V. Every part on the power side must be rated for it.'],
  c: ['C rating', 'C rating says how fast a pack can be drained: 50C on a 2 Ah pack claims 100 A. Labels are optimistic, so keep peak current under about 70% of it.'],
  twr: ['thrust : weight', 'Thrust to weight is full-throttle thrust divided by takeoff weight. 2:1 hovers and handles wind; racing quads run 7:1 or more.'],
  hover: ['hover thrust', 'Hover thrust is the share of full thrust needed just to hold height (100 ÷ thrust : weight). Builders aim for 45-50%; the throttle reads higher because thrust grows with about the square of throttle.'],
  wh: ['mAh vs Wh', 'mAh is charge at the pack voltage; Wh is the energy (mAh x volts / 1000). Compare packs of different cell counts by Wh, not mAh.'],
  stator: ['stator size', 'Stator size is the motor core width and height in mm: 2306 is 23 mm wide, 6 mm tall. A bigger stator gives more torque for bigger props.'],
};
export const gl = (k) => (GLOSSARY[k] ? `<details class="gl"><summary aria-label="What is ${esc(GLOSSARY[k][0])}?">?</summary><p>${esc(GLOSSARY[k][1])}</p></details>` : '');

// Swap effect against the category's best pick (SPEC-v4 8): weight x pieces and price x qty. dir: up = heavier and/or dearer, down = lighter
// and/or cheaper, same = no change or a mixed trade. c = { qty(key, it), money(usd) }.
const massG = (it, key, c) => { const q = it.qty ?? c.qty(key, it); return (Number(it.weightG) || 0) * (Number.isFinite(it.units) ? it.units : it.packOf > 1 ? q * it.packOf : q); };
// Motors: a built-in ESC on one side only adds (or saves) the best ESC option's weight and price, noted "incl. ESC".
export function delta(it, best, key, c) {
  if (!best || best.id === it.id) return null;
  const esc0 = key === 'motor' ? c.rec?.esc?.[0] : null, ie = (x) => !!x.specs?.integratedEsc, sideE = esc0 ? Number(ie(best)) - Number(ie(it)) : 0;
  const dg = Math.round(massG(it, key, c) - massG(best, key, c) + sideE * massG(esc0 || {}, 'esc', c));
  const dp = (it.qty ?? c.qty(key, it)) * it.priceUsd - (best.qty ?? c.qty(key, best)) * best.priceUsd + (sideE ? sideE * (esc0.qty ?? c.qty('esc', esc0)) * esc0.priceUsd : 0);
  const sg = Math.sign(dg), sp = Math.abs(dp) < 0.005 ? 0 : Math.sign(dp), sign = (s) => (s < 0 ? '−' : '+');
  const dir = sg >= 0 && sp >= 0 && sg + sp > 0 ? 'up' : sg <= 0 && sp <= 0 && sg + sp < 0 ? 'down' : 'same';
  return { dir, text: `${sign(sg)}${Math.abs(dg)} g · ${sign(sp)}${c.money(Math.abs(dp))}${sideE ? ' incl. ESC' : ''}` };
}
// Spec lines that use jargon get their explainers (a div, since <details> cannot sit inside a <p>).
const NEED_GL = { motor: gl('kv') + gl('stator'), pusher: gl('kv') + gl('stator'), battery: gl('cells') + gl('c') + gl('wh') };
const deltaHtml = (d) => (d ? ` <span class="delta" data-dir="${d.dir}" title="Against the best pick">${esc(d.text)}</span>` : '');

function card(it, i, key, c, miss, extra) {
  const on = c.sel[key] === it.id, best = !miss && !extra && i === 0;
  const q = it.qty ?? c.qty(key, it), pk = pack(it, q, key);
  const rk = miss ? '~' : extra ? '+' : 'ABC'[i] || i + 1;
  const tag = miss ? '<b class="tag">Closest, not a full match</b> ' : best ? '<b class="tag">Best pick</b> ' : '';
  return `<li class="it${on ? ' on' : ''}${best ? ' best' : ''}">
<span class="rk" title="${miss ? 'Closest option' : extra ? 'Extra' : best ? 'Best pick' : 'Alternate'}">${rk}</span>
<div class="it-m"><div class="nm">${esc(it.name)}</div><div class="meta">${tag}${extra ? esc(catLabel(key, c.kind)) + ' &middot; ' : ''}${esc(it.brand)} &middot; ${esc(it.weightG)} g${miss || extra || best ? '' : deltaHtml(delta(it, c.rec?.[key]?.[0], key, c))}</div></div>
<div class="pr"><b>${c.money(q * it.priceUsd)}</b>${pk ? `<small>${q} &times; ${esc(pk.sets)} (${esc(pk.pcs)})</small><small>${c.money(it.priceUsd)} per set</small>` : q > 1 ? `<small>${q} &times; ${c.money(it.priceUsd)}</small>` : ''}</div>
<div class="it-f">${badge(it, c)}${selBtn(key, it, on)}</div>${linkTxt(it.links, 3)}</li>`;
}

function optRow(it, key, c, ro) {
  const on = !ro && c.sel[key] === it.id;
  return `<li class="opt${on ? ' on' : ''}"><div class="o-m"><span class="nm">${esc(it.name)}</span><span class="meta">${esc(it.brand)} &middot; ${esc(it.weightG)} g${ro ? '' : deltaHtml(delta(it, c.rec?.[key]?.[0], key, c))}</span></div><b class="pr">${c.money(it.priceUsd)}</b><div class="o-f">${badge(it, c)}${ro ? '' : selBtn(key, it, on)}</div>${linkTxt(it.links, 3)}</li>`;
}

// ro = read-only list (no Select), for categories that do not belong to this build.
function more(key, c, ro) {
  const list = c.optsFor(key);
  // A category in the build lists swaps for its pick: "Similar parts"; the rest stay a plain option list.
  const head = !ro && c.sec?.main?.includes(key) ? `Similar parts (${list.length}) ${esc(c.where)}` : `All ${list.length} option${list.length === 1 ? '' : 's'} ${esc(c.where)}`;
  return list.length ? `<details class="more"><summary>${CHEV}${head}</summary><ul class="opts">${list.map((it) => optRow(it, key, c, ro)).join('')}</ul></details>` : '';
}

export function section(key, c) {
  const g = gaps(c.rec, key), list = g.miss ? g.items : c.rec[key] || [], n = need(key, c.req);
  const gap = g.miss ? `<p class="nopart"><b>No off-the-shelf part found</b>${g.reason ? ': ' + esc(g.reason) : ' that meets this spec.'}${list.length ? ' Closest options below, check fit before buying.' : ''}</p>` : '';
  const fb = (c.rec.regionFallback || []).includes(key) ? `<p class="fb">No local listing ${esc(c.where)}. Showing parts that ship internationally.</p>` : '';
  // ESC: follows the picked (else best) motor; options stay selectable for a motor swap.
  const free = key === 'esc' && c.escFree ? `<p class="fb">Not needed: built into ${esc(c.motor.brand)} ${esc(c.motor.name)}. Pick one only if you change to a motor without one.</p>` : '';
  return `<section class="cat${g.miss ? ' gap' : ''}" id="cat-${esc(key)}" tabindex="-1"><h4 data-tone="${tone(key)}">${esc(catLabel(key, c.kind))}</h4>${n ? `<div class="need">Spec: ${esc(n)}${NEED_GL[key] || ''}</div>` : ''}${free}${gap}${fb}${list.length ? `<ul class="items">${list.map((it, i) => card(it, i, key, c, g.miss)).join('')}</ul>` : ''}${more(key, c)}</section>`;
}

// c = { rec, req, opts, sec, sel, money, where, kind, qty(key,item), optsFor(key), note }
export function partsHtml(c) {
  // The matcher's "ESC built into ..." note follows its best motor; the ESC section says it for the picked motor instead.
  const { rec, sec } = c, t = rec?.totalUsd, ex = rec?.extras || [], notes = [...new Set(rec?.notes || [])].filter((x) => !/^ESC built into /.test(x));
  const miss = sec.main.some((k) => gaps(rec, k).miss);
  return `${t ? `<div class="tot"><span>Estimated parts total, A picks to C picks${miss ? '. Closest options included' : ''}</span><b>${c.money(t.low)} &ndash; ${c.money(t.high)}</b></div>` : ''}
${c.note ? `<p class="fx">${esc(c.note)}</p>` : ''}
<div class="cats">${sec.main.map((k) => section(k, c)).join('')}${ex.length ? `<section class="cat wide" id="cat-extras" tabindex="-1"><h4>Extras</h4><p class="need">Mission add-ons, one pick per category.</p><ul class="items">${ex.map((it, i) => card(it, i, it.category, c, false, true)).join('')}</ul></section>` : ''}</div>
${sec.other.length ? `<div class="others"><h4>More categories</h4><div class="o-grid">${sec.other.map((k) => `<section class="cat mini" id="cat-${esc(k)}" tabindex="-1"><h5 data-tone="${tone(k)}">${esc(catLabel(k, c.kind))}</h5>${more(k, c)}</section>`).join('')}</div></div>` : ''}
${sec.off?.length ? `<div class="others off"><h4>Other parts (not for this build)</h4><p class="need">For reference only: these fit other configurations, so they cannot be selected here.</p><div class="o-grid">${sec.off.map((k) => `<section class="cat mini" id="cat-${esc(k)}" tabindex="-1"><h5 data-tone="${tone(k)}">${esc(catLabel(k))}</h5>${more(k, c, true)}</section>`).join('')}</div></div>` : ''}
${notes.length ? `<ul class="notes">${notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
}

const sum = (rows) => rows.reduce((a, r) => a + r.line, 0);
const budgetLine = (total, b, c) => `${total <= b ? 'Under' : 'Over'} budget by ${c.money(Math.abs(b - total))}`;

// rows = [{ key, label, it, qty, line }] in category order.
export function bomHtml(rows, c) {
  if (!rows.length) return `<p class="empty">Nothing selected yet. Press <b>Select</b> on one part per category to build the bill of materials. Without a selection, Export PDF lists every option ${esc(c.where)}.</p>`;
  const total = sum(rows), b = c.budgetUsd;
  return `<table class="bomt"><thead><tr><th scope="col">Category</th><th scope="col">Part</th><th scope="col" class="n">Qty</th><th scope="col" class="n">Unit</th><th scope="col" class="n">Line</th><th scope="col">Links</th></tr></thead>
<tbody>${rows.map((r) => `<tr><td class="c" data-tone="${tone(r.key)}">${esc(r.label)}</td><th scope="row" class="p">${esc(r.it.name)}<small>${esc(r.it.brand)}</small></th><td class="n q" data-l="Qty">${r.pack ? `${r.qty} &times; ${esc(r.pack.sets)}<small>${esc(r.pack.pcs)}</small>` : r.qty}</td><td class="n u" data-l="Unit">${c.money(r.it.priceUsd)}</td><td class="n l">${c.money(r.line)}</td><td class="k">${linkBtns(r.it.links, 3)}</td></tr>`).join('')}</tbody>
<tfoot><tr class="sum"><th scope="row" colspan="4">Total</th><td class="n">${c.money(total)}</td><td class="k"></td></tr>${b != null ? `<tr class="bud ${total <= b ? 'ok' : 'bad'}"><th scope="row" colspan="4">Budget ${c.money(b)}</th><td class="n" colspan="2">${budgetLine(total, b, c)}</td></tr>` : ''}</tfoot></table>`;
}

// Compact summary for the dock: every recommended category, then any other selected one.
export function dockHtml(rows, c) {
  if (!rows.length) return '<p class="d-empty">Pick parts to build a BOM</p>';
  const total = sum(rows), b = c.budgetUsd, by = Object.fromEntries(rows.map((r) => [r.key, r]));
  const keys = [...c.sec.main, ...rows.map((r) => r.key).filter((k) => !c.sec.main.includes(k))];
  return `<p class="d-tot"><span>Total &middot; ${rows.length} selected</span><b>${c.money(total)}</b></p>
${b != null ? `<p class="d-bud ${total <= b ? 'ok' : 'bad'}">${budgetLine(total, b, c)}</p>` : ''}
<ol class="d-list">${keys.map((k) => { const r = by[k]; return `<li${r ? ' class="on"' : ''}><a href="#cat-${esc(k)}" data-tone="${tone(k)}">${esc(catLabel(k, c.kind))}</a><span>${r ? esc(r.it.name) : k === 'esc' && c.escFree ? 'Built into the motor' : 'Not selected'}</span><b>${r ? c.money(r.line) : ''}</b></li>`; }).join('')}</ol>`;
}

// Spreadsheet formula guard: a pasted line starting with = + - @ gets a leading apostrophe.
const cell = (s) => (/^\s*[=+\-@]/.test(s) ? "'" + s : s);
export function copyText(rows, c) {
  if (rows.length) {
    const out = [`DRONECALC BILL OF MATERIALS${c.name ? `: ${c.name}` : ''}`];
    for (const r of rows) {
      out.push(`${r.label}: ${r.it.brand} ${r.it.name} - ${r.qty} x ${r.pack ? `${r.pack.sets} (${r.pack.pcs}) at ` : ''}${c.money(r.it.priceUsd)} = ${c.money(r.line)}`);
      links(r.it.links, 3).forEach((l) => out.push(`   ${linkLabel(l)}: ${l.url}`));
    }
    out.push(`Total: ${c.money(sum(rows))}`);
    return out.map(cell).join('\n');
  }
  const out = [`DRONECALC PARTS LIST${c.name ? `: ${c.name}` : ''}`];
  for (const k of c.sec.main) {
    const g = gaps(c.rec, k);
    (g.miss ? g.items : c.rec[k] || []).forEach((it, i) => {
      out.push(`${catLabel(k, c.kind)}${g.miss ? ' (closest, not a full match)' : ' (' + ('ABC'[i] || i + 1) + ')'}: ${it.brand} ${it.name} - ${c.money(it.priceUsd)}`);
      links(it.links, 3).forEach((l) => out.push(`   ${linkLabel(l)}: ${l.url}`));
    });
  }
  (c.rec?.extras || []).forEach((it) => out.push(`Extra, ${catLabel(it.category)}: ${it.brand} ${it.name} - ${c.money(it.priceUsd)}`));
  if (c.rec?.totalUsd) out.push(`Total: ${c.money(c.rec.totalUsd.low)} - ${c.money(c.rec.totalUsd.high)}`);
  return out.map(cell).join('\n');
}

// CSV cell: always quoted, quotes doubled; text starting (after any whitespace) with = + - @ tab or CR gets a leading apostrophe (formula guard).
const csvCell = (v) => `"${(typeof v === 'number' ? String(v) : /^\s*[=+\-@\t\r]/.test(String(v ?? '')) ? "'" + v : String(v ?? '')).replace(/"/g, '""')}"`;
// BOM as CSV: selected rows, else the recommended A/B/C picks (Qty 1). Numbers are plain c.num values so spreadsheets can sum them.
// c adds { num(usd) -> number in c.cur, cur }. UTF-8 BOM so Excel reads non-ASCII names; CRLF per RFC 4180.
export function bomCsv(rows, c) {
  const link = (it) => links(it.links, 1)[0]?.url || '';
  const line = (label, it, q, pcs, total) => [label, it.brand, it.name, q, pcs, c.num(it.priceUsd), c.num(total), c.cur, link(it)];
  const out = [['Category', 'Brand', 'Part', 'Qty', 'Pieces', 'Unit price', 'Line total', 'Currency', 'Link']];
  if (rows.length) {
    rows.forEach((r) => out.push(line(r.label, r.it, r.qty, r.pack ? r.qty * r.it.packOf : r.qty, r.line)));
    out.push(['Total', '', '', '', '', '', c.num(sum(rows)), c.cur, '']);
  } else {
    for (const k of c.sec.main) {
      const g = gaps(c.rec, k);
      (g.miss ? g.items : c.rec?.[k] || []).forEach((it, i) => out.push(line(`${catLabel(k, c.kind)} (${g.miss ? 'closest' : 'ABC'[i] || i + 1})`, it, 1, 1, it.priceUsd)));
    }
    (c.rec?.extras || []).forEach((it) => out.push(line(`Extra, ${catLabel(it.category)}`, it, 1, 1, it.priceUsd)));
    const t = c.rec?.totalUsd;
    if (t) out.push(['Total, A picks', '', '', '', '', '', c.num(t.low), c.cur, ''], ['Total, C picks', '', '', '', '', '', c.num(t.high), c.cur, '']);
  }
  return '﻿' + out.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
