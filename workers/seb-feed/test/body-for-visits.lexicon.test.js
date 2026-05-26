import { test } from "node:test";
import assert from "node:assert/strict";
import { BUCKETS, ROLES, TOKEN_PRIORS, WORD_PRIOR_SOURCE } from "../src/body-for-visits/lexicon.js";

test("every linguistic role is present and non-empty", () => {
  for (const role of ROLES) {
    assert.ok(Array.isArray(BUCKETS[role]), `bucket ${role} must be an array`);
    assert.ok(BUCKETS[role].length > 0, `bucket ${role} must be non-empty`);
  }
});

test("corruption_glyphs are single graphemes", () => {
  assert.ok(BUCKETS.corruption_glyphs.length >= 6);
  for (const g of BUCKETS.corruption_glyphs) {
    assert.equal(typeof g, "string");
    assert.equal([...g].length, 1, `expected single grapheme, got ${JSON.stringify(g)}`);
  }
});

test("no bucket has duplicates or empty entries", () => {
  for (const [name, bucket] of Object.entries(BUCKETS)) {
    const seen = new Set();
    for (const tok of bucket) {
      assert.equal(typeof tok, "string", `${name} contains non-string`);
      assert.notEqual(tok.length, 0, `${name} contains empty string`);
      assert.ok(!seen.has(tok), `${name} duplicates "${tok}"`);
      seen.add(tok);
    }
  }
});

test("linguistic buckets are backed by generated neutral word priors", () => {
  assert.ok(WORD_PRIOR_SOURCE.scowl.includes("en-wl/wordlist-diff"));
  assert.ok(WORD_PRIOR_SOURCE.frequency.includes("reneklacan/symspell"));
  assert.ok(Object.keys(TOKEN_PRIORS.nouns).length >= 500);
  assert.ok(Object.keys(TOKEN_PRIORS.verbs).length >= 400);
  assert.ok(Object.keys(TOKEN_PRIORS.adjectives).length >= 400);
  assert.ok(BUCKETS.nouns.length >= 70);
  assert.ok(BUCKETS.verbs.length >= 50);
  assert.ok(BUCKETS.adjectives.length >= 60);

  for (const role of ROLES) {
    for (const token of BUCKETS[role]) {
      assert.equal(typeof TOKEN_PRIORS[role][token], "number", `${role}/${token} has no prior`);
      assert.ok(TOKEN_PRIORS[role][token] > 0, `${role}/${token} must have positive prior`);
    }
  }
});
