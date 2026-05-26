import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSnapshotHTML } from "../src/body-for-visits/snapshot.js";

test("snapshot renders stored italic spans as semantic emphasis", () => {
  const html = renderSnapshotHTML({
    body: [
      {
        token: "the small office",
        role: "speech_unit",
        event_id: 1,
        ts: 1,
        spans: [
          { text: "the ", italic: false },
          { text: "small office", italic: true },
        ],
      },
    ],
    fringe: "",
    body_version: 1,
    fold_count: 0,
    corruption_count: 0,
  }, "2026-05-21T00:00:00.000Z");

  assert.match(html, /the <em>small office<\/em>/);
});

test("snapshot escapes text inside italic spans", () => {
  const html = renderSnapshotHTML({
    body: [
      {
        token: "the <small>",
        role: "speech_unit",
        event_id: 1,
        ts: 1,
        spans: [
          { text: "the ", italic: false },
          { text: "<small>", italic: true },
        ],
      },
    ],
    fringe: "",
    body_version: 1,
    fold_count: 0,
    corruption_count: 0,
  }, "2026-05-21T00:00:00.000Z");

  assert.match(html, /the <em>&lt;small&gt;<\/em>/);
  assert.doesNotMatch(html, /<em><small><\/em>/);
});
