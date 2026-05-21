import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createVoiceSelector,
  pickShape,
  pickMark,
} from "../src/body-for-visits/voice.js";
import { validateSpeechUnit } from "../src/body-for-visits/grammar.js";

// A non-empty model so the cold-start short-circuit does not pre-empt the
// LLM path, and a prevToken the candidates can legally follow.
const MODEL = { recentTokens: ["the", "room", "keeps", "turning"] };
const PREV = "the room keeps turning";
const EVENT = 5;

// The selector rolls a per-visit shape from (seed, eventIndex); a punct shape
// short-circuits the model entirely. Pin seeds with a known shape so the
// LLM-path tests are not disturbed by the roll.
function seedFor(kind) {
  for (let s = 1; s < 1_000_000; s++) {
    if (pickShape(s, EVENT).kind === kind) return s;
  }
  throw new Error(`no ${kind} seed found`);
}
const WORDS_SEED = seedFor("words");
const PUNCT_SEED = seedFor("punct");

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
  const out = await select("speech_unit", EVENT, WORDS_SEED, PREV, MODEL);
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
  const out = await select("speech_unit", EVENT, WORDS_SEED, PREV, MODEL);
  assert.equal(out.token, "well now");
  assert.equal(net.calls, 1);
});

test("voice selector accepts a continuation that is not a net-style opener", async () => {
  const net = netStub();
  const ai = { run: async () => ({ response: "of the night" }) };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", EVENT, WORDS_SEED, PREV, MODEL);
  assert.equal(out.token, "of the night");
  assert.equal(net.calls, 0);
  // strict (net) validation rejects "of" as a bad starter — the LLM path does not
  assert.equal(validateSpeechUnit("of the night").ok, false);
});

test("voice selector truncates an over-long reply to MAX_WORDS", async () => {
  const net = netStub();
  const ai = { run: async () => ({ response: "the night swallows the road" }) };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", EVENT, WORDS_SEED, PREV, MODEL);
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
  const out = await select("speech_unit", EVENT, WORDS_SEED, PREV, MODEL);
  assert.equal(out.token, "well now");
  assert.equal(net.calls, 1);
});

test("voice selector falls back when ai.run times out", async () => {
  const net = netStub();
  const ai = { run: () => new Promise(() => {}) }; // never resolves
  const select = createVoiceSelector({ ai, netSelector: net, timeoutMs: 20 });
  const out = await select("speech_unit", EVENT, WORDS_SEED, PREV, MODEL);
  assert.equal(out.token, "well now");
  assert.equal(net.calls, 1);
});

test("voice selector falls back when the AI binding is absent", async () => {
  const net = netStub();
  const select = createVoiceSelector({ ai: undefined, netSelector: net });
  const out = await select("speech_unit", EVENT, WORDS_SEED, PREV, MODEL);
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
  const out = await select("speech_unit", 1, WORDS_SEED, null, { recentTokens: [] });
  assert.equal(out.token, "well now");
  assert.equal(aiCalls, 0);
  assert.equal(net.calls, 1);
});

test("voice selector retries before succeeding", async () => {
  const net = netStub();
  let aiCalls = 0;
  const ai = {
    run: async () => {
      aiCalls += 1;
      return { response: aiCalls === 1 ? "" : "we wonder" };
    },
  };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", EVENT, WORDS_SEED, PREV, MODEL);
  assert.equal(out.token, "we wonder");
  assert.equal(aiCalls, 2);
  assert.equal(net.calls, 0);
});

test("voice selector emits a lone punctuation mark on a punct shape", async () => {
  const net = netStub();
  let aiCalls = 0;
  const ai = {
    run: async () => {
      aiCalls += 1;
      return { response: "we wonder" };
    },
  };
  const select = createVoiceSelector({ ai, netSelector: net });
  const out = await select("speech_unit", EVENT, PUNCT_SEED, "the quiet room", MODEL);
  assert.ok([",", ";", ":", "—", "…"].includes(out.token), `got ${out.token}`);
  assert.equal(aiCalls, 0); // punctuation never calls the model
  assert.equal(net.calls, 0);
});

test("pickShape is deterministic and spans every shape", () => {
  assert.deepEqual(pickShape(0x1234, 5), pickShape(0x1234, 5));
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const shape = pickShape(Math.imul(i, 0x85ebca6b) >>> 0, i);
    seen.add(shape.kind === "punct" ? "punct" : `words${shape.n}`);
  }
  assert.deepEqual([...seen].sort(), ["punct", "words1", "words2", "words3"]);
});

test("pickMark is deterministic and yields only allowed marks", () => {
  assert.equal(pickMark(0x1234, 5), pickMark(0x1234, 5));
  const allowed = new Set([",", ";", ":", "—", "…"]);
  for (let i = 0; i < 200; i++) {
    assert.ok(allowed.has(pickMark(Math.imul(i, 0x9e3779b1) >>> 0, i)));
  }
});
