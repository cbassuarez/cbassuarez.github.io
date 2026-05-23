// this person — Google Data Portability parsing and record construction.
// This module is pure: it accepts already-downloaded Data Portability archive
// text/JSON objects and returns only sanitized ad-interest candidates.

import {
  LIMITS,
  type ClaimIntensity,
  type ExtractedClaim,
  type ExtractedFragment,
  type FragmentKind,
} from "./types";
import { classifyFragment } from "./extraction/classifyFragment";
import { isRedactedEmpty, redactText } from "./extraction/redactIdentifiers";
import JSZip from "jszip";

export const GOOGLE_DP_SCOPE =
  "https://www.googleapis.com/auth/dataportability.myactivity.myadcenter";
export const GOOGLE_DP_RESOURCE = "myactivity.myadcenter";

export type GoogleAdInterestRelation =
  | "likes"
  | "less"
  | "blocked"
  | "seen"
  | "visited"
  | "associated";

export interface GoogleAdInterestCandidate {
  id: string;
  label: string;
  relation: GoogleAdInterestRelation;
  kind: FragmentKind;
  confidence: number;
  claimSentence: string;
  sourceNote: string;
  evidenceTitle: string;
  evidenceTime?: string;
}

interface ActivityRecord {
  header?: unknown;
  title?: unknown;
  titleUrl?: unknown;
  subtitles?: unknown;
  description?: unknown;
  details?: unknown;
  products?: unknown;
  time?: unknown;
}

const GENERIC_LABELS = new Set([
  "ad",
  "ads",
  "advertisement",
  "advertising",
  "google",
  "google ads",
  "my ad center",
  "visited",
  "viewed",
  "activity",
  "details",
]);

function oneLine(value: unknown, maxLen = 160): string {
  const raw = String(value ?? "");
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : ch;
  }
  return decodeHtml(out)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

function stringsFromUnknown(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") return [oneLine(value)];
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  if (typeof value === "object") {
    const out: string[] = [];
    for (const item of Object.values(value as Record<string, unknown>)) {
      out.push(...stringsFromUnknown(item));
    }
    return out;
  }
  return [];
}

function isRelevantRecord(record: ActivityRecord): boolean {
  const joined = [
    record.header,
    record.title,
    record.titleUrl,
    record.products,
    record.details,
    record.description,
  ]
    .flatMap(stringsFromUnknown)
    .join(" ")
    .toLowerCase();
  return /\b(my ad center|google ads|ads?|advertis|ad preferences?|ad topics?)\b/.test(joined);
}

function relationFromTitle(title: string): GoogleAdInterestRelation {
  const t = title.toLowerCase();
  if (/\b(chose to see more|see more ads|liked an? ad|liked ads?)\b/.test(t)) return "likes";
  if (/\b(chose to see fewer|see fewer ads|see less ads|show less|fewer ads)\b/.test(t)) return "less";
  if (/\b(blocked an? ad|blocked ads?|blocked)\b/.test(t)) return "blocked";
  if (/\bvisited\b/.test(t)) return "visited";
  if (/\b(viewed|saw|seen)\b/.test(t)) return "seen";
  return "associated";
}

function normalizeUrlLabel(value: string): string {
  try {
    const url = new URL(value);
    const query =
      url.searchParams.get("q") ||
      url.searchParams.get("query") ||
      url.searchParams.get("topic") ||
      url.searchParams.get("brand") ||
      url.searchParams.get("advertiser");
    if (query) return oneLine(query, LIMITS.MAX_FRAGMENT_LEN);
    const parts = url.pathname.split("/").map(decodeURIComponent).filter(Boolean);
    const last = parts.reverse().find((part) => !/^\d+$/.test(part) && part.length > 1);
    if (last) return oneLine(last.replace(/[-_]+/g, " "), LIMITS.MAX_FRAGMENT_LEN);
    return oneLine(url.hostname.replace(/^www\./, ""), LIMITS.MAX_FRAGMENT_LEN);
  } catch {
    return value;
  }
}

function stripTitlePrefix(title: string, relation: GoogleAdInterestRelation): string {
  let label = title;
  const replacements: RegExp[] = [
    /^chose to see more ads?\s+(?:about|from|for)\s+/i,
    /^chose to see fewer ads?\s+(?:about|from|for)\s+/i,
    /^liked an? ads?\s+(?:about|from|for)?\s*/i,
    /^blocked an? ads?\s+(?:about|from|for)?\s*/i,
    /^visited\s+/i,
    /^viewed\s+/i,
    /^saw\s+/i,
    /^seen\s+/i,
  ];
  for (const pattern of replacements) label = label.replace(pattern, "");
  label = label
    .replace(/\b(on|in)\s+my ad center\b/gi, "")
    .replace(/\bfrom google ads\b/gi, "")
    .replace(/\bgoogle ads\b/gi, "")
    .replace(/\bmy ad center\b/gi, "")
    .replace(/^[:"'\s-]+|[:"'\s.-]+$/g, "");
  if (relation === "associated") {
    label = label.replace(/\b(ad topics?|ads?|advertisers?|preferences?)\b/gi, "").trim();
  }
  return label;
}

function sanitizeCandidateLabel(value: string): string {
  const urlNormalized = value.replace(/https?:\/\/[^\s)"']+/gi, (match) => normalizeUrlLabel(match));
  const cleaned = oneLine(urlNormalized, LIMITS.MAX_FRAGMENT_LEN)
    .replace(/^[:"'\s-]+|[:"'\s.-]+$/g, "")
    .replace(/\s+\/\s+/g, " / ");
  const { text } = redactText(cleaned);
  if (!text || isRedactedEmpty(text)) return "";
  const lower = text.toLowerCase();
  if (GENERIC_LABELS.has(lower)) return "";
  if (lower.length < 2 || !/[a-z0-9]/i.test(lower)) return "";
  return text;
}

function labelForRecord(record: ActivityRecord, relation: GoogleAdInterestRelation): string {
  const title = oneLine(record.title, 240);
  const fromTitle = sanitizeCandidateLabel(stripTitlePrefix(title, relation));
  if (fromTitle) return fromTitle;

  for (const value of [
    record.titleUrl,
    record.subtitles,
    record.description,
    record.details,
  ].flatMap(stringsFromUnknown)) {
    const label = sanitizeCandidateLabel(normalizeUrlLabel(value));
    if (label) return label;
  }
  return "";
}

function confidenceForRelation(relation: GoogleAdInterestRelation): number {
  if (relation === "likes" || relation === "less" || relation === "blocked") return 0.94;
  if (relation === "visited" || relation === "seen") return 0.78;
  return 0.62;
}

function sentenceFor(label: string, relation: GoogleAdInterestRelation, title: string): string {
  const lower = title.toLowerCase();
  if (relation === "likes") {
    if (/\bliked an? ad\b/.test(lower)) return "this person liked an ad about " + label;
    return "this person chose to see more ads about " + label;
  }
  if (relation === "less") return "this person chose to see fewer ads about " + label;
  if (relation === "blocked") return "this person blocked an ad about " + label;
  if (relation === "visited") return "Google recorded this person visiting " + label + " through an ad surface";
  if (relation === "seen") return "Google recorded this person seeing an ad about " + label;
  return "Google associated this person with " + label;
}

function sourceNoteFor(label: string, relation: GoogleAdInterestRelation, title: string): string {
  const evidence = title && title !== label ? title : label;
  const prefix =
    relation === "associated"
      ? "Google Data Portability: inferred from My Ad Center activity"
      : "Google Data Portability: " + relation;
  return oneLine(prefix + " — " + evidence, 220);
}

function hashId(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function candidateFromRecord(record: ActivityRecord): GoogleAdInterestCandidate | null {
  if (!isRelevantRecord(record)) return null;
  const title = oneLine(record.title, 240);
  const relation = relationFromTitle(title);
  const label = labelForRecord(record, relation);
  if (!label) return null;
  const kind = classifyFragment(label);
  const evidenceTime = oneLine(record.time, 80) || undefined;
  const claimSentence = sentenceFor(label, relation, title);
  const sourceNote = sourceNoteFor(label, relation, title || label);
  const id = hashId([relation, label.toLowerCase(), title.toLowerCase(), evidenceTime || ""].join("|"));
  return {
    id,
    label,
    relation,
    kind,
    confidence: confidenceForRelation(relation),
    claimSentence,
    sourceNote,
    evidenceTitle: title || label,
    evidenceTime,
  };
}

function collectActivityRecords(value: unknown, out: ActivityRecord[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectActivityRecords(item, out);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  if ("title" in obj || "header" in obj || "products" in obj) {
    out.push(obj as ActivityRecord);
  }
  for (const item of Object.values(obj)) {
    if (item && typeof item === "object") collectActivityRecords(item, out);
  }
}

function recordsFromHtml(text: string): ActivityRecord[] {
  const withoutScripts = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const lines = decodeHtml(withoutScripts.replace(/<[^>]+>/g, "\n"))
    .split(/\r?\n/)
    .map((line) => oneLine(line, 240))
    .filter(Boolean);
  return lines.map((title) => ({ header: "My Ad Center", title, products: ["Ads"] }));
}

export function extractGoogleAdInterestCandidatesFromText(
  text: string,
  sourceName = "Google Data Portability archive"
): GoogleAdInterestCandidate[] {
  const records: ActivityRecord[] = [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/^[\[{]/.test(trimmed)) {
    try {
      collectActivityRecords(JSON.parse(trimmed), records);
    } catch {
      records.push(...recordsFromHtml(text));
    }
  } else {
    records.push(...recordsFromHtml(text));
  }

  const byId = new Map<string, GoogleAdInterestCandidate>();
  for (const record of records) {
    const candidate = candidateFromRecord(record);
    if (!candidate) continue;
    if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
    if (byId.size >= LIMITS.MAX_FRAGMENTS) break;
  }
  const candidates = [...byId.values()];
  for (const candidate of candidates) {
    candidate.sourceNote = candidate.sourceNote.replace(
      "Google Data Portability:",
      "Google Data Portability (" + sourceName + "):"
    );
  }
  return candidates;
}

function looksLikeZip(bytes: ArrayBuffer, contentType = "", sourceName = ""): boolean {
  if (/zip/i.test(contentType) || /\.zip(?:$|\?)/i.test(sourceName)) return true;
  const view = new Uint8Array(bytes.slice(0, 4));
  return view[0] === 0x50 && view[1] === 0x4b;
}

function isReadableArchiveEntry(name: string): boolean {
  return /\.(json|html?|txt)$/i.test(name);
}

export async function extractGoogleAdInterestCandidatesFromArchiveBytes(
  bytes: ArrayBuffer,
  sourceName = "Google Data Portability archive",
  contentType = ""
): Promise<GoogleAdInterestCandidate[]> {
  if (!looksLikeZip(bytes, contentType, sourceName)) {
    return extractGoogleAdInterestCandidatesFromText(
      new TextDecoder().decode(bytes),
      sourceName
    );
  }

  const zip = await JSZip.loadAsync(bytes);
  const byId = new Map<string, GoogleAdInterestCandidate>();
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && isReadableArchiveEntry(entry.name))
    .slice(0, 60);
  for (const entry of entries) {
    const text = await entry.async("string");
    const candidates = extractGoogleAdInterestCandidatesFromText(text, entry.name);
    for (const candidate of candidates) {
      if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
      if (byId.size >= LIMITS.MAX_FRAGMENTS) break;
    }
    if (byId.size >= LIMITS.MAX_FRAGMENTS) break;
  }
  return [...byId.values()];
}

function intensityForRelation(relation: GoogleAdInterestRelation): ClaimIntensity {
  if (relation === "less" || relation === "blocked") return "contradictory";
  if (relation === "visited" || relation === "seen" || relation === "associated") return "institutional";
  return "banal";
}

export function buildGoogleDataPortabilityEntry(candidates: GoogleAdInterestCandidate[]): {
  fragments: ExtractedFragment[];
  claims: ExtractedClaim[];
  generatedText: string;
  extractionSummary: string;
} {
  const selected = candidates.slice(0, LIMITS.MAX_FRAGMENTS);
  const fragments: ExtractedFragment[] = selected.map((candidate) => ({
    value: candidate.label,
    kind: candidate.kind,
    platformHint: "Google My Ad Center",
    confidence: candidate.confidence,
    includeInWall: true,
  }));
  const claims: ExtractedClaim[] = selected.slice(0, LIMITS.MAX_CLAIMS).map((candidate) => ({
    sentence: candidate.claimSentence,
    sourceNote: candidate.sourceNote,
    fragments: [candidate.label],
    intensity: intensityForRelation(candidate.relation),
  }));
  const generatedText = claims
    .map((claim) => claim.sentence + "\nsource: " + claim.sourceNote)
    .join("\n\n");
  const extractionSummary =
    "Google Data Portability returned " +
    selected.length +
    " My Ad Center or ad activity " +
    (selected.length === 1 ? "record" : "records") +
    "; " +
    claims.length +
    " became public claims.";
  return { fragments, claims, generatedText, extractionSummary };
}
