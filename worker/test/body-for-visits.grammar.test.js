import { test } from "node:test";
import assert from "node:assert/strict";
import { BUCKETS } from "../src/body-for-visits/lexicon.js";
import { selectNextToken, allowedNext, inferModel, _internals } from "../src/body-for-visits/grammar.js";

const { SUTURE_EVERY, PUNCT_EVERY } = _internals;

function containsToken(bucket, token) {
  return BUCKETS[bucket].includes(token);
}

test("first token is always an opening", () => {
  const { token, role } = selectNextToken(null, 1, 12345);
  assert.equal(role, "openings");
  assert.ok(containsToken("openings", token));
});

test("eventIndex multiples of PUNCT_EVERY force punctuation", () => {
  for (const i of [PUNCT_EVERY, PUNCT_EVERY * 2, PUNCT_EVERY * 3]) {
    const { role } = selectNextToken("nouns", i, 999);
    assert.equal(role, "punctuation", `event ${i} should be punctuation`);
  }
});

test("eventIndex multiples of SUTURE_EVERY (not also PUNCT) force suture", () => {
  // SUTURE_EVERY=7, PUNCT_EVERY=13 → coprime, so 7,14,21,28,35,42 are pure-suture
  for (const i of [7, 14, 21, 28, 35, 42, 49]) {
    if (i % PUNCT_EVERY === 0) continue;
    const { role } = selectNextToken("nouns", i, 42);
    assert.equal(role, "sutures", `event ${i} should be suture`);
  }
});

test("transitions follow the allowed-next table over a 500-event walk", () => {
  let prevRole = null;
  let prevToken = null;
  for (let i = 1; i <= 500; i++) {
    const { token, role } = selectNextToken(prevRole, i, 0xc0ffee);
    if (prevRole === null) {
      assert.equal(role, "openings");
    } else if (i % PUNCT_EVERY === 0) {
      assert.equal(role, "punctuation");
    } else if (i % SUTURE_EVERY === 0) {
      assert.equal(role, "sutures");
    } else {
      const ok = allowedNext(prevRole).includes(role);
      assert.ok(ok, `at i=${i} ${prevRole} → ${role} is not allowed`);
    }
    assert.equal(typeof token, "string");
    prevRole = role;
    prevToken = token;
  }
});

test("selection is deterministic given (eventIndex, seed)", () => {
  const a = selectNextToken("verbs", 5, 7);
  const b = selectNextToken("verbs", 5, 7);
  assert.deepEqual(a, b);
});

test("inferModel counts word bigrams and free-choice role transitions only", () => {
  // 8 human events. Event 7 is a suture-forced destination, so the role
  // transition INTO it must not be counted; word bigrams count every pair.
  const seq = [
    { role: "nouns", token: "w1" },
    { role: "nouns", token: "w2" },
    { role: "nouns", token: "w3" },
    { role: "nouns", token: "w4" },
    { role: "nouns", token: "w5" },
    { role: "nouns", token: "w6" },
    { role: "sutures", token: "w7" }, // event 7 — forced destination
    { role: "nouns", token: "w8" },
  ];
  const m = inferModel(seq);
  assert.equal(m.roles.nouns?.sutures, undefined, "forced transition excluded");
  assert.equal(m.roles.nouns.nouns, 5, "dest events 2..6 counted");
  assert.equal(m.roles.sutures.nouns, 1, "dest event 8 counted");
  assert.equal(Object.keys(m.words).length, 7, "every adjacent pair counted");
  assert.equal(m.words.w6.w7, 1);
  assert.equal(m.words.w7.w8, 1);
});

test("an empty model selects identically to no model (cold start)", () => {
  const empty = { roles: {}, words: {} };
  for (let i = 2; i <= 24; i++) {
    const a = selectNextToken("nouns", i, 0xabc, "request", null);
    const b = selectNextToken("nouns", i, 0xabc, "request", empty);
    assert.deepEqual(a, b, `event ${i}: empty model must match no model`);
  }
});

test("selection is deterministic given a model", () => {
  const model = inferModel([
    { role: "nouns", token: "room" },
    { role: "verbs", token: "holds" },
    { role: "nouns", token: "request" },
  ]);
  const a = selectNextToken("verbs", 5, 7, "holds", model);
  const b = selectNextToken("verbs", 5, 7, "holds", model);
  assert.deepEqual(a, b);
});

test("a learned model only ever reweights within the grammar and bucket", () => {
  // Learn from a self-generated walk, then walk again under the model.
  let prevRole = null;
  let prevToken = null;
  const events = [];
  for (let i = 1; i <= 120; i++) {
    const { token, role } = selectNextToken(prevRole, i, 0xfeed, prevToken);
    events.push({ role, token });
    prevRole = role;
    prevToken = token;
  }
  const model = inferModel(events);
  prevRole = null;
  prevToken = null;
  for (let i = 1; i <= 500; i++) {
    const { token, role } = selectNextToken(prevRole, i, 0xbeef, prevToken, model);
    if (prevRole === null) {
      assert.equal(role, "openings");
    } else if (i % PUNCT_EVERY === 0) {
      assert.equal(role, "punctuation");
    } else if (i % SUTURE_EVERY === 0) {
      assert.equal(role, "sutures");
    } else {
      assert.ok(allowedNext(prevRole).includes(role), `i=${i} ${prevRole}→${role}`);
    }
    assert.ok(containsToken(role, token), `i=${i} token not in ${role} bucket`);
    prevRole = role;
    prevToken = token;
  }
});

test("a learned model biases the role pick toward observed transitions", () => {
  // allowedNext("nouns") = verbs / conjunctions / punctuation. A model that has
  // only ever seen nouns→verbs should pick verbs far above the uniform ~1/3.
  const biased = { roles: { nouns: { verbs: 50 } }, words: {} };
  let verbs = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { role } = selectNextToken("nouns", 5, seed, null, biased);
    if (role === "verbs") verbs++;
  }
  assert.ok(verbs / 300 > 0.8, `expected strong verbs bias, got ${verbs}/300`);
});

test("a learned model biases the word pick toward observed bigrams", () => {
  // Event 13 forces the punctuation bucket. A model that has only seen
  // "request" → "," should pick "," far above the uniform 1/4.
  const biased = { roles: {}, words: { request: { ",": 50 } } };
  let comma = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { token, role } = selectNextToken("nouns", 13, seed, "request", biased);
    assert.equal(role, "punctuation");
    if (token === ",") comma++;
  }
  assert.ok(comma / 300 > 0.8, `expected strong "," bias, got ${comma}/300`);
});
