import { test } from "node:test";
import assert from "node:assert/strict";
import { createVoiceSelector } from "../src/body-for-visits/voice.js";
import { validateSpeechUnit } from "../src/body-for-visits/grammar.js";

// A non-empty model so the cold-start short-circuit does not pre-empt the
// LLM path, and a prevToken the candidates can legally follow.
const MODEL = { recentTokens: ["the", "room", "keeps", "turning"] };
const PREV = "the room keeps turning";

// A net selector stub that counts its calls. Returns a valid open unit.
function netStub() {
  const fn = (...args) => {
    fn.calls += 1;
    void args;
    return { token: "well now", role: "speech_unit" };
  };
  fn.calls = 0;
  return fn;
}

test("createVoiceSelector requires a net selector", () => {
  assert.throws(() => createVoiceSelector({ ai: {} }), /netSelector is required/);
});

test("voice selector uses a valid LLM candidate", async () => {
  const net = netStub();
  let aiCalls = 0;
  const ai = {
    run: async () => {
      aiCalls += 1;
      return { response: "we wonder" };
    },
  };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", 5, 0x1234, PREV, MODEL);
  assert.equal(out.role, "speech_unit");
  assert.equal(out.token, "we wonder");
  assert.equal(validateSpeechUnit(out.token, PREV).ok, true);
  assert.equal(aiCalls, 1);
  assert.equal(net.calls, 0);
});

test("voice selector falls back to the net on empty output", async () => {
  const net = netStub();
  const ai = { run: async () => ({ response: "" }) };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", 5, 0x1234, PREV, MODEL);
  assert.equal(out.token, "well now");
  assert.equal(net.calls, 1);
});

test("voice selector accepts a continuation that is not a net-style opener", async () => {
  const net = netStub();
  const ai = { run: async () => ({ response: "of the night" }) };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", 5, 0x1234, PREV, MODEL);
  assert.equal(out.token, "of the night");
  assert.equal(net.calls, 0);
  // strict (net) validation rejects "of" as a bad starter — the LLM path does not
  assert.equal(validateSpeechUnit("of the night").ok, false);
});

test("voice selector truncates an over-long reply to MAX_WORDS", async () => {
  const net = netStub();
  const ai = { run: async () => ({ response: "the night swallows the road" }) };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", 5, 0x1234, PREV, MODEL);
  assert.equal(out.token, "the night swallows");
  assert.equal(net.calls, 0);
});

test("voice selector falls back when ai.run throws", async () => {
  const net = netStub();
  const ai = {
    run: async () => {
      throw new Error("network down");
    },
  };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", 5, 0x1234, PREV, MODEL);
  assert.equal(out.token, "well now");
  assert.equal(net.calls, 1);
});

test("voice selector falls back when ai.run times out", async () => {
  const net = netStub();
  const ai = { run: () => new Promise(() => {}) }; // never resolves
  const select = createVoiceSelector({ ai, netSelector: net, timeoutMs: 20 });
  const out = await select("speech_unit", 5, 0x1234, PREV, MODEL);
  assert.equal(out.token, "well now");
  assert.equal(net.calls, 1);
});

test("voice selector falls back when the AI binding is absent", async () => {
  const net = netStub();
  const select = createVoiceSelector({ ai: undefined, netSelector: net });
  const out = await select("speech_unit", 5, 0x1234, PREV, MODEL);
  assert.equal(out.token, "well now");
  assert.equal(net.calls, 1);
});

test("voice selector skips the API on a cold start", async () => {
  const net = netStub();
  let aiCalls = 0;
  const ai = {
    run: async () => {
      aiCalls += 1;
      return { response: "we wonder" };
    },
  };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", 1, 0x1234, null, { recentTokens: [] });
  assert.equal(out.token, "well now");
  assert.equal(aiCalls, 0);
  assert.equal(net.calls, 1);
});

test("voice selector retries once before succeeding", async () => {
  const net = netStub();
  let aiCalls = 0;
  const ai = {
    run: async () => {
      aiCalls += 1;
      return { response: aiCalls === 1 ? "" : "we wonder" };
    },
  };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", 5, 0x1234, PREV, MODEL);
  assert.equal(out.token, "we wonder");
  assert.equal(aiCalls, 2);
  assert.equal(net.calls, 0);
});
