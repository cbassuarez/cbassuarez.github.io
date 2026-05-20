import { test } from "node:test";
import assert from "node:assert/strict";
import { BUCKETS } from "../src/body-for-visits/lexicon.js";
import { selectNextToken, allowedNext, inferModel, _internals } from "../src/body-for-visits/grammar.js";

const { MODEL_VERSION, scoreRole, scoreToken } = _internals;

function containsToken(bucket, token) {
  return BUCKETS[bucket].includes(token);
}

function simulate(seed, count, initialEvents = []) {
  const events = initialEvents.slice();
  let prevRole = events.length > 0 ? events[events.length - 1].role : null;
  let prevToken = events.length > 0 ? events[events.length - 1].token : null;

  while (events.length < count) {
    const model = inferModel(events);
    const { token, role } = selectNextToken(prevRole, events.length + 1, seed, prevToken, model);
    events.push({ token, role });
    prevRole = role;
    prevToken = token;
  }
  return events;
}

function roleGaps(events, role) {
  const indexes = [];
  events.forEach((event, i) => {
    if (event.role === role) indexes.push(i + 1);
  });
  const gaps = [];
  for (let i = 1; i < indexes.length; i++) gaps.push(indexes[i] - indexes[i - 1]);
  return gaps;
}

test("first token is always an opening", () => {
  const { token, role } = selectNextToken(null, 1, 12345);
  assert.equal(role, "openings");
  assert.ok(containsToken("openings", token));
});

test("allowed-next table prevents punctuation followed by suture", () => {
  assert.deepEqual(allowedNext("punctuation"), ["openings", "adjectives", "nouns"]);
  assert.ok(allowedNext("nouns").includes("sutures"));
  assert.ok(allowedNext("verbs").includes("sutures"));
  assert.ok(allowedNext("conjunctions").includes("sutures"));
});

test("inferModel returns versioned local state from the journal", () => {
  const seq = [
    { role: "nouns", token: "request" },
    { role: "punctuation", token: "," },
    { role: "openings", token: "again" },
    { role: "nouns", token: "room" },
    { role: "verbs", token: "answers" },
    { role: "sutures", token: "— signal received —" },
  ];
  const model = inferModel(seq);

  assert.equal(model.version, MODEL_VERSION);
  assert.equal(model.roles.nouns.punctuation, 1);
  assert.equal(model.roles.nouns.verbs, 1);
  assert.equal(model.words.request[","], 1);
  assert.deepEqual(model.recentRoles, seq.map((event) => event.role));
  assert.deepEqual(model.recentTokens, seq.map((event) => event.token));
  assert.equal(model.distanceSincePunctuation, 5);
  assert.equal(model.distanceSinceSuture, 1);
  assert.equal(model.phraseLength, 4);
  assert.deepEqual(model.roleRun, { value: "sutures", count: 1 });
  assert.deepEqual(model.tokenRun, { value: "— signal received —", count: 1 });
  assert.equal(model.count, seq.length);
});

test("an empty model selects identically to no model", () => {
  const empty = { roles: {}, words: {} };
  for (let i = 2; i <= 24; i++) {
    const a = selectNextToken("nouns", i, 0xabc, "request", null);
    const b = selectNextToken("nouns", i, 0xabc, "request", empty);
    assert.deepEqual(a, b, `event ${i}: empty model must match no model`);
  }
});

test("selection is deterministic given a model", () => {
  const model = inferModel([
    { role: "nouns", token: "room" },
    { role: "verbs", token: "holds" },
    { role: "nouns", token: "request" },
  ]);
  const a = selectNextToken("verbs", 5, 7, "holds", model);
  const b = selectNextToken("verbs", 5, 7, "holds", model);
  assert.deepEqual(a, b);
});

test("learned role transitions bias the adaptive scorer", () => {
  const biased = {
    roles: { nouns: { verbs: 80 } },
    words: {},
    recentRoles: [],
    recentTokens: [],
    phraseLength: 3,
    distanceSincePunctuation: 4,
    distanceSinceSuture: 10,
    count: 20,
  };
  let verbs = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { role } = selectNextToken("nouns", 5, seed, null, biased);
    if (role === "verbs") verbs++;
  }
  assert.ok(verbs / 300 > 0.85, `expected strong verbs bias, got ${verbs}/300`);
});

test("token scorer favors comma and semicolon over terminal punctuation", () => {
  const model = {
    words: { request: { ",": 20, ";": 20, ".": 20, "—": 20 } },
    recentTokens: [],
  };
  const comma = scoreToken(",", "punctuation", "request", model);
  const semicolon = scoreToken(";", "punctuation", "request", model);
  const period = scoreToken(".", "punctuation", "request", model);
  const dash = scoreToken("—", "punctuation", "request", model);

  assert.ok(comma > period);
  assert.ok(semicolon > period);
  assert.ok(comma > dash);
});

test("punctuation pressure rises with phrase length", () => {
  const shortPhrase = inferModel([
    { role: "openings", token: "again" },
    { role: "nouns", token: "room" },
  ]);
  const longPhrase = inferModel([
    { role: "openings", token: "again" },
    { role: "nouns", token: "room" },
    { role: "verbs", token: "answers" },
    { role: "prepositions", token: "through" },
    { role: "adjectives", token: "quiet" },
    { role: "nouns", token: "signal" },
    { role: "verbs", token: "returns" },
    { role: "prepositions", token: "inside" },
    { role: "nouns", token: "archive" },
  ]);

  assert.ok(
    scoreRole("punctuation", "nouns", longPhrase) > scoreRole("punctuation", "nouns", shortPhrase)
  );
});

test("suture pressure rises with distance since the last suture", () => {
  const recentSuture = {
    roles: {},
    words: {},
    recentRoles: ["nouns", "sutures", "adjectives", "nouns"],
    recentTokens: [],
    phraseLength: 6,
    distanceSinceSuture: 4,
    count: 20,
  };
  const distantSuture = {
    ...recentSuture,
    recentRoles: ["adjectives", "nouns", "verbs", "prepositions", "nouns"],
    distanceSinceSuture: 22,
    count: 48,
  };

  assert.ok(
    scoreRole("sutures", "nouns", distantSuture) > scoreRole("sutures", "nouns", recentSuture)
  );
});

test("adaptive walks stay inside grammar and buckets", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const events = simulate(seed, 500);
    for (let i = 0; i < events.length; i++) {
      const prev = events[i - 1] || null;
      const cur = events[i];
      if (!prev) assert.equal(cur.role, "openings");
      else assert.ok(allowedNext(prev.role).includes(cur.role), `seed=${seed} event=${i + 1} ${prev.role}->${cur.role}`);
      assert.ok(containsToken(cur.role, cur.token), `seed=${seed} event=${i + 1} token not in ${cur.role}`);
    }
  }
});

test("adaptive walks never place suture after punctuation or duplicate adjacent tokens", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const events = simulate(seed, 500);
    for (let i = 1; i < events.length; i++) {
      assert.notEqual(events[i].token, events[i - 1].token, `seed=${seed} event=${i + 1} duplicate token`);
      if (events[i - 1].role === "punctuation") {
        assert.notEqual(events[i].role, "sutures", `seed=${seed} event=${i + 1} punctuation->suture`);
      }
    }
  }
});

test("adaptive walks have healthy punctuation and suture ranges without fixed cadence", () => {
  const events = simulate(0xdecaf, 360);
  const punctuation = events.filter((event) => event.role === "punctuation").length;
  const sutures = events.filter((event) => event.role === "sutures").length;
  const punctuationRatio = punctuation / events.length;
  const sutureRatio = sutures / events.length;
  const punctuationGaps = roleGaps(events, "punctuation");
  const sutureGaps = roleGaps(events, "sutures");

  assert.ok(punctuationRatio > 0.05 && punctuationRatio < 0.24, `punctuation ratio ${punctuationRatio}`);
  assert.ok(sutureRatio > 0.015 && sutureRatio < 0.16, `suture ratio ${sutureRatio}`);
  assert.ok(new Set(punctuationGaps).size >= 4, `punctuation gaps too regular: ${punctuationGaps.join(",")}`);
  assert.ok(new Set(sutureGaps).size >= 3, `suture gaps too regular: ${sutureGaps.join(",")}`);
});
