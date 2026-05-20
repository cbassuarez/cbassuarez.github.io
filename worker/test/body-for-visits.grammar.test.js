import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedNext,
  inferModel,
  tokenizeSpeech,
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

test("validator accepts short open speech units", () => {
  const result = validateSpeechUnit("and then I guess the room,", "someone remembers");
  assert.equal(result.ok, true);
  assert.equal(result.token, "and then i guess the room,");
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
