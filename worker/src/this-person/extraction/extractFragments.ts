// this person — fragment extraction.
// Turns normalized lines (from OCR, an archive, or an extension payload) into
// candidate ExtractedFragments for the participant to review. It keeps brands,
// categories, and desire-phrases; it drops interface boilerplate and prose
// with no advertising signal. It does not over-filter — the participant makes
// the final include/exclude decision. Pure module.

import type { ExtractedFragment } from "../types";
import { LIMITS } from "../types";
import { foldCase } from "./normalizeText";
import { classifyFragment } from "./classifyFragment";
import { redactText, isRedactedEmpty } from "./redactIdentifiers";

// Interface chrome from ad-settings pages. Matched as whole folded lines.
const BOILERPLATE = new Set([
  "learn more", "manage", "see all", "see more", "see less", "turn off",
  "turn on", "settings", "privacy policy", "help", "sign out", "log out",
  "back", "menu", "home", "search", "done", "save", "cancel", "edit",
  "delete", "remove", "close", "show more", "show less", "see fewer ads",
  "feedback", "report", "report ad", "next", "previous", "loading",
  "ad choices", "personalize", "got it", "ok", "okay", "continue", "skip",
  "view all", "recent", "filter", "sort", "all", "more", "less", "open",
  "your ad settings", "ads personalization", "about these ads", "details",
]);

// Phrases that, anywhere in a line, mark advertising-relevant activity.
const INTENT_PHRASES = [
  "mortgage", "moving", "flight", "hotel", "car insurance", "baby registry",
  "wedding venue", "funeral", "new home", "buy a house", "vacation",
  "refinance", "student loan", "used car", "weight loss", "down payment",
  "credit card", "job opening", "graduate program", "test drive",
];

// Words that, as a short header line, mark a list of categories below.
const HEADER_TERMS = [
  "topics", "brands", "interests", "advertisers", "ad preferences",
  "ad topics", "personalization", "why you saw this", "why you're seeing",
  "categories", "your interests", "things you", "you might like",
  "based on your", "inferred", "audiences", "segments", "things you like",
];

const HEADER_WINDOW = 14;

function isBoilerplate(folded: string): boolean {
  if (BOILERPLATE.has(folded)) return true;
  if (folded.length < 2) return true;
  if (!/[a-z]/i.test(folded)) return true; // pure numbers / punctuation
  return false;
}

function isHeader(folded: string): boolean {
  if (folded.length > 48) return false;
  return HEADER_TERMS.some((term) => folded.includes(term));
}

function isCategoryPath(line: string): boolean {
  return / \/ | › | > /.test(line) || (line.includes(" & ") && line.length < 60);
}

// 1–5 mostly-capitalized words: a brand- or product-name shape.
function isBrandLike(line: string): boolean {
  if (line.length < 2 || line.length > 44) return false;
  const words = line.split(" ");
  if (words.length > 5) return false;
  let capitalized = 0;
  for (const word of words) {
    if (/^[A-Z0-9][A-Za-z0-9'&.+-]*$/.test(word) || /^[A-Z][A-Z'&.+-]+$/.test(word)) {
      capitalized++;
    }
  }
  return capitalized >= Math.ceil(words.length / 2) && /[A-Za-z]/.test(line);
}

function hasIntent(folded: string): boolean {
  return INTENT_PHRASES.some((phrase) => folded.includes(phrase));
}

export function extractFragments(lines: string[]): ExtractedFragment[] {
  const fragments: ExtractedFragment[] = [];
  const seen = new Set<string>();
  let headerCountdown = 0;

  for (const rawLine of lines) {
    const line = rawLine.length > LIMITS.MAX_FRAGMENT_LEN
      ? rawLine.slice(0, LIMITS.MAX_FRAGMENT_LEN)
      : rawLine;
    const folded = foldCase(line);

    if (isHeader(folded)) {
      headerCountdown = HEADER_WINDOW;
      continue;
    }
    if (isBoilerplate(folded)) {
      if (headerCountdown > 0) headerCountdown--;
      continue;
    }

    const underHeader = headerCountdown > 0;
    if (headerCountdown > 0) headerCountdown--;

    const kind = classifyFragment(line);
    const categoryPath = isCategoryPath(line);
    const brandLike = isBrandLike(line);
    const intent = hasIntent(folded);

    // A line earns a place only if it carries advertising signal.
    const known = kind !== "unknown";
    if (!known && !categoryPath && !brandLike && !intent && !underHeader) continue;

    // Long lines are kept only when they carry explicit purchase intent.
    if (line.length > 90 && !intent) continue;

    const { text: redacted } = redactText(line);
    if (!redacted || isRedactedEmpty(redacted)) continue;
    const value = redacted.slice(0, LIMITS.MAX_FRAGMENT_LEN);

    const key = foldCase(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    let confidence = 0.4;
    if (known) confidence = 0.85;
    else if (intent) confidence = 0.75;
    else if (categoryPath) confidence = 0.66;
    else if (underHeader) confidence = 0.6;
    else if (brandLike) confidence = 0.5;

    fragments.push({
      value,
      kind: known ? kind : classifyFragment(value),
      confidence,
      sourceLine: rawLine.slice(0, LIMITS.MAX_FRAGMENT_LEN),
      includeInWall: true,
    });

    if (fragments.length >= LIMITS.MAX_FRAGMENTS) break;
  }

  return fragments;
}
