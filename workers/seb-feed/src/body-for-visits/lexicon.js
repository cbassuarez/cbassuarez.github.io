// Neutral token pools for the body-for-visits artwork.
// Linguistic buckets are generated from ESDB/SCOWL POS data, with compact
// frequency priors used only to keep cold starts in common English. The event
// journal still becomes the stronger local model as the body grows.

import { WORD_PRIORS, WORD_PRIOR_SOURCE } from "./word-priors.generated.js";

const CORE_BUCKETS = Object.freeze({
  openings: Object.freeze([
    "now", "then", "again", "here", "there", "soon", "later", "already",
    "meanwhile", "elsewhere", "afterward", "beforehand", "nearby", "inside",
    "outside", "back", "ahead", "almost", "sometimes", "otherwise",
    "at first", "for now", "by then", "once more", "not yet", "in time",
    "the", "a", "this", "that", "some", "another", "maybe the",
    "and then the", "so the", "you know the", "I guess the",
  ]),
  nouns: Object.freeze([
    "act", "air", "answer", "area", "body", "book", "border", "breath",
    "call", "case", "center", "change", "child", "city", "class", "color",
    "country", "day", "door", "edge", "effect", "end", "face", "fact",
    "field", "figure", "floor", "form", "friend", "group", "hand", "head",
    "home", "house", "idea", "image", "kind", "language", "letter", "life",
    "light", "line", "list", "mark", "matter", "meaning", "memory", "minute",
    "moment", "name", "night", "number", "order", "page", "part", "place",
    "point", "question", "record", "road", "room", "rule", "shape", "side",
    "sound", "space", "state", "story", "surface", "thing", "thought",
    "time", "voice", "wall", "water", "way", "word", "work", "world",
    "someone", "something", "nothing", "everything", "everyone", "no one",
  ]),
  verbs: Object.freeze([
    "accepts", "answers", "appears", "becomes", "begins", "breaks", "calls",
    "carries", "changes", "closes", "comes", "continues", "crosses", "draws",
    "ends", "enters", "exists", "falls", "finds", "follows", "forms", "gives",
    "grows", "happens", "has", "holds", "keeps", "leaves", "lets", "lives",
    "looks", "makes", "means", "moves", "names", "needs", "opens", "passes",
    "reaches", "reads", "remains", "returns", "rises", "says", "sees",
    "seems", "sends", "sets", "shows", "sits", "speaks", "stands", "stays",
    "takes", "thinks", "tries", "turns", "waits", "walks", "wants", "works",
    "writes", "asks", "feels", "forgets", "hears", "knows", "notices",
    "remembers",
  ]),
  prepositions: Object.freeze([
    "about", "across", "after", "against", "along", "among", "around", "before",
    "behind", "below", "beneath", "beside", "between", "beyond", "inside",
    "into", "near", "of", "over", "for", "through", "to", "toward", "under",
    "with", "within", "without",
  ]),
  adjectives: Object.freeze([
    "able", "absent", "bare", "bright", "broad", "broken", "careful",
    "central", "clear", "close", "cold", "common", "deep", "dry", "early",
    "empty", "familiar", "far", "final", "first", "former", "free", "full",
    "general", "hidden", "human", "inner", "last", "late", "left", "light",
    "living", "local", "long", "loose", "lost", "low", "minor", "narrow",
    "near", "new", "old", "open", "ordinary", "other", "partial", "plain",
    "possible", "public", "quiet", "ready", "real", "recent", "same",
    "second", "shared", "short", "silent", "simple", "slow", "small", "soft",
    "still", "strange", "strong", "thin", "true", "usual", "warm", "whole",
    "wide", "young", "little", "weird", "wrong", "half", "next",
  ]),
  conjunctions: Object.freeze(["and", "or", "but", "yet", "and then", "but then", "so"]),
  sutures: Object.freeze([
    "— again —", "— then —", "— still —", "— briefly —", "— perhaps —",
    "— already —", "— almost —", "— elsewhere —", "— for now —", "— not yet —",
    "— once more —", "— in time —", "— at first —", "— after all —",
    "— as if —", "— if so —", "— in part —", "— as before —",
    "— I mean —", "— you know —", "— sort of —", "— wait —", "— no —",
  ]),
});

function priors(role) {
  const source = { ...(WORD_PRIORS[role] || {}) };
  for (const token of CORE_BUCKETS[role] || []) {
    if (typeof source[token] !== "number") source[token] = 1;
  }
  return Object.freeze(source);
}

export const BUCKETS = Object.freeze({
  openings: CORE_BUCKETS.openings,
  nouns: CORE_BUCKETS.nouns,
  verbs: CORE_BUCKETS.verbs,
  prepositions: CORE_BUCKETS.prepositions,
  adjectives: CORE_BUCKETS.adjectives,
  conjunctions: CORE_BUCKETS.conjunctions,
  sutures: CORE_BUCKETS.sutures,
  punctuation: Object.freeze([".", ",", ";", "—"]),
  corruption_glyphs: Object.freeze(["▮", "░", "▒", "▓", "◌", "◍", "◯", "⌁", "⌇", "⎓", "⎔", "⏚"]),
});

export const TOKEN_PRIORS = Object.freeze({
  openings: priors("openings"),
  nouns: priors("nouns"),
  verbs: priors("verbs"),
  prepositions: priors("prepositions"),
  adjectives: priors("adjectives"),
  conjunctions: priors("conjunctions"),
  sutures: priors("sutures"),
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
