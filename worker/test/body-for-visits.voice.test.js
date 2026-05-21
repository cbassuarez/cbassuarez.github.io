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

test("revealUnit preserves styled spans while keeping plain unit text", () => {
  const r = revealUnit([
    "the",
    { text: "small", italic: true },
    { text: "office", italic: true },
    "counted",
  ], 3);
  assert.equal(r.unit, "the small office");
  assert.deepEqual(r.spans, [
    { text: "the ", italic: false },
    { text: "small office", italic: true },
  ]);
  assert.deepEqual(r.rest, ["counted"]);
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

test("generateSpan extracts and italicizes a named thing on a naming span", async () => {
  const ai = {
    run: async (_model, input) => {
      const content = input.messages[input.messages.length - 1].content;
      if (/copied word for word/.test(content)) {
        return { response: "operation black wing" };
      }
      return { response: "the agency ran operation black wing for years" };
    },
  };
  const tokens = await generateSpan(ai, { contextText: "x", nameSpan: true });
  assert.deepEqual(tokens, [
    "the",
    "agency",
    "ran",
    { text: "operation", italic: true },
    { text: "black", italic: true },
    { text: "wing", italic: true },
    "for",
    "years",
  ]);
});

test("generateSpan italicizes two named things on a naming span", async () => {
  const ai = {
    run: async (_model, input) => {
      const content = input.messages[input.messages.length - 1].content;
      if (/copied word for word/.test(content)) {
        return { response: "operation black wing\ndirective lighthouse" };
      }
      return {
        response: "they ran operation black wing and directive lighthouse",
      };
    },
  };
  const tokens = await generateSpan(ai, { contextText: "x", nameSpan: true });
  assert.deepEqual(tokens, [
    "they",
    "ran",
    { text: "operation", italic: true },
    { text: "black", italic: true },
    { text: "wing", italic: true },
    "and",
    { text: "directive", italic: true },
    { text: "lighthouse", italic: true },
  ]);
});

test("generateSpan leaves a naming span plain when no name is extracted", async () => {
  const ai = {
    run: async (_model, input) => {
      const content = input.messages[input.messages.length - 1].content;
      if (/copied word for word/.test(content)) return { response: "none" };
      return { response: "the agency shuffled its papers again" };
    },
  };
  const tokens = await generateSpan(ai, { contextText: "x", nameSpan: true });
  assert.deepEqual(tokens, ["the", "agency", "shuffled", "its", "papers", "again"]);
});

test("generateSpan makes no extraction call on a non-naming span", async () => {
  let calls = 0;
  const ai = {
    run: async () => {
      calls += 1;
      return { response: "the agency shuffled papers" };
    },
  };
  const tokens = await generateSpan(ai, { contextText: "x" });
  assert.equal(calls, 1);
  assert.deepEqual(tokens, ["the", "agency", "shuffled", "papers"]);
});

test("generateSpan strips stray markdown markers", async () => {
  const ai = { run: async () => ({ response: "the _little_ machine *counted*" }) };
  const tokens = await generateSpan(ai, { contextText: "x" });
  assert.deepEqual(tokens, ["the", "little", "machine", "counted"]);
});

test("generateSpan trims a dangling tail back to a safe word", async () => {
  // A span ending on "to the" leaves the next span nothing to attach to.
  const ai = {
    run: async () => ({ response: "the report was forwarded straight to the" }),
  };
  assert.deepEqual(await generateSpan(ai, { contextText: "x" }), [
    "the", "report", "was", "forwarded", "straight",
  ]);
});

test("generateSpan trims a trailing naming participle", async () => {
  const ai = { run: async () => ({ response: "she found a dossier titled" }) };
  assert.deepEqual(await generateSpan(ai, { contextText: "x" }), [
    "she", "found", "a", "dossier",
  ]);
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

test("generateSpan rejects a span repeating a phrase from earlier in the body", async () => {
  let n = 0;
  const ai = {
    run: async () => {
      n += 1;
      return {
        response:
          n === 1
            ? "filing the forms in triplicate once again"
            : "stamping each crate with a dull thud",
      };
    },
  };
  // "forms ... triplicate" sits far back in the body, outside the prompt tail,
  // but the whole-body echo check still catches the reused phrase.
  const tokens = await generateSpan(ai, {
    contextText: "the clerk went on",
    bodyText:
      "long ago the office demanded the forms in triplicate so the clerk went on",
  });
  assert.deepEqual(tokens, ["stamping", "each", "crate", "with", "a", "dull", "thud"]);
  assert.equal(n, 2);
});

test("generateSpan keeps intentional repetition within one span", async () => {
  // A litany repeats a frame on purpose; echo detection is span-against-body,
  // so the in-span repetition is never mistaken for an echo.
  const ai = {
    run: async () => ({
      response: "the clerk filed; the clerk stamped; the clerk sealed",
    }),
  };
  const tokens = await generateSpan(ai, {
    contextText: "morning came",
    bodyText: "morning came over the wide rooftops",
  });
  assert.deepEqual(tokens, [
    "the", "clerk", "filed", ";",
    "the", "clerk", "stamped", ";",
    "the", "clerk", "sealed",
  ]);
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

test("pickMode includes a naming mode that allows italics", () => {
  const seen = new Set();
  let italicModes = 0;
  for (let i = 0; i < 400; i += 1) {
    const mode = pickMode(Math.imul(i, 0x85ebca6b) >>> 0, i);
    seen.add(mode.brief);
    if (mode.italic === true) italicModes += 1;
  }
  assert.ok(italicModes > 40, `expected a steady naming mode, got ${italicModes}/400`);
});
