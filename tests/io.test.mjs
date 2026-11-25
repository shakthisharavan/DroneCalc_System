// F3 build file import/export: round trip, and every hostile-file path (size, JSON, format, prototype keys, hostile hashes, count cap).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../js/engine.js";
import * as C from "../js/catalog.js";
import * as M from "../js/matcher.js";
import * as PERF from "../js/ui/perf.js";
import * as CHK from "../js/checks.js";
import { createState } from "../js/ui/state.js";
import { createLibrary, LIB_MAX } from "../js/ui/library.js";
import { exportDoc, exportName, parseBuildFile, readBuildFile, addToLibrary, summary, ioHtml, mountIO, FILE_MAX_BYTES, FILE_MAX_BUILDS } from "../js/ui/io.js";

const X = createState({ E, C, M, PERF, CHK });
const motor = C.CATALOG.find((i) => i.category === "motor").id;
const build = (h, name = "") => ({ name, hash: h, savedAt: 1700000000000 });
const file = (o) => JSON.stringify({ app: "DroneCalc", format: 1, ...o });
const hashes = Array.from({ length: 30 }, (_, i) => X.hashOf({ ...X.parse(`#s=3&m=mapping&t=${5 + i}`).S, name: `B${i}` }, 3));
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };

test("round trip: export -> JSON text -> import gives the same builds", () => {
  const S1 = { ...X.parse("#s=3&m=delivery&t=25&p=1.5&cfg=hex&alt=500&b=800&cur=USD").S, name: "My Hex é", sel: { motor }, mw: 2400 };
  const S2 = X.parse("#s=3&m=fpv&fc=7").S;
  const items = [build(X.hashOf(S1, 3), "My Hex é"), build(X.hashOf(S2, 3), "Untitled build")];
  const doc = exportDoc(items);
  assert.deepEqual(Object.keys(doc), ["app", "format", "builds"]);
  assert.equal(doc.app, "DroneCalc"); assert.equal(doc.format, 1);
  const r = parseBuildFile(X, JSON.stringify(doc, null, 2));
  assert.equal(r.skipped, 0); assert.equal(r.error, undefined);
  assert.deepEqual(r.builds, items);
  assert.deepEqual(X.parse(r.builds[0].hash).S, S1, "the full build state survives");
  assert.deepEqual(parseBuildFile(X, JSON.stringify(exportDoc(r.builds))), r, "export of an import is stable");
});

test("export file name is sanitised", () => {
  assert.equal(exportName({ name: "Survey-01" }, "Mapping", "2026-11-14"), "dronecalc-Survey-01-2026-11-14.json");
  assert.equal(exportName({ name: "" }, "Mapping / survey", "2026-11-14"), "dronecalc-Mapping-2026-11-14.json");
  assert.match(exportName({ name: '../..\\evil:*?"<>|' }, "x", "2026-11-14"), /^dronecalc-[\p{L}\p{N}_-]+-2026-11-14\.json$/u);
  assert.equal(exportName({ name: "all-builds" }, "", "2026-11-14"), "dronecalc-all-builds-2026-11-14.json");
});

test("oversize file is refused before it is read", async () => {
  const big = file({ builds: [], pad: "x".repeat(FILE_MAX_BYTES) });
  assert.match(parseBuildFile(X, big).error, /larger than 256 KB/);
  let read = false;
  const lying = { size: FILE_MAX_BYTES + 1, text: async () => { read = true; return "{}"; } };
  assert.match((await readBuildFile(X, lying)).error, /larger than 256 KB/);
  assert.equal(read, false, "file.text() never called");
  assert.match((await readBuildFile(X, {})).error, /larger/, "no size: refused");
  // multi-byte text counts in bytes, not characters
  assert.match(parseBuildFile(X, file({ builds: [], pad: "é".repeat(FILE_MAX_BYTES / 2) })).error, /larger/);
  const ok = file({ builds: [build(hashes[0], "A")] });
  assert.equal((await readBuildFile(X, new File([ok], "a.json"))).builds.length, 1, "a real File works");
});

test("malformed JSON", async () => {
  for (const t of ["", "{", "not json", '{"app":"DroneCalc",', "\u0000", "{'app':1}"]) assert.match(parseBuildFile(X, t).error, /not valid JSON/, JSON.stringify(t));
  assert.match(parseBuildFile(X, 42).error, /larger|JSON/, "non-string input refused");
  assert.match((await readBuildFile(X, { size: 5, text: async () => { throw new Error("denied"); } })).error, /could not be read/);
});

test("wrong app, format or shape", () => {
  const bad = ['null', '42', '"DroneCalc"', '[]', '[{"app":"DroneCalc","format":1,"builds":[]}]', '{}',
    file({ app: "Other", builds: [] }), file({ format: 2, builds: [] }), file({ format: "1", builds: [] }), file({ app: "dronecalc", builds: [] }),
    file({ builds: {} }), file({ builds: "x" }), file({ builds: null }), JSON.stringify({ app: "DroneCalc", format: 1 })];
  for (const t of bad) assert.match(parseBuildFile(X, t).error, /not a DroneCalc build file/, t.slice(0, 60));
  assert.deepEqual(parseBuildFile(X, file({ builds: [] })), { builds: [], skipped: 0 }, "empty list is valid, nothing to import");
});

test("prototype pollution payloads change nothing", () => {
  const evil = '{"app":"DroneCalc","format":1,"__proto__":{"polluted":"doc"},"constructor":{"prototype":{"polluted":"ctor"}},"builds":['
    + `{"name":"ok","hash":"${hashes[0]}","__proto__":{"polluted":"entry"},"constructor":{"prototype":{"polluted":"entry-ctor"}},"prototype":{"polluted":1}},`
    + '{"__proto__":{"hash":"#s=3&m=mapping"}},{"constructor":{"hash":"#s=3&m=mapping"}},{"hash":{"__proto__":{"x":1}}},{"hash":["#s=3&m=mapping"]}]}';
  const r = parseBuildFile(X, evil);
  assert.equal({}.polluted, undefined); assert.equal(Object.prototype.polluted, undefined); assert.equal([].polluted, undefined);
  assert.equal(r.builds.length, 1); assert.equal(r.skipped, 4);
  assert.deepEqual(Object.keys(r.builds[0]), ["name", "hash", "savedAt"]);
  for (const k of ["__proto__", "constructor", "prototype"]) assert.equal(Object.hasOwn(r.builds[0], k), false);
  // a hash that only an inherited key could supply is not taken
  assert.equal(parseBuildFile(X, '{"app":"DroneCalc","format":1,"builds":[{"__proto__":{"hash":"#s=3&m=mapping"}}]}').builds.length, 0);
});

test("hostile hashes inside a valid file are dropped or re-serialised, never stored raw", () => {
  const dropped = ["javascript:alert(1)", "#s=3&m=__proto__", "#s=3&m=constructor", "#s=3&m=toString", "#m=nope", "#s=3", "", "#s=3&m=mapping&t=-5", "#s=3&m=mapping&t=1e999",
    "#s=3&m=mapping&t=abc", "#s=3&m=mapping&alt=99999", "#s=3&m=mapping&n=" + "a".repeat(5000), 42, null, true, {}, [], undefined];
  const r = parseBuildFile(X, file({ builds: [...dropped.map((h) => ({ name: "x", hash: h })), "#s=3&m=mapping", 7, null] }));
  assert.equal(r.builds.length, 0, JSON.stringify(r.builds)); assert.equal(r.skipped, dropped.length + 3);

  const hostile = `#s=3&m=mapping&n=${encodeURIComponent("<img src=x onerror=alert(1)>")}&sel=${encodeURIComponent(`motor:<script>,bogus:x,motor:${motor}`)}&mw=1e9&cur=EVIL&reg=__proto__&extra=1&s=99`;
  const ok = parseBuildFile(X, file({ builds: [{ name: "<b>‮bold​</b>", hash: hostile, savedAt: "now" }] }));
  assert.equal(ok.builds.length, 1);
  const b = ok.builds[0];
  assert.notEqual(b.hash, hostile);
  assert.ok(!/[<>"' ]/.test(b.hash), `markup survived: ${b.hash}`);
  assert.ok(!/extra|bogus|EVIL|mw=/.test(b.hash), b.hash);
  assert.equal(b.name, "<b>bold</b>", "bidi and zero-width stripped; HTML stays text for the escaping renderers");
  assert.equal(b.savedAt, 0, "non-number savedAt becomes 0");
  assert.equal(X.hashOf(X.parse(b.hash).S, 3), b.hash, "re-serialised hash is a fixed point");
  assert.deepEqual(X.parse(b.hash).S.sel, { motor }, "only the valid pick survives");
  for (const t of [-1, 1e300, Infinity, NaN, "5"]) assert.equal(parseBuildFile(X, file({ builds: [{ hash: hashes[0], savedAt: t }] })).builds[0].savedAt, 0, `savedAt ${t}`);
  assert.equal(parseBuildFile(X, file({ builds: [{ hash: hashes[0], name: { a: 1 } }] })).builds[0].name, "B0", "non-string name falls back to the hash's own");
  assert.equal(parseBuildFile(X, file({ builds: [{ hash: "#s=3&m=mapping" }] })).builds[0].name, "Untitled build");
});

test("more than 20 builds: the first 20 are read, the rest counted as skipped", () => {
  const r = parseBuildFile(X, file({ builds: hashes.map((h, i) => build(h, `B${i}`)) }));
  assert.equal(FILE_MAX_BUILDS, 20);
  assert.equal(r.builds.length, 20); assert.equal(r.skipped, 10);
  assert.deepEqual(r.builds.map((b) => b.name), hashes.slice(0, 20).map((_, i) => `B${i}`));
  assert.equal(parseBuildFile(X, file({ builds: Array(5000).fill({ name: "x", hash: "#" }) })).skipped, 5000, "a flood of junk is bounded work");
  const d = parseBuildFile(X, file({ builds: [build(hashes[0], "A"), build(hashes[0], "A"), build(hashes[1], "B")] }));
  assert.equal(d.builds.length, 2); assert.equal(d.skipped, 1, "same build twice counts once");
});

test("addToLibrary adds in file order and never evicts saved builds", () => {
  const st = store(), LIB = createLibrary(X, st, (() => { let t = 1e12; return () => (t += 1000); })());
  const mine = hashes.slice(20, 25).map((h) => X.parse(h).S);
  for (const S of mine) LIB.save({ ...S, name: "" }, "mine");
  const incoming = parseBuildFile(X, file({ builds: hashes.slice(0, 20).map((h, i) => build(h, `B${i}`)) })).builds;
  const r = addToLibrary(X, LIB, incoming);
  assert.deepEqual([r.added, r.skipped, r.failed], [15, 5, false]);
  const after = LIB.list();
  assert.equal(after.length, LIB_MAX);
  assert.deepEqual(after.slice(0, 15).map((b) => b.name), incoming.slice(0, 15).map((b) => b.name), "file order, newest first");
  assert.equal(after.filter((b) => b.name === "mine").length, 5, "existing builds all kept");
  // importing again adds nothing; the same builds are not stored twice
  assert.deepEqual(addToLibrary(X, LIB, incoming.slice(0, 3)), { added: 0, skipped: 3, failed: false });
  assert.equal(LIB.list().length, LIB_MAX);
  // an empty library takes all 20, and what is stored is the library's own re-validated form
  const L2 = createLibrary(X, store());
  assert.equal(addToLibrary(X, L2, incoming).added, 20);
  assert.deepEqual(L2.list().map((b) => b.hash), incoming.map((b) => b.hash));
  // storage that refuses writes is reported, not swallowed
  const dead = createLibrary(X, { getItem: () => null, setItem: () => { throw new Error("quota"); } });
  assert.deepEqual(addToLibrary(X, dead, incoming.slice(0, 2)), { added: 0, skipped: 2, failed: true });
});

test("summary wording and drawer controls are labelled", () => {
  assert.equal(summary(1, 0), "Imported 1 build, skipped 0."); assert.equal(summary(3, 2), "Imported 3 builds, skipped 2.");
  const h = ioHtml(2);
  assert.match(h, /<button type="button" class="btn sm" data-io="import">Import build file<\/button>/);
  assert.match(h, /<button type="button" class="btn sm" data-io="export-all">Export all saved builds<\/button>/);
  assert.match(h, /<input type="file" id="io-file" accept="\.json,application\/json" hidden aria-label="[^"]+">/);
  assert.match(h, /role="group" aria-label="Build files"/);
  assert.match(ioHtml(0), /data-io="export-all" disabled>/, "nothing to export, button disabled");
});

test("page wiring: drops are cancelled and imported, status region announces, export downloads", async () => {
  const g = globalThis, saved = { document: g.document, setTimeout: g.setTimeout }, urlFns = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }, on = {}, made = [];
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); }; // let the async file read finish
  const el = () => { const e = { style: {}, className: "", attrs: {}, listeners: {}, classList: { add: (c) => (e.className += ` ${c}`), remove: (c) => (e.className = e.className.replace(c, "")) }, setAttribute: (k, v) => (e.attrs[k] = v), click() { e.clicked = true; }, remove() {} }; made.push(e); return e; };
  g.document = { createElement: el, body: { appendChild() {} }, addEventListener: (t, f) => (on[t] = f) };
  g.setTimeout = () => 0;
  const urls = []; URL.createObjectURL = (b) => (urls.push(b), "blob:x"); URL.revokeObjectURL = () => {};
  try {
    const libEl = { l: {}, addEventListener(t, f) { this.l[t] = f; }, querySelector: () => ({ click() { libEl.clicked = true; } }) };
    const opened = [], changed = [], S = { ...X.parse("#s=3&m=mapping&n=Wing").S };
    const LIB = createLibrary(X, store());
    const io = mountIO({ X, LIB, libEl, state: () => S, label: () => "Mapping / survey", date: () => "2026-11-14", open: (h) => opened.push(h), changed: () => changed.push(1) });
    const toast = made[0];
    assert.equal(toast.attrs.role, "status"); assert.match(toast.className, /live/, "hidden until a message shows");

    const ev = (types, files) => ({ dataTransfer: { types, files }, prevented: false, preventDefault() { this.prevented = true; } });
    const over = ev(["Files"], []); on.dragover(over); assert.equal(over.prevented, true, "file drag allowed to drop");
    const text = ev(["text/plain"], []); on.dragover(text); assert.equal(text.prevented, false, "text drag untouched");
    const t2 = ev(["text/plain"], []); on.drop(t2); assert.equal(t2.prevented, false);

    const drop = async (text, name = "b.json") => { const d = ev(["Files"], [new File([text], name)]); on.drop(d); assert.equal(d.prevented, true, "never navigates to the file"); await settle(); };
    await drop(file({ builds: [build(hashes[0], "A")] }));
    assert.deepEqual(opened, [hashes[0]]); assert.equal(toast.textContent, "Imported 1 build, skipped 0."); assert.doesNotMatch(toast.className, /live/, "message is shown");
    assert.equal(LIB.list().length, 0, "a single build is loaded, not saved");

    await drop("{ nope"); assert.match(toast.textContent, /not valid JSON/);
    await drop(file({ app: "x", builds: [] })); assert.match(toast.textContent, /not a DroneCalc build file/);
    await drop(file({ builds: [{ hash: "javascript:1" }] })); assert.match(toast.textContent, /No valid builds found in that file \(skipped 1\)/);
    await drop("x".repeat(FILE_MAX_BYTES + 1)); assert.match(toast.textContent, /larger than 256 KB/);
    assert.equal(opened.length, 1, "no failed import opened a build");

    await drop(file({ builds: hashes.slice(0, 3).map((h, i) => build(h, `B${i}`)) }));
    assert.equal(toast.textContent, "Imported 3 builds, skipped 0."); assert.equal(LIB.list().length, 3); assert.equal(changed.length, 1);
    await drop(file({ builds: hashes.slice(0, 3).map((h, i) => build(h, `B${i}`)) }));
    assert.match(toast.textContent, /^Imported 0 builds, skipped 3\. Builds already saved/);

    // drawer: the Import button opens the file picker; choosing a file imports it and resets the input
    libEl.l.click({ target: { closest: () => ({ dataset: { io: "import" } }) } }); assert.equal(libEl.clicked, true);
    const input = { id: "io-file", files: [new File([file({ builds: [build(hashes[5], "Z")] })], "z.json")], value: "x" };
    libEl.l.change({ target: input }); assert.equal(input.value, "", "input reset so the same file can be chosen again");
    await settle();
    assert.equal(opened.at(-1), hashes[5]);
    libEl.l.change({ target: { id: "other", files: [] } }); // unrelated change events are ignored

    // export current build and all saved builds
    io.exportCurrent();
    assert.equal(toast.textContent, "Saved dronecalc-Wing-2026-11-14.json");
    const doc = JSON.parse(await urls.at(-1).text());
    assert.deepEqual(Object.keys(doc), ["app", "format", "builds"]); assert.equal(doc.builds[0].name, "Wing"); assert.equal(doc.builds[0].hash, X.hashOf(S, 3));
    libEl.l.click({ target: { closest: () => ({ dataset: { io: "export-all" } }) } });
    assert.equal(toast.textContent, "Saved dronecalc-all-builds-2026-11-14.json");
    assert.equal(JSON.parse(await urls.at(-1).text()).builds.length, 3);
    S.mission = ""; io.exportCurrent(); assert.match(toast.textContent, /Nothing to export/);
  } finally { Object.assign(g, saved); Object.assign(URL, urlFns); if (saved.document === undefined) delete g.document; }
});
