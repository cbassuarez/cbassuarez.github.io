import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectNextToken,
  allowedNext,
  inferModel,
  tokenizeSpeech,
  validateSpeechUnit,
  _internals,
} from "../src/body-for-visits/grammar.js";

const { MODEL_VERSION, SPEECH_ROLE } = _internals;

function simulate(seed, count, initialEvents = []) {
  const events = initialEvents.slice();
  let prevRole = events.length > 0 ? events[events.length - 1].role : null;
  let prevToken = events.length > 0 ? events[events.length - 1].token : null;

  while (events.length < count) {
    const model = inferModel(events);
    const next = selectNextToken(prevRole, events.length + 1, seed, prevToken, model);
    assert.ok(next, `seed=${seed} event=${events.length + 1} failed to generate`);
    events.push(next);
    prevRole = next.role;
    prevToken = next.token;
  }
  return events;
}

test("allowed-next exposes the speech unit role", () => {
  assert.deepEqual(allowedNext(null), [SPEECH_ROLE]);
  assert.deepEqual(allowedNext("nouns"), [SPEECH_ROLE]);
  assert.deepEqual(allowedNext("speech_unit"), [SPEECH_ROLE]);
});

test("inferModel returns versioned speech context and source metadata", () => {
  const seq = [
    { role: "speech_unit", token: "at first the room remembers," },
    { role: "speech_unit", token: "and then it keeps going" },
  ];
  const model = inferModel(seq);

  assert.equal(model.version, MODEL_VERSION);
  assert.equal(model.role, SPEECH_ROLE);
  assert.ok(model.speechModel.version >= 1);
  assert.ok(Array.isArray(model.speechModel.sources));
  assert.ok(model.speechModel.sources.length >= 4);
  assert.deepEqual(model.recentUnits, seq.map((event) => event.token));
  assert.deepEqual(model.recentTokens.slice(-5), ["and", "then", "it", "keeps", "going"]);
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

test("selection is deterministic given the same seed and context", () => {
  const events = [
    { role: "speech_unit", token: "at first the room remembers," },
    { role: "speech_unit", token: "and then it keeps going" },
  ];
  const model = inferModel(events);
  const a = selectNextToken("speech_unit", 3, 0xabc, events[1].token, model);
  const b = selectNextToken("speech_unit", 3, 0xabc, events[1].token, model);
  assert.deepEqual(a, b);
});

test("different contexts can produce different valid continuations", () => {
  const aEvents = [{ role: "speech_unit", token: "at first the room remembers," }];
  const bEvents = [{ role: "speech_unit", token: "after all the sea keeps" }];
  const a = selectNextToken("speech_unit", 2, 0x2222, aEvents[0].token, inferModel(aEvents));
  const b = selectNextToken("speech_unit", 2, 0x2222, bEvents[0].token, inferModel(bEvents));

  assert.ok(a);
  assert.ok(b);
  assert.equal(a.role, SPEECH_ROLE);
  assert.equal(b.role, SPEECH_ROLE);
  assert.notEqual(a.token, b.token);
  assert.equal(validateSpeechUnit(a.token, aEvents[0].token).ok, true);
  assert.equal(validateSpeechUnit(b.token, bEvents[0].token).ok, true);
});

test("simulated speech walks stay open and avoid known bad fragments", () => {
  const blockedTerms = /\b(?:ahab|ishmael|tristram|shandy|ulysses|bloom|strether|gutenberg)\b/;
  for (let seed = 1; seed <= 16; seed++) {
    const events = simulate(seed, 500);
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      assert.equal(event.role, SPEECH_ROLE, `seed=${seed} event=${i + 1}`);
      assert.equal(validateSpeechUnit(event.token, events[i - 1]?.token || null).ok, true, event.token);
      assert.ok(!/[.!?]\s*$/.test(event.token), `terminal closure: ${event.token}`);
      assert.ok(!blockedTerms.test(event.token), `source leakage: ${event.token}`);
      assert.notEqual(event.token, "area looks face");
      assert.notEqual(event.token, "at first area looks face;");
    }
  }
});
