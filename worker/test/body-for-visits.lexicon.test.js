import { test } from "node:test";
import assert from "node:assert/strict";
import { BUCKETS, ROLES } from "../src/body-for-visits/lexicon.js";

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
