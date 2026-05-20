// Next-role state machine and token selector for body-for-visits.
// Deterministic per (eventIndex, seed) so events are replayable from the journal.

import { BUCKETS } from "./lexicon.js";

const NEXT_ROLES = {
  openings:     ["adjectives", "nouns"],
  punctuation:  ["openings", "adjectives", "nouns"],
  sutures:      ["adjectives", "nouns", "verbs"],
  adjectives:   ["nouns", "conjunctions"],
  nouns:        ["verbs", "conjunctions", "punctuation"],
  verbs:        ["prepositions", "adjectives", "nouns", "punctuation"],
  prepositions: ["adjectives", "nouns"],
  conjunctions: ["adjectives", "nouns", "verbs"],
};

const SUTURE_EVERY = 7;
const PUNCT_EVERY = 13;

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

export function allowedNext(prevRole) {
  return NEXT_ROLES[prevRole] || NEXT_ROLES.punctuation;
}

// Returns { token, role }.
// prevRole — role of the token immediately before; null for an empty body.
// eventIndex — 1-based count of human events appended so far (this one inclusive).
// seed — integer; together with eventIndex makes selection deterministic.
// prevToken — the last token string, used to avoid back-to-back duplicates.
export function selectNextToken(prevRole, eventIndex, seed, prevToken = null) {
  const rng = mulberry32((seed ^ (eventIndex * 0x9e3779b1)) >>> 0);

  let role;
  if (!prevRole) {
    role = "openings";
  } else if (eventIndex > 0 && eventIndex % PUNCT_EVERY === 0) {
    role = "punctuation";
  } else if (eventIndex > 0 && eventIndex % SUTURE_EVERY === 0) {
    role = "sutures";
  } else {
    const choices = allowedNext(prevRole);
    role = choices[Math.floor(rng() * choices.length)];
  }

  const pool = BUCKETS[role] || BUCKETS.nouns;
  let token = pool[Math.floor(rng() * pool.length)];
  for (let i = 0; i < 4 && token === prevToken && pool.length > 1; i++) {
    token = pool[Math.floor(rng() * pool.length)];
  }
  return { token, role };
}

export const _internals = { NEXT_ROLES, SUTURE_EVERY, PUNCT_EVERY };
