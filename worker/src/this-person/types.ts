// this person — shared types, limits, and payload validation.
// Pure module: no worker or DOM APIs. Imported by the worker, the Durable
// Object, the frontend bundle, and the unit tests alike.
//
// The work is an extraction apparatus. The repository contains only people who
// chose extraction — successful extracted portraits. There is no refusal,
// unsupported, empty, or error entry type.

export type ExtractionSource =
  | "screen_capture"
  | "screenshot_ocr"
  | "data_export"
  | "active_tab_extension"
  | "ad_preferences_surface"
  | "browser_topics"
  | "adtech_return_loop"
  | "manual_operator_entry";

export const EXTRACTION_SOURCES: readonly ExtractionSource[] = [
  "screen_capture",
  "screenshot_ocr",
  "data_export",
  "active_tab_extension",
  "ad_preferences_surface",
  "browser_topics",
  "adtech_return_loop",
  "manual_operator_entry",
];

export type ExtractionStatus =
  | "extracted"
  | "extracted_and_appended"
  | "extracted_and_enrolled"
  | "returned_through_ad";

export type FragmentKind =
  | "brand"
  | "restaurant"
  | "retail"
  | "travel"
  | "home"
  | "real_estate"
  | "finance"
  | "education"
  | "literature"
  | "entertainment"
  | "health"
  | "family"
  | "work"
  | "vehicle"
  | "technology"
  | "food"
  | "political"
  | "religious"
  | "unknown";

export const FRAGMENT_KINDS: readonly FragmentKind[] = [
  "brand",
  "restaurant",
  "retail",
  "travel",
  "home",
  "real_estate",
  "finance",
  "education",
  "literature",
  "entertainment",
  "health",
  "family",
  "work",
  "vehicle",
  "technology",
  "food",
  "political",
  "religious",
  "unknown",
];

export type ClaimIntensity =
  | "banal"
  | "aspirational"
  | "contradictory"
  | "institutional"
  | "ugly"
  | "intimate";

export interface ExtractedFragment {
  value: string;
  kind: FragmentKind;
  platformHint?: string;
  confidence: number; // 0..1
  sourceLine?: string; // client-side review only — never sent to the server
  includeInWall: boolean;
}

export interface ExtractedClaim {
  sentence: string;
  sourceNote: string;
  fragments: string[];
  intensity: ClaimIntensity;
}

export interface ReturnLoopState {
  enrolled: boolean;
  events: string[];
  returned: boolean;
}

export interface ExtractedPerson {
  id: string; // public monotonic id, e.g. "0042"
  publicNumber: number;
  source: ExtractionSource;
  status: ExtractionStatus;
  platformHints: string[];
  fragments: ExtractedFragment[];
  claims: ExtractedClaim[];
  generatedText: string;
  extractionSummary: string;
  appendedAtOrder: number;
  appendedAtVisible?: string | null;
  returnLoop?: ReturnLoopState;
}

export const LIMITS = {
  MAX_FRAGMENTS: 40,
  MAX_FRAGMENT_LEN: 120,
  MAX_PLATFORM_HINTS: 8,
  MAX_PLATFORM_HINT_LEN: 60,
  MAX_CLAIMS: 12,
  MAX_BODY_BYTES: 16384,
} as const;

export function zeroPad(n: number, width = 4): string {
  const s = String(Math.max(0, Math.floor(Number(n) || 0)));
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}

export function isExtractionSource(value: unknown): value is ExtractionSource {
  return (
    typeof value === "string" &&
    (EXTRACTION_SOURCES as readonly string[]).includes(value)
  );
}

export function isFragmentKind(value: unknown): value is FragmentKind {
  return (
    typeof value === "string" &&
    (FRAGMENT_KINDS as readonly string[]).includes(value)
  );
}

// Collapse a value into a single safe display line: drop control characters
// (code points below 32, plus DEL), collapse whitespace, trim, cap length.
// HTML metacharacters are left intact — every surface renders with textContent.
export function sanitizeLabel(value: unknown, maxLen: number): string {
  const raw = String(value ?? "");
  let cleaned = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    cleaned += code < 32 || code === 127 ? " " : ch;
  }
  return cleaned.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ExtractionInput {
  source: ExtractionSource;
  platformHints: string[];
  fragments: ExtractedFragment[];
}

export interface AppendInput extends ExtractionInput {
  seed: number;
  keptClaimIndices: number[] | null;
}

function sanitizeHints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const hint = sanitizeLabel(item, LIMITS.MAX_PLATFORM_HINT_LEN);
    if (hint && !out.includes(hint)) out.push(hint);
    if (out.length >= LIMITS.MAX_PLATFORM_HINTS) break;
  }
  return out;
}

// Normalizes one inbound fragment. sourceLine is intentionally dropped — raw
// source lines are a client-side review aid and never reach the server.
function sanitizeFragment(value: unknown): ExtractedFragment | null {
  if (!value || typeof value !== "object") return null;
  const f = value as Record<string, unknown>;
  const text = sanitizeLabel(f.value, LIMITS.MAX_FRAGMENT_LEN);
  if (!text) return null;
  const kind = isFragmentKind(f.kind) ? f.kind : "unknown";
  const platformHint =
    f.platformHint != null
      ? sanitizeLabel(f.platformHint, LIMITS.MAX_PLATFORM_HINT_LEN) || undefined
      : undefined;
  let confidence = Number(f.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.min(1, Math.max(0, confidence));
  return {
    value: text,
    kind,
    platformHint,
    confidence,
    includeInWall: f.includeInWall !== false,
  };
}

function parseExtractionInput(body: unknown): ParseResult<ExtractionInput> {
  if (!body || typeof body !== "object") return { ok: false, error: "bad_body" };
  const b = body as Record<string, unknown>;
  if (!isExtractionSource(b.source)) return { ok: false, error: "bad_source" };
  if (!Array.isArray(b.fragments)) return { ok: false, error: "bad_fragments" };

  const fragments: ExtractedFragment[] = [];
  for (const raw of b.fragments) {
    const fragment = sanitizeFragment(raw);
    if (fragment) fragments.push(fragment);
    if (fragments.length >= LIMITS.MAX_FRAGMENTS) break;
  }
  // The wall portrait is built only from fragments the participant kept.
  const included = fragments.filter((f) => f.includeInWall);
  if (included.length === 0) return { ok: false, error: "no_fragments" };

  return {
    ok: true,
    data: { source: b.source, platformHints: sanitizeHints(b.platformHints), fragments: included },
  };
}

export function parsePreviewRequest(body: unknown): ParseResult<ExtractionInput> {
  return parseExtractionInput(body);
}

export function parseAppendRequest(body: unknown): ParseResult<AppendInput> {
  const base = parseExtractionInput(body);
  if (!base.ok) return base;
  const b = body as Record<string, unknown>;

  const seedNum = Number(b.seed);
  if (!Number.isFinite(seedNum)) return { ok: false, error: "bad_seed" };

  let keptClaimIndices: number[] | null = null;
  if (Array.isArray(b.keptClaimIndices)) {
    keptClaimIndices = [];
    for (const raw of b.keptClaimIndices) {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 0 && n < LIMITS.MAX_CLAIMS) {
        keptClaimIndices.push(n);
      }
    }
  }

  return {
    ok: true,
    data: {
      ...base.data,
      seed: Math.floor(seedNum) >>> 0,
      keptClaimIndices,
    },
  };
}
