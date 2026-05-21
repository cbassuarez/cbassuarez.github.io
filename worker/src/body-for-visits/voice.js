// LLM-backed speech-unit selector for (to)complete.
//
// The offline net in net.js sees only four tokens of context, so it cannot be
// coherent. This selector asks a real language model — Cloudflare Workers AI —
// for the next fragment — a word or two, or a mark of punctuation — gates it
// through the same validateSpeechUnit the net output passes, and falls back to
// the net on any failure. The net stays graceful degradation: never silent.

import {
  validateSpeechUnit,
  detokenize,
  tokenizeSpeech,
  isWord,
  PUNCTUATION,
  SPEECH_ROLE,
  MAX_WORDS,
} from "./grammar.js";

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_MAX_RETRIES = 2; // up to 3 ai.run calls before falling back
const CONTEXT_TOKENS = 32; // recent body words handed to the model
const MAX_OUTPUT_TOKENS = 16;
const TEMPERATURE = 0.7;

const SEED_A = 0x9e3779b1;
const SEED_B = 0x85ebca6b;

const SYSTEM_PROMPT = [
  "You are one contributor to a single shared sentence that many strangers",
  "write together, one tiny fragment at a time. You will be shown the",
  "sentence so far and told exactly what shape your fragment must take.",
  "Reply with ONLY that fragment. Rules:",
  "- all lowercase",
  "- never end the sentence: no . ! ? and no quotes or markup",
  "- the only punctuation marks allowed are , ; : — …",
  "- it must continue the sentence so far grammatically and naturally",
  "- do not finish or summarize the sentence; just add the next small step",
  "Output the fragment alone, with no quotes, no labels, no explanation.",
].join("\n");

// Per-visit target shape — weighted so most fragments are one or two words,
// with an occasional lone punctuation mark. Deterministic from the seed.
const SHAPES = Object.freeze([
  { kind: "words", n: 1, weight: 24 },
  { kind: "words", n: 2, weight: 34 },
  { kind: "words", n: 3, weight: 24 },
  { kind: "punct", weight: 18 },
]);

// Marks for a lone-punctuation unit, weighted roughly like ordinary prose.
// Punctuation is mechanical — picked directly rather than asked of the model,
// which is unreliable at emitting a bare mark.
const MARKS = Object.freeze([
  { mark: ",", weight: 50 },
  { mark: "—", weight: 22 },
  { mark: "…", weight: 16 },
  { mark: ";", weight: 8 },
  { mark: ":", weight: 4 },
]);

const NUMBER_WORDS = Object.freeze({ 1: "one", 2: "two", 3: "three" });

// A murmur3 fmix32 finalizer so the seed and event index fully diffuse —
// small or structured inputs still spread across the whole 32-bit range.
function hash32(seed, eventIndex) {
  let h = ((seed >>> 0) ^ Math.imul((eventIndex >>> 0) + 1, SEED_A)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function weightedPick(table, hashed) {
  let r = (hashed / 4294967296) * 100;
  for (const entry of table) {
    r -= entry.weight;
    if (r < 0) return entry;
  }
  return table[table.length - 1];
}

export function pickShape(seed, eventIndex) {
  return weightedPick(SHAPES, hash32(seed, eventIndex));
}

export function pickMark(seed, eventIndex) {
  // a distinct salt so the mark is independent of the shape roll
  return weightedPick(MARKS, hash32(seed ^ 0x5bd1e995, eventIndex)).mark;
}

function shapeInstruction(shape) {
  const n = shape.n;
  return `Add exactly ${NUMBER_WORDS[n]} word${n === 1 ? "" : "s"} that continue it.`;
}

// True when the previous unit already ends in a mark — a lone mark may not
// follow one (it would render as ",;" / ", —" and fail validation).
function endsWithMark(prevToken) {
  const tokens = tokenizeSpeech(prevToken || "");
  const last = tokens[tokens.length - 1];
  return last != null && PUNCTUATION.has(last);
}

// Reject a hung ai.run before it can stall the qualify request.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("voice_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Trim an LLM reply down to a single candidate fragment. The validator
// re-tokenizes anyway; this just keeps well-formed replies off the retry path.
function sanitize(raw) {
  let s = String(raw || "").split(/[\r\n]+/)[0] || "";
  s = s.trim().replace(/^["'`]+|["'`]+$/g, ""); // wrapping quotes
  s = s.replace(/\.\.\.+|…/g, "…"); // normalize ellipsis before the strip
  s = s.replace(/[.!?]+\s*$/g, ""); // a terminal full stop
  return s.trim().toLowerCase();
}

// Keep at most MAX_WORDS words — salvages an over-long but coherent reply
// instead of discarding it and falling back to the incoherent net.
function capWords(text) {
  const tokens = tokenizeSpeech(text);
  const kept = [];
  let words = 0;
  for (const token of tokens) {
    if (isWord(token)) {
      if (words >= MAX_WORDS) break;
      words += 1;
    }
    kept.push(token);
  }
  return detokenize(kept);
}

// The recent body, as flowing text the model can continue.
function buildContext(model, prevToken) {
  const recentTokens =
    model && Array.isArray(model.recentTokens) ? model.recentTokens : [];
  if (recentTokens.length > 0) {
    return detokenize(recentTokens.slice(-CONTEXT_TOKENS));
  }
  return String(prevToken || "").trim();
}

// Builds an async selector with the same contract as net.js createSelector:
//   (prevRole, eventIndex, seed, prevToken, model) => { token, role } | null
// netSelector is the synchronous net-backed selector and is required — it is
// the fallback for every failure mode (no binding, timeout, error, bad output).
export function createVoiceSelector({
  ai,
  netSelector,
  model = DEFAULT_MODEL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
} = {}) {
  if (typeof netSelector !== "function") {
    throw new Error("createVoiceSelector: netSelector is required");
  }

  return async function selectNextToken(
    prevRole,
    eventIndex,
    seed,
    prevToken = null,
    contextModel = null
  ) {
    const fallback = () =>
      netSelector(prevRole, eventIndex, seed, prevToken, contextModel);

    // No binding, or no text to continue (cold start): the net handles it.
    const recentText = buildContext(contextModel, prevToken);
    if (!ai || typeof ai.run !== "function" || !recentText) {
      return fallback();
    }

    // A target shape per visit gives length variety. A lone mark cannot open
    // the body or follow another mark, so demote it to two words there.
    let shape = pickShape(seed, eventIndex);
    if (shape.kind === "punct" && (!prevToken || endsWithMark(prevToken))) {
      shape = { kind: "words", n: 2 };
    }

    // Punctuation is mechanical — pick the mark directly, no model call.
    if (shape.kind === "punct") {
      const mark = pickMark(seed, eventIndex);
      const validation = validateSpeechUnit(mark, prevToken, {
        requireStyle: false,
      });
      return validation.ok
        ? { token: validation.token, role: SPEECH_ROLE }
        : fallback();
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `The sentence so far:\n"${recentText}"\n\n${shapeInstruction(shape)}`,
      },
    ];

    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const runSeed =
          (seed ^
            Math.imul(eventIndex >>> 0, SEED_A) ^
            Math.imul(attempt + 1, SEED_B)) >>>
          0;
        const out = await withTimeout(
          ai.run(model, {
            messages,
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: TEMPERATURE,
            seed: runSeed,
          }),
          timeoutMs
        );
        const raw = typeof out === "string" ? out : out && out.response;
        const candidate = capWords(sanitize(raw));
        if (!candidate) continue;
        // requireStyle:false — the model owns grammar; this gate keeps only
        // the structural and safety checks (length, terminal, blocked terms).
        const validation = validateSpeechUnit(candidate, prevToken, {
          requireStyle: false,
        });
        if (validation.ok) {
          return { token: validation.token, role: SPEECH_ROLE };
        }
      }
    } catch {
      // network error, timeout, malformed response — fall through to the net
    }

    return fallback();
  };
}
