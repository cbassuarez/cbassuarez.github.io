import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedNext,
  inferModel,
  tokenizeSpeech,
  detokenize,
  validateSpeechUnit,
  _internals,
} from "../src/body-for-visits/grammar.js";

const { MODEL_VERSION, SPEECH_ROLE } = _internals;

test("allowed-next exposes the speech unit role", () => {
  assert.deepEqual(allowedNext(null), [SPEECH_ROLE]);
  assert.deepEqual(allowedNext("nouns"), [SPEECH_ROLE]);
  assert.deepEqual(allowedNext("speech_unit"), [SPEECH_ROLE]);
});

test("inferModel distils the journal into rolling model context", () => {
  const seq = [
    { role: "speech_unit", token: "at first the room remembers," },
    { role: "speech_unit", token: "and then it keeps going" },
  ];
  const model = inferModel(seq);

  assert.equal(model.version, MODEL_VERSION);
  assert.equal(model.role, SPEECH_ROLE);
  assert.equal(model.count, 2);
  assert.deepEqual(model.recentUnits, seq.map((event) => event.token));
  assert.deepEqual(model.recentTokens.slice(-5), ["and", "then", "it", "keeps", "going"]);
});

test("inferModel ignores fold markers and corruption events", () => {
  const seq = [
    { role: "speech_unit", token: "the room keeps" },
    { role: "fold_marker", token: "⟨folded⟩" },
    { role: "corruption", token: "░" },
    { role: "speech_unit", token: "going somewhere" },
  ];
  const model = inferModel(seq);
  assert.deepEqual(model.recentTokens, ["the", "room", "keeps", "going", "somewhere"]);
  assert.deepEqual(model.recentUnits, ["the room keeps", "going somewhere"]);
});

test("tokenizeSpeech preserves open punctuation without terminal periods", () => {
  assert.deepEqual(
    tokenizeSpeech("Then--well, the room thinks; no."),
    ["then", "—", "well", ",", "the", "room", "thinks", ";", "no"]
  );
});

test("tokenizeSpeech keeps colons and ellipses as their own marks", () => {
  assert.deepEqual(
    tokenizeSpeech("wait: really... and then…"),
    ["wait", ":", "really", "…", "and", "then", "…"]
  );
});

test("tokenizeSpeech reads a spaced hyphen as a dash", () => {
  assert.deepEqual(
    tokenizeSpeech("he paused - a clerk - and left"),
    ["he", "paused", "—", "a", "clerk", "—", "and", "left"]
  );
});

test("tokenizeSpeech keeps parentheses as their own tokens", () => {
  assert.deepEqual(
    tokenizeSpeech("a clerk (probably) left"),
    ["a", "clerk", "(", "probably", ")", "left"]
  );
});

test("detokenize hugs parentheses to their contents", () => {
  assert.equal(
    detokenize(["the", "door", "(", "a", "clerk", ")", "left"]),
    "the door (a clerk) left"
  );
  assert.equal(detokenize(["(", "or", "so", ")"]), "(or so)");
});

test("validator accepts short open speech units", () => {
  const result = validateSpeechUnit("We wonder,", "someone remembers");
  assert.equal(result.ok, true);
  assert.equal(result.token, "we wonder,");
});

test("validator accepts a one-word unit", () => {
  const result = validateSpeechUnit("well", "the quiet room");
  assert.equal(result.ok, true);
  assert.equal(result.token, "well");
});

test("validator accepts a lone mark after a word", () => {
  const result = validateSpeechUnit("—", "the quiet room");
  assert.equal(result.ok, true);
  assert.equal(result.token, "—");
});

test("validator accepts a lone colon or ellipsis after a word", () => {
  const colon = validateSpeechUnit(":", "the quiet room");
  assert.equal(colon.ok, true);
  assert.equal(colon.token, ":");
  const ellipsis = validateSpeechUnit("…", "the quiet room");
  assert.equal(ellipsis.ok, true);
  assert.equal(ellipsis.token, "…");
});

test("validator accepts a word unit ending in a colon", () => {
  const result = validateSpeechUnit("no one knows:", "the quiet room");
  assert.equal(result.ok, true);
  assert.equal(result.token, "no one knows:");
});

test("validator rejects a lone mark that opens or doubles punctuation", () => {
  assert.equal(validateSpeechUnit("—", null).ok, false);
  assert.equal(validateSpeechUnit(";", "the room,").ok, false);
});

test("validator rejects units longer than three words", () => {
  assert.equal(validateSpeechUnit("we wonder where it goes", "someone remembers").ok, false);
});

test("validator rejects closed, unsafe, or source-identifying units", () => {
  const bad = [
    "this is done.",
    "go to https://example.com",
    "<b>no</b>",
    "PROJECT GUTENBERG",
    "ahab waits",
    "the the room",
    "and then",
  ];
  for (const unit of bad) {
    assert.equal(validateSpeechUnit(unit).ok, false, unit);
  }
});
