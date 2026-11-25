// Wiring and connectors: one list for the Components section and the PDF. Pure string and row builders.
// Uses result.wiring [{name, connector, count, lengthMm}] when the engine sends it; otherwise derives a basic list from the build.
import { esc } from './parts.js';
import * as U from './units.js';
import { t } from '../i18n/i18n.js';

const fin = Number.isFinite;
const cnt = (v) => (fin(v) ? String(Math.round(v)) : '-');
const len = (v) => (fin(v) ? U.num('mm', Math.round(v)) : '-'); // lengths are mm in the data; shown in the display unit
const lenH = () => t('wire.col.length', { unit: U.label('mm') });

// -> { rows: [{name, connector, count, lengthMm}], derived: bool }. rows is [] when there is nothing to show.
// bat = the picked battery item: its specs.connector replaces the battery lead's estimated connector.
export function wiringRows(r, mission, bat) {
  const out = base(r, mission), c = bat?.specs?.connector;
  if (c) out.rows = out.rows.map((w) => (w.id === 'battery' ? { ...w, connector: t('wire.pickedBattery', { connector: c }) } : w));
  return out;
}
function base(r, mission) {
  if (!r?.ok) return { rows: [], derived: false };
  if (Array.isArray(r.wiring) && r.wiring.length) {
    const rows = r.wiring.filter((w) => w && w.name).map((w) => ({ id: w.id ? String(w.id) : undefined, name: String(w.name), connector: String(w.connector || '-'), count: fin(w.count) ? w.count : '-', lengthMm: fin(w.lengthMm) ? w.lengthMm : '-' }));
    return { rows, derived: false };
  }
  // Derived: basic harness for the build. Lengths are estimates; the engine's list replaces this when it ships.
  const motors = r.motorCount ?? 4, fixed = !!r.fixedWing, v = r.vtol, gps = !!r.requirements?.fc?.needsGps;
  const servos = (v?.servoCount ?? (fixed ? 2 : 0)) + (v?.tilt?.servoCount ?? 0);
  const rows = [
    { id: 'escPower', name: t('wire.d.escPower.name'), connector: t('wire.d.escPower.conn'), count: motors, lengthMm: 120 },
    { id: 'escSignal', name: t('wire.d.escSignal.name'), connector: t('wire.d.escSignal.conn'), count: motors, lengthMm: 200 },
    ...(v?.pusher ? [{ id: 'pusher', name: t('wire.d.pusher.name'), connector: t('wire.d.pusher.conn'), count: 1, lengthMm: 150 }] : []),
    ...(servos > 0 ? [{ id: 'servo', name: t('wire.d.servo.name'), connector: t('wire.d.servo.conn'), count: servos, lengthMm: 250 }] : []),
    { id: 'fcMain', name: t('wire.d.fcMain.name'), connector: 'JST GH 6-pin', count: 1, lengthMm: 120 },
    { id: 'fcTelem', name: t('wire.d.fcTelem.name'), connector: 'JST SH 4-pin', count: 1, lengthMm: 200 },
    ...(gps ? [{ id: 'gps', name: t('wire.d.gps.name'), connector: 'JST GH 6-pin', count: 1, lengthMm: 250 }, { id: 'can', name: t('wire.d.can.name'), connector: 'JST GH 4-pin', count: 1, lengthMm: 300 }] : []),
    { id: 'rx', name: t('wire.d.rx.name'), connector: 'JST SH 3-pin', count: 1, lengthMm: 250 },
    ...(mission === 'fpv' || mission === 'interceptor' ? [{ id: 'vtx', name: t('wire.d.vtx.name'), connector: 'JST SH 4-pin', count: 1, lengthMm: 120 }] : []),
    ...(mission !== 'agriculture' ? [{ id: 'camera', name: t('wire.d.camera.name'), connector: t('wire.d.camera.conn'), count: 1, lengthMm: 150 }] : []),
    { id: 'battery', name: t('wire.d.battery.name'), connector: fin(r.peakCurrentA) && r.peakCurrentA > 60 ? 'XT90' : 'XT60', count: 1, lengthMm: 150 },
  ];
  return { rows, derived: true };
}

// Section block for the Components list; empty string when there are no rows.
export function wiringHtml({ rows, derived }) {
  if (!rows.length) return '';
  return `<section class="wiring" id="wiring" tabindex="-1" aria-labelledby="h-wiring"><h4 id="h-wiring">${esc(t('wire.title'))}</h4>
<p class="need">${esc(t(derived ? 'wire.est' : 'wire.calc'))}</p>
<table class="wt" aria-labelledby="h-wiring"><thead><tr><th scope="col">${esc(t('wire.col.item'))}</th><th scope="col">${esc(t('wire.col.connector'))}</th><th scope="col" class="n">${esc(t('wire.col.count'))}</th><th scope="col" class="n">${esc(lenH())}</th></tr></thead>
<tbody>${rows.map((w) => `<tr><th scope="row" class="p">${esc(w.name)}</th><td class="c" data-l="${esc(t('wire.col.connector'))}">${esc(w.connector)}</td><td class="n" data-l="${esc(t('wire.col.count'))}">${esc(cnt(w.count))}</td><td class="n" data-l="${esc(lenH())}">${esc(len(w.lengthMm))}</td></tr>`).join('')}</tbody></table></section>`;
}

// PDF table in the same shape as the perf tables: {title, columns, rows} with display strings.
export function wiringTable({ rows }) {
  if (!rows.length) return null;
  return { title: t('wire.title'), columns: [t('wire.col.item'), t('wire.col.connector'), t('wire.col.count'), lenH()], rows: rows.map((w) => [w.name, w.connector, cnt(w.count), len(w.lengthMm)]) };
}
