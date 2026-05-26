import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideQualify,
  SESSION_QUOTA_LIMIT_DEFAULT,
  SESSION_QUOTA_WINDOW_MS_DEFAULT,
} from "../src/body-for-visits/decide.js";

const browser =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

// decide.js no longer owns generation — the Durable Object injects a selector.
// These tests exercise the orchestration (bot / quota / selector), so a stub
// selector standing in for the neural model is sufficient.
const stubSelector = () => ({ token: "here we are,", role: "speech_unit" });

test("first qualify from a fresh session appends", async () => {
  const d = await decideQualify({
    ua: browser,
    sessionWindowCount: 0,
    prevRole: null,
    prevToken: null,
    humanEventIndex: 1,
    seed: 42,
    now: 1_700_000_000_000,
    selector: stubSelector,
  });
  assert.equal(d.action, "append");
  assert.equal(d.ua_class, "browser");
  assert.equal(typeof d.token, "string");
  assert.equal(d.role, "speech_unit");
});

test("append decisions preserve optional styled spans", async () => {
  const spans = [
    { text: "here ", italic: false },
    { text: "we are", italic: true },
  ];
  const d = await decideQualify({
    ua: browser,
    sessionWindowCount: 0,
    prevRole: null,
    prevToken: null,
    humanEventIndex: 1,
    seed: 42,
    now: 1_700_000_000_000,
    selector: () => ({ token: "here we are", role: "speech_unit", spans }),
  });
  assert.equal(d.action, "append");
  assert.deepEqual(d.spans, spans);
});

test("same session can append below the rolling quota", async () => {
  const t0 = 1_700_000_000_000;
  const d = await decideQualify({
    ua: browser,
    sessionWindowCount: SESSION_QUOTA_LIMIT_DEFAULT - 1,
    prevRole: "openings",
    prevToken: "here",
    humanEventIndex: 2,
    seed: 42,
    now: t0 + 60_000, // 1 min later
    selector: stubSelector,
  });
  assert.equal(d.action, "append");
});

test("a missing selector withholds", async () => {
  const d = await decideQualify({
    ua: browser,
    sessionWindowCount: 0,
    prevRole: null,
    prevToken: null,
    humanEventIndex: 1,
    seed: 42,
  });
  assert.equal(d.action, "withhold");
  assert.equal(d.reason, "no_selector");
});

test("same session at the rolling quota is cooldown", async () => {
  const t0 = 1_700_000_000_000;
  const d = await decideQualify({
    ua: browser,
    sessionWindowCount: SESSION_QUOTA_LIMIT_DEFAULT,
    prevRole: "openings",
    prevToken: "here",
    humanEventIndex: 2,
    seed: 42,
    now: t0 + SESSION_QUOTA_WINDOW_MS_DEFAULT - 1,
  });
  assert.equal(d.action, "cooldown");
});

test("generator failure withholds without appending", async () => {
  const d = await decideQualify({
    ua: browser,
    sessionWindowCount: 0,
    prevRole: "speech_unit",
    prevToken: "at first the room remembers,",
    humanEventIndex: 2,
    seed: 42,
    selector: () => null,
  });
  assert.equal(d.action, "withhold");
  assert.equal(d.reason, "generator");
});

test("bot UA never appends, regardless of session state", async () => {
  const d = await decideQualify({
    ua: "GPTBot/1.0",
    lastSessionTs: null,
    prevRole: null,
    prevToken: null,
    humanEventIndex: 1,
    seed: 42,
  });
  assert.equal(d.action, "bot");
  assert.equal(d.bucket, "llm");
});

test("empty UA classifies as bot", async () => {
  const d = await decideQualify({
    ua: "",
    lastSessionTs: null,
    prevRole: null,
    prevToken: null,
    humanEventIndex: 1,
    seed: 1,
  });
  assert.equal(d.action, "bot");
  assert.equal(d.bucket, "empty");
});
