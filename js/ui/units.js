// Display units (F6): metric or imperial. DISPLAY ONLY. The engine, the share-link hash and saved builds stay in SI
// (g, kg, mm, m, m/s, km, °C); this module converts at the edge, so an old link or saved build is unaffected by the choice.
// Pure: no DOM. Metric is the identity everywhere (same strings as before), so only the imperial render changes.
import { t, fmtNum } from '../i18n/i18n.js';
export const KEY = 'dronecalc:units';
const CODES = ['metric', 'imperial'];
export const valid = (u) => CODES.includes(u);

const OZ = 0.03527396194958041, FT2 = 0.10763910416709722, IN3 = 0.06102374409473229;
// quantity -> [metric label, imperial label, factor metric -> imperial, offset (imperial), extra decimals in imperial for num()].
// A gram value becomes ounces (one more decimal keeps a number of that size readable); thrust and force follow mass (gf -> ozf, kgf -> lbf).
const Q = {
  g: ['g', 'oz', OZ, 0, 1], kg: ['kg', 'lb', 2.2046226218487757, 0, 0],
  mm: ['mm', 'in', 1 / 25.4, 0, 1], cm: ['cm', 'in', 1 / 2.54, 0, 1], m: ['m', 'ft', 3.280839895013123, 0, 0],
  ms: ['m/s', 'mph', 2.2369362920544025, 0, 0], kmh: ['km/h', 'mph', 0.6213711922373339, 0, 0], km: ['km', 'mi', 0.6213711922373339, 0, 0],
  c: ['°C', '°F', 1.8, 32, 0],
  gw: ['g/W', 'oz/W', OZ, 0, 2], dm2: ['dm²', 'in²', 15.500031000062, 0, 0], gdm2: ['g/dm²', 'oz/ft²', OZ / FT2, 0, 1],
  gcc: ['g/cm³', 'oz/in³', OZ / IN3, 0, 1], kgcm: ['kg·cm', 'oz·in', OZ * 1000 / 2.54, 0, 0],
};
// Metric unit label -> quantity, for text and form fields that only know the label.
export const QOF = Object.fromEntries(Object.entries(Q).map(([q, a]) => [a[0], q]));

let cur = 'metric';
export const get = () => cur;
export const isImperial = () => cur === 'imperial';
export const set = (u) => { if (valid(u)) cur = u; return cur; };

// Stored choice (strict: only the two codes), else imperial for an en-US browser and metric for everyone else.
export function initial(storage, lang) {
  let s = null;
  try { s = storage?.getItem(KEY); } catch { /* storage unavailable */ }
  return valid(s) ? s : lang === 'en-US' ? 'imperial' : 'metric';
}
const store = () => { try { return localStorage; } catch { return null; } };
export const load = (storage = store(), lang = typeof navigator === 'object' ? navigator.language : '') => set(initial(storage, lang));
export const save = (u, storage = store()) => { try { storage?.setItem(KEY, u); } catch { /* the choice lasts this visit */ } };

const fin = Number.isFinite;
const U = (u) => (u === 'imperial' ? 1 : 0);
export const label = (q, u = cur) => Q[q][U(u)];
export const dx = (q, u = cur) => (u === 'imperial' ? Q[q][4] : 0);
export const toDisplay = (q, v, u = cur) => (u === 'imperial' && fin(v) ? v * Q[q][2] + Q[q][3] : v);
export const fromDisplay = (q, v, u = cur) => (u === 'imperial' && fin(v) ? (v - Q[q][3]) / Q[q][2] : v);
// Number text in display units: toFixed(d) in metric (as before), d plus the quantity's extra decimals in imperial. '-' when not a number.
export const num = (q, v, d = 0, u = cur) => (fin(v) ? toDisplay(q, v, u).toFixed(d + dx(q, u)) : '-');
export const format = (q, v, d = 0, u = cur) => `${num(q, v, d, u)} ${label(q, u)}`;
// Value as the data holds it (no fixed decimals) with its unit: metric prints the number untouched; imperial rounds by size (3 significant digits, at most 2 decimals).
export const show = (q, v, u = cur) => (u === 'imperial' && fin(v) ? `${sig(toDisplay(q, v, u))} ${label(q, u)}` : `${v} ${label(q, u)}`);
const sig = (x) => String(+x.toFixed(Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2));
// "a and b unit" for a field's allowed range.
export const range = (q, lo, hi, u = cur) => t('units.range', { lo: fmtNum(Number(num(q, lo, 0, u))), hi: fmtNum(Number(num(q, hi, 0, u))), unit: label(q, u) });

// Number inputs. value shown: the stored SI number untouched in metric; in imperial a short rounded figure. parse() goes the other way and rounds
// to 4 decimals so 3,281 ft stores 1000.0488 m, never 1000.04880001. The page only calls parse() when the user types, so an untouched field never drifts.
export const input = (q, v, u = cur) => (u === 'imperial' && fin(v) ? +toDisplay(q, v, u).toFixed(3) : v);
export const parse = (q, raw, u = cur) => { const x = Number(raw); return u === 'imperial' && fin(x) ? Math.round(fromDisplay(q, x, u) * 1e4) / 1e4 : x; };
export const step = (q, siStep, u = cur) => (u === 'imperial' ? { kg: 0.1, m: 100, c: 1, ms: 1, g: 0.1 }[q] ?? 'any' : siStep);

// Free text written in metric (engine warnings, check messages, part notes) -> the display units. "250 g", "1-2 kg", "-400 m", "12 m/s", "20 °C", "25,000 g".
// Metric text comes back untouched. Numbers with no unit after them, and units with no number before them, are left alone.
const UNIT_RE = /(^|[^\w.,])([-−])?(\d[\d,]*(?:\.\d+)?)(?:(\s?[-–]\s?)(\d[\d,]*(?:\.\d+)?))?(\s?)(°C|kg·cm|g\/dm²|g\/cm³|g\/W|km\/h|m\/s|kg|mm|cm|km|dm²|g|m)(?![\p{L}\p{N}²³/])/gu;
export function text(s, u = cur) {
  if (u !== 'imperial' || typeof s !== 'string') return s;
  // The leading group stands in for a lookbehind (Safari < 16.4 cannot parse one); it is put back unchanged.
  return s.replace(UNIT_RE, (all, pre, neg, a, sep, b, sp, unit) => {
    const q = QOF[unit], one = (x, d0, n) => {
      const v = toDisplay(q, (n ? -1 : 1) * Number(x.replace(/,/g, '')), u), d = q === 'c' ? d0 : Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2, r = v.toFixed(d);
      return x.includes(',') ? Number(r).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : r;
    }, dec = (x) => (x.split('.')[1] || '').length;
    return `${pre}${one(a, dec(a), neg)}${b ? sep + one(b, dec(b), false) : ''}${sp}${label(q, u)}`;
  });
}
