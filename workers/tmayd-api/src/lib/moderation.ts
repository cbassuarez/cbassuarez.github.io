import type { Env, ModerationResult } from "../types";
import { MODERATION_VERSION } from "../types";
import { bedrockConfigured, bedrockModerate } from "./bedrock";

/**
 * Deterministic moderation. Returns either `ok: true` with a cleaned message
 * (whitespace-normalised, no other transformations), or `ok: false` with a
 * sanitized reason and public-safe message. NEVER echoes raw rejected text.
 *
 * Categories that trigger rejection:
 *   - url:        any http(s)://, www., or bare domain pattern
 *   - email:      RFC-ish mailbox patterns
 *   - phone:      7+ digit blobs with separators
 *   - ssn:        9-digit US SSN with dashes
 *   - address:    street suffix + house number heuristic, or US ZIP
 *   - dob:        explicit "DOB / date of birth" with a date
 *   - profanity:  small slur/threat list (kept short; expand via Bedrock)
 *   - length:     too short / too long
 *
 * Categories that trigger soft rejection (asks user to revise):
 *   - displayname: identifying display name (handled separately)
 *
 * Reasons are short tokens for the `rejection_counts` aggregate. Public
 * messages are intentionally generic — no leakage of which rule fired.
 */

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i;
const BARE_DOMAIN_RE =
  /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|io|app|co|us|uk|de|fr|gov|edu|info|biz|me|dev|xyz|tv|live|art)\b/i;
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;

// Phone: groups of 3+/4+ digits with separators, or 10+ run-on digits.
const PHONE_RE =
  /(?:\+?\d[\s\-.()]?){7,}\d|\b\d{3}[\s\-.]\d{3}[\s\-.]\d{4}\b|\b\(\d{3}\)\s*\d{3}[\s\-.]\d{4}\b/;

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
const ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;

// Street-suffix heuristic. Trip if a digit followed by street word appears.
const STREET_RE =
  /\b\d{1,5}\s+(?:[A-Z][a-zA-Z]+\s+){0,3}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Ter|Terrace)\b\.?/i;

const DOB_RE =
  /\b(?:dob|date of birth|born on|birthday)\b[^\n]{0,40}?\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/i;

// Tight profanity list. Keep small; production should layer Bedrock.
const SLUR_RE =
  /\b(?:k(?:ike|yke)|f(?:aggot|aggit)|n(?:igger|igga)|chink|spic|tranny|retard)\b/i;
const THREAT_RE = /\b(?:i\s+will\s+kill|kill\s+(?:you|him|her|them)|i\s+will\s+shoot|bomb\s+the)\b/i;

// Display-name patterns that look like real names: First Last, First M. Last
const REAL_NAME_RE = /^[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+$/;

interface ModerateOpts {
  minChars: number;
  maxChars: number;
}

const GENERIC_HARD_MESSAGE =
  "This message cannot be accepted. Please submit a non-identifying reflection about your day.";
const GENERIC_SOFT_MESSAGE =
  "This message includes identifying information. Please submit a non-identifying version.";

export function deterministicModerate(
  rawText: string,
  opts: ModerateOpts
): ModerationResult {
  if (typeof rawText !== "string") {
    return reject("hard", "invalid", GENERIC_HARD_MESSAGE);
  }

  // Normalise whitespace but preserve intentional line breaks.
  const cleaned = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const len = cleaned.length;
  if (len < opts.minChars) {
    return reject("hard", "length", `Message must be at least ${opts.minChars} characters.`);
  }
  if (len > opts.maxChars) {
    return reject("hard", "length", `Message must be ${opts.maxChars} characters or fewer.`);
  }

  // Specific patterns first; URL/phone are catchall and would otherwise mask
  // more precise reasons in aggregate counters.
  if (EMAIL_RE.test(cleaned)) {
    return reject("hard", "email", GENERIC_HARD_MESSAGE);
  }
  if (SSN_RE.test(cleaned)) {
    return reject("hard", "ssn", GENERIC_HARD_MESSAGE);
  }
  if (URL_RE.test(cleaned) || BARE_DOMAIN_RE.test(cleaned)) {
    return reject("hard", "url", GENERIC_HARD_MESSAGE);
  }
  if (PHONE_RE.test(cleaned)) {
    return reject("hard", "phone", GENERIC_HARD_MESSAGE);
  }
  if (STREET_RE.test(cleaned) || ZIP_RE.test(cleaned)) {
    return reject("hard", "address", GENERIC_HARD_MESSAGE);
  }
  if (DOB_RE.test(cleaned)) {
    return reject("hard", "dob", GENERIC_HARD_MESSAGE);
  }
  if (SLUR_RE.test(cleaned) || THREAT_RE.test(cleaned)) {
    return reject("hard", "harmful", GENERIC_HARD_MESSAGE);
  }

  // Soft rejections: try to nudge user. Currently none in body — see displayName.
  return { ok: true, cleaned, moderationVersion: MODERATION_VERSION };
}

export function moderateDisplayName(name: string | undefined): ModerationResult {
  if (!name) return { ok: true, cleaned: "", moderationVersion: MODERATION_VERSION };
  const trimmed = name.trim();
  if (!trimmed) return { ok: true, cleaned: "", moderationVersion: MODERATION_VERSION };
  if (trimmed.length > 40) {
    return reject("soft", "displayname_length", GENERIC_SOFT_MESSAGE);
  }
  if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed) || URL_RE.test(trimmed)) {
    return reject("soft", "displayname_contains_pii", GENERIC_SOFT_MESSAGE);
  }
  if (REAL_NAME_RE.test(trimmed)) {
    return reject("soft", "displayname_realname", GENERIC_SOFT_MESSAGE);
  }
  return { ok: true, cleaned: trimmed, moderationVersion: MODERATION_VERSION };
}

function reject(
  kind: "soft" | "hard",
  reason: string,
  message: string
): ModerationResult {
  return { ok: false, kind, reason, message };
}

/**
 * Layered moderation orchestrator.
 *
 * - Always runs the deterministic regex layer first. It is cheap, has no
 *   third-party dependency, and catches obvious PII shapes before sending
 *   anything outbound to AWS.
 * - In `bedrock` or `strict` modes, the cleaned text is then sent to AWS
 *   Bedrock Guardrails. If Bedrock is misconfigured or unreachable, the
 *   request is rejected (fail-closed) — never accept on a Bedrock error.
 * - In `deterministic_only` mode, the function returns immediately after
 *   the regex layer. Production should only run in this mode when
 *   `TMAYD_ALLOW_DETERMINISTIC_ONLY_IN_PROD=true`; the route layer enforces
 *   that gate before reaching this function.
 *
 * `_bedrockFetcher` is for tests only.
 */
export async function moderateSubmission(
  rawText: string,
  env: Env,
  opts: { minChars: number; maxChars: number },
  _bedrockFetcher?: typeof fetch
): Promise<ModerationResult> {
  const det = deterministicModerate(rawText, opts);
  if (!det.ok) return det;

  const mode = (env.MODERATION_MODE || "deterministic_only").toLowerCase();
  if (mode === "deterministic_only") {
    return det;
  }

  if (mode !== "bedrock" && mode !== "strict") {
    // Unknown mode: treat as misconfiguration; fail closed.
    return reject(
      "hard",
      "moderation_misconfigured",
      "This message cannot be accepted. Please submit a non-identifying reflection about your day."
    );
  }

  if (!bedrockConfigured(env)) {
    return reject(
      "hard",
      "bedrock_not_configured",
      "This message cannot be accepted. Please submit a non-identifying reflection about your day."
    );
  }

  const bed = await bedrockModerate(det.cleaned, env, _bedrockFetcher);
  if (!bed.ok) return bed;

  // In strict mode we already required Bedrock; in bedrock mode same path.
  return {
    ok: true,
    cleaned: det.cleaned,
    moderationVersion: bed.moderationVersion
  };
}

/**
 * Tells the route layer whether moderation is currently ready to accept
 * submissions. If the configured mode requires Bedrock but Bedrock is not
 * configured, intake must close.
 */
export function moderationReady(env: Env): { ready: boolean; reason: string } {
  const mode = (env.MODERATION_MODE || "deterministic_only").toLowerCase();
  if (mode === "deterministic_only") {
    const allowed = env.TMAYD_ALLOW_DETERMINISTIC_ONLY_IN_PROD === "true";
    return allowed
      ? { ready: true, reason: "deterministic_only_allowed" }
      : { ready: false, reason: "deterministic_only_disallowed" };
  }
  if (mode === "bedrock" || mode === "strict") {
    return bedrockConfigured(env)
      ? { ready: true, reason: mode }
      : { ready: false, reason: "bedrock_not_configured" };
  }
  return { ready: false, reason: "unknown_mode" };
}
