import { test } from "node:test";
import assert from "node:assert/strict";
import {
  duplicateQualifyResponse,
  normalizeVisitId,
  SerialQueue,
} from "../src/body-for-visits/idempotency.js";

test("normalizeVisitId accepts bounded token-shaped ids", () => {
  assert.equal(
    normalizeVisitId("A0B1C2D3-E4F5-6789-abcd-ef0123456789"),
    "a0b1c2d3-e4f5-6789-abcd-ef0123456789"
  );
  assert.equal(normalizeVisitId("visit-1234"), "visit-1234");
});

test("normalizeVisitId distinguishes missing from invalid ids", () => {
  assert.equal(normalizeVisitId(null), "");
  assert.equal(normalizeVisitId(""), "");
  assert.equal(normalizeVisitId("short"), null);
  assert.equal(normalizeVisitId("bad/id"), null);
  assert.equal(normalizeVisitId("x".repeat(81)), null);
});

test("duplicateQualifyResponse returns current state without a new-token marker", () => {
  const state = { body_version: 4, new_token_index: null, body: [{ token: "already", role: "speech_unit" }] };
  const quota = { limit: 5, remaining: 4 };
  assert.deepEqual(duplicateQualifyResponse(state, quota), {
    ...state,
    skipped: "duplicate",
    quota,
  });
});

test("SerialQueue runs jobs one at a time in order", async () => {
  const queue = new SerialQueue();
  const events = [];
  let releaseFirst;
  const firstDone = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.run(async () => {
    events.push("first:start");
    await firstDone;
    events.push("first:end");
    return 1;
  });
  const second = queue.run(async () => {
    events.push("second:start");
    return 2;
  });

  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();

  assert.equal(await first, 1);
  assert.equal(await second, 2);
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
});

test("SerialQueue continues after a rejected job", async () => {
  const queue = new SerialQueue();
  const events = [];
  await assert.rejects(
    queue.run(async () => {
      events.push("reject");
      throw new Error("nope");
    }),
    /nope/
  );

  const value = await queue.run(async () => {
    events.push("next");
    return 3;
  });
  assert.equal(value, 3);
  assert.deepEqual(events, ["reject", "next"]);
});
