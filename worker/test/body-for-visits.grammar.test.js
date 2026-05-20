import { test } from "node:test";
import assert from "node:assert/strict";
import { BUCKETS } from "../src/body-for-visits/lexicon.js";
import { selectNextToken, allowedNext, _internals } from "../src/body-for-visits/grammar.js";

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
