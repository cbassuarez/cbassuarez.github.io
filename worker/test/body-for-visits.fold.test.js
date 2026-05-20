import { test } from "node:test";
import assert from "node:assert/strict";
import { foldBody, realTokenCount, MAX_VISIBLE, KEEP_TAIL } from "../src/body-for-visits/fold.js";

function makeToken(i) {
  return { token: `entry ${i}`, role: "speech_unit", event_id: i, ts: i };
}

test("body unchanged when under MAX_VISIBLE", () => {
  const body = Array.from({ length: 90 }, (_, i) => makeToken(i + 1));
  const result = foldBody(body, 0, 0);
  assert.equal(result.body.length, 90);
  assert.equal(result.fold_count, 0);
  assert.equal(result.fold_generations, 0);
});

test("fold marker glyph matches expected format and ends with `held⟩`", () => {
  const body = Array.from({ length: MAX_VISIBLE + 5 }, (_, i) => makeToken(i + 1));
  const result = foldBody(body, 0, 0);
  const marker = result.body[0];
  assert.equal(marker.role, "fold_marker");
  assert.match(marker.token, /^⟨folded ×\d+: \d+ entries held⟩$/);
});

test("after fold, real tokens kept = KEEP_TAIL, marker is at index 0", () => {
  const body = Array.from({ length: MAX_VISIBLE + 10 }, (_, i) => makeToken(i + 1));
  const result = foldBody(body, 0, 0);
  assert.equal(result.body[0].role, "fold_marker");
  assert.equal(realTokenCount(result.body), KEEP_TAIL);
  assert.equal(result.fold_count, MAX_VISIBLE + 10 - KEEP_TAIL);
  assert.equal(result.fold_generations, 1);
});

test("body is bounded across 1000 sequential appends", () => {
  let body = [];
  let foldCount = 0;
  let foldGens = 0;
  for (let i = 1; i <= 1000; i++) {
    body.push(makeToken(i));
    const r = foldBody(body, foldCount, foldGens);
    body = r.body;
    foldCount = r.fold_count;
    foldGens = r.fold_generations;
    assert.ok(body.length <= MAX_VISIBLE + 1, `body too long at i=${i}: ${body.length}`);
  }
  // accounting: folded + visible real = total emitted
  assert.equal(foldCount + realTokenCount(body), 1000);
  // at most one marker (we replace, not stack)
  const markers = body.filter((t) => t.role === "fold_marker").length;
  assert.equal(markers, 1);
});
