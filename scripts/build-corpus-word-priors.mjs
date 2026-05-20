import { readFile, writeFile } from "node:fs/promises";

const SCOWL_URL =
  "https://raw.githubusercontent.com/en-wl/wordlist-diff/diff/scowl.txt";
const FREQUENCY_URL =
  "https://raw.githubusercontent.com/reneklacan/symspell/main/data/frequency_dictionary_en_82_765.txt";
const OUTPUT_PATH = new URL("../worker/src/body-for-visits/word-priors.generated.js", import.meta.url);

const LIMITS = {
  nouns: 700,
  verbs: 520,
  adjectives: 520,
  prepositions: 80,
  conjunctions: 56,
};

const OPENINGS = [
  ["now", 2.6],
  ["then", 2.45],
  ["again", 2.3],
  ["here", 2.2],
  ["there", 2.1],
  ["soon", 1.95],
  ["later", 1.9],
  ["already", 1.85],
  ["meanwhile", 1.8],
  ["elsewhere", 1.7],
  ["afterward", 1.65],
  ["beforehand", 1.6],
  ["nearby", 1.55],
  ["inside", 1.5],
  ["outside", 1.5],
  ["back", 1.45],
  ["ahead", 1.4],
  ["almost", 1.35],
  ["sometimes", 1.3],
  ["otherwise", 1.25],
  ["at first", 1.2],
  ["for now", 1.18],
  ["by then", 1.15],
  ["once more", 1.12],
  ["not yet", 1.1],
  ["in time", 1.05],
];

const SUTURES = [
  ["— again —", 2.1],
  ["— then —", 2.0],
  ["— still —", 1.95],
  ["— briefly —", 1.85],
  ["— perhaps —", 1.8],
  ["— already —", 1.7],
  ["— almost —", 1.65],
  ["— elsewhere —", 1.55],
  ["— for now —", 1.5],
  ["— not yet —", 1.45],
  ["— once more —", 1.4],
  ["— in time —", 1.35],
  ["— at first —", 1.3],
  ["— after all —", 1.25],
  ["— as if —", 1.2],
  ["— if so —", 1.15],
  ["— in part —", 1.1],
  ["— as before —", 1.05],
];

const SKIP_RE = /\[(?:stale|ukacd)\]|offensive|vulgar|taboo|slur/i;
const POS_CLASS_SKIP_RE = /\/(?:upper|name|person|place|surname|abbr|trademark|demonym)/;
const TOKEN_RE = /^[a-z]{2,14}$/;
const GLOBAL_BLOCKLIST = new Set([
  "anal",
  "erotic",
  "nude",
  "porn",
  "sex",
  "sexual",
]);
const ROLE_BLOCKLISTS = {
  nouns: new Set([
    "above",
    "are",
    "back",
    "bad",
    "best",
    "better",
    "by",
    "can",
    "clear",
    "close",
    "come",
    "daily",
    "do",
    "doing",
    "down",
    "due",
    "even",
    "fast",
    "feel",
    "here",
    "inside",
    "left",
    "may",
    "must",
    "open",
    "outside",
    "right",
    "there",
    "turn",
    "sec",
  ]),
  adjectives: new Set([
    "annual",
    "basic",
    "central",
    "commercial",
    "daily",
    "federal",
    "must",
    "national",
    "sec",
  ]),
  verbs: new Set(["are"]),
  prepositions: new Set(),
  conjunctions: new Set(),
};

async function loadText(pathOrUrl, fallbackUrl) {
  const source = pathOrUrl || fallbackUrl;
  if (!/^https?:\/\//.test(source)) return readFile(source, "utf8");
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Failed to fetch ${source}: ${response.status}`);
  return response.text();
}

function parseFrequency(text) {
  const ranks = new Map();
  const counts = new Map();
  let rank = 0;
  for (const line of text.split(/\r?\n/)) {
    const [word, count] = line.trim().split(/\s+/);
    if (!word || !TOKEN_RE.test(word) || ranks.has(word)) continue;
    rank += 1;
    ranks.set(word, rank);
    counts.set(word, Number(count) || 1);
  }
  return { ranks, counts };
}

function minSize(prefix) {
  const sizes = [...prefix.matchAll(/\b\d{2}\b/g)].map((match) => Number(match[0]));
  return sizes.length > 0 ? Math.min(...sizes) : null;
}

function cleanToken(value) {
  return value
    .replace(/[~!†@]/g, "")
    .trim()
    .toLowerCase();
}

function candidateToken(raw) {
  const token = cleanToken(raw);
  if (!TOKEN_RE.test(token)) return null;
  return token;
}

function presentSingularVerb(formText) {
  const candidates = formText
    .split("#")[0]
    .split(",")
    .map((part) =>
      cleanToken(part.replace(/[()|:]/g, " "))
        .split(/\s+/)
        .find((word) => TOKEN_RE.test(word) && word !== "-")
    )
    .filter(Boolean);
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

function priorWeight(size, token, frequency) {
  const commonness = Math.max(0.35, (82 - size) / 28);
  const count = frequency.counts.get(token) || 1;
  const frequencyLift = 1 + Math.min(1.9, Math.log10(count) / 8);
  const rank = frequency.ranks.get(token) || 120000;
  const rankPenalty = rank > 50000 ? 0.72 : rank > 20000 ? 0.86 : 1;
  return Number((commonness * frequencyLift * rankPenalty).toFixed(3));
}

function addCandidate(buckets, role, token, size, frequency) {
  if (!token) return;
  if (GLOBAL_BLOCKLIST.has(token)) return;
  if ((role === "nouns" || role === "verbs" || role === "adjectives") && token.length < 3) return;
  if (ROLE_BLOCKLISTS[role]?.has(token)) return;
  const current = buckets[role].get(token);
  const weight = priorWeight(size, token, frequency);
  if (!current || weight > current.weight) {
    buckets[role].set(token, { token, weight, size });
  }
}

function parseScowl(text, frequency) {
  const buckets = {
    nouns: new Map(),
    verbs: new Map(),
    adjectives: new Map(),
    prepositions: new Map(),
    conjunctions: new Map(),
  };

  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith("#") || SKIP_RE.test(raw)) continue;
    const posStart = raw.indexOf("<");
    if (posStart === -1 || POS_CLASS_SKIP_RE.test(raw)) continue;

    const beforePos = raw.slice(0, posStart);
    const afterPos = raw.slice(posStart);
    const prefix = beforePos.split(":").slice(0, -1).join(":");
    const size = minSize(prefix);
    if (size == null || size > 60) continue;

    const word = candidateToken(beforePos.split(":").pop());
    if (!word) continue;

    const posMatch = afterPos.match(/^<([^>]+)>/);
    if (!posMatch) continue;
    const pos = posMatch[1].split("/")[0];
    const forms = afterPos.slice(posMatch[0].length + 1);

    if (pos === "n" || pos === "n_v") addCandidate(buckets, "nouns", word, size, frequency);
    if (pos === "aj" || pos === "aj_av" || pos === "a") {
      addCandidate(buckets, "adjectives", word, size, frequency);
    }
    if (pos === "pp") addCandidate(buckets, "prepositions", word, size, frequency);
    if (pos === "c") addCandidate(buckets, "conjunctions", word, size, frequency);
    if (pos === "v" || pos === "n_v" || pos === "m") {
      addCandidate(buckets, "verbs", presentSingularVerb(forms), size, frequency);
    }
  }

  return buckets;
}

function rankedEntries(map, limit) {
  return [...map.values()]
    .sort((a, b) => b.weight - a.weight || a.size - b.size || a.token.localeCompare(b.token))
    .slice(0, limit)
    .sort((a, b) => a.token.localeCompare(b.token))
    .map(({ token, weight }) => [token, weight]);
}

function renderPairs(pairs) {
  return pairs.map(([token, weight]) => `    ${JSON.stringify(token)}: ${weight},`).join("\n");
}

function renderGenerated(entries) {
  return `// Generated by scripts/build-corpus-word-priors.mjs.
// Sources:
// - English Speller Database / SCOWL generated output:
//   ${SCOWL_URL}
// - SymSpell frequency dictionary:
//   ${FREQUENCY_URL}
// ESDB copyright: Copyright 2000-2026 by Kevin Atkinson. Permission granted
// for use, copy, modification, distribution, and sale with notice.
// SymSpell repo license: MIT. This file keeps only a compact derived set of
// lowercase tokens and local weights for the (to)complete grammar.

export const WORD_PRIOR_SOURCE = Object.freeze({
  scowl: ${JSON.stringify(SCOWL_URL)},
  frequency: ${JSON.stringify(FREQUENCY_URL)},
});

export const WORD_PRIORS = Object.freeze({
${Object.entries(entries)
  .map(([role, pairs]) => `  ${role}: Object.freeze({\n${renderPairs(pairs)}\n  }),`)
  .join("\n")}
});
`;
}

async function main() {
  const scowlText = await loadText(process.env.SCOWL_TXT, SCOWL_URL);
  const frequencyText = await loadText(process.env.SYMSPELL_FREQUENCY_TXT, FREQUENCY_URL);
  const frequency = parseFrequency(frequencyText);
  const parsed = parseScowl(scowlText, frequency);

  const entries = {
    openings: OPENINGS,
    nouns: rankedEntries(parsed.nouns, LIMITS.nouns),
    verbs: rankedEntries(parsed.verbs, LIMITS.verbs),
    prepositions: rankedEntries(parsed.prepositions, LIMITS.prepositions),
    adjectives: rankedEntries(parsed.adjectives, LIMITS.adjectives),
    conjunctions: rankedEntries(parsed.conjunctions, LIMITS.conjunctions),
    sutures: SUTURES,
  };

  await writeFile(OUTPUT_PATH, renderGenerated(entries));
  const counts = Object.fromEntries(Object.entries(entries).map(([role, pairs]) => [role, pairs.length]));
  console.log(`Wrote ${OUTPUT_PATH.pathname}`);
  console.log(JSON.stringify(counts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
