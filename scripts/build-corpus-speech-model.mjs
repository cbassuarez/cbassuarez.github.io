import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const SOURCES = Object.freeze([
  {
    id: "tristram-shandy",
    title: "The Life and Opinions of Tristram Shandy, Gentleman",
    author: "Laurence Sterne",
    url: "https://www.gutenberg.org/cache/epub/1079/pg1079.txt",
  },
  {
    id: "moby-dick",
    title: "Moby-Dick; or, The Whale",
    author: "Herman Melville",
    url: "https://www.gutenberg.org/cache/epub/2701/pg2701.txt",
  },
  {
    id: "ulysses",
    title: "Ulysses",
    author: "James Joyce",
    url: "https://www.gutenberg.org/cache/epub/4300/pg4300.txt",
  },
  {
    id: "ambassadors",
    title: "The Ambassadors",
    author: "Henry James",
    url: "https://www.gutenberg.org/cache/epub/432/pg432.txt",
  },
]);

export const OUTPUT_PATH = new URL(
  "../workers/seb-feed/src/body-for-visits/speech-model.generated.js",
  import.meta.url
);

const MODEL_VERSION = 1;
const ORDER_LIMITS = Object.freeze({
  "1": 1200,
  "2": 3800,
  "3": 4800,
  "4": 3600,
});
const MAX_OPTIONS = 8;
const MIN_CONTEXT_COUNT = Object.freeze({
  "1": 8,
  "2": 2,
  "3": 2,
  "4": 2,
});
const START_LIMIT = 1600;
const FRAGMENT_LIMIT = 2800;
const TOKEN_RE = /^[a-z]+(?:'[a-z]+)?$/;
const ROMAN_RE = /^(?:[ivxlcdm]+)$/;
const BAD_FRAGMENT_STARTERS = new Set([
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
const GOOD_FRAGMENT_STARTERS = new Set([
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
const BAD_FRAGMENT_ENDERS = new Set([
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

export const BLOCKED_TERMS = Object.freeze([
  "ahab",
  "ambassadors",
  "antisthenes",
  "bloom",
  "bilham",
  "benben",
  "bildad",
  "boylan",
  "buck",
  "carr",
  "chad",
  "cissy",
  "daggoo",
  "dedalus",
  "dignam",
  "dilly",
  "dublin",
  "fedallah",
  "flask",
  "gerty",
  "gloriani",
  "gorgias",
  "gostrey",
  "gutenberg",
  "haines",
  "hawaiian",
  "honour",
  "ishmael",
  "joyce",
  "kelleher",
  "kernan",
  "lambert",
  "lenehan",
  "leopold",
  "madame",
  "mamie",
  "melville",
  "milly",
  "moby",
  "molly",
  "mulligan",
  "nantucket",
  "newsome",
  "obadiah",
  "paddy",
  "peleg",
  "pequod",
  "pocock",
  "project",
  "quoth",
  "queequeg",
  "shandy",
  "slop",
  "sperm",
  "starbuck",
  "stephen",
  "sterne",
  "stubb",
  "strether",
  "susannah",
  "tashtego",
  "thee",
  "thou",
  "toby",
  "trim",
  "tristram",
  "uncle",
  "ulysses",
  "vionnet",
  "walter",
  "waymarsh",
  "whale",
  "woollett",
  "ye",
  "yorick",
  "au",
  "conseil",
  "livres",
  "monsieur",
  "mr",
  "mrs",
  "miss",
  "o'connor",
  "reste",
  "seaman's",
]);

const BLOCKED = new Set(BLOCKED_TERMS);
const PROPER_STOPLIST = new Set([
  "A",
  "About",
  "After",
  "Again",
  "All",
  "Almost",
  "Already",
  "An",
  "And",
  "Any",
  "As",
  "At",
  "Away",
  "Back",
  "Before",
  "Besides",
  "But",
  "By",
  "Can",
  "Come",
  "Dear",
  "Did",
  "Do",
  "Does",
  "Every",
  "For",
  "From",
  "Good",
  "Had",
  "Has",
  "Have",
  "He",
  "Her",
  "Here",
  "His",
  "How",
  "If",
  "In",
  "Into",
  "Is",
  "It",
  "Just",
  "Like",
  "Look",
  "Much",
  "My",
  "No",
  "Nor",
  "Not",
  "Now",
  "O",
  "Of",
  "Oh",
  "On",
  "Once",
  "One",
  "Only",
  "Or",
  "Out",
  "Over",
  "See",
  "She",
  "So",
  "Some",
  "Still",
  "That",
  "The",
  "Then",
  "There",
  "These",
  "They",
  "This",
  "Those",
  "Though",
  "To",
  "Under",
  "Up",
  "Very",
  "Was",
  "We",
  "Well",
  "What",
  "When",
  "Where",
  "Who",
  "Why",
  "Will",
  "With",
  "Would",
  "Yes",
  "Yet",
  "You",
]);

export async function loadText(source) {
  const override = process.env[`CORPUS_SOURCE_${source.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`];
  const target = override || source.url;
  if (!/^https?:\/\//i.test(target)) {
    const { readFile } = await import("node:fs/promises");
    return readFile(target, "utf8");
  }
  const response = await fetch(target, {
    headers: { "user-agent": "cbassuarez.com corpus speech model builder" },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${target}: ${response.status}`);
  return response.text();
}

export function stripGutenberg(text) {
  const raw = String(text || "").replace(/\r\n?/g, "\n");
  const start = raw.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const end = raw.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const body = start >= 0 ? raw.slice(raw.indexOf("\n", start) + 1) : raw;
  return end >= 0 ? body.slice(0, Math.max(0, end - (start >= 0 ? raw.indexOf("\n", start) + 1 : 0))) : body;
}

function stripBlockedTerms(text, blocked = BLOCKED) {
  let out = String(text || "");
  for (const term of blocked) {
    out = out.replace(new RegExp(`\\b${term}\\b`, "gi"), " ");
  }
  return out;
}

function normalizeText(text, blocked = BLOCKED) {
  return stripBlockedTerms(text, blocked)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[_*]/g, " ")
    .replace(/--+|[—–]/g, " — ")
    .replace(/[:]/g, ",")
    .replace(/[.!?]+/g, " . ")
    .replace(/[,]+/g, " , ")
    .replace(/[;]+/g, " ; ")
    .replace(/[^a-zA-Z'.,;—\s-]/g, " ")
    .toLowerCase();
}

function cleanWord(token, blocked = BLOCKED) {
  const word = token.replace(/^-+|-+$/g, "").replace(/^'+|'+$/g, "");
  if (!TOKEN_RE.test(word)) return null;
  if (word.length < 2 || word.length > 18) return null;
  if (ROMAN_RE.test(word)) return null;
  if (blocked.has(word)) return null;
  return word;
}

export function tokenizeText(text, blocked = BLOCKED) {
  const tokens = [];
  for (const raw of normalizeText(text, blocked).split(/\s+/)) {
    if (!raw) continue;
    if (raw === "." || raw === "," || raw === ";" || raw === "—") {
      tokens.push(raw);
      continue;
    }
    const word = cleanWord(raw, blocked);
    if (word) tokens.push(word);
  }
  return tokens;
}

function isWord(token) {
  return TOKEN_RE.test(token || "");
}

function isBoundary(token) {
  return token === "." || token === ";" || token === "—";
}

function hasBlocked(tokens, blocked = BLOCKED) {
  return tokens.some((token) => blocked.has(token));
}

export function collectProperTerms(texts) {
  const counts = new Map();
  for (const text of texts) {
    for (const match of String(text || "").matchAll(/\b[A-Z](?:[a-z]+|[a-z]*'[A-Za-z]+)\b/g)) {
      const raw = match[0];
      if (PROPER_STOPLIST.has(raw)) continue;
      const token = raw.toLowerCase();
      if (!TOKEN_RE.test(token) || token.length < 3) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([token]) => token);
}

function bump(map, key, next) {
  let row = map.get(key);
  if (!row) {
    row = new Map();
    map.set(key, row);
  }
  row.set(next, (row.get(next) || 0) + 1);
}

function addStart(starts, tokens, blocked = BLOCKED) {
  const words = tokens.filter(isWord);
  if (words.length < 2 || words.length > 4 || hasBlocked(words, blocked)) return;
  if (BAD_FRAGMENT_STARTERS.has(words[0])) return;
  if (["and", "but", "or", "yet", "so"].includes(words[0])) return;
  const key = words.join(" ");
  starts.set(key, (starts.get(key) || 0) + 1);
}

function topEntries(row) {
  return [...row.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_OPTIONS);
}

function renderTable(table, order) {
  const entries = [...table.entries()]
    .map(([key, row]) => {
      const total = [...row.values()].reduce((sum, n) => sum + n, 0);
      return { key, total, options: topEntries(row) };
    })
    .filter((entry) => entry.total >= MIN_CONTEXT_COUNT[String(order)])
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
    .slice(0, ORDER_LIMITS[String(order)])
    .sort((a, b) => a.key.localeCompare(b.key));
  return entries;
}

function detokenize(tokens) {
  let out = "";
  for (const token of tokens) {
    if (token === "," || token === ";") out = out.replace(/\s+$/g, "") + token;
    else if (token === "—") out = `${out.replace(/\s+$/g, "")} — `;
    else out += `${out && !out.endsWith(" ") ? " " : ""}${token}`;
  }
  return out.replace(/\s+/g, " ").replace(/\s+([,;])/g, "$1").trim();
}

function repeatedAdjacentWords(tokens) {
  let prev = null;
  for (const token of tokens) {
    if (!isWord(token)) continue;
    if (token === prev) return true;
    prev = token;
  }
  return false;
}

function addFragment(fragments, tokens, blocked) {
  const words = tokens.filter(isWord);
  if (words.length < 3 || words.length > 12) return;
  if (!isWord(tokens[0])) return;
  if (BAD_FRAGMENT_STARTERS.has(words[0])) return;
  if (!GOOD_FRAGMENT_STARTERS.has(words[0])) return;
  if (hasBlocked(tokens, blocked)) return;
  if (words.some((word) => NARRATION_WORDS.has(word))) return;
  const lastWord = words[words.length - 1];
  const lastToken = tokens[tokens.length - 1];
  void lastToken;
  if (BAD_FRAGMENT_ENDERS.has(lastWord)) return;
  if (repeatedAdjacentWords(tokens)) return;
  if (["and", "but", "or", "yet", "so"].includes(words[0]) && words.length < 4) return;
  const text = detokenize(tokens);
  if (!text || /[.!?]$/.test(text)) return;
  const weight = 1 + (tokens[tokens.length - 1] === "," ? 0.6 : tokens[tokens.length - 1] === ";" ? 0.45 : 0);
  fragments.set(text, (fragments.get(text) || 0) + weight);
}

function collectFragments(tokens, blocked) {
  const fragments = new Map();
  for (let i = 0; i < tokens.length; i++) {
    if (!isWord(tokens[i])) continue;
    const current = [];
    let words = 0;
    for (let j = i; j < tokens.length && current.length < 18; j++) {
      const token = tokens[j];
      if (token === ".") break;
      if (hasBlocked([token], blocked)) break;
      current.push(token);
      if (isWord(token)) words++;
      if (words >= 2) addFragment(fragments, current, blocked);
      if ((token === "," || token === ";" || token === "—") && words >= 2) break;
      if (words >= 12) break;
    }
  }
  return [...fragments.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, FRAGMENT_LIMIT)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function modelFromTokens(tokens, blocked = BLOCKED) {
  const grams = new Map([
    [1, new Map()],
    [2, new Map()],
    [3, new Map()],
    [4, new Map()],
  ]);
  const starts = new Map();
  let sinceBoundary = [];

  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    if (isBoundary(current)) {
      addStart(starts, sinceBoundary.slice(0, 4), blocked);
      sinceBoundary = [];
      continue;
    }
    if (current === ",") {
      addStart(starts, sinceBoundary.slice(-4), blocked);
    }
    if (isWord(current)) sinceBoundary.push(current);

    if (current === ".") continue;
    for (const order of [1, 2, 3, 4]) {
      if (i < order) continue;
      const context = tokens.slice(i - order, i);
      if (context.includes(".") || hasBlocked(context, blocked) || blocked.has(current)) continue;
      if (!context.some(isWord)) continue;
      bump(grams.get(order), context.join(" "), current);
    }
  }

  const startEntries = [...starts.entries()]
    .filter(([key, weight]) => weight >= 2 && !hasBlocked(key.split(" "), blocked))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, START_LIMIT)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return {
    starts: startEntries,
    fragments: collectFragments(tokens, blocked),
    grams: {
      "1": renderTable(grams.get(1), 1),
      "2": renderTable(grams.get(2), 2),
      "3": renderTable(grams.get(3), 3),
      "4": renderTable(grams.get(4), 4),
    },
  };
}

export function buildModelFromTexts(texts, sources = SOURCES) {
  const stripped = texts.map((text) => stripGutenberg(text));
  const blocked = new Set([...BLOCKED, ...collectProperTerms(stripped)]);
  const tokens = [];
  for (const text of stripped) {
    for (const token of tokenizeText(text, BLOCKED)) {
      tokens.push(token);
    }
  }
  const built = modelFromTokens(tokens, blocked);
  return {
    version: MODEL_VERSION,
    order: 4,
    sources: sources.map(({ id, title, author, url }) => ({ id, title, author, url })),
    blockedTerms: [...blocked].sort(),
    starts: built.starts,
    fragments: built.fragments,
    grams: built.grams,
  };
}

function renderArray(value, indent = 0) {
  void indent;
  return JSON.stringify(value);
}

function renderModel(model) {
  return `// Generated by scripts/build-corpus-speech-model.mjs.
// Sources are public-domain Project Gutenberg texts. This file stores only
// compact derived n-gram counts for the (to)complete offline speech model.

export const SPEECH_MODEL = Object.freeze({
  version: ${model.version},
  order: ${model.order},
  sources: Object.freeze(${renderArray(model.sources, 2)}),
  blockedTerms: Object.freeze(${renderArray(model.blockedTerms, 2)}),
  starts: Object.freeze(${renderArray(model.starts, 2)}),
  fragments: Object.freeze(${renderArray(model.fragments, 2)}),
  grams: Object.freeze({
    "1": Object.freeze(${renderArray(model.grams["1"], 4)}),
    "2": Object.freeze(${renderArray(model.grams["2"], 4)}),
    "3": Object.freeze(${renderArray(model.grams["3"], 4)}),
    "4": Object.freeze(${renderArray(model.grams["4"], 4)})
  })
});
`;
}

async function main() {
  const texts = [];
  for (const source of SOURCES) {
    texts.push(await loadText(source));
  }
  const model = buildModelFromTexts(texts);
  await writeFile(OUTPUT_PATH, renderModel(model));
  const counts = {
    starts: model.starts.length,
    fragments: model.fragments.length,
    grams: Object.fromEntries(Object.entries(model.grams).map(([order, rows]) => [order, rows.length])),
  };
  console.log(`Wrote ${OUTPUT_PATH.pathname}`);
  console.log(JSON.stringify(counts, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
