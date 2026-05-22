// this person — identifier redaction.
// The artwork keeps brands, desires, contradictions, and embarrassing consumer
// detail. It does NOT keep direct identifiers. This removes them before any
// fragment is shown for review or sent to the server. Runs client-side during
// review and again server-side as defence in depth. Pure module.

interface RedactionPattern {
  name: string;
  regex: RegExp;
}

// Order matters: longer / more specific patterns first.
const PATTERNS: RedactionPattern[] = [
  // email
  { name: "email", regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // SSN-like
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  // credit-card-like: 13–19 digits, optionally grouped
  { name: "card", regex: /\b(?:\d[ -]?){13,19}\b/g },
  // phone: 10+ digits with common separators
  { name: "phone", regex: /\+?\d[\d\s().-]{8,}\d/g },
  // street address
  {
    name: "address",
    regex:
      /\b\d{1,6}\s+[A-Za-z0-9.\s]{2,40}\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|circle|cir|place|pl|terrace|highway|hwy)\b\.?/gi,
  },
  // long opaque token / key / secret
  { name: "token", regex: /\b[A-Za-z0-9_-]{28,}\b/g },
];

const PLACEHOLDER = "[redacted]";

export interface RedactionResult {
  text: string;
  found: string[]; // distinct identifier categories that were removed
}

export function redactText(input: string): RedactionResult {
  let text = String(input ?? "");
  const found: string[] = [];
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      if (!found.includes(pattern.name)) found.push(pattern.name);
      pattern.regex.lastIndex = 0;
      text = text.replace(pattern.regex, PLACEHOLDER);
    }
  }
  return { text: text.replace(/\s+/g, " ").trim(), found };
}

export function containsIdentifier(input: string): boolean {
  return redactText(input).found.length > 0;
}

// A fragment value reduced to nothing but placeholders carries no content.
export function isRedactedEmpty(value: string): boolean {
  const stripped = value.split(PLACEHOLDER).join("").replace(/\s+/g, " ").trim();
  return stripped.length === 0;
}
