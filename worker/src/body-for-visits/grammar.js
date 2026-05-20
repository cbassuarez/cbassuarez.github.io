// Next-role state machine and token selector for body-for-visits.
// Deterministic per (eventIndex, seed, model) so events are replayable from the
// journal, replayed in order.

import { BUCKETS, TOKEN_PRIORS } from "./lexicon.js";

const NEXT_ROLES = {
  openings:     ["adjectives", "nouns"],
  punctuation:  ["openings", "adjectives", "nouns"],
  sutures:      ["adjectives", "nouns", "verbs"],
  adjectives:   ["nouns", "conjunctions"],
  nouns:        ["verbs", "conjunctions", "punctuation", "sutures"],
  verbs:        ["prepositions", "adjectives", "nouns", "punctuation", "sutures"],
  prepositions: ["adjectives", "nouns"],
  conjunctions: ["adjectives", "nouns", "verbs", "sutures"],
};

const MODEL_VERSION = 2;
const RECENT_WINDOW = 18;

// Smoothing weight. A learned count is added to the source word prior, so cold
// starts stay deterministic and the journal takes over as it accumulates
// evidence.
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
    distanceSincePunctuation: distanceSince(seq, "punctuation"),
    distanceSinceSuture: distanceSince(seq, "sutures"),
    phraseLength: phraseLength(seq),
    roleRun: tailRun(seq, "role"),
    tokenRun: tailRun(seq, "token"),
    count: seq.length,
  };
}

function scoreRole(role, prevRole, model) {
  const m = normalizeModel(model);
  const learned = m.roles[prevRole] || {};
  let weight = ROLE_ALPHA + (learned[role] || 0);
  const recentCount = countRecent(m.recentRoles, role);

  if (recentCount > 0) {
    weight *= 1 / (1 + recentCount * 0.18);
  }
  if (m.roleRun.value === role && m.roleRun.count > 1) {
    weight *= Math.max(0.16, 1 / (m.roleRun.count * 0.8));
  }

  if (role === "punctuation") {
    const phrase = m.phraseLength;
    const dist = m.distanceSincePunctuation ?? (m.count + 1);
    if (phrase <= 1) weight *= 0.08;
    else if (phrase <= 3) weight *= 0.35;
    else weight *= 0.65 + Math.min(3.2, Math.pow((phrase - 2) / 6, 1.3));
    if (dist < 4) weight *= 0.25;
  }

  if (role === "sutures") {
    const dist = m.distanceSinceSuture ?? Math.min(m.count + 1, 24);
    if (dist < 8) weight *= 0.05;
    else weight *= Math.min(3.2, 0.45 + Math.pow((dist - 4) / 14, 1.35));
    if (m.phraseLength < 4) weight *= 0.35;
    if (prevRole === "conjunctions") weight *= 0.55;
  }

  return Math.max(0, weight);
}

// Weighted role pick within the grammatical guardrail. Cadence emerges from
// pressure in the text model instead of hardcoded modulo intervals.
function chooseRole(rng, prevRole, model) {
  const choices = allowedNext(prevRole);
  const weights = choices.map((r) => scoreRole(r, prevRole, model));
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

  if (role === "punctuation") {
    if (token === ",") weight *= 1.45;
    else if (token === ";") weight *= 1.2;
    else if (token === ".") weight *= 0.28;
    else if (token === "—") weight *= 0.22;
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
    role = chooseRole(rng, prevRole, model);
  }

  const token = chooseToken(rng, role, prevToken, model);
  return { token, role };
}

export const _internals = {
  NEXT_ROLES,
  MODEL_VERSION,
  RECENT_WINDOW,
  ROLE_ALPHA,
  WORD_ALPHA,
  normalizeModel,
  scoreRole,
  scoreToken,
};
