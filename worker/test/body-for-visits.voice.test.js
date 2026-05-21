import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBufferedSelector,
  generateSpan,
  revealUnit,
  pickWordCount,
  pickMode,
} from "../src/body-for-visits/voice.js";

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

test("createBufferedSelector requires a net selector", () => {
  assert.throws(
    () => createBufferedSelector({ ai: {} }),
    /netSelector is required/
  );
});

test("revealUnit takes words and pulls a trailing mark", () => {
  const a = revealUnit(["she", "was", "walking"], 2);
  assert.equal(a.unit, "she was");
  assert.deepEqual(a.rest, ["walking"]);

  const b = revealUnit(["street", ";", "the", "rain"], 1);
  assert.equal(b.unit, "street;");
  assert.deepEqual(b.rest, ["the", "rain"]);

  const c = revealUnit(["the", "end"], 5);
  assert.equal(c.unit, "the end");
  assert.deepEqual(c.rest, []);
});

test("revealUnit keeps a parenthetical aside whole", () => {
  const r = revealUnit(["(", "a", "clerk", ")", "and", "then"], 2);
  assert.equal(r.unit, "(a clerk)");
  assert.deepEqual(r.rest, ["and", "then"]);
});

test("revealUnit leaves an opening paren to start the next unit", () => {
  const r = revealUnit(["the", "clerk", "(", "a", "fly", ")"], 3);
  assert.equal(r.unit, "the clerk");
  assert.deepEqual(r.rest, ["(", "a", "fly", ")"]);
});

test("generateSpan returns a token array from the model reply", async () => {
  const ai = { run: async () => ({ response: "she was walking down the street" }) };
  const tokens = await generateSpan(ai, { contextText: "the room" });
  assert.deepEqual(tokens, ["she", "was", "walking", "down", "the", "street"]);
});

test("generateSpan returns [] on an empty reply", async () => {
  const ai = { run: async () => ({ response: "" }) };
  assert.deepEqual(await generateSpan(ai, { contextText: "x" }), []);
});

test("generateSpan returns [] when the AI binding is absent", async () => {
  assert.deepEqual(await generateSpan(undefined, { contextText: "x" }), []);
});

test("generateSpan drops a span carrying a blocked source term", async () => {
  const ai = { run: async () => ({ response: "ahab stood at the rail" }) };
  assert.deepEqual(await generateSpan(ai, { contextText: "x" }), []);
});

test("generateSpan keeps balanced parentheses", async () => {
  const ai = {
    run: async () => ({ response: "the clerk (still counting) sighed" }),
  };
  assert.deepEqual(await generateSpan(ai, { contextText: "x" }), [
    "the",
    "clerk",
    "(",
    "still",
    "counting",
    ")",
    "sighed",
  ]);
});

test("generateSpan drops unbalanced parentheses", async () => {
  const ai = {
    run: async () => ({ response: "the clerk (still counting sighed" }),
  };
  assert.deepEqual(await generateSpan(ai, { contextText: "x" }), [
    "the",
    "clerk",
    "still",
    "counting",
    "sighed",
  ]);
});

test("generateSpan retries when the model echoes the body", async () => {
  let n = 0;
  const ai = {
    run: async () => {
      n += 1;
      return {
        response: n === 1 ? "the small room keeps turning" : "into the bright morning light",
      };
    },
  };
  const tokens = await generateSpan(ai, {
    contextText: "the small room keeps turning slowly",
  });
  assert.deepEqual(tokens, ["into", "the", "bright", "morning", "light"]);
  assert.equal(n, 2);
});

test("buffered selector reveals from the buffer without calling the model", async () => {
  let buf = ["she", "was", "walking", "down", "the", "street"];
  let aiCalls = 0;
  const ai = {
    run: async () => {
      aiCalls += 1;
      return { response: "should not run" };
    },
  };
  const net = netStub();
  const select = createBufferedSelector({
    ai,
    netSelector: net,
    getPending: () => buf,
    setPending: (p) => {
      buf = p;
    },
    getContext: () => "",
  });
  const out = await select("speech_unit", 5, 0x1234, null, null);
  assert.equal(out.role, "speech_unit");
  assert.ok(out.token.length > 0);
  assert.equal(aiCalls, 0); // the buffer already had content
  assert.equal(net.calls, 0);
  assert.ok(buf.length < 6); // some tokens were consumed
});

test("buffered selector generates a span when the buffer is empty", async () => {
  let buf = [];
  let aiCalls = 0;
  const ai = {
    run: async () => {
      aiCalls += 1;
      return { response: "she was walking down the street slowly" };
    },
  };
  const net = netStub();
  const select = createBufferedSelector({
    ai,
    netSelector: net,
    getPending: () => buf,
    setPending: (p) => {
      buf = p;
    },
    getContext: () => "the room keeps turning",
  });
  const out = await select("speech_unit", 5, 0x1234, null, null);
  assert.equal(aiCalls, 1);
  assert.equal(net.calls, 0);
  assert.ok(out.token.length > 0);
  assert.ok(buf.length > 0); // the rest of the span is buffered
});

test("buffered selector falls back to the net when generation fails", async () => {
  let buf = [];
  const ai = {
    run: async () => {
      throw new Error("network down");
    },
  };
  const net = netStub();
  const select = createBufferedSelector({
    ai,
    netSelector: net,
    getPending: () => buf,
    setPending: (p) => {
      buf = p;
    },
    getContext: () => "x",
  });
  const out = await select("speech_unit", 5, 0x1234, null, null);
  assert.equal(out.token, "well now");
  assert.equal(net.calls, 1);
});

test("buffered selector falls back when the AI binding is absent", async () => {
  let buf = [];
  const net = netStub();
  const select = createBufferedSelector({
    ai: undefined,
    netSelector: net,
    getPending: () => buf,
    setPending: (p) => {
      buf = p;
    },
    getContext: () => "x",
  });
  const out = await select("speech_unit", 5, 0x1234, null, null);
  assert.equal(out.token, "well now");
  assert.equal(net.calls, 1);
});

test("buffered selector drains a span across visits", async () => {
  let buf = [];
  const ai = {
    run: async () => ({ response: "she was walking down the street very slowly" }),
  };
  const net = netStub();
  const select = createBufferedSelector({
    ai,
    netSelector: net,
    getPending: () => buf,
    setPending: (p) => {
      buf = p;
    },
    getContext: () => "",
  });
  const revealed = [];
  for (let i = 1; i <= 8; i += 1) {
    const out = await select("speech_unit", i, 0x1000 + i, null, null);
    revealed.push(out.token);
  }
  // the revealed units, in order, reconstruct the generated span
  const words = revealed.join(" ").split(/\s+/).filter(Boolean);
  assert.deepEqual(words.slice(0, 8), [
    "she",
    "was",
    "walking",
    "down",
    "the",
    "street",
    "very",
    "slowly",
  ]);
  assert.equal(net.calls, 0);
});

test("pickWordCount is deterministic and spans 1..3", () => {
  assert.equal(pickWordCount(0x1234, 5), pickWordCount(0x1234, 5));
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    seen.add(pickWordCount(Math.imul(i, 0x85ebca6b) >>> 0, i));
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test("pickMode is deterministic and spans every structural mode", () => {
  assert.equal(pickMode(0x1234, 5), pickMode(0x1234, 5));
  const seen = new Set();
  for (let i = 0; i < 300; i += 1) {
    const mode = pickMode(Math.imul(i, 0x85ebca6b) >>> 0, i);
    assert.equal(typeof mode.brief, "string");
    assert.ok(mode.min >= 1 && mode.max >= mode.min, "mode word range");
    seen.add(mode.brief);
  }
  assert.ok(seen.size >= 4, `expected varied modes, got ${seen.size}`);
});
