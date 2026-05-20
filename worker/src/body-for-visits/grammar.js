// Next-role state machine and token selector for body-for-visits.
// Deterministic per (eventIndex, seed, model) so events are replayable from the
// journal, replayed in order.

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

// Smoothing weight. A learned count is added to this prior, so with no history
// the weighted pick is uniform — identical to the original behaviour — and the
// learned distribution only takes over as the journal grows.
const ROLE_ALPHA = 1;
const WORD_ALPHA = 1;

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

// Build the learned model from the journal — the ordered human events as
// { role, token }. Returns { roles, words }, nested count tables:
//   roles[from][to]   — role-transition counts. Only FREELY chosen transitions
//                       are counted; destinations forced by the suture /
//                       punctuation cadence are skipped, so the model learns
//                       genuine choices rather than the fixed rhythm.
//   words[prev][next] — word-bigram counts over every adjacent pair.
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
    // cur is the human event at 1-based index i + 1.
    const destIndex = i + 1;
    const forced = destIndex % SUTURE_EVERY === 0 || destIndex % PUNCT_EVERY === 0;
    if (!forced) bump(roles, prev.role, cur.role);
  }
  return { roles, words };
}

// Weighted role pick within the grammatical guardrail. With no learned history
// for prevRole, falls back to the original uniform pick.
function chooseRole(rng, prevRole, model) {
  const choices = allowedNext(prevRole);
  const learned = model && model.roles ? model.roles[prevRole] : null;
  if (!learned) {
    return choices[Math.floor(rng() * choices.length)];
  }
  const weights = choices.map((r) => (learned[r] || 0) + ROLE_ALPHA);
  return pickWeighted(rng, choices, weights);
}

// Weighted token pick within the chosen role's bucket. With no learned history
// for prevToken, falls back to the original uniform pick.
function chooseToken(rng, pool, prevToken, model) {
  const learned =
    model && model.words && prevToken != null ? model.words[prevToken] : null;
  if (!learned) {
    return pool[Math.floor(rng() * pool.length)];
  }
  const weights = pool.map((w) => (learned[w] || 0) + WORD_ALPHA);
  return pickWeighted(rng, pool, weights);
}

// Returns { token, role }.
// prevRole — role of the token immediately before; null for an empty body.
// eventIndex — 1-based count of human events appended so far (this one inclusive).
// seed — integer; together with eventIndex makes selection deterministic.
// prevToken — the last token string, used to avoid back-to-back duplicates.
// model — optional learned model from inferModel(); when absent, selection is
//         uniform (identical to the original behaviour).
export function selectNextToken(prevRole, eventIndex, seed, prevToken = null, model = null) {
  const rng = mulberry32((seed ^ (eventIndex * 0x9e3779b1)) >>> 0);

  let role;
  if (!prevRole) {
    role = "openings";
  } else if (eventIndex > 0 && eventIndex % PUNCT_EVERY === 0) {
    role = "punctuation";
  } else if (eventIndex > 0 && eventIndex % SUTURE_EVERY === 0) {
    role = "sutures";
  } else {
    role = chooseRole(rng, prevRole, model);
  }

  const pool = BUCKETS[role] || BUCKETS.nouns;
  let token = chooseToken(rng, pool, prevToken, model);
  for (let i = 0; i < 4 && token === prevToken && pool.length > 1; i++) {
    token = chooseToken(rng, pool, prevToken, model);
  }
  return { token, role };
}

export const _internals = { NEXT_ROLES, SUTURE_EVERY, PUNCT_EVERY, ROLE_ALPHA, WORD_ALPHA };
