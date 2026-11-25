// English output regression (i18n extraction): the full results text, BOM, CSV, copy text, PDF doc and PDF bytes of three sample builds,
// in metric and imperial, must equal tests/golden-en.json, which was captured from the code BEFORE any string moved into js/i18n/en.js.
// Regenerate only on a deliberate English wording change: node tests/golden.test.mjs --write
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as E from '../js/engine.js';
import * as C from '../js/catalog.js';
import * as M from '../js/matcher.js';
import * as PERF from '../js/ui/perf.js';
import * as CHK from '../js/checks.js';
import * as U from '../js/ui/units.js';
import { createState } from '../js/ui/state.js';
import { partsHtml, bomHtml, dockHtml, copyText, bomCsv } from '../js/ui/parts.js';
import { wiringRows, wiringHtml } from '../js/ui/wiring.js';
import { buildBomPdf } from '../js/ui/pdf.js';

const FILE = new URL('./golden-en.json', import.meta.url);
const X = createState({ E, C, M, PERF, CHK });
const BUILDS = ['#s=3&m=inspection&n=Inspect&cfg=hex&ha=20&age=10&b=5000&cur=INR', '#s=3&m=fpv&fc=7&mw=900', '#s=3&m=mapping&cfg=fixedwing&n=Wing%20One', '#s=3&m=delivery&cfg=vtol&mw=3500'];

function capture(hash, units) {
  U.set(units);
  const { S } = X.parse(hash), est = X.run(S), R = X.results(S, est), r = R.r;
  // every third part of the first categories selected, so the BOM, CSV and PDF have lines
  const picks = {}; let i = 0; for (const k of R.sec.main) if (R.rec?.[k]?.[0] && i++ % 2 === 0) picks[k] = R.rec[k][0].id;
  const bare = X.bomRows(R, {}), sel = { ...S, sel: picks }, rows = X.bomRows(R, picks), c = X.ctx(R, S), cs = X.ctx(R, sel);
  const doc = X.pdfDoc(R, sel, '2026-11-08'), pdfDoc0 = X.pdfDoc(R, S, '2026-11-08');
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  return {
    warnings: X.warnsOf(S, r), mwErr: R.mwErr, note: R.note, cfgWarns: X.cfgWarns(S, est), matWarns: X.matWarns(S, est),
    parts: partsHtml(c), bomEmpty: bomHtml(bare, c), bom: bomHtml(rows, cs), dock: dockHtml(rows, cs), dockEmpty: dockHtml(bare, c),
    copy: copyText(rows, cs), copyEmpty: copyText(bare, c), csv: bomCsv(rows, cs), csvEmpty: bomCsv(bare, c),
    compat: X.compatOf(R, rows), wclass: X.wclassOf(R), checklist: CHK.checklist(r, S), wiring: wiringHtml(wiringRows(r, S.mission)),
    perf: PERF.renderPerformance(r, { missionLabel: X.MISSIONS[S.mission].label }),
    pdfDoc: doc, pdfSha: sha(buildBomPdf(doc)), pdfOptionsSha: sha(buildBomPdf(pdfDoc0)),
  };
}
// Long values are stored as "sha256:<16 hex>:<length>" to keep the fixture small; a mismatch names the build and field. Set GOLDEN_FULL=file.json to dump the full text for diffing.
const squash = (v) => { const j = JSON.stringify(v); return j.length > 400 ? `sha256:${crypto.createHash('sha256').update(j).digest('hex').slice(0, 16)}:${j.length}` : v; };
const all = () => Object.fromEntries(['metric', 'imperial'].flatMap((u) => BUILDS.map((h) => [`${u} ${h}`, capture(h, u)])));

const squashAll = (o) => Object.fromEntries(Object.entries(o).map(([k, b]) => [k, Object.fromEntries(Object.entries(b).map(([f, v]) => [f, squash(v)]))]));
if (process.env.GOLDEN_FULL) { fs.writeFileSync(process.env.GOLDEN_FULL, JSON.stringify(all(), null, 1)); process.exit(0); }
if (process.argv.includes('--write')) { fs.writeFileSync(FILE, JSON.stringify(squashAll(all()), null, 1) + '\n'); console.log('golden-en.json written'); process.exit(0); }
const want = JSON.parse(fs.readFileSync(FILE, 'utf8')), got = JSON.parse(JSON.stringify(squashAll(all())));
assert.deepEqual(Object.keys(got), Object.keys(want));
for (const k of Object.keys(want)) for (const f of Object.keys(want[k])) assert.deepEqual(got[k][f], want[k][f], `${k}: ${f} changed`);
U.set('metric');
console.log('golden-en tests passed');
