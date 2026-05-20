// Neutral token pools for the body-for-visits artwork.
// Linguistic buckets are generated from ESDB/SCOWL POS data, with compact
// frequency priors used only to keep cold starts in common English. The event
// journal still becomes the stronger local model as the body grows.

import { WORD_PRIORS, WORD_PRIOR_SOURCE } from "./word-priors.generated.js";

function tokens(role) {
  return Object.freeze(Object.keys(WORD_PRIORS[role] || {}));
}

export const BUCKETS = Object.freeze({
  openings: tokens("openings"),
  nouns: tokens("nouns"),
  verbs: tokens("verbs"),
  prepositions: tokens("prepositions"),
  adjectives: tokens("adjectives"),
  conjunctions: tokens("conjunctions"),
  sutures: tokens("sutures"),
  punctuation: Object.freeze([".", ",", ";", "—"]),
  corruption_glyphs: Object.freeze(["▮", "░", "▒", "▓", "◌", "◍", "◯", "⌁", "⌇", "⎓", "⎔", "⏚"]),
});

export const TOKEN_PRIORS = Object.freeze({
  openings: WORD_PRIORS.openings,
  nouns: WORD_PRIORS.nouns,
  verbs: WORD_PRIORS.verbs,
  prepositions: WORD_PRIORS.prepositions,
  adjectives: WORD_PRIORS.adjectives,
  conjunctions: WORD_PRIORS.conjunctions,
  sutures: WORD_PRIORS.sutures,
  punctuation: Object.freeze({
    ".": 0.35,
    ",": 1.65,
    ";": 1.25,
    "—": 0.22,
  }),
});

export { WORD_PRIOR_SOURCE };

export const ROLES = Object.freeze([
  "openings",
  "nouns",
  "verbs",
  "prepositions",
  "adjectives",
  "conjunctions",
  "sutures",
  "punctuation",
]);
