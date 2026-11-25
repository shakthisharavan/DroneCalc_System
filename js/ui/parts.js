// Parts list, option expanders, BOM table and BOM dock. Pure string builders; every text value is escaped.
import * as U from './units.js';
import { t, tf } from '../i18n/i18n.js';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Display order (SPEC-v3 4): frame, airframe (vtol / fixedwing / tilt), motor, pusher, esc, fc, battery, prop, servo, camera, extras, then any other category.
export const ORDER = ['frame', 'vtol', 'fixedwing', 'tilt', 'motor', 'pusher', 'esc', 'fc', 'battery', 'prop', 'servo', 'camera', 'extras'];
const LABEL = new Set(['frame', 'vtol', 'fixedwing', 'tilt', 'motor', 'pusher', 'esc', 'fc', 'battery', 'prop', 'servo', 'camera', 'extras', 'vtx', 'gps', 'radio', 'payload', 'sensor']); // text: cat.<id>
// Category colour, one tone per family (main.css tokens): airframe slate, propulsion blue, electronics teal, power mustard, payload rust, extras ink.
export const TONE = { frame: "slate", vtol: "slate", fixedwing: "slate", tilt: "slate", servo: "slate", motor: "blue", pusher: "blue", prop: "blue", esc: "teal", fc: "teal", battery: "mustard", camera: "accent", vtx: "accent", gps: "accent", radio: "accent", sensor: "accent", payload: "accent" };
const tone = (k) => (Object.hasOwn(TONE, k) ? TONE[k] : "ink");
// Headings that depend on the airframe kind: 'multi' | 'vtol' | 'tiltrotor' | 'fixedwing' (true still means vtol).
const BY_KIND = { vtol: ['motor', 'servo'], tiltrotor: ['vtol', 'motor', 'servo'], fixedwing: ['motor', 'pusher', 'prop', 'servo'] }; // text: cat.kind.<kind>.<id>
export const catLabel = (k, kind) => { const kd = kind === true ? 'vtol' : kind; return (Object.hasOwn(BY_KIND, kd) && BY_KIND[kd].includes(k) && t(`cat.kind.${kd}.${k}`)) || (LABEL.has(k) && t(`cat.${k}`)) || k.charAt(0).toUpperCase() + k.slice(1); };
// Pack-sold parts (item.packOf > 1): qty counts packs, item.units the pieces needed. null for single parts.
const NOUN = new Set(['prop', 'motor', 'servo', 'tilt', 'esc', 'battery']); // text: parts.noun.<id>
export function pack(it, q, key) {
  if (!(it?.packOf > 1)) return null;
  const n = q * it.packOf, noun = t(`parts.noun.${NOUN.has(key) ? key : 'pieces'}`);
  return { sets: t('parts.pack.set', { n: it.packOf }), pcs: Number.isFinite(it.units) && it.units !== n ? t('parts.pack.pcsNeed', { n, noun, units: it.units }) : t('parts.pack.pcs', { n, noun }) };
}

function need(key, rq) {
  const q = rq && (key === 'servo' ? rq.servo || rq.vtol : key === 'fixedwing' ? rq.wing : rq[key]);
  if (!q) return '';
  const r = Math.round;
  const m = {
    frame: () => t('parts.need.frame', { min: q.minSizeMm, max: q.maxSizeMm, material: q.material, configuration: q.configuration }),
    vtol: () => t('parts.need.wing', { min: r(q.minSpanMm), max: r(q.maxSpanMm), area: q.minAreaDm2, auw: q.maxAuwKg }),
    fixedwing: () => t('parts.need.wing', { min: r(q.minSpanMm), max: r(q.maxSpanMm), area: q.minAreaDm2, auw: q.maxAuwKg }),
    tilt: () => t(Number.isFinite(q.minTorqueKgcm) ? 'parts.need.tiltTorque' : 'parts.need.tilt', { n: q.servoCount, torque: q.minTorqueKgcm }),
    motor: () => t('parts.need.motor', { stator: q.statorMm, kvMin: q.kvMin, kvMax: q.kvMax, thrust: r(q.minThrustG), count: q.count }),
    pusher: () => t('parts.need.pusher', { stator: q.statorMm, kvMin: q.kvMin, kvMax: q.kvMax, thrust: r(q.minThrustG), inch: q.propInch }),
    esc: () => t('parts.need.esc', { a: r(q.minContinuousA), minCells: q.minCells, maxCells: q.maxCells, protocol: q.protocol }),
    battery: () => t('parts.need.battery', { cells: q.cells, minMah: r(q.minMah), maxMah: r(q.maxMah), c: q.minC, chemistry: q.chemistry }),
    prop: () => t('parts.need.prop', { inch: q.inch }),
    fc: () => t(q.needsGps ? 'parts.need.fcGps' : 'parts.need.fc', { n: q.minMotorOutputs }),
    servo: () => t('parts.need.servo', { n: q.count ?? q.servoCount }),
    camera: () => t('parts.need.camera', { kind: q.kind || t('parts.need.anyKind'), g: r(q.maxWeightG) }),
  }[key];
  return m ? U.text(m()) : '';
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

// A custom part (user-entered, unverified) is never "listed" anywhere, whatever the matcher says about locality.
export const listed = (it) => !it.custom && (it.localListing ?? (it.links || []).some((l) => l.local && l.kind === 'product'));
export const customTxt = () => t('parts.custom');

// One link per store, no near-identical URLs. localLinks already orders: local product, local search, global.
export function links(list, max = 3) {
  const seenS = new Set(), seenU = new Set();
  return (list || []).filter((l) => {
    const u = String(l.url).toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, ''), st = String(l.store).toLowerCase();
    if (seenU.has(u) || seenS.has(st)) return false;
    seenU.add(u); seenS.add(st); return true;
  }).slice(0, max);
}
export const linkLabel = (l) => (l.kind === 'search' ? t('parts.link.search', { store: l.store }) : l.store);
const linkBtns = (list, max) => `<span class="lk">${links(list, max).map((l) => `<a class="btn sm buy" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(linkLabel(l))}<span class="sr"> ${esc(t('parts.newTab'))}</span></a>`).join('')}</span>`;
const linkTxt = (list, max) => !links(list, max).length ? '' : `<span class="lk lt"><span class="lt-h">${esc(t('parts.buy'))}</span>${links(list, max).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(linkLabel(l))}<span class="sr"> ${esc(t('parts.newTab'))}</span></a>`).join('')}</span>`;
const badge = (it, c) => (it.custom ? `<span class="badge cust">${esc(customTxt())}</span>` : listed(it) ? `<span class="badge on">${esc(t('parts.listed', { where: c.where }))}</span>` : `<span class="badge">${esc(t('parts.search', { where: c.where }))}</span>`);
const selBtn = (key, it, on) => `<button type="button" class="sel" data-cat="${esc(key)}" data-id="${esc(it.id)}" aria-pressed="${on}" aria-label="${esc(t('parts.select.aria', { brand: it.brand, name: it.name }))}"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13"/><path d="M4.5 8.2l2.4 2.4 4.6-5.2"/></svg>${esc(t('parts.select.label'))}</button>`;
export const CHEV = '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5"/></svg>';

// Plain-language explainers (SPEC-v4 9): [term for the "What is ..?" label, 1-2 sentences].
// text: glossary.<id>.term and glossary.<id>.text; read through getters so the active language shows.
export const GLOSSARY = Object.defineProperties({}, Object.fromEntries(['kv', 'cells', 'c', 'twr', 'hover', 'wh', 'stator'].map((k) => [k, { enumerable: true, get: () => [t(`glossary.${k}.term`), t(`glossary.${k}.text`)] }])));
// Stator codes are millimetres by convention in every unit system: the imperial text says so and gives the example in inches.
const GL_IMP = new Set(['stator']); // text: glossary.<id>.textImperial
export const gl = (k) => (Object.hasOwn(GLOSSARY, k) ? `<details class="gl"><summary aria-label="${esc(t('glossary.aria', { term: GLOSSARY[k][0] }))}">?</summary><p>${esc((U.isImperial() && GL_IMP.has(k) && t(`glossary.${k}.textImperial`)) || GLOSSARY[k][1])}</p></details>` : '');

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
  return { dir, text: `${sign(sg)}${U.show('g', Math.abs(dg))} · ${sign(sp)}${c.money(Math.abs(dp))}${sideE ? ' ' + t('parts.delta.inclEsc') : ''}` };
}
// Spec lines that use jargon get their explainers (a div, since <details> cannot sit inside a <p>).
const needGl = (k) => ({ motor: gl('kv') + gl('stator'), pusher: gl('kv') + gl('stator'), battery: gl('cells') + gl('c') + gl('wh') })[k] || '';
const deltaHtml = (d) => (d ? ` <span class="delta" data-dir="${d.dir}" title="${esc(t('parts.delta.title'))}">${esc(d.text)}</span>` : '');

function card(it, i, key, c, miss, extra) {
  const on = c.sel[key] === it.id, best = !miss && !extra && i === 0;
  const q = it.qty ?? c.qty(key, it), pk = pack(it, q, key);
  const rk = miss ? '~' : extra ? '+' : 'ABC'[i] || i + 1;
  const tag = miss ? `<b class="tag">${esc(t('parts.tag.closest'))}</b> ` : best ? `<b class="tag">${esc(t('parts.tag.best'))}</b> ` : '';
  return `<li class="it${on ? ' on' : ''}${best ? ' best' : ''}">
<span class="rk" title="${esc(miss ? t('parts.rank.closest') : extra ? t('parts.rank.extra') : best ? t('parts.tag.best') : t('parts.rank.alt'))}">${rk}</span>
<div class="it-m"><div class="nm">${esc(it.name)}</div><div class="meta">${tag}${extra ? esc(catLabel(key, c.kind)) + ' &middot; ' : ''}${esc(it.brand)} &middot; ${esc(U.show('g', it.weightG))}${miss || extra || best ? '' : deltaHtml(delta(it, c.rec?.[key]?.[0], key, c))}</div></div>
<div class="pr"><b>${c.money(q * it.priceUsd)}</b>${pk ? `<small>${q} &times; ${esc(pk.sets)} (${esc(pk.pcs)})</small><small>${esc(t('parts.perSet', { price: c.money(it.priceUsd) }))}</small>` : q > 1 ? `<small>${q} &times; ${c.money(it.priceUsd)}</small>` : ''}</div>
<div class="it-f">${badge(it, c)}${selBtn(key, it, on)}</div>${linkTxt(it.links, 3)}</li>`;
}

function optRow(it, key, c, ro) {
  const on = !ro && c.sel[key] === it.id;
  return `<li class="opt${on ? ' on' : ''}"><div class="o-m"><span class="nm">${esc(it.name)}</span><span class="meta">${esc(it.brand)} &middot; ${esc(U.show('g', it.weightG))}${ro ? '' : deltaHtml(delta(it, c.rec?.[key]?.[0], key, c))}</span></div><b class="pr">${c.money(it.priceUsd)}</b><div class="o-f">${badge(it, c)}${ro ? '' : selBtn(key, it, on)}</div>${linkTxt(it.links, 3)}</li>`;
}

// ro = read-only list (no Select), for categories that do not belong to this build.
function more(key, c, ro) {
  const list = c.optsFor(key);
  // A category in the build lists swaps for its pick: "Similar parts"; the rest stay a plain option list.
  const head = esc(!ro && c.sec?.main?.includes(key) ? t('parts.more.similar', { count: list.length, where: c.where }) : t('parts.more.all', { count: list.length, where: c.where }));
  return list.length ? `<details class="more"><summary>${CHEV}${head}</summary><ul class="opts">${list.map((it) => optRow(it, key, c, ro)).join('')}</ul></details>` : '';
}

export function section(key, c) {
  const g = gaps(c.rec, key), list = g.miss ? g.items : c.rec[key] || [], n = need(key, c.req);
  const gap = g.miss ? `<p class="nopart">${g.reason ? tf('parts.gap.reason', { reason: U.text(g.reason) }) : tf('parts.gap.none')}${list.length ? ' ' + esc(t('parts.gap.closest')) : ''}</p>` : '';
  const fb = (c.rec.regionFallback || []).includes(key) ? `<p class="fb">${esc(t('parts.noLocal', { where: c.where }))}</p>` : '';
  // ESC: follows the picked (else best) motor; options stay selectable for a motor swap.
  const free = key === 'esc' && c.escFree ? `<p class="fb">${esc(t('parts.escFree', { brand: c.motor.brand, name: c.motor.name }))}</p>` : '';
  return `<section class="cat${g.miss ? ' gap' : ''}" id="cat-${esc(key)}" tabindex="-1"><h4 data-tone="${tone(key)}">${esc(catLabel(key, c.kind))}</h4>${n ? `<div class="need">${esc(t('parts.spec', { need: n }))}${needGl(key)}</div>` : ''}${free}${gap}${fb}${list.length ? `<ul class="items">${list.map((it, i) => card(it, i, key, c, g.miss)).join('')}</ul>` : ''}${more(key, c)}</section>`;
}

// c = { rec, req, opts, sec, sel, money, where, kind, qty(key,item), optsFor(key), note }
export function partsHtml(c) {
  const { rec, sec } = c, tot = rec?.totalUsd, ex = rec?.extras || [], notes = [...new Set(rec?.notes || [])];
  const miss = sec.main.some((k) => gaps(rec, k).miss);
  return `${tot ? `<div class="tot"><span>${esc(t(miss ? 'parts.totalMiss' : 'parts.total'))}</span><b>${c.money(tot.low)} &ndash; ${c.money(tot.high)}</b></div>` : ''}
${c.note ? `<p class="fx">${esc(c.note)}</p>` : ''}
<div class="cats">${sec.main.map((k) => section(k, c)).join('')}${ex.length ? `<section class="cat wide" id="cat-extras" tabindex="-1"><h4>${esc(t('cat.extras'))}</h4><p class="need">${esc(t('parts.extras.note'))}</p><ul class="items">${ex.map((it, i) => card(it, i, it.category, c, false, true)).join('')}</ul></section>` : ''}</div>
${sec.other.length ? `<div class="others"><h4>${esc(t('parts.more.cats'))}</h4><div class="o-grid">${sec.other.map((k) => `<section class="cat mini" id="cat-${esc(k)}" tabindex="-1"><h5 data-tone="${tone(k)}">${esc(catLabel(k, c.kind))}</h5>${more(k, c)}</section>`).join('')}</div></div>` : ''}
${sec.off?.length ? `<div class="others off"><h4>${esc(t('parts.off.title'))}</h4><p class="need">${esc(t('parts.off.note'))}</p><div class="o-grid">${sec.off.map((k) => `<section class="cat mini" id="cat-${esc(k)}" tabindex="-1"><h5 data-tone="${tone(k)}">${esc(catLabel(k))}</h5>${more(k, c, true)}</section>`).join('')}</div></div>` : ''}
${notes.length ? `<ul class="notes">${notes.map((x) => `<li>${esc(U.text(x))}</li>`).join('')}</ul>` : ''}`;
}

const sum = (rows) => rows.reduce((a, r) => a + r.line, 0);
const budgetLine = (total, b, c) => t(total <= b ? 'bom.under' : 'bom.over', { amount: c.money(Math.abs(b - total)) });

// rows = [{ key, label, it, qty, line }] in category order.
export function bomHtml(rows, c) {
  if (!rows.length) return `<p class="empty">${tf('bom.empty', { where: c.where })}</p>`;
  const total = sum(rows), b = c.budgetUsd;
  return `<table class="bomt"><caption class="sr">${esc(t('bom.caption'))}</caption><thead><tr><th scope="col">${esc(t('bom.col.category'))}</th><th scope="col">${esc(t('bom.col.part'))}</th><th scope="col" class="n">${esc(t('bom.col.qty'))}</th><th scope="col" class="n">${esc(t('bom.col.unit'))}</th><th scope="col" class="n">${esc(t('bom.col.line'))}</th><th scope="col">${esc(t('bom.col.links'))}</th></tr></thead>
<tbody>${rows.map((r) => `<tr><td class="c" data-tone="${tone(r.key)}">${esc(r.label)}</td><th scope="row" class="p">${esc(r.it.name)}<small>${esc(r.it.brand)}${r.it.custom ? ` &middot; ${esc(customTxt())}` : ''}</small></th><td class="n q" data-l="${esc(t('bom.col.qty'))}">${r.pack ? `${r.qty} &times; ${esc(r.pack.sets)}<small>${esc(r.pack.pcs)}</small>` : r.qty}</td><td class="n u" data-l="${esc(t('bom.col.unit'))}">${c.money(r.it.priceUsd)}</td><td class="n l">${c.money(r.line)}</td><td class="k">${linkBtns(r.it.links, 3)}</td></tr>`).join('')}</tbody>
<tfoot><tr class="sum"><th scope="row" colspan="4">${esc(t('bom.total'))}</th><td class="n">${c.money(total)}</td><td class="k"></td></tr>${b != null ? `<tr class="bud ${total <= b ? 'ok' : 'bad'}"><th scope="row" colspan="4">${esc(t('bom.budget', { amount: c.money(b) }))}</th><td class="n" colspan="2">${esc(budgetLine(total, b, c))}</td></tr>` : ''}</tfoot></table>`;
}

// Compact summary for the dock: every recommended category, then any other selected one.
export function dockHtml(rows, c) {
  if (!rows.length) return `<p class="d-empty">${esc(t('dock.empty'))}</p>`;
  const total = sum(rows), b = c.budgetUsd, by = Object.fromEntries(rows.map((r) => [r.key, r]));
  const keys = [...c.sec.main, ...rows.map((r) => r.key).filter((k) => !c.sec.main.includes(k))];
  return `<p class="d-tot"><span>${esc(t('dock.total'))} &middot; ${esc(t('dock.selected', { count: rows.length }))}</span><b>${c.money(total)}</b></p>
${b != null ? `<p class="d-bud ${total <= b ? 'ok' : 'bad'}">${esc(budgetLine(total, b, c))}</p>` : ''}
<ol class="d-list">${keys.map((k) => { const r = by[k]; return `<li${r ? ' class="on"' : ''}><a href="#cat-${esc(k)}" data-tone="${tone(k)}">${esc(catLabel(k, c.kind))}</a><span>${r ? esc(r.it.name) : k === 'esc' && c.escFree ? esc(t('dock.escBuiltIn')) : esc(t('dock.notSelected'))}</span><b>${r ? c.money(r.line) : ''}</b></li>`; }).join('')}</ol>`;
}

// Spreadsheet formula guard: a pasted line starting with = + - @ gets a leading apostrophe.
const cell = (s) => (/^\s*[=+\-@]/.test(s) ? "'" + s : s);
export function copyText(rows, c) {
  if (rows.length) {
    const out = [`${t('copy.bomTitle')}${c.name ? `: ${c.name}` : ''}`];
    for (const r of rows) {
      out.push(`${r.label}: ${r.it.brand} ${r.it.name}${r.it.custom ? ' ' + t('copy.customTag') : ''} - ${r.qty} x ${r.pack ? t('copy.packAt', { sets: r.pack.sets, pcs: r.pack.pcs }) : ''}${c.money(r.it.priceUsd)} = ${c.money(r.line)}`);
      links(r.it.links, 3).forEach((l) => out.push(`   ${linkLabel(l)}: ${l.url}`));
    }
    out.push(t('copy.total', { amount: c.money(sum(rows)) }));
    return out.map(cell).join('\n');
  }
  const out = [`${t('copy.listTitle')}${c.name ? `: ${c.name}` : ''}`];
  for (const k of c.sec.main) {
    const g = gaps(c.rec, k);
    (g.miss ? g.items : c.rec[k] || []).forEach((it, i) => {
      out.push(`${catLabel(k, c.kind)}${g.miss ? ' ' + t('copy.closestTag') : ' (' + ('ABC'[i] || i + 1) + ')'}: ${it.brand} ${it.name} - ${c.money(it.priceUsd)}`);
      links(it.links, 3).forEach((l) => out.push(`   ${linkLabel(l)}: ${l.url}`));
    });
  }
  (c.rec?.extras || []).forEach((it) => out.push(`${t('copy.extra', { cat: catLabel(it.category) })}: ${it.brand} ${it.name} - ${c.money(it.priceUsd)}`));
  if (c.rec?.totalUsd) out.push(t('copy.totalRange', { low: c.money(c.rec.totalUsd.low), high: c.money(c.rec.totalUsd.high) }));
  return out.map(cell).join('\n');
}

// CSV cell: always quoted, quotes doubled; text starting (after any whitespace) with = + - @ tab or CR gets a leading apostrophe (formula guard).
const csvCell = (v) => `"${(typeof v === 'number' ? String(v) : /^\s*[=+\-@\t\r]/.test(String(v ?? '')) ? "'" + v : String(v ?? '')).replace(/"/g, '""')}"`;
// BOM as CSV: selected rows, else the recommended A/B/C picks (Qty 1). Numbers are plain c.num values so spreadsheets can sum them.
// c adds { num(usd) -> number in c.cur, cur }. UTF-8 BOM so Excel reads non-ASCII names; CRLF per RFC 4180.
export function bomCsv(rows, c) {
  const link = (it) => links(it.links, 1)[0]?.url || '';
  const line = (label, it, q, pcs, total) => [label, it.brand, it.custom ? `${it.name} ${t('copy.customTag')}` : it.name, q, pcs, c.num(it.priceUsd), c.num(total), c.cur, link(it)];
  const out = [['Category', 'Brand', 'Part', 'Qty', 'Pieces', 'Unit price', 'Line total', 'Currency', 'Link']];
  if (rows.length) {
    rows.forEach((r) => out.push(line(r.label, r.it, r.qty, r.pack ? r.qty * r.it.packOf : r.qty, r.line)));
    out.push([t('csv.total'), '', '', '', '', '', c.num(sum(rows)), c.cur, '']);
  } else {
    for (const k of c.sec.main) {
      const g = gaps(c.rec, k);
      (g.miss ? g.items : c.rec?.[k] || []).forEach((it, i) => out.push(line(`${catLabel(k, c.kind)} (${g.miss ? t('csv.closest') : 'ABC'[i] || i + 1})`, it, 1, 1, it.priceUsd)));
    }
    (c.rec?.extras || []).forEach((it) => out.push(line(t('csv.extra', { cat: catLabel(it.category) }), it, 1, 1, it.priceUsd)));
    const tt = c.rec?.totalUsd;
    if (tt) out.push([t('csv.totalA'), '', '', '', '', '', c.num(tt.low), c.cur, ''], [t('csv.totalC'), '', '', '', '', '', c.num(tt.high), c.cur, '']);
  }
  return '﻿' + out.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
