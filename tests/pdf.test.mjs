import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildBomPdf } from "../js/ui/pdf.js";

const OUT = new URL("./out/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const money = (cur, v) => `${cur} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const q = encodeURIComponent;
const storeLinks = (name, n) => [
  { label: "Amazon IN", url: `https://www.amazon.in/s?k=${q(name)}` },
  { label: "Robu.in", url: `https://robu.in/?s=${q(name)}&post_type=product` },
  { label: "GetFPV (ships intl.)", url: `https://www.getfpv.com/catalogsearch/result/?q=${q(name)}` },
].slice(0, n);

// [category, part, brand, qty, unit INR, note]; a few strings carry chars outside WinAnsi on purpose
const PARTS = [
  ["frame", "X650 carbon quad frame, 650 mm wheelbase (folding arms)", "Tarot", 1, 14500, "Carbon 3K plates"],
  ["motor", "MN3508 KV380 navigator motor", "T-Motor", 4, 9800, "Stator 35x08, 6S"],
  ["esc", "Air 40A 6S ESC (single)", "T-Motor", 4, 3100, ""],
  ["fc", "Pixhawk 6C flight controller", "Holybro", 1, 21500, "PX4 / ArduPilot"],
  ["gps", "M10 GPS + compass module", "Holybro", 1, 6400, ""],
  ["battery", "6S 10000 mAh 25C LiPo", "Tattu", 2, 18900, "Two packs for hot swap"],
  ["prop", "P15x5 carbon props (CW/CCW pair)", "T-Motor", 2, 5200, "pairs ≥ 15 in"],
  ["camera", "ZT6 dual-sensor gimbal: 640×512 thermal + 4K 6× zoom", "SIYI", 1, 145000, "Inspection payload → core"],
  ["radio", "TX16S MKII transmitter, Hall gimbals, 2.4 GHz", "RadioMaster", 1, 21000, ""],
  ["receiver", "RP3 ExpressLRS diversity receiver", "RadioMaster", 1, 2100, ""],
  ["telemetry", "SiK telemetry radio V3, 433 MHz (pair)", "Holybro", 1, 5600, "Check local band rules"],
  ["power", "PM02 V3 power module, 12S", "Holybro", 1, 2900, ""],
  ["pdb", "Power distribution board, XT90 input", "Matek", 1, 1450, ""],
  ["vtx", "Avatar HD Pro kit ↗", "Walksnail", 1, 17500, ""],
  ["extras", "XT90-S anti-spark connectors", "Amass", 4, 240, "‘quoted’ “note” – dash"],
  ["extras", "Silicone wire 10 AWG, red + black, 1 m", "Generic", 2, 380, ""],
  ["extras", "Folding landing gear, 220 mm", "Tarot", 1, 2600, ""],
  ["extras", "Battery straps 20 x 300 mm, Kevlar", "Generic", 4, 150, ""],
  ["extras", "Anti-vibration plate for FC", "Holybro", 1, 900, ""],
  ["extras", "Folding GPS mast, carbon", "Tarot", 1, 750, ""],
  ["extras", "M3 nylon standoff kit, 180 pcs", "Generic", 1, 450, ""],
  ["extras", "Threadlocker 243, 10 ml", "Loctite", 1, 520, "Motor screws"],
  ["extras", "Buzzer + RGB LED arming indicator", "Matek", 1, 650, ""],
  ["sensor", "TF-Luna lidar rangefinder, 8 m", "Benewake", 1, 2350, "Terrain follow"],
  ["servo", "MG996R metal gear servo (payload release)", "TowerPro", 1, 420, ""],
  ["charger", "K4 dual AC/DC smart charger, 400 W", "ISDT", 1, 15800, "Charges both packs at 1C"],
  ["extras", "LiPo safe bag 230 x 300 mm", "Generic", 2, 650, ""],
  ["extras", "Spare props P15x5 (pair)", "T-Motor", 2, 5200, ""],
  ["extras", "Carry case, foam-cut, 70 x 50 cm", "Generic", 1, 6900, ""],
  ["extras", "Supercalifragilisticexpialidocious-extra-long-part-number-ABC123-XYZ789-unbroken", "Generic", 1, 999, "Long-word wrap check"],
];

const bomRows = PARTS.map(([category, part, brand, qty, unit, note], i) => ({
  n: String(i + 1), category, part, brand, qty: String(qty), unit: money("INR", unit), line: money("INR", qty * unit), note,
  links: storeLinks(`${brand} ${part.split(",")[0]}`, (i % 3) + 1),
}));
const total = PARTS.reduce((a, p) => a + p[3] * p[4], 0);

const specs = [["All-up weight", "4.62 kg"], ["Thrust-to-weight", "2.4 : 1"], ["Hover throttle", "41 %"], ["Est. flight time", "27.5 min"],
  ["Battery", "6S 10000 mAh LiPo x 2"], ["Hover power", "712 W"], ["Peak current", "96 A"], ["Motor", "3508, 380 KV"],
  ["Propeller", "15 in"], ["Range at cruise", "14.2 km"], ["Cruise speed", "10 m/s"], ["Operating temp.", "-10 to 40 °C"]];
const tables = [
  { title: "Speed sweep", columns: ["Speed (m/s)", "Power (W)", "Current (A)", "Flight (min)", "Range (km)"],
    rows: Array.from({ length: 14 }, (_, i) => [(i * 1.2).toFixed(1), (712 + i * i * 6).toFixed(0), ((712 + i * i * 6) / 22.2).toFixed(1), (27.5 - i * 0.9).toFixed(1), (i * 1.2 * (27.5 - i * 0.9) * 0.06).toFixed(2)]) },
  { title: "Payload sweep", columns: ["Payload (kg)", "Flight (min)", "TWR"],
    rows: Array.from({ length: 10 }, (_, i) => [(i * 0.15).toFixed(2), (31 - i * 1.4).toFixed(1), (2.9 - i * 0.12).toFixed(2)]) },
  { title: "Mission profile", columns: ["Phase", "Start (s)", "Duration (s)", "Power (W)"],
    rows: [["takeoff", "0", "20", "980"], ["cruise", "20", "1290", "690"], ["hover", "1310", "180", "712"], ["landing", "1490", "30", "640"], ["reserve", "1520", "130", "-"]] },
];
const notes = [
  "Approximate exchange rates as of 2026-11-06. Prices are converted from USD list prices; local prices differ (duties, shipping). Verify at checkout.",
  "Availability changes daily. Links open the store listing or a store search for the part; stock, price and specifications must be confirmed before ordering.",
  "Flight time is an estimate from momentum theory with fixed efficiency assumptions. Bench-test thrust and current before the first flight.",
];

const bomDoc = {
  title: "DroneCalc: Drone calculator and bill of materials",
  subtitle: "Bill of materials — inspection quad, 25 min target, 0.8 kg payload",
  dateISO: "2026-11-06",
  meta: [["Mission", "Inspection"], ["Configuration", "Quad X"], ["Flight target", "25 min"], ["Payload", "0.8 kg"],
    ["Region", "India"], ["Currency", "INR - Indian rupee"], ["Budget", money("INR", 450000)], ["Parts", "30 lines"]],
  specs,
  bom: { rows: bomRows, total: money("INR", total), budget: money("INR", 450000),
    budgetNote: `Within budget: ${money("INR", 450000 - total)} headroom (${Math.round((100 * (450000 - total)) / 450000)} %).` },
  options: null,
  tables,
  notes,
};

const CATS = { frame: 5, motor: 7, esc: 5, fc: 5, battery: 6, prop: 5, camera: 8, vtol: 6, pusher: 3, servo: 4, sensor: 3, extras: 9 };
const BRANDS = ["T-Motor", "Holybro", "iFlight", "SIYI", "Matek", "Tattu", "RadioMaster", "Foxeer", "Caddx"];
const optionsDoc = {
  title: "DroneCalc: Drone calculator and bill of materials",
  subtitle: "Available options — mapping VTOL, United States",
  dateISO: "2026-11-06",
  meta: [["Mission", "Mapping"], ["Configuration", "VTOL quadplane"], ["Region", "United States"], ["Currency", "USD - US dollar"]],
  specs: specs.slice(0, 6),
  bom: null,
  options: Object.entries(CATS).map(([category, n], c) => ({
    category: category[0].toUpperCase() + category.slice(1),
    items: Array.from({ length: n }, (_, i) => {
      const brand = BRANDS[(c + i) % BRANDS.length], part = `${category} option ${i + 1}${i % 4 === 0 ? " with a much longer descriptive model name, revision B" : ""}`;
      return { part, brand, price: money("USD", 19.99 * (i + 1) * (c + 1)),
        links: [{ label: "GetFPV", url: `https://www.getfpv.com/catalogsearch/result/?q=${q(`${brand} ${part}`)}` },
          { label: "Amazon US", url: `https://www.amazon.com/s?k=${q(`${brand} ${part}`)}` }].slice(0, 1 + (i % 2)) };
    }),
  })),
  tables: tables.slice(0, 1),
  notes: notes.slice(0, 2),
};

// Hostile input: rupee signs, emoji, CJK, missing fields, a non-web link, an empty category.
const edgeDoc = {
  title: "Drone ₹ test 🚁", subtitle: "₹12,340.00 budget → ≥ 2 packs ↗ — 日本",
  dateISO: "2026-11-06",
  meta: [["Budget", "₹ 1,23,400"], ["Mixed", "₹100 + €90 + £80 + ¥70 + ₩600"], null],
  specs: [["Thrust ≥", "≈ 2.1 : 1"]],
  bom: { rows: [{ n: "1", category: "motor", part: "Motor (₹ price) \\ back(slash)", brand: "Bränd µ", qty: "4", unit: "₹ 2,500.00", line: "₹10,000.00", note: null,
    links: [{ label: "Store ↗", url: "https://example.com/p?q=₹ (a)" }, { label: "Bad scheme", url: "javascript:alert(1)" }] }],
    total: "₹10,000.00" },
  options: [{ category: "Camera", items: [] }],
  tables: [{ title: "Empty table", columns: ["A", "B"], rows: [] }],
  notes: ["₹ note", "↗", null],
};

const latin1 = (u8) => Buffer.from(u8).toString("latin1");

function checkPdf(bytes, links, name) {
  assert.ok(bytes instanceof Uint8Array, `${name}: Uint8Array`);
  assert.ok(bytes.every((b) => b <= 255), `${name}: every byte <= 255`);
  const s = latin1(bytes);
  assert.ok(s.startsWith("%PDF-1.4"), `${name}: header`);
  assert.match(s, /%%EOF\n?$/, `${name}: ends with %%EOF`);

  const sx = Number(/startxref\n(\d+)\n%%EOF\n?$/.exec(s)?.[1]);
  assert.equal(sx, s.lastIndexOf("\nxref\n") + 1, `${name}: startxref is the real offset of xref`);
  const head = /^xref\n0 (\d+)\n/.exec(s.slice(sx));
  assert.ok(head, `${name}: xref header`);
  const size = Number(head[1]), table = s.slice(sx + head[0].length, sx + head[0].length + 20 * size);
  assert.equal(table.slice(0, 20), "0000000000 65535 f \n", `${name}: free entry`);
  for (let n = 1; n < size; n++) {
    const e = table.slice(n * 20, n * 20 + 20);
    assert.match(e, /^\d{10} 00000 n \n$/, `${name}: xref entry ${n} is 20 bytes`);
    assert.ok(s.startsWith(`${n} 0 obj`, Number(e.slice(0, 10))), `${name}: xref offset of object ${n}`);
  }
  assert.match(s, new RegExp(`trailer\\n<< /Size ${size} `), `${name}: trailer /Size`);

  for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    assert.ok(s.startsWith("\nendstream", m.index + m[0].length + Number(m[1])), `${name}: stream /Length`);
  }
  const pages = s.match(/\/Type \/Page\b/g).length;
  assert.equal(pages, Number(/\/Type \/Pages .*?\/Count (\d+)/.exec(s)[1]), `${name}: page objects = /Count`);
  assert.equal((s.match(/\/Subtype \/Link/g) || []).length, links, `${name}: one link annotation per link`);
  const rects = [...s.matchAll(/\/Rect \[([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)\]/g)];
  assert.equal(rects.length, links, `${name}: every annotation has a positive /Rect`);
  for (const [, ...r] of rects) {
    const [x1, y1, x2, y2] = r.map(Number);
    assert.ok(x1 >= 0 && y1 >= 0 && x2 <= 595.28 && y2 <= 841.89 && x2 - x1 > 5 && y2 - y1 > 5, `${name}: link rect on page ${r}`);
  }
  assert.equal((s.match(/\/S \/URI \/URI \(https:\/\//g) || []).length, links, `${name}: annotations are https URIs`);
  for (let i = 1; i <= pages; i++) assert.ok(s.includes(`(Page ${i} of ${pages}) Tj`), `${name}: "Page ${i} of ${pages}" in header`);
  assert.ok(!/[^\x00-\x7f]/.test(s.slice(sx)), `${name}: xref/trailer are ASCII`);
  writeFileSync(new URL(name, OUT), bytes);
  return { s, pages };
}

// (a) 30-row BOM: >= 2 pages, table header repeated, sanitizer output present
const bomLinks = bomRows.reduce((a, r) => a + r.links.length, 0);
const bom = checkPdf(buildBomPdf(bomDoc), bomLinks, "bom-sample.pdf");
assert.ok(bom.pages >= 2, "30-row BOM spans at least 2 pages");
assert.ok((bom.s.match(/\(LINKS\) Tj/g) || []).length >= 2, "BOM header row repeats on the next page");
assert.ok(bom.s.includes("(Continued on page 2) Tj"), "continuation marker");
assert.ok(bom.s.includes(`(${money("INR", total)}) Tj`), "total box shows the total");
assert.ok(bom.s.includes("2.4\xa0GHz"), "a number and its unit never split across lines");
for (const t of ["(pairs >= 15\xa0in) Tj", "(Inspection payload -> core) Tj", "(Avatar HD Pro kit) Tj", "(TOTAL) Tj", "(01) Tj", "(NOTES) Tj"]) {
  assert.ok(bom.s.includes(t), `BOM content has ${t}`);
}
assert.ok(bom.s.includes("(\x91quoted\x92 \x93note\x94 \x96 dash) Tj"), "curly quotes and dash map to WinAnsi bytes");
assert.ok(bom.s.includes("640\xd7512"), "multiplication sign kept as WinAnsi 0xD7");
assert.ok(bom.s.includes("/BaseFont /Helvetica ") && bom.s.includes("/BaseFont /Helvetica-Bold "), "standard fonts");
assert.equal((bom.s.match(/\/Encoding \/WinAnsiEncoding/g) || []).length, 2, "WinAnsiEncoding on both fonts");

// (b) options doc
const optLinks = optionsDoc.options.reduce((a, g) => a + g.items.reduce((b, it) => b + it.links.length, 0), 0);
const opt = checkPdf(buildBomPdf(optionsDoc), optLinks, "options-sample.pdf");
assert.ok(opt.pages >= 2, "options doc spans pages");
for (const c of Object.keys(CATS)) assert.ok(opt.s.includes(`(${c.toUpperCase()}) Tj`), `options doc lists ${c}`);
assert.ok(!opt.s.includes("(TOTAL) Tj"), "no total box without a BOM");

// (c) rupee and other hostile input must not crash; only the https link becomes an annotation
const edge = checkPdf(buildBomPdf(edgeDoc), 1, "edge-sample.pdf");
assert.ok(edge.s.includes("(INR 10,000.00) Tj"), "rupee sign becomes INR");
assert.ok(edge.s.includes("(INR 100 + \x8090 + \xa380 + \xa570 + KRW 600) Tj"), "currency signs: ISO codes outside WinAnsi, glyphs inside");
assert.ok(edge.s.includes("(Motor \\(INR price\\) \\\\ back\\(slash\\)) Tj"), "escapes \\ ( )");
assert.ok(edge.s.includes("/URI (https://example.com/p?q=%E2%82%B9%20\\(a\\))"), "URI percent-encoded and escaped");
assert.ok(!edge.s.includes("javascript:"), "non-web link is not an annotation");
assert.ok(edge.s.includes("(DRONE INR TEST ?) Tj"), "emoji becomes a single ?");
assert.ok(edge.s.includes("(Br\xe4nd \xb5) Tj"), "Latin-1 kept");
assert.ok(edge.s.includes("(No parts listed.) Tj"), "empty category placeholder");
assert.doesNotThrow(() => buildBomPdf({}), "empty doc");
assert.doesNotThrow(() => buildBomPdf(null), "null doc");
checkPdf(buildBomPdf({ title: "₹" }), 0, "minimal-sample.pdf");

// (d) one 20000-char word must wrap fast (the old downward cut was cubic: 8000 chars took 15 s)
const t0 = performance.now();
const long = checkPdf(buildBomPdf({ title: "x".repeat(20000), subtitle: "y".repeat(20000), notes: ["z".repeat(20000)] }), 0, "long-word-sample.pdf");
const ms = performance.now() - t0;
assert.ok(ms < 200, `20000-char word wraps in under 200 ms (took ${ms.toFixed(0)} ms)`);
assert.ok(long.pages >= 1 && long.s.includes("zzzz"), "long word is split across lines, not dropped");

console.log(`pdf tests passed: bom ${bom.pages} pages / ${bomLinks} links, options ${opt.pages} pages / ${optLinks} links, edge ${edge.pages} page`);
