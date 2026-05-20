// Offline speech-unit selector for (to)complete.
// The runtime model is a committed n-gram table generated from pinned
// public-domain texts. There are no live model calls in the Worker.

import { SPEECH_MODEL } from "./speech-model.generated.js";

const MODEL_VERSION = 4;
const SPEECH_ROLE = "speech_unit";
const RECENT_TOKEN_WINDOW = 48;
const RECENT_UNIT_WINDOW = 12;
const MIN_WORDS = 2;
const MAX_WORDS = 12;
const MAX_ATTEMPTS = 36;
const MAX_STEPS = 24;

const TOKEN_RE = /^[a-z]+(?:'[a-z]+)?$/;
const PUNCTUATION = new Set([",", ";", "—"]);
const HARD_TERMINAL_RE = /[.!?]\s*$/;
const CONNECTORS = new Set(["and", "but", "or", "yet", "so", "then"]);
const BAD_STARTERS = new Set([
  "a",
  "about",
  "above",
  "after",
  "against",
  "along",
  "among",
  "around",
  "before",
  "behind",
  "below",
  "beneath",
  "beside",
  "between",
  "beyond",
  "by",
  "for",
  "from",
  "in",
  "inside",
  "into",
  "near",
  "of",
  "on",
  "onto",
  "over",
  "the",
  "to",
  "toward",
  "under",
  "with",
  "within",
  "without",
]);
const GOOD_STARTERS = new Set([
  "again",
  "ah",
  "all",
  "almost",
  "already",
  "and",
  "anyway",
  "back",
  "because",
  "but",
  "can",
  "can't",
  "come",
  "did",
  "do",
  "does",
  "don't",
  "even",
  "everything",
  "go",
  "he",
  "here",
  "how",
  "i",
  "if",
  "isn't",
  "it",
  "it's",
  "just",
  "look",
  "maybe",
  "never",
  "no",
  "not",
  "nothing",
  "now",
  "oh",
  "once",
  "one",
  "only",
  "perhaps",
  "see",
  "she",
  "so",
  "something",
  "still",
  "sure",
  "that",
  "that's",
  "then",
  "there",
  "there's",
  "these",
  "they",
  "this",
  "though",
  "wait",
  "we",
  "well",
  "what",
  "when",
  "where",
  "who",
  "why",
  "won't",
  "yes",
  "yet",
  "you",
]);
const BAD_ENDERS = new Set([
  "a",
  "again",
  "already",
  "am",
  "an",
  "about",
  "and",
  "any",
  "as",
  "at",
  "be",
  "been",
  "being",
  "because",
  "but",
  "by",
  "can",
  "come",
  "could",
  "did",
  "do",
  "don't",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "if",
  "in",
  "into",
  "is",
  "isn't",
  "it",
  "little",
  "many",
  "may",
  "might",
  "more",
  "much",
  "must",
  "my",
  "not",
  "of",
  "on",
  "only",
  "or",
  "our",
  "shall",
  "should",
  "so",
  "some",
  "that",
  "the",
  "they",
  "then",
  "this",
  "to",
  "very",
  "was",
  "we",
  "were",
  "what",
  "will",
  "with",
  "would",
  "you",
  "your",
]);
const NARRATION_WORDS = new Set(["answered", "asked", "cried", "murmured", "replied", "said", "says"]);
const BLOCKED_TERMS = new Set(SPEECH_MODEL.blockedTerms || []);
const BLOCKED_PHRASES = [
  "project gutenberg",
  "the end",
  "chapter ",
  "ebook",
  "my uncle",
  "please your",
  "public domain",
  "said my",
  "white whale",
];
const tableCache = new Map();

function table(order) {
  if (!tableCache.has(order)) {
    tableCache.set(order, new Map(SPEECH_MODEL.grams[String(order)] || []));
  }
  return tableCache.get(order);
}

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

function pickWeighted(rng, pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  let total = 0;
  for (const pair of pairs) total += Number(pair[1]) || 0;
  if (!(total > 0)) return pairs[Math.floor(rng() * pairs.length)]?.[0] ?? null;
  let r = rng() * total;
  for (const pair of pairs) {
    r -= Number(pair[1]) || 0;
    if (r < 0) return pair[0];
  }
  return pairs[pairs.length - 1]?.[0] ?? null;
}

function hashTokens(tokens) {
  let h = 0x811c9dc5;
  for (const token of tokens) {
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x20;
  }
  return h >>> 0;
}

function isWord(token) {
  return TOKEN_RE.test(token || "");
}

function wordCount(tokens) {
  return tokens.filter(isWord).length;
}

export function tokenizeSpeech(text) {
  const normalized = String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/--+|[—–]/g, " — ")
    .replace(/[:]/g, ",")
    .replace(/[,]+/g, " , ")
    .replace(/[;]+/g, " ; ")
    .replace(/[.!?]+/g, " ")
    .replace(/[^a-zA-Z',;—\s-]/g, " ")
    .toLowerCase();
  const tokens = [];
  for (const raw of normalized.split(/\s+/)) {
    if (!raw) continue;
    if (PUNCTUATION.has(raw)) {
      tokens.push(raw);
      continue;
    }
    const word = raw.replace(/^-+|-+$/g, "").replace(/^'+|'+$/g, "");
    if (isWord(word)) tokens.push(word);
  }
  return tokens;
}

function detokenize(tokens) {
  let out = "";
  for (const token of tokens) {
    if (!token) continue;
    if (token === "," || token === ";") {
      out = out.replace(/\s+$/g, "") + token;
    } else if (token === "—") {
      out = `${out.replace(/\s+$/g, "")} — `;
    } else {
      out += `${out && !out.endsWith(" ") ? " " : ""}${token}`;
    }
  }
  return out.replace(/\s+/g, " ").replace(/\s+([,;])/g, "$1").trim();
}

function normalizeUnit(unit) {
  return detokenize(tokenizeSpeech(unit));
}

function hasBlockedTerm(tokens) {
  return tokens.some((token) => BLOCKED_TERMS.has(token));
}

function hasRepeatedAdjacentWord(tokens) {
  let prev = null;
  for (const token of tokens) {
    if (!isWord(token)) continue;
    if (token === prev) return true;
    prev = token;
  }
  return false;
}

function endsOpen(tokens) {
  const last = tokens[tokens.length - 1];
  if (!last) return false;
  if (PUNCTUATION.has(last)) return true;
  if (CONNECTORS.has(last)) return true;
  return isWord(last);
}

export function validateSpeechUnit(unit, prevToken = null) {
  const raw = String(unit || "");
  if (!raw.trim()) return { ok: false, reason: "empty" };
  if (/[\r\n]/.test(raw)) return { ok: false, reason: "multiline" };
  if (/https?:|www\.|<[^>]+>/i.test(raw)) return { ok: false, reason: "markup" };
  if (HARD_TERMINAL_RE.test(raw)) return { ok: false, reason: "terminal" };
  if (/[A-Z]{3,}/.test(raw)) return { ok: false, reason: "caps" };

  const normalized = normalizeUnit(raw);
  const lower = normalized.toLowerCase();
  for (const phrase of BLOCKED_PHRASES) {
    if (lower.includes(phrase)) return { ok: false, reason: "source_phrase" };
  }

  const tokens = tokenizeSpeech(normalized);
  const words = wordCount(tokens);
  if (words < MIN_WORDS || words > MAX_WORDS) return { ok: false, reason: "length" };
  if (!isWord(tokens[0])) return { ok: false, reason: "bad_start" };
  if (!endsOpen(tokens)) return { ok: false, reason: "closed" };
  if (hasBlockedTerm(tokens)) return { ok: false, reason: "source_term" };
  if (hasRepeatedAdjacentWord(tokens)) return { ok: false, reason: "repeat" };

  const previous = tokenizeSpeech(prevToken || "");
  const prevWords = previous.filter(isWord);
  const first = tokens.find(isWord);
  const wordsOnly = tokens.filter(isWord);
  const lastPrev = prevWords[prevWords.length - 1];
  if (BAD_STARTERS.has(first)) return { ok: false, reason: "bad_starter" };
  if (!GOOD_STARTERS.has(first)) return { ok: false, reason: "weak_starter" };
  if (wordsOnly.some((word) => NARRATION_WORDS.has(word))) return { ok: false, reason: "narration" };
  const lastWord = wordsOnly[wordsOnly.length - 1];
  if (BAD_ENDERS.has(lastWord)) return { ok: false, reason: "dangling_end" };
  if (lastPrev && first && lastPrev === first) return { ok: false, reason: "join_repeat" };
  if (!lastPrev && CONNECTORS.has(first)) return { ok: false, reason: "orphan_connector" };

  return { ok: true, token: normalized };
}

function flattenTokens(sequence) {
  const out = [];
  const seq = Array.isArray(sequence) ? sequence : [];
  for (const event of seq) {
    if (!event || event.role === "fold_marker" || event.role === "corruption") continue;
    out.push(...tokenizeSpeech(event.token));
  }
  return out;
}

export function allowedNext(_prevRole) {
  return [SPEECH_ROLE];
}

export function inferModel(sequence) {
  const seq = Array.isArray(sequence) ? sequence : [];
  const flattened = flattenTokens(seq);
  return {
    version: MODEL_VERSION,
    role: SPEECH_ROLE,
    speechModel: {
      version: SPEECH_MODEL.version,
      order: SPEECH_MODEL.order,
      sources: SPEECH_MODEL.sources,
    },
    recentTokens: flattened.slice(-RECENT_TOKEN_WINDOW),
    recentUnits: seq
      .filter((event) => event && event.role !== "fold_marker" && event.role !== "corruption")
      .slice(-RECENT_UNIT_WINDOW)
      .map((event) => String(event.token || "")),
    count: seq.length,
  };
}

function normalizeModel(model) {
  return {
    version: Number(model?.version) || MODEL_VERSION,
    recentTokens: Array.isArray(model?.recentTokens) ? model.recentTokens.filter((t) => isWord(t) || PUNCTUATION.has(t)) : [],
    recentUnits: Array.isArray(model?.recentUnits) ? model.recentUnits.map(String) : [],
    count: typeof model?.count === "number" ? model.count : 0,
  };
}

function chooseStart(rng) {
  const picked = pickWeighted(rng, SPEECH_MODEL.starts);
  return picked ? picked.split(" ").filter(isWord) : [];
}

function chooseFragment(rng, contextTokens) {
  const fragments = SPEECH_MODEL.fragments || [];
  if (!Array.isArray(fragments) || fragments.length === 0) return "";
  const prevWords = contextTokens.filter(isWord);
  const last = prevWords[prevWords.length - 1] || "";
  const afterPunctuation = PUNCTUATION.has(contextTokens[contextTokens.length - 1]);
  const scored = [];
  for (const pair of fragments) {
    const text = pair[0];
    const weight = Number(pair[1]) || 1;
    const tokens = tokenizeSpeech(text);
    const first = tokens.find(isWord) || "";
    if (!first || first === last) continue;
    if (contextTokens.length === 0 && CONNECTORS.has(first)) continue;
    let score = weight;
    if (CONNECTORS.has(first)) score *= afterPunctuation ? 0.75 : 1.6;
    if (last && tokens.includes(last)) score *= 1.18;
    scored.push([text, score]);
  }
  return pickWeighted(rng, scored) || "";
}

function chooseNext(rng, context) {
  for (let order = SPEECH_MODEL.order || 4; order >= 1; order--) {
    const key = context.slice(-order).join(" ");
    if (!key) continue;
    const options = table(order).get(key);
    if (options && options.length > 0) {
      const picked = pickWeighted(rng, options);
      if (picked && !BLOCKED_TERMS.has(picked)) return picked;
    }
  }
  return null;
}

function targetWordCount(rng) {
  const r = rng();
  if (r < 0.18) return 2 + Math.floor(rng() * 2);
  if (r < 0.72) return 4 + Math.floor(rng() * 4);
  return 8 + Math.floor(rng() * 5);
}

function generateCandidate(rng, contextTokens) {
  const fragment = chooseFragment(rng, contextTokens);
  if (fragment) return fragment;
  const target = targetWordCount(rng);
  const context = contextTokens.slice(-RECENT_TOKEN_WINDOW);
  const out = context.length > 0 ? [] : chooseStart(rng).slice(0, Math.max(2, Math.min(4, target)));

  if (out.length > 0) {
    context.push(...out);
  }

  let steps = 0;
  while (wordCount(out) < MAX_WORDS && steps < MAX_STEPS) {
    steps++;
    const next = chooseNext(rng, context);
    if (!next) {
      if (wordCount(out) >= MIN_WORDS) break;
      const restart = chooseStart(rng).slice(0, Math.max(2, Math.min(4, target - wordCount(out))));
      if (restart.length === 0) break;
      out.push(...restart);
      context.push(...restart);
      continue;
    }
    if (out.length === 0 && !isWord(next)) continue;
    if (BLOCKED_TERMS.has(next)) continue;
    const last = out[out.length - 1];
    if (isWord(last) && last === next) continue;
    if (PUNCTUATION.has(last) && PUNCTUATION.has(next)) continue;

    out.push(next);
    context.push(next);

    const words = wordCount(out);
    if (words >= MIN_WORDS && PUNCTUATION.has(next)) {
      if (rng() < 0.86) break;
    }
    if (words >= target && isWord(next)) {
      if (!CONNECTORS.has(next) && rng() < 0.48) {
        const maybePunctuation = chooseNext(rng, context);
        if (PUNCTUATION.has(maybePunctuation)) {
          out.push(maybePunctuation);
          context.push(maybePunctuation);
          break;
        }
      }
      if (CONNECTORS.has(next) || rng() < 0.74) break;
    }
  }

  return detokenize(out);
}

// Returns { token, role } or null if the offline model cannot produce a safe
// continuation after bounded retries.
export function selectNextToken(prevRole, eventIndex, seed, prevToken = null, model = null) {
  void prevRole;
  const m = normalizeModel(model);
  const context = m.recentTokens.length > 0 ? m.recentTokens : tokenizeSpeech(prevToken || "");
  const contextHash = hashTokens(context.slice(-8));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptSeed = (
      seed ^
      contextHash ^
      Math.imul(eventIndex, 0x9e3779b1) ^
      Math.imul(attempt + 1, 0x85ebca6b)
    ) >>> 0;
    const rng = mulberry32(attemptSeed);
    const candidate = generateCandidate(rng, context);
    const validation = validateSpeechUnit(candidate, prevToken);
    if (validation.ok) {
      return { token: validation.token, role: SPEECH_ROLE };
    }
  }
  return null;
}

export const _internals = {
  MODEL_VERSION,
  SPEECH_ROLE,
  MIN_WORDS,
  MAX_WORDS,
  MAX_ATTEMPTS,
  RECENT_TOKEN_WINDOW,
  normalizeModel,
  tokenizeSpeech,
  validateSpeechUnit,
  generateCandidate,
  hashTokens,
};
