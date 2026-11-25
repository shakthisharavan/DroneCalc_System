// Share-link hash is untrusted: name cut on code points, bidi/zero-width stripped, sel ids and hash length bounded.
import assert from "node:assert/strict";
import * as E from "../js/engine.js";
import * as C from "../js/catalog.js";
import * as M from "../js/matcher.js";
import * as PERF from "../js/ui/perf.js";
import { createState, cleanName, NAME_MAX } from "../js/ui/state.js";

const X = createState({ E, C, M, PERF });

// M1: a 40-unit cut used to split the emoji, leaving a lone surrogate that made encodeURIComponent throw in hashOf.
{
  const { S, step } = X.parse("#s=3&m=mapping&n=" + "a".repeat(39) + "%F0%9F%98%80");
  assert.equal(step, 3); assert.equal(S.mission, "mapping");
  assert.equal(S.name, "a".repeat(39) + "\u{1F600}", "pair kept whole, 40 code points");
  let h; assert.doesNotThrow(() => { h = X.hashOf(S, step); });
  assert.equal(X.parse(h).S.name, S.name, "name round-trips");
  assert.equal([...cleanName("\u{1F600}".repeat(60))].length, NAME_MAX, "capped by code points");
  assert.equal(cleanName("a" + "\u{1F600}".repeat(60)), "a" + "\u{1F600}".repeat(39));
}
// A lone surrogate already in the input never reaches encodeURIComponent.
{
  assert.equal(cleanName("ab\ud83dcd\ude00e"), "abcde");
  const S = { ...X.parse("#s=3&m=mapping").S, name: "x\ud83d" };
  assert.doesNotThrow(() => X.hashOf(S, 3));
  assert.match(X.hashOf(S, 3), /&n=x$/);
}
// L4: bidi override / isolate and zero-width chars are stripped.
{
  assert.equal(cleanName("ab‮cd​ef‏⁦g⁩﻿h‪"), "abcdefgh");
  assert.equal(X.parse("#s=3&m=mapping&n=a%E2%80%AEb%E2%80%8Bc").S.name, "abc");
}
// L1: sel ids must be short ids; hostile or oversized ones are dropped, valid ones kept.
{
  const ok = C.CATALOG.find((i) => i.category === "motor").id;
  const sel = (v) => X.parse("#s=3&m=mapping&sel=" + encodeURIComponent(v)).S.sel;
  assert.deepEqual(sel("motor:" + ok), { motor: ok });
  assert.deepEqual(sel("motor:" + "a".repeat(64)), { motor: "a".repeat(64) }, "64 chars is the limit");
  assert.deepEqual(sel("motor:" + "a".repeat(65)), {}, "65 chars dropped");
  assert.deepEqual(sel("motor:<img src=x onerror=alert(1)>"), {});
  assert.deepEqual(sel("motor:-lead"), {}, "must start with a letter or digit");
  assert.deepEqual(sel("motor:a b"), {});
  assert.deepEqual(sel(`motor:${"x".repeat(100)},battery:${C.CATALOG.find((i) => i.category === "battery").id}`), { battery: C.CATALOG.find((i) => i.category === "battery").id }, "bad entry dropped, good kept");
  for (const i of C.CATALOG) assert.match(i.id, /^[a-z0-9][a-z0-9._-]{0,63}$/i, `catalog id ${i.id}`);
}
// An oversized hash falls back to defaults, like an invalid one.
{
  const big = "#s=3&m=mapping&n=" + "a".repeat(5000), d = X.parse("");
  assert.deepEqual(X.parse(big), d);
  assert.equal(X.parse(big).S.mission, "");
  assert.equal(X.parse("#s=3&m=mapping&sel=" + "motor:a,".repeat(700)).S.mission, "", "5.6 KB hash refused whole");
}
// Existing valid share links round-trip unchanged.
{
  const ids = Object.fromEntries(["motor", "battery", "esc"].map((c) => [c, C.CATALOG.find((i) => i.category === c).id]));
  const S = { ...X.parse("#s=3&m=delivery&t=25&p=1.5&cfg=hex&alt=500&tmp=15&w=4&b=800&cur=USD").S, name: "My Hex é\u{1F600}", sel: ids, mw: 2400 };
  const h = X.hashOf(S, 3);
  assert.ok(h.length < 600, "real link far under the cap");
  assert.deepEqual(X.parse(h).S, S);
  assert.equal(X.hashOf(X.parse(h).S, 3), h);
  assert.equal(X.parse(h).step, 3);
}
