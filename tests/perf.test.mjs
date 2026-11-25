import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderPerformance, bindPerformance, perfTables } from "../js/ui/perf.js";

// Fixtures live once, in perf-preview.html (<script id="fx">), so the preview and this test see the same fake builds.
const page = readFileSync(new URL("./perf-preview.html", import.meta.url), "utf8");
new Function(page.match(/<script id="fx">([\s\S]*?)<\/script>/)[1])();
const { quad, vtol, tiltrotor, fixedwing, fpv } = globalThis.PERF_FIXTURES;
const ctx = { missionLabel: "Mapping / survey" };
const BAD = /NaN|undefined|Infinity|null/;
const LEN = { "Fig 1": "speed", "Fig 2": "payload", "Fig 3": "battery", "Fig 4": "throttle", "Fig 5": "profile" };
const tbodies = (html) => [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((m) => (m[1].match(/<tr/g) || []).length);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("fixtures are sane physics (best range above best endurance, flight time falls with payload)", () => {
  for (const r of [quad, vtol, tiltrotor, fixedwing]) {
    const P = r.performance;
    assert.ok(P.bestSpeed.rangeMs > P.bestSpeed.enduranceMs);
    for (let i = 1; i < P.payload.length; i++) assert.ok(P.payload[i].flightMin < P.payload[i - 1].flightMin);
  }
});

const KEYS = {
  vtol: ["Span", "Wing loading", "Lift : drag", "Stall", "Cruise", "Hover vs cruise"],
  tiltrotor: ["Span", "Wing loading", "Lift : drag", "Stall", "Cruise", "Hover vs cruise", "Tilt servos", "Tilt time", "Transition angle"],
  fixedwing: ["Span", "Wing loading", "Lift : drag", "Stall", "Cruise", "Launch", "Endurance", "Range"],
};
for (const [name, r] of [["quad", quad], ["vtol", vtol], ["tiltrotor", tiltrotor], ["fixedwing", fixedwing]]) {
  t(`${name}: six figures, clean text, every figure fully equipped`, () => {
    const out = renderPerformance(r, ctx);
    assert.equal(typeof out, "string");
    assert.doesNotMatch(out, BAD, out.match(BAD)?.[0]);
    for (let i = 1; i <= 6; i++) assert.match(out, new RegExp(`<em>FIG ${i}</em>`), `fig ${i}`);
    for (const re of [/class="pf-svg" role="img" tabindex="0" aria-label="Figure \d/g, /data-pf="table"/g, /data-pf="csv"/g, /<figcaption id="[^"]+"><b>Fig \d\./g, /class="pf-key"/g, /class="db"/g])
      assert.equal((out.match(re) || []).length >= 6, true, String(re));
    assert.doesNotMatch(out, /pf-miss/);
    assert.match(out, /class="vb[^"]*"/); // build point values printed on the figures
    assert.equal(/class="pf-vt"/.test(out), name !== "quad");
    for (const k of KEYS[name] || []) assert.ok(out.includes(`<dt>${k}</dt>`), k);
    if (KEYS[name]) assert.equal((out.match(/<dt>/g) || []).length, KEYS[name].length);
    if (name !== "quad") assert.match(out, /class="pf-ga-svg"/); // planform drawn
  });

  t(`${name}: table rows match the data lengths (perfTables and on-screen tables)`, () => {
    const T = perfTables(r), P = r.performance, out = renderPerformance(r, ctx);
    const want = [P.speed.length, P.payload.length, P.battery.length, P.throttle.length, P.profile.length, Object.values(r.weights).filter((g) => g > 0).length];
    for (const tb of T) {
      const key = LEN[tb.title.slice(0, 5)];
      if (key) assert.equal(tb.rows.length, P[key].length, tb.title);
    }
    assert.deepEqual(T.slice(0, 6).map((x) => x.rows.length), want);
    assert.deepEqual(tbodies(out), want);
  });

  t(`${name}: perfTables shape is display strings with units in the column titles`, () => {
    const T = perfTables(r);
    assert.equal(T.length, name === "quad" ? 6 : 7);
    if (name !== "quad") { assert.equal(T[6].title, name === "vtol" ? "VTOL key figures" : "Wing / tilt"); assert.equal(T[6].rows.length, KEYS[name].length); }
    for (const tb of T) {
      assert.equal(typeof tb.title, "string");
      assert.ok(Array.isArray(tb.columns) && tb.columns.length >= 2 && tb.columns.every((c) => typeof c === "string"));
      for (const row of tb.rows) {
        assert.equal(row.length, tb.columns.length, tb.title);
        for (const c of row) { assert.equal(typeof c, "string"); assert.doesNotMatch(c, BAD); }
      }
    }
    assert.deepEqual(T[0].columns, ["Speed (m/s)", "Power (W)", "Current (A)", "Flight time (min)", "Range (km)"]);
  });
}

t("fixed wing: stall boundary, no hover marker, cruise build point on the static-thrust sweep, own airframe drawing", () => {
  const out = renderPerformance(fixedwing, ctx);
  assert.match(out, /class="lm"/); // stall boundary pole on the speed polar
  assert.match(out, /Stall boundary 9\.6 m\/s/);
  assert.doesNotMatch(out, /HOVER \d|Hover throttle/); // no hover marker
  assert.match(out, /\d+% bench throttle/i); // throttle build point, named for the static test stand
  assert.doesNotMatch(out, /TWR &lt;/); // no thrust-to-weight floor for a wing
  assert.match(out, /<em>FIXED WING<\/em>/);
  assert.match(out, /class="fn"/); // fin / tail on the planform
});

t("profile: launch, climb, loiter and descent each get their own mark and legend entry", () => {
  const out = renderPerformance(fixedwing, ctx), key = out.match(/<ul class="pf-key">((?:(?!<\/ul>)[\s\S])*?Launch[\s\S]*?)<\/ul>/)[1];
  const items = [...key.matchAll(/<li><i class="(k-sw[^"]*)" style="--c:([^"]+)"><\/i>([^<]+)<\/li>/g)].map((m) => [m[3], `${m[1]} ${m[2]}`]);
  assert.deepEqual(items.map((i) => i[0]), ["Launch", "Climb", "Cruise", "Loiter", "Descent"]);
  assert.equal(new Set(items.map((i) => i[1])).size, 5); // five distinct marks
  assert.match(out, /pattern id="[^"]+-s0"/); // striped variants drawn
});

t("tiltrotor: tilt strip and planform with tilt axes and angle, no pusher, tilting-rotor throttle", () => {
  const out = renderPerformance(tiltrotor, ctx);
  assert.match(out, /<em>TILTROTOR<\/em>/);
  assert.match(out, /class="ax"/);
  assert.match(out, /TILT 90°/);
  assert.match(out, /Tilt-rotor throttle/);
  assert.match(out, /HOVER \d+%/);
});

t("fpv: the class label appears in the captions that name the mission", () => {
  const out = renderPerformance(fpv, { missionLabel: "FPV freestyle/racing" });
  assert.doesNotMatch(out, BAD);
  assert.match(out, /pf-lede">[^<]*7 in long range/);
  assert.match(out, /<figcaption id="[^"]+"><b>Fig 5\.<\/b> [^<]*FPV · 7 in long range mission/);
  assert.doesNotMatch(renderPerformance(quad, { missionLabel: "FPV freestyle/racing" }), /7 in/);
});

t("missing or partial series: figure skipped with a note, never throws", () => {
  const partial = { ...quad, performance: { speed: quad.performance.speed, payload: null, battery: [], throttle: [{ pct: 50 }] } };
  const out = renderPerformance(partial, ctx);
  assert.doesNotMatch(out, BAD);
  assert.equal((out.match(/class="pf pf-miss"/g) || []).length, 4); // payload, battery, throttle, profile
  assert.match(out, /<em>FIG 1<\/em>Speed polar/);
  assert.equal(perfTables(partial).length, 2); // speed + weights
  for (const x of [null, undefined, 0, "x", {}, [], { ok: false, errors: ["bad"] }, { ok: true }, { ...quad, performance: undefined, weights: undefined, vtol: undefined }, { ...vtol, vtol: { wingspanMm: NaN } }, { ...fixedwing, fixedWing: { launch: 5 } }, { ...tiltrotor, vtol: { ...tiltrotor.vtol, tilt: "x" } }, { ...fpv, fpvClass: "99" }]) {
    const o = renderPerformance(x, {});
    assert.equal(typeof o, "string");
    assert.doesNotMatch(o, BAD, JSON.stringify(x)?.slice(0, 40));
    assert.ok(Array.isArray(perfTables(x)));
  }
});

t("non-finite points are dropped, not drawn", () => {
  const r = structuredClone(quad);
  r.performance.speed[3].powerW = NaN;
  r.performance.speed.push({ ms: Infinity, powerW: 1, currentA: 1, flightMin: 1, rangeKm: 1 }, null);
  r.performance.battery[2].flightMin = undefined;
  const out = renderPerformance(r, ctx);
  assert.doesNotMatch(out, BAD);
  const T = perfTables(r);
  assert.equal(T[0].rows.length, quad.performance.speed.length - 1);
  assert.equal(T[2].rows.length, quad.performance.battery.length - 1);
});

t("payload: zone below the mission min TWR is hatched; unknown mission skips the zone", () => {
  const out = renderPerformance(quad, ctx);
  assert.match(out, /TWR &lt; 2\.0/);
  assert.doesNotMatch(renderPerformance(quad, { missionLabel: "Unknown" }), /TWR &lt;/);
  assert.match(renderPerformance(quad, { minTWR: 1.5 }), /TWR &lt; 1\.5|Min 1\.5|MIN 1\.5/);
});

t("bindPerformance tolerates odd roots", () => {
  for (const x of [null, undefined, {}, 1]) bindPerformance(x);
});

console.log(`${n} tests passed`);
