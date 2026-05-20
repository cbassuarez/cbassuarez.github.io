import { test } from "node:test";
import assert from "node:assert/strict";
import { decideQualify, COOLDOWN_MS_DEFAULT } from "../src/body-for-visits/decide.js";

const browser =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

test("first qualify from a fresh session appends", () => {
  const d = decideQualify({
    ua: browser,
    lastSessionTs: null,
    prevRole: null,
    prevToken: null,
    humanEventIndex: 1,
    seed: 42,
    now: 1_700_000_000_000,
  });
  assert.equal(d.action, "append");
  assert.equal(d.ua_class, "browser");
  assert.equal(typeof d.token, "string");
  assert.equal(d.role, "openings");
});

test("second qualify from same session within 24h is cooldown", () => {
  const t0 = 1_700_000_000_000;
  const d = decideQualify({
    ua: browser,
    lastSessionTs: t0,
    prevRole: "openings",
    prevToken: "here",
    humanEventIndex: 2,
    seed: 42,
    now: t0 + 60_000, // 1 min later
  });
  assert.equal(d.action, "cooldown");
});

test("same session after cooldown is allowed to append", () => {
  const t0 = 1_700_000_000_000;
  const d = decideQualify({
    ua: browser,
    lastSessionTs: t0,
    prevRole: "openings",
    prevToken: "here",
    humanEventIndex: 2,
    seed: 42,
    now: t0 + COOLDOWN_MS_DEFAULT + 1,
  });
  assert.equal(d.action, "append");
});

test("bot UA never appends, regardless of session state", () => {
  const d = decideQualify({
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

test("empty UA classifies as bot", () => {
  const d = decideQualify({
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
