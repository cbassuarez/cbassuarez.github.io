// LLM-backed speech-unit selector for (to)complete.
//
// The offline net in net.js sees only four tokens of context, so it cannot be
// coherent. This selector asks a real language model — Cloudflare Workers AI —
// for the next 1-3 word fragment, gates it through the same validateSpeechUnit
// the net output passes, and falls back to the net on any failure. The net
// stays as graceful degradation: the piece never goes silent.

import {
  validateSpeechUnit,
  detokenize,
  tokenizeSpeech,
  isWord,
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
  "sentence so far. Reply with ONLY the next fragment to append. Rules:",
  "- one, two, or three words, OR a single punctuation mark: , ; —",
  "- all lowercase",
  "- no ending punctuation (no . ! ?), no quotes, no markup",
  "- it must continue the sentence so far grammatically and naturally",
  "- do not finish or summarize the sentence; just add the next small step",
  "Output the fragment alone, with no quotes, no labels, no explanation.",
].join("\n");

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

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `The sentence so far:\n"${recentText}"\n\nThe next fragment:`,
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
