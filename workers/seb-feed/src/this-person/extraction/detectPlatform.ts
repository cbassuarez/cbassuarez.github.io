// this person — platform detection.
// Identifies which advertising surface a body of text came from, so claims can
// carry an accurate source note. Pure module.

import { foldCase } from "./normalizeText";

interface PlatformSignature {
  hint: string;
  terms: string[];
}

const SIGNATURES: PlatformSignature[] = [
  {
    hint: "Google My Ad Center",
    terms: [
      "my ad center",
      "ads personalization",
      "adssettings",
      "ad settings",
      "why you're seeing this ad",
      "manage your google account",
      "topics you like",
    ],
  },
  {
    hint: "Meta Ad Preferences",
    terms: [
      "accounts center",
      "ad preferences",
      "ad topics",
      "advertisers you've seen",
      "manage info advertisers use",
      "meta",
      "facebook",
      "instagram",
    ],
  },
  {
    hint: "Amazon advertising preferences",
    terms: ["advertising preferences", "interest-based ads", "amazon ad"],
  },
  {
    hint: "TikTok ad interests",
    terms: ["ad interests", "personalized ads", "tiktok"],
  },
  {
    hint: "Microsoft advertising",
    terms: ["microsoft advertising", "personalized ads in microsoft"],
  },
  {
    hint: "X ad preferences",
    terms: ["your twitter data", "interests from twitter", "interests from x"],
  },
];

// Returns the platform hints whose signatures appear in the text.
export function detectPlatforms(text: string): string[] {
  const haystack = foldCase(text);
  const hints: string[] = [];
  for (const signature of SIGNATURES) {
    if (signature.terms.some((term) => haystack.includes(term))) {
      hints.push(signature.hint);
    }
  }
  return hints;
}

// A concise note for a single fragment that did not match a platform.
export function genericPlatformHint(): string {
  return "ad-preference surface";
}
