// Next-role state machine and token selector for body-for-visits.
// Deterministic per (eventIndex, seed, model) so events are replayable from the
// journal, replayed in order.

import { BUCKETS, TOKEN_PRIORS } from "./lexicon.js";

const NEXT_ROLES = {
  openings:     ["adjectives", "nouns"],
  punctuation:  ["openings", "adjectives", "nouns"],
  sutures:      ["adjectives", "nouns"],
  adjectives:   ["nouns"],
  nouns:        ["verbs", "conjunctions", "punctuation", "sutures"],
  verbs:        ["prepositions", "nouns", "punctuation", "sutures"],
  prepositions: ["adjectives", "nouns"],
  conjunctions: ["adjectives", "nouns"],
};

const MODEL_VERSION = 3;
const RECENT_WINDOW = 18;
const PHRASE_WINDOW = 12;

// Smoothing weight. A learned count is added to the source word prior, so cold
// starts stay deterministic and the journal takes over as it accumulates
// evidence.
const ROLE_ALPHA = 1;
const WORD_ALPHA = 0.45;
const INTRANSITIVE_VERBS = new Set([
  "appears",
  "arrives",
  "becomes",
  "begins",
  "comes",
  "continues",
  "dies",
  "exists",
  "falls",
  "goes",
  "happens",
  "thinks",
  "lasts",
  "lies",
  "lives",
  "occurs",
  "remains",
  "returns",
  "rises",
  "runs",
  "sits",
  "stands",
  "stays",
  "waits",
  "works",
]);
const TRANSITIVE_VERBS = new Set([
  "accepts",
  "answers",
  "breaks",
  "calls",
  "carries",
  "changes",
  "closes",
  "crosses",
  "draws",
  "enters",
  "finds",
  "follows",
  "forms",
  "gives",
  "has",
  "holds",
  "keeps",
  "leaves",
  "lets",
  "looks",
  "makes",
  "means",
  "names",
  "needs",
  "notices",
  "opens",
  "passes",
  "reaches",
  "reads",
  "remembers",
  "says",
  "sees",
  "sends",
  "sets",
  "shows",
  "speaks",
  "takes",
  "tries",
  "wants",
  "writes",
  "asks",
  "feels",
  "forgets",
  "hears",
  "knows",
]);
const PREPOSITIONAL_VERBS = new Set([
  "appears",
  "arrives",
  "comes",
  "continues",
  "crosses",
  "falls",
  "goes",
  "looks",
  "moves",
  "passes",
  "speaks",
  "thinks",
  "returns",
  "rises",
  "runs",
  "sits",
  "stands",
  "stays",
  "turns",
  "waits",
  "walks",
  "works",
]);
const DETERMINER_OPENINGS = new Set([
  "the",
  "a",
  "this",
  "that",
  "some",
  "another",
  "maybe the",
  "and then the",
  "so the",
  "you know the",
  "I guess the",
]);
const VERB_PREPOSITION_MULTIPLIERS = {
  thinks: { about: 5, of: 2.4, through: 0.45, over: 0.2, toward: 0.3, against: 0.25 },
  speaks: { to: 4.5, with: 2.3, about: 2, against: 0.25, along: 0.35 },
  waits: { for: 4, with: 1.5, about: 0.35 },
  asks: { about: 3, for: 2.8, to: 1.7, against: 0.25 },
  knows: { about: 3.2, of: 2.2, against: 0.25, along: 0.35 },
  feels: { about: 2.4, through: 1.4, against: 0.35 },
};
const HUMAN_TOKEN_MULTIPLIERS = {
  openings: {
    "the": 2.2,
    "a": 2,
    "this": 2,
    "that": 1.8,
    "some": 1.45,
    "another": 1.45,
    "maybe the": 1.9,
    "and then the": 1.8,
    "so the": 1.55,
    "you know the": 1.45,
    "I guess the": 1.35,
    "now": 1.3,
    "then": 1.25,
    "again": 1.2,
  },
  nouns: {
    "someone": 4,
    "something": 3.8,
    "nothing": 3.1,
    "everything": 3,
    "everyone": 2.7,
    "no one": 2.65,
    "thing": 2.6,
    "body": 2,
    "voice": 1.95,
    "hand": 1.45,
    "face": 1.4,
    "room": 1.35,
    "word": 1.35,
    "thought": 1.35,
    "story": 1.3,
    "friend": 1.3,
    "door": 1.25,
    "home": 1.25,
    "moment": 1.25,
    "name": 1.2,
    "day": 1.15,
    "night": 1.15,
  },
  verbs: {
    "says": 3.2,
    "keeps": 2.4,
    "thinks": 2.4,
    "tries": 2.35,
    "asks": 2.2,
    "feels": 2.15,
    "forgets": 2.15,
    "knows": 2.1,
    "notices": 2.05,
    "remembers": 1.55,
    "waits": 1.5,
    "comes": 1.35,
    "looks": 1.35,
    "wants": 1.35,
  },
  adjectives: {
    "little": 2,
    "weird": 1.9,
    "wrong": 1.8,
    "same": 1.55,
    "old": 1.5,
    "small": 1.45,
    "quiet": 1.4,
    "lost": 1.35,
    "half": 1.35,
    "next": 1.35,
  },
  conjunctions: {
    "and": 1.8,
    "but": 1.55,
    "and then": 1.7,
    "but then": 1.45,
    "so": 1.35,
    "or": 0.45,
    "yet": 0.75,
  },
  sutures: {
    "— I mean —": 2.2,
    "— you know —": 2,
    "— sort of —": 1.8,
    "— wait —": 1.7,
    "— no —": 1.5,
    "— still —": 1.35,
    "— again —": 1.25,
  },
};
const STIFF_TOKEN_MULTIPLIERS = {
  nouns: {
    "area": 0.45,
    "case": 0.5,
    "center": 0.6,
    "class": 0.45,
    "effect": 0.55,
    "figure": 0.55,
    "kind": 0.65,
    "mark": 0.7,
    "number": 0.45,
    "order": 0.55,
    "part": 0.65,
    "point": 0.65,
    "record": 0.65,
    "state": 0.55,
    "surface": 0.65,
  },
  adjectives: {
    "able": 0.35,
    "bare": 0.55,
    "central": 0.55,
    "common": 0.65,
    "final": 0.65,
    "former": 0.55,
    "general": 0.5,
    "local": 0.65,
    "possible": 0.65,
    "public": 0.65,
    "ready": 0.7,
    "recent": 0.65,
    "usual": 0.7,
    "wide": 0.7,
  },
  verbs: {
    "becomes": 0.2,
    "forms": 0.55,
    "means": 0.05,
    "seems": 0.6,
    "sets": 0.55,
  },
};

// Small mulberry32 — deterministic, no Math.random.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one item, probability proportional to its weight. Consumes exactly one
// rng() call, so selection stays deterministic.
function pickWeighted(rng, items, weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (!(total > 0)) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

export function allowedNext(prevRole) {
  return NEXT_ROLES[prevRole] || NEXT_ROLES.punctuation;
}

function countRecent(items, value) {
  if (!Array.isArray(items)) return 0;
  let n = 0;
  for (const item of items) if (item === value) n++;
  return n;
}

function distanceSince(seq, role) {
  for (let i = seq.length - 1, distance = 1; i >= 0; i--, distance++) {
    if (seq[i]?.role === role) return distance;
  }
  return null;
}

function phraseLength(seq) {
  let n = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    if (seq[i]?.role === "punctuation") break;
    n++;
  }
  return n;
}

function phraseEvents(seq) {
  const out = [];
  for (let i = seq.length - 1; i >= 0; i--) {
    if (seq[i]?.role === "punctuation") break;
    out.unshift(seq[i]);
  }
  return out;
}

function tailRun(seq, field) {
  const last = seq.length > 0 ? seq[seq.length - 1]?.[field] : null;
  if (last == null) return { value: null, count: 0 };
  let count = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    if (seq[i]?.[field] !== last) break;
    count++;
  }
  return { value: last, count };
}

function normalizeModel(model) {
  return {
    version: Number(model?.version) || MODEL_VERSION,
    roles: model?.roles || {},
    words: model?.words || {},
    recentRoles: Array.isArray(model?.recentRoles) ? model.recentRoles : [],
    recentTokens: Array.isArray(model?.recentTokens) ? model.recentTokens : [],
    phraseRoles: Array.isArray(model?.phraseRoles) ? model.phraseRoles : [],
    phraseTokens: Array.isArray(model?.phraseTokens) ? model.phraseTokens : [],
    distanceSincePunctuation:
      typeof model?.distanceSincePunctuation === "number" ? model.distanceSincePunctuation : null,
    distanceSinceSuture:
      typeof model?.distanceSinceSuture === "number" ? model.distanceSinceSuture : null,
    phraseLength: typeof model?.phraseLength === "number" ? model.phraseLength : 0,
    roleRun: model?.roleRun || { value: null, count: 0 },
    tokenRun: model?.tokenRun || { value: null, count: 0 },
    count: typeof model?.count === "number" ? model.count : 0,
  };
}

function phraseHasVerb(model) {
  return Array.isArray(model.phraseRoles) && model.phraseRoles.includes("verbs");
}

function phraseTailNounAfterVerb(model) {
  const roles = Array.isArray(model.phraseRoles) ? model.phraseRoles : [];
  if (roles[roles.length - 1] !== "nouns") return false;
  const lastVerb = roles.lastIndexOf("verbs");
  return lastVerb >= 0 && lastVerb < roles.length - 1;
}

// Build the learned model from the journal — the ordered human events as
// { role, token }. The model is intentionally small and replayable: counts plus
// local health signals used by the adaptive scorer.
export function inferModel(sequence) {
  const roles = {};
  const words = {};
  const bump = (table, a, b) => {
    if (a == null || b == null) return;
    const row = table[a] || (table[a] = {});
    row[b] = (row[b] || 0) + 1;
  };
  const seq = Array.isArray(sequence) ? sequence : [];
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1];
    const cur = seq[i];
    if (!prev || !cur) continue;
    bump(words, prev.token, cur.token);
    bump(roles, prev.role, cur.role);
  }
  return {
    version: MODEL_VERSION,
    roles,
    words,
    recentRoles: seq.slice(-RECENT_WINDOW).map((e) => e.role),
    recentTokens: seq.slice(-RECENT_WINDOW).map((e) => e.token),
    phraseRoles: phraseEvents(seq).slice(-PHRASE_WINDOW).map((e) => e.role),
    phraseTokens: phraseEvents(seq).slice(-PHRASE_WINDOW).map((e) => e.token),
    distanceSincePunctuation: distanceSince(seq, "punctuation"),
    distanceSinceSuture: distanceSince(seq, "sutures"),
    phraseLength: phraseLength(seq),
    roleRun: tailRun(seq, "role"),
    tokenRun: tailRun(seq, "token"),
    count: seq.length,
  };
}

function scoreRole(role, prevRole, model, prevToken = null) {
  const m = normalizeModel(model);
  const learned = m.roles[prevRole] || {};
  let weight = ROLE_ALPHA + (learned[role] || 0);
  const recentCount = countRecent(m.recentRoles, role);
  const hasVerb = phraseHasVerb(m) || prevRole === "verbs";
  const tailNounAfterVerb = phraseTailNounAfterVerb(m);

  if (recentCount > 0) {
    weight *= 1 / (1 + recentCount * 0.18);
  }
  if (m.roleRun.value === role && m.roleRun.count > 1) {
    weight *= Math.max(0.16, 1 / (m.roleRun.count * 0.8));
  }

  if (role === "punctuation") {
    const phrase = m.phraseLength;
    const dist = m.distanceSincePunctuation ?? (m.count + 1);
    if (phrase <= 1) weight *= 0.05;
    else if (!hasVerb) weight *= 0.12;
    else if (phrase <= 3) weight *= 0.45;
    else weight *= 0.65 + Math.min(3.2, Math.pow((phrase - 2) / 6, 1.3));
    if (dist < 4) weight *= 0.25;
    if (tailNounAfterVerb) weight *= 1.45;
  }

  if (role === "sutures") {
    const dist = m.distanceSinceSuture ?? Math.min(m.count + 1, 24);
    if (dist < 8) weight *= 0.05;
    else weight *= Math.min(3.2, 0.45 + Math.pow((dist - 4) / 14, 1.35));
    if (!hasVerb) weight *= 0.16;
    else if (m.phraseLength < 4) weight *= 0.35;
    if (prevRole === "conjunctions") weight *= 0.55;
    if (tailNounAfterVerb) weight *= 1.25;
  }

  if (prevRole === "nouns") {
    if (!hasVerb) {
      if (role === "verbs") weight *= 4.8;
      if (role === "conjunctions") weight *= 0.16;
      if (role === "punctuation" || role === "sutures") weight *= 0.22;
    } else if (tailNounAfterVerb) {
      if (role === "verbs") weight *= 0.28;
      if (role === "conjunctions") weight *= 1.35;
      if (role === "punctuation" || role === "sutures") weight *= 1.45;
    }
  }

  if (prevRole === "verbs" && INTRANSITIVE_VERBS.has(prevToken)) {
    if (role === "nouns") weight *= 0.005;
    if (role === "prepositions") weight *= PREPOSITIONAL_VERBS.has(prevToken) ? 1.25 : 0.06;
    if (role === "punctuation" || role === "sutures") weight *= 1.9;
  }
  if (prevRole === "verbs" && TRANSITIVE_VERBS.has(prevToken)) {
    if (role === "nouns") weight *= 1.75;
    if (role === "prepositions") weight *= PREPOSITIONAL_VERBS.has(prevToken) ? 1.15 : 0.005;
    if (role === "punctuation" || role === "sutures") weight *= 0.55;
  }
  return Math.max(0, weight);
}

// Weighted role pick within the grammatical guardrail. Cadence emerges from
// pressure in the text model instead of hardcoded modulo intervals.
function chooseRole(rng, prevRole, model, prevToken = null) {
  const choices = allowedNext(prevRole);
  const weights = choices.map((r) => scoreRole(r, prevRole, model, prevToken));
  return pickWeighted(rng, choices, weights);
}

function scoreToken(token, role, prevToken, model) {
  const m = normalizeModel(model);
  if (token === prevToken) return 0;

  const learned = prevToken != null ? m.words[prevToken] || {} : {};
  const prior = TOKEN_PRIORS[role]?.[token] || 1;
  let weight = WORD_ALPHA * prior + (learned[token] || 0);
  const recentCount = countRecent(m.recentTokens, token);
  if (recentCount > 0) weight *= 1 / (1 + Math.pow(recentCount, 1.4));
  weight *= HUMAN_TOKEN_MULTIPLIERS[role]?.[token] || 1;
  weight *= STIFF_TOKEN_MULTIPLIERS[role]?.[token] || 1;
  if (DETERMINER_OPENINGS.has(prevToken)) {
    if (role === "adjectives") {
      if (["little", "old", "same", "weird", "wrong", "small", "quiet", "lost", "half", "next"].includes(token)) {
        weight *= 1.8;
      } else {
        weight *= 0.78;
      }
    } else if (role === "nouns") {
      if (["someone", "something", "nothing", "everything", "everyone", "no one", "thing", "body", "voice", "hand", "face", "room", "story", "friend", "door", "home"].includes(token)) {
        weight *= 1.8;
      } else if (STIFF_TOKEN_MULTIPLIERS.nouns?.[token]) {
        weight *= 0.55;
      }
    }
  }

  if (role === "punctuation") {
    if (token === ",") weight *= 1.45;
    else if (token === ";") weight *= 1.2;
    else if (token === ".") weight *= 0.28;
    else if (token === "—") weight *= 0.22;
  }
  if (role === "prepositions" && prevToken && VERB_PREPOSITION_MULTIPLIERS[prevToken]) {
    weight *= VERB_PREPOSITION_MULTIPLIERS[prevToken][token] || 0.18;
  }

  return Math.max(0, weight);
}

function chooseToken(rng, role, prevToken, model) {
  const pool = BUCKETS[role] || BUCKETS.nouns;
  const weights = pool.map((token) => scoreToken(token, role, prevToken, model));
  return pickWeighted(rng, pool, weights);
}

// Returns { token, role }.
// prevRole — role of the token immediately before; null for an empty body.
// eventIndex — 1-based count of human events appended so far (this one inclusive).
// seed — integer; together with eventIndex makes selection deterministic.
// prevToken — the last token string, used to avoid back-to-back duplicates.
// model — optional learned model from inferModel(); when absent, selection is
//         driven by source priors only.
export function selectNextToken(prevRole, eventIndex, seed, prevToken = null, model = null) {
  const rng = mulberry32((seed ^ (eventIndex * 0x9e3779b1)) >>> 0);

  let role;
  if (!prevRole) {
    role = "openings";
  } else {
    role = chooseRole(rng, prevRole, model, prevToken);
  }

  const token = chooseToken(rng, role, prevToken, model);
  return { token, role };
}

export const _internals = {
  NEXT_ROLES,
  MODEL_VERSION,
  RECENT_WINDOW,
  PHRASE_WINDOW,
  ROLE_ALPHA,
  WORD_ALPHA,
  INTRANSITIVE_VERBS,
  TRANSITIVE_VERBS,
  PREPOSITIONAL_VERBS,
  normalizeModel,
  scoreRole,
  scoreToken,
};
