// DroneCalc: dependency-free PDF 1.4 writer (SPEC-v2 section 3).
// Pure: nothing touches the DOM at import; only downloadPdf() needs a browser.
// Text uses the standard-14 Helvetica / Helvetica-Bold with /WinAnsiEncoding, so no font is embedded.
// The whole file is built as a string of char codes 0-255 (one char = one byte), so xref offsets are string indexes.
// The fixed labels (column titles, TOTAL, Page x of y) come from the i18n catalog in the PDF's language: i18n.pdfLang() is English for a script
// WinAnsi cannot draw (Hindi), so that PDF is entirely English; every other language is drawn with its WinAnsi (Latin-1) letters.
import { t as tr, withLang, pdfLang } from "../i18n/i18n.js";

const PW = 595.28, PH = 841.89, M = 36, CW = PW - 2 * M; // A4 portrait in pt, 0.5 in margins
const BAND = 58, TOP = BAND + 22, BOTTOM = PH - 36; // header band; body runs TOP..BOTTOM, y measured downwards
const LEAD = 1.28, PX = 4, PY = 3.5, HS = 6.4; // table line height (x font size), cell padding, header font size
// css/main.css tokens: --ink --ink-2 --paper --paper-2 --accent (rust) --amber --panel-ink, figure background #f3efe2.
// RULE is --rule (ink at 28 %) pre-blended on paper: fills here are opaque.
const INK = "#14181c", INK2 = "#3c434a", PAPER = "#e9e4d4", PAPER2 = "#dfd9c6", SHEET = "#f3efe2",
  RUST = "#b53a08", AMBER = "#ffb000", PANEL_INK = "#d8d4c4", MUTED = "#bdb8a6", RULE = "#adaba0";

// Adobe Core14 AFM advance widths (1/1000 em) for WinAnsi codes 32..255; 0 = code not used in WinAnsi.
const AFM = {
  F1: [ // Helvetica
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0,
    556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
    0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667,
    278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
    400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
    667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
    722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
    556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
  ],
  F2: [ // Helvetica-Bold
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0,
    556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
    0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667,
    278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
    400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
    722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
    722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
    556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
    611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556,
  ],
};

// Unicode code points of WinAnsi bytes 0x80..0x9F (0 = unused); 0xA0..0xFF equal Latin-1.
const WIN = new Map();
[0x20ac, 0, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0, 0x17d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0, 0x17e, 0x178]
  .forEach((u, i) => u && WIN.set(u, String.fromCharCode(0x80 + i)));
// Outside WinAnsi: ASCII stand-ins ("" drops the char); currency signs become ISO codes; anything else becomes "?".
const SUB = { "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~", "→": "->", "←": "<-",
  "↔": "<->", "⇒": "=>", "↗": "", "−": "-", "‐": "-", "‑": "-", " ": " ",
  " ": " ", " ": " ", " ": " ", "­": "", "​": "", "‌": "", "‍": "", "⁠": "",
  "﻿": "", "️": "", "′": "'", "″": "\"" };
const CUR = { "₹": "INR", "₩": "KRW", "₽": "RUB", "₺": "TRY", "₱": "PHP", "₦": "NGN",
  "₫": "VND", "₪": "ILS", "฿": "THB", "₴": "UAH", "₸": "KZT", "₭": "LAK", "₮": "MNT",
  "₲": "PYG", "₵": "GHS", "₡": "CRC", "₼": "AZN", "₾": "GEL", "৳": "BDT", "₿": "BTC" };

// Any value -> WinAnsi byte string. Apply exactly once per value: bytes 0x80-0x9F are glyphs afterwards.
function S(v) {
  const s = String(v ?? "").normalize("NFC");
  let o = "";
  for (let i = 0; i < s.length;) {
    const c = s.codePointAt(i), ch = String.fromCodePoint(c);
    i += ch.length;
    if (c < 32 || (c > 126 && c < 160)) o += " ";
    else if (ch in SUB) o += SUB[ch];
    else if (c < 256) o += ch;
    else if (WIN.has(c)) o += WIN.get(c);
    else if (CUR[ch]) o += (/\d$/.test(o) ? " " : "") + CUR[ch] + (/[\d.]/.test(s[i] ?? "") ? " " : "");
    else o += "?";
  }
  return o;
}
const U = (v) => S(String(v ?? "").toUpperCase());
const esc = (s) => s.replace(/[\\()]/g, "\\$&");
const f = (v, d = 2) => (Number.isFinite(+v) ? String(+(+v).toFixed(d)) : "0");
const rgb = (h) => [1, 3, 5].map((i) => f(parseInt(h.slice(i, i + 2), 16) / 255, 3)).join(" ");
const enc = (c) => { try { return encodeURIComponent(c); } catch { return ""; } };
// Only web/mail links become annotations; non-ASCII is percent-encoded because /URI strings are 7-bit.
const uri = (u) => ((u = String(u ?? "").trim()), /^(https?:|mailto:)/i.test(u) ? u.replace(/[^\x21-\x7e]/gu, enc) : "");

// Width in pt of a sanitized string; tc = char spacing, sc = horizontal scale % (both as in the PDF text state).
function tw(s, fn, z, tc = 0, sc = 100) {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += AFM[fn][s.charCodeAt(i) - 32] || 0;
  return ((w * z) / 1000 + tc * Math.max(0, s.length - 1)) * (sc / 100);
}

// Greedy word wrap on real glyph widths; words wider than the column are split by characters.
// A number keeps its short unit ("2.4 GHz", "40 °C") on the same line via a no-break space (WinAnsi 0xA0).
function wrap(s, fn, z, maxW) {
  const lines = [];
  let cur = "";
  for (let word of s.replace(/(\d) (?=[A-Za-z%\xb0\xb5/]{1,5}(?![A-Za-z]))/g, "$1\xa0").split(" ")) {
    if (!word) continue;
    const cand = cur ? cur + " " + word : word;
    if (tw(cand, fn, z) <= maxW) { cur = cand; continue; }
    if (cur) lines.push(cur);
    while (word.length > 1 && tw(word, fn, z) > maxW) {
      // Grow the cut upward: cost tracks the line length, not the word length (an 8000-char word took 15 s cutting down).
      let k = 1;
      while (k < word.length && tw(word.slice(0, k + 1), fn, z) <= maxW) k++;
      lines.push(word.slice(0, k));
      word = word.slice(k);
    }
    cur = word;
  }
  if (cur) lines.push(cur);
  return lines;
}

const clip = (s, fn, z, maxW, tc) => {
  if (tw(s, fn, z, tc) <= maxW) return s;
  let k = 0; // grow upward, same reason as wrap()
  while (k < s.length && tw(s.slice(0, k + 1) + "\x85", fn, z, tc) <= maxW) k++;
  return s.slice(0, k) + "\x85";
};
const blank = (s) => /^[\s\-\x96\x97]*$/.test(s);
const NUM = /^([A-Z]{3} )?[-+~<>=]*\d/; // "12.5 W", "~3", "INR 1,234.00" read as numbers -> right-aligned

// fit = natural width (numbers, short codes); the other columns share the rest by weight wt.
const BOM_COLS = () => [{ t: "#", right: 1, fit: 1 }, { t: tr("pdfx.col.category"), fit: 1 }, { t: tr("pdfx.col.part"), wt: 2.4 }, { t: tr("pdfx.col.brand"), wt: 0.95 },
  { t: tr("pdfx.col.qty"), right: 1, fit: 1 }, { t: tr("pdfx.col.unit"), right: 1, fit: 1 }, { t: tr("pdfx.col.line"), right: 1, fit: 1 }, { t: tr("pdfx.col.links"), wt: 1.3 }];
const OPT_COLS = () => [{ t: "#", right: 1, fit: 1 }, { t: tr("pdfx.col.part"), wt: 3 }, { t: tr("pdfx.col.brand"), wt: 1.2 },
  { t: tr("pdfx.col.price"), right: 1, fit: 1 }, { t: tr("pdfx.col.links"), wt: 1.3 }];

/** doc -> PDF bytes. doc shape: SPEC-v2 section 3. All values are display strings. */
function build(doc) {
  doc = doc || {};
  const pages = [];
  let pg, y, sec = 0;
  const newPage = () => { pages.push((pg = { ops: [], links: [] })); y = TOP; };
  const room = (h) => { if (y + h > BOTTOM && y > TOP + 1) newPage(); };
  const op = (s) => pg.ops.push(s);
  const Y = (v) => f(PH - v);
  const rect = (x, t, w, h, c) => op(`${rgb(c)} rg ${f(x)} ${Y(t + h)} ${f(w)} ${f(h)} re f`);
  const frame = (x, t, w, h, lw, c) => op(`${rgb(c)} RG ${f(lw)} w ${f(x)} ${Y(t + h)} ${f(w)} ${f(h)} re S`);
  const rule = (x1, y1, x2, y2, lw, c) => op(`${rgb(c)} RG ${f(lw)} w ${f(x1)} ${Y(y1)} m ${f(x2)} ${Y(y2)} l S`);
  // s must be sanitized; o.right puts the text's right edge at x
  const text = (x, base, s, fn, z, c, o = {}) => {
    if (!s) return;
    const w = tw(s, fn, z, o.tc, o.sc);
    op(`BT /${fn} ${f(z)} Tf ${f(o.tc || 0)} Tc ${o.sc || 100} Tz ${rgb(c)} rg ${f(o.right ? x - w : x)} ${Y(base)} Td (${esc(s)}) Tj ET`);
  };
  const cell = (s, fn = "F1", z = 7.8, c = INK) => ({ s, fn, z, c });
  const linkCell = (l) => { const url = uri(l?.url); return { s: S(l?.label || l?.url), fn: "F1", z: 7.4, c: url ? RUST : INK2, url }; };

  const section = (title, aside, need) => { // numbered heading, kept with the first `need` pt of its content
    room(40 + need);
    if (y > TOP + 1) y += 14;
    sec++;
    rule(M, y, M + CW, y, 1.5, INK);
    text(M, y + 15, String(sec).padStart(2, "0"), "F2", 11, RUST, { sc: 88 });
    text(M + 19, y + 15, U(title), "F2", 11, INK, { tc: 0.9, sc: 88 });
    text(M + CW, y + 14.5, U(aside), "F1", 6.6, INK2, { right: true, tc: 0.6 });
    y += 24;
  };
  const subhead = (label, title, aside, need) => {
    room(22 + need);
    if (y > TOP + 1) y += 8;
    text(M, y + 9, label, "F2", 8, RUST, { tc: 0.3 });
    text(M + 22, y + 9, U(title), "F2", 8, INK, { tc: 0.8 });
    text(M + CW, y + 9, U(aside), "F1", 6.4, INK2, { right: true, tc: 0.5 });
    y += 14;
  };

  // rows: [[block]], one block list per column; blocks stack vertically inside the cell.
  // compact: size columns to content (+ gutter) when that fits, instead of stretching to the full width.
  const widths = (defs, rows, compact) => {
    const nat = defs.map((d, i) => 2 * PX + 1 + Math.max(tw(U(d.t), "F2", HS), ...rows.map((r) => Math.max(0, ...r[i].map((b) => tw(b.s, b.fn, b.z))))));
    if (compact && nat.reduce((a, n) => a + n + 22, 0) <= CW) return defs.map((d, i) => ({ ...d, w: nat[i] + 22 }));
    const flex = defs.some((d) => !d.fit), isFit = (d) => d.fit && flex;
    const fixed = defs.reduce((a, d, i) => a + (isFit(d) ? nat[i] : 0), 0);
    const k = Math.min(1, (CW * 0.7) / (fixed || 1)); // fit columns never take more than 70 % of the width
    const wsum = defs.reduce((a, d, i) => a + (isFit(d) ? 0 : d.wt ?? nat[i]), 0);
    return defs.map((d, i) => ({ ...d, w: isFit(d) ? nat[i] * k : ((CW - fixed * k) * (d.wt ?? nat[i])) / wsum }));
  };
  const prep = (cols, rows) => {
    const head = cols.map((c) => wrap(U(c.t), "F2", HS, c.w - 2 * PX));
    const headH = Math.max(1, ...head.map((l) => l.length)) * HS * 1.25 + 8;
    const body = rows.map((row) => {
      const cells = row.map((blocks, i) => blocks.flatMap((b, bi) => wrap(b.s, b.fn, b.z, cols[i].w - 2 * PX).map((s) => ({ ...b, s, bi }))));
      return { cells, h: Math.max(7.8 * LEAD, ...cells.map((ls) => ls.reduce((a, l) => a + l.z * LEAD, 0))) + 2 * PY };
    });
    return { cols, head, headH, body, need: headH + (body[0]?.h || 0), W: cols.reduce((a, c) => a + c.w, 0) };
  };
  const drawHead = (t) => {
    rect(M, y, t.W, t.headH, PAPER2);
    let x = M;
    t.cols.forEach((c, i) => {
      t.head[i].forEach((l, j) => text(c.right ? x + c.w - PX : x + PX, y + 4 + HS + j * HS * 1.25, l, "F2", HS, INK, { right: c.right }));
      x += c.w;
    });
    y += t.headH;
    rule(M, y, M + t.W, y, 0.8, INK);
  };
  const drawTable = (t) => {
    drawHead(t);
    t.body.forEach((row, r) => {
      if (r && y + row.h > BOTTOM) { // r > 0: the caller's room() already placed the first row
        rule(M, y, M + t.W, y, 1.2, INK);
        text(M + t.W, y + 10, S(tr("pdfx.continued", { page: pages.length + 1 })), "F1", 6.4, INK2, { right: true });
        newPage();
        drawHead(t); // header row repeats on every page
      }
      if (r % 2) rect(M, y, t.W, row.h, PAPER);
      let x = M;
      row.cells.forEach((ls, i) => {
        const c = t.cols[i], hit = [];
        let ly = y + PY;
        for (const l of ls) {
          const lh = l.z * LEAD, base = ly + lh / 2 + 0.33 * l.z, w = tw(l.s, l.fn, l.z);
          const lx = c.right ? x + c.w - PX - w : x + PX;
          text(lx, base, l.s, l.fn, l.z, l.c);
          if (l.url) {
            rule(lx, base + 1.4, lx + w, base + 1.4, 0.45, RUST);
            const b = (hit[l.bi] ||= { url: l.url, x1: lx, x2: lx + w, t: ly });
            b.x1 = Math.min(b.x1, lx); b.x2 = Math.max(b.x2, lx + w); b.b = ly + lh;
          }
          ly += lh;
        }
        hit.forEach((b) => pg.links.push({ url: b.url, r: [b.x1 - 1, PH - b.b, b.x2 + 1, PH - b.t] }));
        x += c.w;
      });
      y += row.h;
    });
    rule(M, y, M + t.W, y, 1.2, INK);
  };

  newPage();

  // Title block. shortcut: drawn at the top of page 1 without page breaks; fine below ~40 pairs.
  const meta = (doc.meta || []).filter(Array.isArray);
  if (meta.length) {
    const per = Math.min(4, meta.length), w = CW / per, y0 = y;
    for (let r = 0; r < meta.length; r += per) {
      const row = meta.slice(r, r + per).map(([k, v]) => [U(k), wrap(S(v), "F2", 9.5, w - 14)]);
      const h = 18 + Math.max(1, ...row.map((c) => c[1].length)) * 11.5;
      if (r) rule(M, y, M + CW, y, 0.5, RULE);
      row.forEach(([k, ls], i) => {
        const x = M + i * w;
        if (i) rule(x, y, x, y + h, 0.5, RULE);
        text(x + 7, y + 11, k, "F2", 6.2, INK2, { tc: 0.8 });
        ls.forEach((l, j) => text(x + 7, y + 24 + j * 11.5, l, "F2", 9.5, INK));
      });
      y += h;
    }
    frame(M, y0, CW, y - y0, 1.5, INK);
  }

  // Key figures: three key/value columns, values right-aligned.
  const specs = (doc.specs || []).filter(Array.isArray);
  if (specs.length) {
    const per = 3, gap = 18, w = (CW - gap * (per - 1)) / per;
    const rows = [];
    for (let r = 0; r < specs.length; r += per) {
      const row = specs.slice(r, r + per).map(([k, v]) => {
        const vs = S(v), vw = Math.min(tw(vs, "F2", 8.2), w * 0.55);
        return { k: wrap(S(k), "F1", 7.8, w - vw - 8), v: wrap(vs, "F2", 8.2, vw) };
      });
      rows.push({ row, h: Math.max(1, ...row.map((c) => Math.max(c.k.length, c.v.length))) * 10.5 + 6 });
    }
    section(tr("pdfx.keyFigures"), "", rows[0].h);
    for (const { row, h } of rows) {
      room(h);
      row.forEach((c, i) => {
        const x = M + i * (w + gap);
        c.k.forEach((l, j) => text(x, y + 11 + j * 10.5, l, "F1", 7.8, INK2));
        c.v.forEach((l, j) => text(x + w, y + 11 + j * 10.5, l, "F2", 8.2, INK, { right: true }));
        rule(x, y + h, x + w, y + h, 0.4, RULE);
      });
      y += h;
    }
  }

  if (doc.bom) {
    const b = doc.bom, list = (b.rows || []).filter(Boolean);
    const rows = list.map((r) => [
      [cell(S(r.n), "F1", 7.4, INK2)],
      [cell(U(r.category), "F2", 6.6, INK2)],
      [cell(S(r.part)), ...(r.note ? [cell(S(r.note), "F1", 6.6, INK2)] : [])],
      [cell(S(r.brand))],
      [cell(S(r.qty))],
      [cell(S(r.unit))],
      [cell(S(r.line), "F2")],
      (r.links || []).map(linkCell),
    ]);
    const t = prep(widths(BOM_COLS(), rows), rows);
    section(tr("pdfx.bom"), tr("pdfx.lines", { count: list.length }), t.need);
    drawTable(t);

    // Total box: the site's dark readout (ink panel, amber figure).
    const tot = S(b.total), bud = S(b.budget), bw = 236, bx = M + CW - bw;
    const nl = wrap(S(b.budgetNote), "F1", 7, bw - 20);
    const h = 32 + (bud ? 15 : 0) + nl.length * 9.2 + (nl.length ? 5 : 0);
    room(h + 10);
    y += 10;
    rect(bx, y, bw, h, INK);
    text(bx + 10, y + 19, U(tr("pdfx.total")), "F2", 7.4, PAPER, { tc: 1.4 });
    text(bx + bw - 10, y + 21, tot, "F2", Math.min(14, (14 * (bw - 74)) / (tw(tot, "F2", 14) || 1)), AMBER, { right: true });
    let yy = y + 32;
    if (bud) {
      rule(bx + 10, yy, bx + bw - 10, yy, 0.5, INK2);
      text(bx + 10, yy + 10, U(tr("pdfx.budget")), "F2", 6.4, PANEL_INK, { tc: 1.2 });
      text(bx + bw - 10, yy + 10, bud, "F1", 8, PANEL_INK, { right: true });
      yy += 15;
    }
    nl.forEach((l, j) => text(bx + 10, yy + 8 + j * 9.2, l, "F1", 7, MUTED));
    y += h;
  }

  if (doc.options) {
    const groups = doc.options.filter(Boolean).map((g) => ({
      name: g.category,
      rows: (g.items || []).filter(Boolean).map((it, i) => [[cell(String(i + 1), "F1", 7.4, INK2)], [cell(S(it.part))],
        [cell(S(it.brand))], [cell(S(it.price), "F2")], (it.links || []).map(linkCell)]),
    }));
    const cols = widths(OPT_COLS(), groups.flatMap((g) => g.rows)); // one set of widths so columns line up across categories
    const ts = groups.map((g) => prep(cols, g.rows.length ? g.rows : [[[], [cell(S(tr("pdfx.noParts")), "F1", 7.4, INK2)], [], [], []]]));
    const n = groups.reduce((a, g) => a + g.rows.length, 0);
    section(tr("pdfx.options"), tr("pdfx.optionsAside", { parts: tr("pdfx.parts", { count: n }), cats: tr("pdfx.cats", { count: groups.length }) }), 22 + (ts[0]?.need || 0));
    groups.forEach((g, k) => {
      subhead(`${sec}.${k + 1}`, g.name, tr("pdfx.optionCount", { count: g.rows.length }), ts[k].need);
      drawTable(ts[k]);
    });
  }

  for (const tb of doc.tables || []) {
    if (!tb) continue;
    const heads = tb.columns || [];
    const raw = (tb.rows || []).map((r) => heads.map((_, i) => S(r?.[i])));
    const num = heads.map((_, i) => raw.some((r) => !blank(r[i])) && raw.every((r) => blank(r[i]) || NUM.test(r[i])));
    const rows = raw.map((r) => r.map((s) => [cell(s)]));
    const t = prep(widths(heads.map((h, i) => ({ t: h, right: num[i], fit: num[i] })), rows, true), rows);
    section(tb.title, "", t.need);
    drawTable(t);
  }

  const notes = (doc.notes || []).map(S).filter((s) => s.trim()).map((s) => wrap(s, "F1", 7.6, CW - 20));
  if (notes.length) {
    section(tr("pdfx.notes"), "", notes[0].length * 10.4 + 4);
    notes.forEach((ls, i) => {
      room(ls.length * 10.4 + 4);
      text(M, y + 8, String(i + 1).padStart(2, "0"), "F2", 7.6, RUST);
      ls.forEach((l, j) => text(M + 20, y + 8 + j * 10.4, l, "F1", 7.6, INK2));
      y += ls.length * 10.4 + 4;
    });
  }

  // Header band (needs the page total): paper band, 3 pt ink rule and the site's ring-and-crosshair mark.
  const title = U(doc.title || "DroneCalc");
  pages.forEach((p, i) => {
    const body = p.ops;
    pg = p;
    p.ops = [];
    rect(0, 0, PW, PH, SHEET);
    rect(0, 0, PW, BAND - 3, PAPER);
    rect(0, BAND - 3, PW, 3, INK);
    const cx = M + 9, cy = 28, r = 7.6, k = 0.5523 * r, py = PH - cy;
    const pt = (dx, dy) => `${f(cx + dx)} ${f(py + dy)}`;
    op(`${rgb(INK)} RG 2.4 w ${pt(r, 0)} m ${pt(r, k)} ${pt(k, r)} ${pt(0, r)} c ${pt(-k, r)} ${pt(-r, k)} ${pt(-r, 0)} c ` +
      `${pt(-r, -k)} ${pt(-k, -r)} ${pt(0, -r)} c ${pt(k, -r)} ${pt(r, -k)} ${pt(r, 0)} c S`);
    rule(cx, cy - 15.5, cx, cy + 15.5, 2.4, RUST);
    rule(cx - 15.5, cy, cx + 15.5, cy, 2.4, RUST);
    const tx = M + 34, maxW = PW - M - 92 - tx;
    text(tx, cy + 2, title, "F2", Math.min(15, (15 * maxW) / (tw(title, "F2", 15, 0.8, 88) || 1)), INK, { tc: 0.8, sc: 88 });
    text(tx, cy + 13.5, clip(U(doc.subtitle), "F1", 6.8, maxW, 0.8), "F1", 6.8, INK2, { tc: 0.8 });
    text(PW - M, cy + 2, S(doc.dateISO), "F2", 8.5, INK, { right: true, tc: 0.5 });
    text(PW - M, cy + 13.5, S(tr("pdfx.page", { n: i + 1, total: pages.length })), "F1", 7, INK2, { right: true, tc: 0.4 });
    p.ops.push(...body);
  });

  // Objects: 1 catalog, 2 page tree, 3-4 fonts, 5 info, then per page: contents, link annotations, page.
  const hex16 = (v) => { let h = "<FEFF"; const s = String(v ?? ""); for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, "0"); return h + ">"; };
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(doc.dateISO ?? ""));
  const objs = [null, null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Title ${hex16(doc.title || "DroneCalc")} /Subject ${hex16(doc.subtitle)} ` +
    `/Creator (DroneCalc) /Producer (drone-calc pdf.js)${d ? ` /CreationDate (D:${d[1]}${d[2]}${d[3]})` : ""} >>`];
  const add = (s) => objs.push(s); // returns the new object's number
  const kids = pages.map((p) => {
    const data = p.ops.join("\n");
    const contents = add(`<< /Length ${data.length} >>\nstream\n${data}\nendstream`);
    const annots = p.links.map((l) => add(`<< /Type /Annot /Subtype /Link /Rect [${l.r.map((v) => f(v)).join(" ")}] /Border [0 0 0] ` +
      `/A << /Type /Action /S /URI /URI (${esc(l.url)}) >> >>`));
    return add(`<< /Type /Page /Parent 2 0 R /Contents ${contents} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(" ")}]` : ""} >>`);
  });
  objs[0] = "<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /DisplayDocTitle true >> >>";
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} /MediaBox [0 0 ${PW} ${PH}] ` +
    "/Resources << /ProcSet [/PDF /Text] /Font << /F1 3 0 R /F2 4 0 R >> >> >>";

  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offs = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const c = out.charCodeAt(i);
    if (c > 255) throw new Error(`pdf.js: unsanitized char U+${c.toString(16)} at byte ${i}`); // a missed S() call, never user input
    bytes[i] = c;
  }
  return bytes;
}

/** doc -> PDF bytes, with the fixed labels in the PDF's language (English where that language's script cannot be drawn: see the top of this file). */
export const buildBomPdf = (doc) => withLang(pdfLang(), () => build(doc));

/** Browser only: save bytes as a PDF download. */
export function downloadPdf(bytes, filename = "document.pdf") {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // revoke later: some browsers read the blob after click() returns
}
