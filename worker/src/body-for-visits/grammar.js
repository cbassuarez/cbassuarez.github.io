// Linguistic utilities and the safety validator for (to)complete.
// Text generation moved to the online neural model in net.js — this module
// keeps only the tokenizer, the detokenizer, the speech-unit validator, and
// the journal-to-context inference the Durable Object feeds the model.

export const MODEL_VERSION = 5;
export const SPEECH_ROLE = "speech_unit";
export const RECENT_TOKEN_WINDOW = 48;
const RECENT_UNIT_WINDOW = 12;
export const MIN_WORDS = 2;
export const MAX_WORDS = 12;

const TOKEN_RE = /^[a-z]+(?:'[a-z]+)?$/;
export const PUNCTUATION = new Set([",", ";", "—"]);
const HARD_TERMINAL_RE = /[.!?]\s*$/;
export const CONNECTORS = new Set(["and", "but", "or", "yet", "so", "then"]);
export const BAD_STARTERS = new Set([
  "a", "about", "above", "after", "against", "along", "among", "around",
  "before", "behind", "below", "beneath", "beside", "between", "beyond",
  "by", "for", "from", "in", "inside", "into", "near", "of", "on", "onto",
  "over", "the", "to", "toward", "under", "with", "within", "without",
]);
export const GOOD_STARTERS = new Set([
  "again", "ah", "all", "almost", "already", "and", "anyway", "back",
  "because", "but", "can", "can't", "come", "did", "do", "does", "don't",
  "even", "everything", "go", "he", "here", "how", "i", "if", "isn't",
  "it", "it's", "just", "look", "maybe", "never", "no", "not", "nothing",
  "now", "oh", "once", "one", "only", "perhaps", "see", "she", "so",
  "something", "still", "sure", "that", "that's", "then", "there",
  "there's", "these", "they", "this", "though", "wait", "we", "well",
  "what", "when", "where", "who", "why", "won't", "yes", "yet", "you",
]);
export const BAD_ENDERS = new Set([
  "a", "again", "already", "am", "an", "about", "and", "any", "as", "at",
  "be", "been", "being", "because", "but", "by", "can", "come", "could",
  "did", "do", "don't", "does", "for", "from", "had", "has", "have", "he",
  "her", "his", "i", "if", "in", "into", "is", "isn't", "it", "little",
  "many", "may", "might", "more", "much", "must", "my", "not", "of", "on",
  "only", "or", "our", "shall", "should", "so", "some", "that", "the",
  "they", "then", "this", "to", "very", "was", "we", "were", "what",
  "will", "with", "would", "you", "your",
]);
export const NARRATION_WORDS = new Set([
  "answered", "asked", "cried", "murmured", "replied", "said", "says",
]);

// Character and place names from the source novels. The neural model's vocab
// excludes these so it cannot emit them; the validator is the second guard.
export const BLOCKED_TERMS = new Set([
  "ahab", "ambassadors", "antisthenes", "bloom", "bilham", "benben",
  "bildad", "boylan", "buck", "carr", "chad", "cissy", "daggoo", "dedalus",
  "dignam", "dilly", "dublin", "fedallah", "flask", "gerty", "gloriani",
  "gorgias", "gostrey", "gutenberg", "haines", "hawaiian", "honour",
  "ishmael", "joyce", "kelleher", "kernan", "lambert", "lenehan",
  "leopold", "madame", "mamie", "melville", "milly", "moby", "molly",
  "mulligan", "nantucket", "newsome", "obadiah", "paddy", "peleg",
  "pequod", "pocock", "project", "quoth", "queequeg", "shandy", "slop",
  "sperm", "starbuck", "stephen", "sterne", "stubb", "strether",
  "susannah", "tashtego", "thee", "thou", "toby", "trim", "tristram",
  "uncle", "ulysses", "vionnet", "walter", "waymarsh", "whale",
  "woollett", "ye", "yorick", "au", "conseil", "livres", "monsieur",
  "mr", "mrs", "miss", "o'connor", "reste", "seaman's",
]);
const BLOCKED_PHRASES = [
  "project gutenberg", "the end", "chapter ", "ebook", "my uncle",
  "please your", "public domain", "said my", "white whale",
];

// Small mulberry32 — deterministic, no Math.random.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashTokens(tokens) {
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

export function isWord(token) {
  return TOKEN_RE.test(token || "");
}

export function wordCount(tokens) {
  return tokens.filter(isWord).length;
}

// A rollout length target, mirroring the cadence the n-gram model used.
export function targetWordCount(rng) {
  const r = rng();
  if (r < 0.18) return 2 + Math.floor(rng() * 2);
  if (r < 0.72) return 4 + Math.floor(rng() * 4);
  return 8 + Math.floor(rng() * 5);
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

export function detokenize(tokens) {
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

// Distils the human event journal into the rolling context the model reads:
// recentTokens drives the model's K-token input window; recentUnits and count
// are kept for the open journal export.
export function inferModel(sequence) {
  const seq = Array.isArray(sequence) ? sequence : [];
  const flattened = flattenTokens(seq);
  return {
    version: MODEL_VERSION,
    role: SPEECH_ROLE,
    recentTokens: flattened.slice(-RECENT_TOKEN_WINDOW),
    recentUnits: seq
      .filter((event) => event && event.role !== "fold_marker" && event.role !== "corruption")
      .slice(-RECENT_UNIT_WINDOW)
      .map((event) => String(event.token || "")),
    count: seq.length,
  };
}

export const _internals = {
  MODEL_VERSION,
  SPEECH_ROLE,
  MIN_WORDS,
  MAX_WORDS,
  RECENT_TOKEN_WINDOW,
  tokenizeSpeech,
  detokenize,
  validateSpeechUnit,
  hashTokens,
  targetWordCount,
};
