// LLM-backed corpus generator for (to)complete.
//
// Earlier versions asked the model for 1-3 words at a time — its weakest mode,
// with no room to plan. This version asks Cloudflare Workers AI for a whole
// coherent span (a clause or two) in one call, buffers it, and lets each visit
// reveal 1-3 tokens. The model writes coherent, correctly punctuated prose;
// the drip-feed is just metering. The offline net in net.js remains the
// fallback whenever generation fails — the piece never goes silent.

import {
  tokenizeSpeech,
  detokenize,
  isWord,
  BLOCKED_TERMS,
  SPEECH_ROLE,
} from "./grammar.js";

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SPAN_TIMEOUT_MS = 4000;
const SPAN_MAX_TOKENS = 64;
const SPAN_MAX_RETRIES = 2; // up to 3 generation calls before falling back
const TEMPERATURE = 0.75;
const FREQUENCY_PENALTY = 0.5;
const PRESENCE_PENALTY = 0.3;
const MAX_SPAN_WORDS = 24; // trim a rambling reply
const CONTEXT_WORDS = 60; // how much of the body tail the model is shown
const ECHO_NGRAM = 5; // a shared 5-word run means the reply echoed the body
const DEFAULT_SPAN_WORDS = 9;

const SEED_A = 0x9e3779b1;

// Per-visit reveal length, weighted short.
const LENGTHS = Object.freeze([
  { n: 1, weight: 28 },
  { n: 2, weight: 40 },
  { n: 3, weight: 32 },
]);

// Each generated span gets ONE clear structural job — the model executes a
// single instruction far more reliably than it balances five at once.
// Varying the job across spans is what makes the corpus lurch: a long winding
// clause here, a staccato burst there, a colon pivot, a parenthetical aside.
const MODES = Object.freeze([
  {
    weight: 20,
    min: 15,
    max: 22,
    brief:
      "For this stretch, write one long, winding clause, broken into parts " +
      "by commas — appositives, lists, subordinate turns; use at least " +
      "three commas.",
  },
  {
    weight: 22,
    min: 9,
    max: 14,
    brief:
      "For this stretch, write three or four short clauses, each a subject " +
      "and a verb landing hard, spliced with semicolons.",
  },
  {
    weight: 16,
    min: 7,
    max: 13,
    brief:
      "For this stretch, set something up, then deliver it across a colon.",
  },
  {
    weight: 16,
    min: 8,
    max: 15,
    brief:
      "For this stretch, cut in a sharp aside, set off on both sides with " +
      "dashes — like this — and then resume.",
  },
  {
    weight: 14,
    min: 8,
    max: 18,
    brief:
      "For this stretch, fold in a parenthetical aside, inside round " +
      "brackets ( ); let its length surprise, from a single word to a long " +
      "swerving digression.",
  },
  {
    weight: 12,
    min: 6,
    max: 12,
    brief: "For this stretch, simply continue, a clause or two.",
  },
]);

// A murmur3 fmix32 finalizer so the seed and event index fully diffuse.
function hash32(seed, eventIndex) {
  let h = ((seed >>> 0) ^ Math.imul((eventIndex >>> 0) + 1, SEED_A)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function pickWordCount(seed, eventIndex) {
  let r = (hash32(seed, eventIndex) / 4294967296) * 100;
  for (const entry of LENGTHS) {
    r -= entry.weight;
    if (r < 0) return entry.n;
  }
  return LENGTHS[LENGTHS.length - 1].n;
}

export function pickMode(seed, eventIndex) {
  let r = (hash32(seed ^ 0x2545f491, eventIndex) / 4294967296) * 100;
  for (const mode of MODES) {
    r -= mode.weight;
    if (r < 0) return mode;
  }
  return MODES[MODES.length - 1];
}

function spanWordsFor(mode, seed, eventIndex) {
  const range = mode.max - mode.min + 1;
  return mode.min + (hash32(seed ^ 0xcc9e2d51, eventIndex) % range);
}

// Reject a hung ai.run before it can stall the qualify request.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("voice_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function responseText(out) {
  return typeof out === "string" ? out : (out && out.response) || "";
}

function tailWords(text, n) {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(-n).join(" ");
}

// The shared texture brief — voice and tone. The per-span structural job
// (a MODES brief) is added on top of this in spanPrompt.
const STYLE =
  "Keep the texture of Thomas Pynchon throughout: concrete, odd, specific " +
  "detail and dry wit, never generic mood-setting — no storms or shadows. " +
  "Whiplash the register — bureaucratic, then slangy, then briefly lyrical, " +
  'then deadpan. Lean on "and" and "as" only sparingly; almost never use an ' +
  "ellipsis. All lowercase. Never use . ! ? — the sentence never ends.";

function spanPrompt(contextText, spanWords, brief) {
  const head = contextText
    ? "Many strangers are writing one endless sentence together. Here is " +
      `the sentence so far:\n"${contextText}"\n\nContinue it — add about ` +
      `${spanWords} words that follow from what is there, moving it ` +
      "forward; do not repeat what is already written."
    : "Many strangers are writing one endless sentence together, a few " +
      `words at a time. Begin it — write about ${spanWords} words.`;
  return `${head} ${brief} ${STYLE} Output only the continuation, nothing else.`;
}

// Keep parentheses only when they pair cleanly; a stray ( or ) — or one left
// open by the word cap — is dropped so the body never holds a dangling mark.
function balanceParens(tokens) {
  let depth = 0;
  let ok = true;
  for (const t of tokens) {
    if (t === "(") depth += 1;
    else if (t === ")") {
      depth -= 1;
      if (depth < 0) {
        ok = false;
        break;
      }
    }
  }
  if (ok && depth === 0) return tokens;
  return tokens.filter((t) => t !== "(" && t !== ")");
}

// Clean a raw model reply into a span of tokens (words and marks). Leading
// marks are dropped; an over-long reply is trimmed. Returns [] if the reply
// is empty or carries a blocked source term.
function cleanSpan(raw) {
  const lines = String(raw || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  // the continuation is the substantive line — take the longest
  const text = lines.reduce((a, b) => (b.length > a.length ? b : a));
  let tokens = tokenizeSpeech(text);
  // drop leading punctuation, but keep an opening paren — it leads its aside
  let start = 0;
  while (
    start < tokens.length &&
    !isWord(tokens[start]) &&
    tokens[start] !== "("
  ) {
    start += 1;
  }
  tokens = tokens.slice(start);
  if (tokens.some((t) => BLOCKED_TERMS.has(t))) return [];
  const out = [];
  let words = 0;
  for (const token of tokens) {
    if (isWord(token)) {
      if (words >= MAX_SPAN_WORDS) break;
      words += 1;
    }
    out.push(token);
  }
  return words > 0 ? balanceParens(out) : [];
}

// True when the reply reproduces a run of words already in the body — the
// model echoing its context instead of moving the sentence forward.
function isEcho(spanTokens, contextText) {
  const spanWords = spanTokens.filter(isWord);
  const ctxWords = tokenizeSpeech(contextText).filter(isWord);
  if (spanWords.length < ECHO_NGRAM || ctxWords.length < ECHO_NGRAM) {
    return false;
  }
  const seen = new Set();
  for (let i = 0; i + ECHO_NGRAM <= ctxWords.length; i += 1) {
    seen.add(ctxWords.slice(i, i + ECHO_NGRAM).join(" "));
  }
  for (let i = 0; i + ECHO_NGRAM <= spanWords.length; i += 1) {
    if (seen.has(spanWords.slice(i, i + ECHO_NGRAM).join(" "))) return true;
  }
  return false;
}

// Ask the model for the next coherent span. Returns a token array, or [] on
// any failure (no binding, timeout, error, empty or blocked reply). A reply
// that echoes the body is retried; an echo is accepted only as a last resort.
export async function generateSpan(
  ai,
  {
    model = DEFAULT_MODEL,
    contextText = "",
    spanWords = DEFAULT_SPAN_WORDS,
    brief = "",
    timeoutMs = SPAN_TIMEOUT_MS,
    maxRetries = SPAN_MAX_RETRIES,
  } = {}
) {
  if (!ai || typeof ai.run !== "function") return [];
  const messages = [
    { role: "user", content: spanPrompt(contextText, spanWords, brief) },
  ];
  let best = [];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const out = await withTimeout(
        ai.run(model, {
          messages,
          max_tokens: SPAN_MAX_TOKENS,
          temperature: TEMPERATURE,
          frequency_penalty: FREQUENCY_PENALTY,
          presence_penalty: PRESENCE_PENALTY,
        }),
        timeoutMs
      );
      const tokens = cleanSpan(responseText(out));
      if (tokens.length === 0) continue;
      best = tokens;
      if (!isEcho(tokens, contextText)) return tokens;
    } catch {
      // timeout or network error — retry, then fall through
    }
  }
  return best;
}

// Take the next unit off the front of a pending buffer: up to wordCount words,
// plus any trailing mark so the next unit never opens on punctuation.
export function revealUnit(pending, wordCount) {
  const tokens = [];
  let words = 0;
  let i = 0;
  while (i < pending.length && words < wordCount) {
    const token = pending[i];
    // an opening paren begins its own unit — never trail it onto this one
    if (token === "(" && tokens.length > 0) break;
    tokens.push(token);
    i += 1;
    if (isWord(token)) words += 1;
  }
  // pull trailing marks, but leave an opening paren to lead the next unit
  while (i < pending.length && !isWord(pending[i]) && pending[i] !== "(") {
    tokens.push(pending[i]);
    i += 1;
  }
  return { unit: detokenize(tokens), rest: pending.slice(i) };
}

// Builds an async selector with the net.js createSelector contract:
//   (prevRole, eventIndex, seed, prevToken, model) => { token, role } | null
// It reveals from a pending buffer, generating the next span when the buffer
// runs dry. getPending/setPending read and write the caller's buffer;
// getContext supplies the body text the model continues from. netSelector is
// the fallback for every failure.
export function createBufferedSelector({
  ai,
  netSelector,
  model = DEFAULT_MODEL,
  timeoutMs = SPAN_TIMEOUT_MS,
  getPending,
  setPending,
  getContext,
}) {
  if (typeof netSelector !== "function") {
    throw new Error("createBufferedSelector: netSelector is required");
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

    let pending = getPending();
    if (!Array.isArray(pending)) pending = [];

    if (pending.length === 0) {
      const contextText =
        typeof getContext === "function"
          ? tailWords(getContext(), CONTEXT_WORDS)
          : "";
      const mode = pickMode(seed, eventIndex);
      pending = await generateSpan(ai, {
        model,
        contextText,
        spanWords: spanWordsFor(mode, seed, eventIndex),
        brief: mode.brief,
        timeoutMs,
      });
    }
    if (pending.length === 0) {
      return fallback(); // generation failed — the net carries this visit
    }

    const { unit, rest } = revealUnit(pending, pickWordCount(seed, eventIndex));
    setPending(rest);
    if (!unit) return fallback();
    return { token: unit, role: SPEECH_ROLE };
  };
}
