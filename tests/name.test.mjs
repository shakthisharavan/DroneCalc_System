// Drone name is untrusted input: it must round-trip the hash, stay escaped in the PDF and slug to a safe filename.
import assert from "node:assert/strict";
import * as E from "../js/engine.js";
import * as C from "../js/catalog.js";
import * as M from "../js/matcher.js";
import * as PERF from "../js/ui/perf.js";
import { createState, cleanName, fileBase, pdfName, csvName, NAME_MAX } from "../js/ui/state.js";
import { esc, copyText, bomCsv } from "../js/ui/parts.js";
import { buildBomPdf } from "../js/ui/pdf.js";

const EVIL = "<img src=x onerror=alert(1)>(evil)\\";
const X = createState({ E, C, M, PERF });
const { S } = X.parse("#s=3&m=mapping");
S.name = cleanName(EVIL);
assert.equal(S.name, EVIL, "a 37-char name passes unchanged");

// Hash: n is encodeURIComponent'd and parses back to the same string.
const h = X.hashOf(S, 3);
assert.ok(h.endsWith("&n=" + encodeURIComponent(EVIL)), "n uses encodeURIComponent");
assert.equal(X.parse(h).S.name, EVIL, "hash round trip");
assert.equal(X.parse("#s=0").S.name, "", "no n means empty name");
assert.ok(!X.hashOf({ ...S, name: "" }, 3).includes("n="), "empty name leaves the hash as before");
assert.equal(cleanName("a\u0000b\nc" + "x".repeat(60)).length, NAME_MAX, "control chars dropped, capped at 40");

// HTML: the escape helper the renderers use leaves no markup.
assert.ok(!/[<>"']/.test(esc(EVIL)), "escaped for HTML");

// PDF: valid file, name present only in escaped form.
const r = X.run(S);
assert.ok(r?.ok, "mapping build runs");
const doc = X.pdfDoc(X.results(S, r), S, "2026-11-07");
assert.deepEqual(doc.meta[0], ["Drone name", EVIL], "name is the first meta row");
const s = Buffer.from(buildBomPdf(doc)).toString("latin1");
assert.ok(s.startsWith("%PDF-1.4") && /%%EOF\n?$/.test(s), "PDF header and EOF");
const sx = Number(/startxref\n(\d+)\n%%EOF\n?$/.exec(s)?.[1]);
assert.equal(sx, s.lastIndexOf("\nxref\n") + 1, "startxref offset");
const size = Number(/^xref\n0 (\d+)\n/.exec(s.slice(sx))[1]);
for (let i = 1; i < size; i++) {
  const off = Number(s.slice(sx).split("\n")[2 + i].slice(0, 10));
  assert.ok(s.startsWith(`${i} 0 obj`, off), `xref offset of object ${i}`);
}
for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n/g)) assert.ok(s.startsWith("\nendstream", m.index + m[0].length + Number(m[1])), "stream /Length");
assert.ok(s.includes("(<IMG SRC=X ONERROR=ALERT\\(1\\)>\\(EVIL\\)\\\\ \xb7 MAPPING"), "header subtitle has ( ) \\ escaped");
assert.ok(s.includes("(onerror=alert\\(1\\)>\\(evil\\)\\\\) Tj"), "wrapped meta value has ( ) \\ escaped");
assert.ok(!/alert\(1|evil\)|EVIL\)/i.test(s), "no unescaped paren from the name anywhere");

// Filename: name as typed (case kept), unsafe runs collapsed to -, mission label fallback when the name is empty or all symbols.
const ML = X.MISSIONS.mapping.label;
assert.equal(pdfName(S, ML), "img-src-x-onerror-alert-1-evil-Build.pdf");
assert.ok(!/[/\\<>:"|?*]/.test(pdfName(S, ML)), "no reserved filename chars");
assert.equal(pdfName({ ...S, name: "" }, ML), "Mapping-Build.pdf");
assert.equal(pdfName({ ...S, name: "" }), "Mapping-Build.pdf", "no label: capitalised mission id");
assert.equal(pdfName({ ...S, name: "../\\<>" }, ML), "Mapping-Build.pdf");
assert.equal(fileBase({ name: "", mission: "" }), "DroneCalc", "no name, no mission");
assert.equal(fileBase({ name: "Inspect" }), "Inspect");
assert.equal(fileBase({ name: "Survey 01" }), "Survey-01");
assert.equal(pdfName({ name: "Inspect" }), "Inspect-Build.pdf");
assert.equal(csvName({ name: "Inspect" }), "Inspect-BOM.csv");
assert.equal(fileBase({ name: "Ünïcode_Ж-1" }), "Ünïcode_Ж-1", "Unicode letters kept");

// CSV: header, every cell quoted, quotes doubled, formula guard, UTF-8 BOM, CRLF, plain numbers.
const cc = { num: (u) => u * 2, cur: "EUR", sec: { main: [] }, rec: null, kind: "multi" };
const csv = bomCsv([{ label: "=HYPERLINK(1)", it: { brand: 'say "hi"', name: "@x", priceUsd: 1.5, links: [{ url: "https://a.example/p", store: "A" }] }, qty: 2, line: 3 }], cc);
assert.ok(csv.startsWith("﻿"), "UTF-8 BOM");
const cl = csv.slice(1).split("\r\n");
assert.equal(cl[0], '"Category","Brand","Part","Qty","Pieces","Unit price","Line total","Currency","Link"');
assert.equal(cl[1], `"'=HYPERLINK(1)","say ""hi""","'@x","2","2","3","6","EUR","https://a.example/p"`);
assert.equal(cl[2], '"Total","","","","","","6","EUR",""');
assert.equal(cl[3], "", "trailing CRLF");
// No selection: recommended picks of the real mapping build, Qty 1.
const MR = X.results(S, r), mc = X.ctx(MR, S), none = bomCsv([], mc).slice(1).split("\r\n");
assert.ok(none.length > 3 && /^"[^"]+ \(A\)",/.test(none[1]) && none[1].includes(',"1","1",'), "no-selection branch lists A/B/C picks with Qty 1");
assert.ok(none.every((l) => l === "" || l.split('","').length === 9), "9 columns per row");

// Hash sel keys: only real categories; an item only under its own category.
const proto = X.parse("#s=3&m=mapping&sel=constructor:x,__proto__:y,toString:z");
assert.deepEqual(Object.keys(proto.S.sel), [], "prototype keys are dropped from sel");
assert.equal(Object.getPrototypeOf(proto.S.sel), Object.prototype, "sel prototype untouched");
const quad = X.parse("#s=3&m=mapping&cfg=quad");
const RQ = X.results(quad.S, X.run(quad.S));
const frameId = C.CATALOG.find((i) => i.category === "frame").id;
const cross = X.parse(`#s=3&m=mapping&cfg=quad&sel=motor:${frameId}`).S;
assert.equal(cross.sel.motor, frameId, "motor is a known key, so it parses");
assert.equal(X.pick(RQ, "motor", frameId), undefined, "a frame never fills the motor slot");
assert.deepEqual(X.bomRows(RQ, cross.sel), [], "cross-category pick gives no BOM row");
const motorId = RQ.rec.motor[0].id;
assert.equal(X.bomRows(RQ, { motor: motorId }).length, 1, "a real motor still fills the motor slot");

// Off-build categories: a fixed wing lists frame and lift motors read-only; a hash pick of them is ignored.
const fwS = X.parse("#s=3&m=mapping&t=20&cfg=fixedwing&mat=carbon&cur=USD").S;
const fwR = X.results(fwS, X.run(fwS));
assert.ok(fwR.sec.off.includes("frame") && fwR.sec.off.includes("motor") && !fwR.sec.all.includes("frame"), "frame and lift motors are off-build on a wing");
assert.deepEqual(X.bomRows(fwR, { frame: frameId }), [], "off-build pick is not in the BOM");

// Fixed-wing best pick: the empty airframe weighs less than the aircraft.
const air = fwR.rec.fixedwing[0];
assert.ok(air && air.weightG < fwR.r.auwKg * 1000, `best airframe ${air?.name} ${air?.weightG} g < AUW ${fwR.r.auwKg} kg`);
for (const c of ["vtol", "tiltrotor"]) {
  const s = X.parse(`#s=3&m=mapping&cfg=${c}`).S, rr = X.results(s, X.run(s));
  for (const it of rr.rec.vtol) assert.ok(it.weightG < rr.r.auwKg * 1000, `${c}: ${it.name} lighter than AUW`);
}

// Copy text: a line that a spreadsheet would read as a formula gets a leading apostrophe.
const ct = copyText([{ label: "=HYPERLINK(1)", it: { brand: "b", name: "n", priceUsd: 1, links: [] }, qty: 1, line: 1 }], { money: String, name: "" }).split("\n");
assert.equal(ct[1][0], "'", "formula-looking line is prefixed");
assert.equal(ct[2], "Total: 1", "normal lines unchanged");

console.log("name tests passed");
