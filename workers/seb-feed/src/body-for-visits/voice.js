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
    weight: 19,
    min: 15,
    max: 22,
    brief:
      "For this stretch, write one long, winding clause, broken into parts " +
      "by commas — appositives, lists, subordinate turns; use at least " +
      "three commas.",
  },
  {
    // The one mode that repeats on purpose: a formal litany. Accidental echo
    // is suppressed elsewhere, so the parallelism here reads as deliberate.
    weight: 11,
    min: 9,
    max: 14,
    brief:
      "For this stretch, write three short parallel clauses separated by " +
      "semicolons, each only a few words long and beginning with the very " +
      "same opening word — a deliberate litany, e.g. 'no file closed; no " +
      "file moved; no file found' — repeat only that opening, no other word.",
  },
  {
    weight: 14,
    min: 7,
    max: 13,
    brief:
      "For this stretch, set something up, then deliver it across a colon.",
  },
  {
    weight: 14,
    min: 8,
    max: 15,
    brief:
      "For this stretch, cut in a sharp aside, set off on both sides with " +
      "dashes — like this — and then resume.",
  },
  {
    weight: 13,
    min: 8,
    max: 18,
    brief:
      "For this stretch, fold in a parenthetical aside, inside round " +
      "brackets ( ); let its length surprise, from a single word to a long " +
      "swerving digression.",
  },
  {
    weight: 18,
    min: 12,
    max: 18,
    italic: true,
    brief:
      "For this stretch, name two specific invented things, each called by " +
      "a proper name two to four words long — an operation or codename, a " +
      "directive, a product, a title, or a song — and build the clause " +
      "around those two names.",
  },
  {
    weight: 11,
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

// The last actual word of a stretch of text — punctuation ignored.
function lastWord(text) {
  const words = tokenizeSpeech(text).filter(isWord);
  return words[words.length - 1] || "";
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
      `${spanWords} words that attach directly to its final words and ` +
      "carry the sentence onward; do not repeat what is already written, " +
      "and avoid stock idioms — reach for fresh, specific wording."
    : "Many strangers are writing one endless sentence together, a few " +
      `words at a time. Begin it — write about ${spanWords} words.`;
  return `${head} ${brief} ${STYLE} Do not use markdown, underscores, asterisks, HTML, or formatting markers. Output only the continuation, nothing else.`;
}

function pendingText(token) {
  if (typeof token === "string") return token;
  if (token && typeof token === "object") return String(token.text || "");
  return "";
}

function pendingItalic(token) {
  return !!(token && typeof token === "object" && token.italic === true);
}

function normalizePendingToken(token) {
  const text = pendingText(token);
  if (!text) return null;
  return pendingItalic(token) ? { text, italic: true } : text;
}

function tokenIsWord(token) {
  return isWord(pendingText(token));
}

function pushSpan(spans, text, italic) {
  if (!text) return;
  const prev = spans[spans.length - 1];
  if (prev && prev.italic === italic) {
    prev.text += text;
    return;
  }
  spans.push({ text, italic });
}

function detokenizeStyled(tokens) {
  const texts = tokens.map(pendingText);
  const unit = detokenize(texts);
  if (!tokens.some(pendingItalic)) return { unit };

  const spans = [];
  const prior = [];
  for (const token of tokens) {
    const before = detokenize(prior);
    prior.push(pendingText(token));
    const after = detokenize(prior);
    const delta = after.slice(before.length);
    const italic = pendingItalic(token);
    const prevItalic = prior.length > 1 && pendingItalic(tokens[prior.length - 2]);

    if (italic && !prevItalic) {
      const match = delta.match(/^(\s+)(.*)$/s);
      if (match) {
        pushSpan(spans, match[1], false);
        pushSpan(spans, match[2], true);
      } else {
        pushSpan(spans, delta, true);
      }
    } else if (!italic && prevItalic) {
      pushSpan(spans, delta, false);
    } else {
      pushSpan(spans, delta, italic);
    }
  }

  const text = spans.map((span) => span.text).join("");
  return text === unit && spans.some((span) => span.italic)
    ? { unit, spans }
    : { unit };
}

// Keep parentheses only when they pair cleanly; a stray ( or ) — or one left
// open by the word cap — is dropped so the body never holds a dangling mark.
function balanceParens(tokens) {
  let depth = 0;
  let ok = true;
  for (const t of tokens) {
    const text = pendingText(t);
    if (text === "(") depth += 1;
    else if (text === ")") {
      depth -= 1;
      if (depth < 0) {
        ok = false;
        break;
      }
    }
  }
  if (ok && depth === 0) return tokens;
  return tokens.filter((t) => pendingText(t) !== "(" && pendingText(t) !== ")");
}

// A span must not end on a word that demands a specific continuation — a
// preposition, article, possessive, conjunction, bare auxiliary, or naming
// participle. The next span is generated on its own; if it has to attach to a
// dangling "...of" or "...titled", the seam between the two reads broken.
const UNSAFE_ENDERS = new Set([
  // prepositions
  "of", "to", "in", "into", "on", "onto", "at", "by", "for", "from", "with",
  "within", "without", "about", "above", "after", "against", "among",
  "around", "before", "behind", "below", "beneath", "beside", "between",
  "beyond", "near", "over", "toward", "towards", "under", "upon", "as",
  // articles
  "a", "an", "the",
  // possessives
  "my", "your", "his", "her", "its", "our", "their",
  // conjunctions
  "and", "but", "or", "nor", "yet", "so",
  // relative pronouns
  "which", "who", "whom", "whose",
  // auxiliaries and copulas
  "is", "are", "was", "were", "be", "been", "being", "am", "has", "have",
  "had", "will", "would", "can", "could", "may", "might", "shall", "should",
  "must", "do", "does", "did",
  // participles and connectives that demand a complement
  "named", "called", "titled", "labeled", "dubbed", "codenamed",
  "including", "involving", "regarding", "featuring", "concerning",
]);

// Clean a raw model reply into a span of tokens (words and marks). Leading
// marks are dropped; an over-long reply is trimmed, as is a dangling tail.
// Returns [] if the reply is empty or carries a blocked source term.
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
    !tokenIsWord(tokens[start]) &&
    pendingText(tokens[start]) !== "("
  ) {
    start += 1;
  }
  tokens = tokens.slice(start);
  if (tokens.some((t) => BLOCKED_TERMS.has(pendingText(t)))) return [];
  const out = [];
  let words = 0;
  for (const token of tokens) {
    if (tokenIsWord(token)) {
      // collapse an accidental immediate doubling ("furthermore furthermore"),
      // a stutter a trimmed litany clause tends to leave behind
      const prev = out[out.length - 1];
      if (prev !== undefined && pendingText(prev) === pendingText(token)) {
        continue;
      }
      if (words >= MAX_SPAN_WORDS) break;
      words += 1;
    }
    out.push(token);
  }
  // Drop a dangling tail so the next span has a complete phrase to attach to.
  // A trailing possessive or contraction ("...the bureau's") dangles just as
  // a preposition does. Trailing marks stay: a span may end on punctuation.
  while (out.length > 0) {
    const last = pendingText(out[out.length - 1]);
    if (isWord(last) && (UNSAFE_ENDERS.has(last) || last.includes("'"))) {
      out.pop();
    } else {
      break;
    }
  }
  return out.some(tokenIsWord) ? balanceParens(out) : [];
}

// Function words carry no idiom signal. Phrase-echo detection skips them so
// it compares the content words that make a stock phrase — "forms in
// triplicate" and "forms, all in triplicate" both reduce to forms+triplicate.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "nor", "so", "yet", "of", "to", "in",
  "on", "at", "by", "for", "with", "from", "into", "onto", "over", "under",
  "as", "than", "that", "this", "these", "those", "it", "its", "he", "she",
  "they", "them", "him", "his", "her", "their", "i", "we", "you", "me", "us",
  "my", "our", "your", "is", "was", "were", "are", "be", "been", "being",
  "had", "has", "have", "do", "does", "did", "will", "would", "can", "could",
  "may", "might", "must", "should", "not", "no", "up", "out", "off", "then",
  "there", "here", "which", "who", "whom", "whose", "when", "where", "while",
  "about", "all", "each", "some", "any", "one",
]);

// Adjacent content-word pairs — the grain at which a reused stock phrase shows.
function contentPairs(words) {
  const content = words.filter((w) => !STOPWORDS.has(w));
  const pairs = [];
  for (let i = 0; i + 1 < content.length; i += 1) {
    pairs.push(content[i] + " " + content[i + 1]);
  }
  return pairs;
}

// True when the reply echoes the body: a raw five-word run already present, or
// a content-word pair — a stock phrase like "forms in triplicate" — seen
// before. The pair check ignores function words, so it catches an idiom
// however its connective tissue is rephrased. Only the span is compared
// against the body; deliberate repetition inside one span is left alone.
function isEcho(spanTokens, bodyText) {
  const spanWords = spanTokens.map(pendingText).filter(isWord);
  const bodyWords = tokenizeSpeech(bodyText).filter(isWord);
  if (spanWords.length === 0 || bodyWords.length === 0) return false;

  if (spanWords.length >= ECHO_NGRAM && bodyWords.length >= ECHO_NGRAM) {
    const runs = new Set();
    for (let i = 0; i + ECHO_NGRAM <= bodyWords.length; i += 1) {
      runs.add(bodyWords.slice(i, i + ECHO_NGRAM).join(" "));
    }
    for (let i = 0; i + ECHO_NGRAM <= spanWords.length; i += 1) {
      if (runs.has(spanWords.slice(i, i + ECHO_NGRAM).join(" "))) return true;
    }
  }

  const bodyPairs = new Set(contentPairs(bodyWords));
  for (const pair of contentPairs(spanWords)) {
    if (bodyPairs.has(pair)) return true;
  }
  return false;
}

// A naming-mode span names invented things, but the model will not reliably
// wrap them in markup. A second, narrow call extracts the names verbatim —
// extraction is a task the model is reliable at — and markName italicizes
// each. Returns the names found (lowercased), or [] on failure or when none.
async function extractNames(ai, model, text, timeoutMs) {
  try {
    const out = await withTimeout(
      ai.run(model, {
        messages: [
          {
            role: "user",
            content:
              "The line below contains one or two invented proper names — " +
              "an operation, codename, project, product, title, or song. " +
              "List each name on its own line, copied word for word from " +
              "the line, nothing else. If there are none, reply: none\n\n" +
              `Line: "${text}"`,
          },
        ],
        max_tokens: 32,
        temperature: 0,
      }),
      timeoutMs
    );
    return responseText(out)
      .split(/\n+/)
      .map((line) =>
        line
          .trim()
          .toLowerCase()
          .replace(/^[-*\d.)\s]+/, "")
          .replace(/^["'`]+|["'`]+$/g, "")
      )
      .filter((name) => name && name !== "none")
      .slice(0, 3);
  } catch {
    return [];
  }
}

const ARTICLES = new Set(["the", "a", "an"]);

// Italicize the first verbatim run of the name's words in the span tokens. A
// leading article is dropped first — it is rarely part of the name and the
// model copies it inconsistently, which would otherwise break the match.
function markName(tokens, namePhrase) {
  let nameWords = tokenizeSpeech(namePhrase).filter(isWord);
  if (nameWords.length > 1 && ARTICLES.has(nameWords[0])) {
    nameWords = nameWords.slice(1);
  }
  if (nameWords.length === 0 || nameWords.length > 5) return tokens;
  for (let i = 0; i + nameWords.length <= tokens.length; i += 1) {
    let hit = true;
    for (let k = 0; k < nameWords.length; k += 1) {
      const t = pendingText(tokens[i + k]);
      if (!isWord(t) || t !== nameWords[k]) {
        hit = false;
        break;
      }
    }
    if (hit) {
      const marked = tokens.slice();
      for (let k = 0; k < nameWords.length; k += 1) {
        marked[i + k] = { text: nameWords[k], italic: true };
      }
      return marked;
    }
  }
  return tokens;
}

// Ask the model for the next coherent span. Returns a token array, or [] on
// any failure (no binding, timeout, error, empty or blocked reply). A reply
// that echoes the body is retried; an echo is accepted only as a last resort.
// On a naming span, the named things are extracted and italicized.
export async function generateSpan(
  ai,
  {
    model = DEFAULT_MODEL,
    contextText = "",
    bodyText = "",
    spanWords = DEFAULT_SPAN_WORDS,
    brief = "",
    nameSpan = false,
    timeoutMs = SPAN_TIMEOUT_MS,
    maxRetries = SPAN_MAX_RETRIES,
  } = {}
) {
  if (!ai || typeof ai.run !== "function") return [];
  // Echo is judged against the whole body, not just the prompt's tail window,
  // so a stock phrase cannot quietly recur a paragraph later.
  const echoText = bodyText || contextText;
  const messages = [
    { role: "user", content: spanPrompt(contextText, spanWords, brief) },
  ];
  let best = [];
  let result = null;
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
      const reply = responseText(out);
      const tokens = cleanSpan(reply);
      if (tokens.length === 0) continue;
      best = tokens;
      if (!isEcho(tokens, echoText)) {
        result = tokens;
        break;
      }
      // The reply reused earlier wording. Show the model its own miss so the
      // next attempt diverges instead of re-deriving the same stock phrase.
      if (attempt < maxRetries) {
        messages.push({ role: "assistant", content: reply.trim() });
        messages.push({
          role: "user",
          content:
            "That reused a phrase already in the sentence. Continue again " +
            "with entirely fresh wording — no repeated phrases, no stock " +
            "idioms. Output only the continuation.",
        });
      }
    } catch {
      // timeout or network error — retry, then fall through
    }
  }
  if (!result) result = best;
  // Drop a leading word that merely repeats the body's last word — a
  // cross-span stutter ("...workflow that somehow" + "somehow yielded...")
  // that the within-span doubling check cannot see.
  const tail = lastWord(contextText);
  if (
    tail &&
    result.length > 1 &&
    isWord(pendingText(result[0])) &&
    pendingText(result[0]) === tail
  ) {
    let lead = 1;
    while (
      lead < result.length &&
      !isWord(pendingText(result[lead])) &&
      pendingText(result[lead]) !== "("
    ) {
      lead += 1;
    }
    result = result.slice(lead);
  }
  if (result.length > 0 && nameSpan) {
    const names = await extractNames(
      ai,
      model,
      detokenize(result.map(pendingText)),
      timeoutMs
    );
    for (const name of names) {
      result = markName(result, name);
    }
  }
  return result;
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
    if (pendingText(token) === "(" && tokens.length > 0) break;
    tokens.push(token);
    i += 1;
    if (tokenIsWord(token)) words += 1;
  }
  // pull trailing marks, but leave an opening paren to lead the next unit
  while (
    i < pending.length &&
    !tokenIsWord(pending[i]) &&
    pendingText(pending[i]) !== "("
  ) {
    tokens.push(pending[i]);
    i += 1;
  }
  return { ...detokenizeStyled(tokens), rest: pending.slice(i) };
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
    pending = Array.isArray(pending)
      ? pending.map(normalizePendingToken).filter(Boolean)
      : [];

    if (pending.length === 0) {
      const fullBody =
        typeof getContext === "function" ? getContext() : "";
      const mode = pickMode(seed, eventIndex);
      pending = await generateSpan(ai, {
        model,
        contextText: tailWords(fullBody, CONTEXT_WORDS),
        bodyText: fullBody,
        spanWords: spanWordsFor(mode, seed, eventIndex),
        brief: mode.brief,
        nameSpan: mode.italic === true,
        timeoutMs,
      });
    }
    if (pending.length === 0) {
      return fallback(); // generation failed — the net carries this visit
    }

    const { unit, spans, rest } = revealUnit(pending, pickWordCount(seed, eventIndex));
    setPending(rest);
    if (!unit) return fallback();
    return spans
      ? { token: unit, role: SPEECH_ROLE, spans }
      : { token: unit, role: SPEECH_ROLE };
  };
}
