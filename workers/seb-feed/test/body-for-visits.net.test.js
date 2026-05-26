import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createNet,
  forward,
  softmax,
  trainStep,
  serializeNet,
  loadWeights,
  snapshotWeights,
  hasNaN,
  weightCount,
  blendToward,
  buildVocabContext,
  createSelector,
  rolloutIds,
  floatsToBase64,
  base64ToFloats,
  _internals,
} from "../src/body-for-visits/net.js";
import { validateSpeechUnit, mulberry32 } from "../src/body-for-visits/grammar.js";
import { NET_MODEL } from "../src/body-for-visits/net-weights.generated.js";

const TINY = { V: 24, K: 3, D: 6, H: 10 };

test("forward produces finite logits of vocab length", () => {
  const net = createNet(TINY, 7);
  const { logits } = forward(net, [0, 1, 2]);
  assert.equal(logits.length, TINY.V);
  assert.ok(logits.every(Number.isFinite));
});

test("softmax is a normalised distribution", () => {
  const p = softmax(Float32Array.from([1, 2, 3, 4]));
  const sum = p.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6);
  assert.ok(p[3] > p[0]);
});

test("entropy is maximal for uniform and zero for one-hot", () => {
  const uniform = Float32Array.from([0.25, 0.25, 0.25, 0.25]);
  const onehot = Float32Array.from([0, 1, 0, 0]);
  assert.ok(Math.abs(_internals.entropy(uniform) - Math.log(4)) < 1e-6);
  assert.ok(_internals.entropy(onehot) < 1e-6);
});

test("trainStep drives a tiny net to memorise distinct examples", () => {
  const net = createNet(TINY, 3);
  const examples = [
    { ctx: [0, 1, 2], target: 5 },
    { ctx: [3, 4, 5], target: 9 },
    { ctx: [6, 7, 8], target: 13 },
    { ctx: [9, 10, 11], target: 17 },
  ];
  const before = trainStep(net, examples, { lr: 0.2 });
  for (let i = 0; i < 600; i++) trainStep(net, examples, { lr: 0.2, decay: 0 });
  const after = trainStep(net, examples, { lr: 0.2 });
  assert.ok(after < before, `loss should fall: ${before} -> ${after}`);
  for (const ex of examples) {
    const { logits } = forward(net, ex.ctx);
    let argmax = 0;
    for (let v = 1; v < TINY.V; v++) if (logits[v] > logits[argmax]) argmax = v;
    assert.equal(argmax, ex.target, "net should predict the memorised target");
  }
  assert.ok(!hasNaN(net));
});

test("zero-weight batches are a no-op", () => {
  const net = createNet(TINY, 5);
  const snap = snapshotWeights(net);
  trainStep(net, [{ ctx: [0, 1, 2], target: 4, weight: 0 }], { lr: 0.5 });
  const after = snapshotWeights(net);
  assert.deepEqual(Array.from(after), Array.from(snap));
});

test("serialize / loadWeights round-trips exactly", () => {
  const net = createNet(TINY, 11);
  trainStep(net, [{ ctx: [1, 2, 3], target: 7 }], { lr: 0.1 });
  const bytes = serializeNet(net);
  assert.equal(bytes.length, weightCount(TINY) * 4);
  const restored = createNet(TINY, 99);
  loadWeights(restored, bytes);
  assert.deepEqual(Array.from(restored.E), Array.from(net.E));
  assert.deepEqual(Array.from(restored.W2), Array.from(net.W2));
});

test("base64 round-trips the weight buffer", () => {
  const net = createNet(TINY, 13);
  const floats = snapshotWeights(net);
  const back = base64ToFloats(floatsToBase64(floats));
  assert.equal(back.length, floats.length);
  assert.ok(back.every((v, i) => v === floats[i]));
});

test("hasNaN catches a poisoned weight", () => {
  const net = createNet(TINY, 1);
  assert.equal(hasNaN(net), false);
  net.W1[3] = NaN;
  assert.equal(hasNaN(net), true);
});

test("blendToward moves weights toward a reference", () => {
  const net = createNet(TINY, 2);
  const ref = snapshotWeights(createNet(TINY, 8));
  const e0 = net.E[0];
  const r0 = ref[0];
  blendToward(net, ref, 0.5);
  assert.ok(Math.abs(net.E[0] - (e0 + r0) / 2) < 1e-5);
});

test("buildVocabContext classifies vocab ids", () => {
  const vocab = ["<bos>", "<unk>", ",", ";", "—", "well", "and", "the", "said", "room"];
  const vctx = buildVocabContext(vocab);
  assert.equal(vctx.BOS, 0);
  assert.equal(vctx.UNK, 1);
  assert.equal(vctx.isPunct[2], 1);
  assert.equal(vctx.goodStart[5], 1); // "well"
  assert.equal(vctx.connector[6], 1); // "and"
  assert.equal(vctx.banned[3], 0); // ";" punctuation is emittable, not banned
  assert.equal(vctx.banned[0], 1); // <bos> is banned from output
  assert.equal(vctx.banned[8], 1); // "said" is a narration word
});

// --- Bundled warm-start model ---------------------------------------------

function buildBundledNet() {
  const net = createNet(NET_MODEL.config, 1);
  loadWeights(net, base64ToFloats(NET_MODEL.weightsB64));
  return net;
}

test("bundled warm-start weights load and are finite", () => {
  const net = buildBundledNet();
  assert.equal(hasNaN(net), false);
  assert.equal(NET_MODEL.vocab.length, NET_MODEL.config.V);
});

test("the selector produces valid open speech units across seeds", () => {
  const net = buildBundledNet();
  const vctx = buildVocabContext(NET_MODEL.vocab);
  const selectNextToken = createSelector(net, vctx);
  const blocked = /\b(?:ahab|ishmael|tristram|shandy|ulysses|bloom|strether|gutenberg)\b/;

  let recent = [];
  for (let i = 0; i < 80; i++) {
    const model = { recentTokens: recent.slice(-48) };
    const prev = recent.length > 0 ? recent.slice(-8).join(" ") : null;
    const out = selectNextToken("speech_unit", i + 1, 0x51a7 + i * 13, prev, model);
    assert.ok(out, `seed ${i} failed to generate`);
    assert.equal(out.role, "speech_unit");
    assert.equal(validateSpeechUnit(out.token, prev).ok, true, out.token);
    assert.ok(!/[.!?]\s*$/.test(out.token), `terminal closure: ${out.token}`);
    assert.ok(!blocked.test(out.token), `source leakage: ${out.token}`);
    recent.push(...out.token.split(/\s+/));
  }
});

test("the selector is deterministic for a fixed seed and context", () => {
  const net = buildBundledNet();
  const vctx = buildVocabContext(NET_MODEL.vocab);
  const selectNextToken = createSelector(net, vctx);
  const model = { recentTokens: ["the", "room", "keeps"] };
  const a = selectNextToken("speech_unit", 4, 0xabcdef, "the room keeps", model);
  const b = selectNextToken("speech_unit", 4, 0xabcdef, "the room keeps", model);
  assert.deepEqual(a, b);
});

test("the selector yields a valid unit from a cold start", () => {
  const net = buildBundledNet();
  const vctx = buildVocabContext(NET_MODEL.vocab);
  const selectNextToken = createSelector(net, vctx);
  for (let seed = 1; seed <= 12; seed++) {
    const out = selectNextToken("speech_unit", 1, seed * 0x9e37, null, { recentTokens: [] });
    assert.ok(out, `cold start seed ${seed} produced nothing`);
    assert.equal(validateSpeechUnit(out.token, null).ok, true, out.token);
  }
});

test("rolloutIds returns in-vocab ids", () => {
  const net = buildBundledNet();
  const vctx = buildVocabContext(NET_MODEL.vocab);
  const cold = new Array(NET_MODEL.config.K).fill(vctx.BOS);
  const ids = rolloutIds(net, vctx, cold, mulberry32(0x2024), []);
  assert.ok(ids.every((id) => id >= 0 && id < NET_MODEL.config.V));
});
