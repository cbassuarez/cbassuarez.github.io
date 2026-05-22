// this person — claim generation.
// Turns approved fragments into blunt third-person targeting grammar. No AI:
// deterministic templates plus seeded variation, so a preview and its append
// produce identical text. Pure module.
//
// The voice is the voice of advertising address. It is not apologetic. It does
// not euphemize, moralize, or hedge. It says "likes" and "wants".

import type {
  ClaimIntensity,
  ExtractedClaim,
  ExtractedFragment,
  ExtractionSource,
  FragmentKind,
} from "../types";
import { LIMITS } from "../types";
import { foldCase } from "./normalizeText";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

interface ClaimDraft {
  sentence: string;
  intensity: ClaimIntensity;
  fragments: string[];
  generated: boolean; // true => "generated from extracted fragments"
}

// ── source notes ────────────────────────────────────────────────────────────

function extractedSourceNote(source: ExtractionSource, platformHint: string): string {
  const surface = platformHint ? platformHint + " " : "";
  switch (source) {
    case "screen_capture":
      return "extracted from " + surface + "screen capture";
    case "screenshot_ocr":
      return "extracted from " + (surface ? surface + "screenshot" : "screenshot");
    case "data_export":
      return "extracted from data archive";
    case "active_tab_extension":
      return "extracted from browser tab";
    case "ad_preferences_surface":
      return "extracted from ad-preference surface";
    case "browser_topics":
      return "extracted from browser topics";
    case "adtech_return_loop":
      return "returned through ad loop";
    case "manual_operator_entry":
      return "entered by operator";
    default:
      return "extracted from ad-preference surface";
  }
}

// ── brand-specific overrides ────────────────────────────────────────────────

interface BrandRule {
  match: string;
  sentence: string;
  intensity: ClaimIntensity;
}

const BRAND_RULES: BrandRule[] = [
  { match: "starbucks", sentence: "this person likes Starbucks", intensity: "banal" },
  { match: "mcdonald", sentence: "this person likes McDonald's", intensity: "ugly" },
  { match: "chick-fil-a", sentence: "this person likes Chick-fil-A", intensity: "banal" },
  { match: "chipotle", sentence: "this person likes Chipotle", intensity: "banal" },
  { match: "target", sentence: "this person likes Target", intensity: "banal" },
  { match: "costco", sentence: "this person likes Costco", intensity: "banal" },
  { match: "ikea", sentence: "this person wants furniture that arrives flat", intensity: "aspirational" },
  { match: "wayfair", sentence: "this person keeps looking at furniture", intensity: "banal" },
  { match: "cabo", sentence: "this person wants to vacation in Cabo", intensity: "aspirational" },
  { match: "cancun", sentence: "this person wants to vacation in Cancún", intensity: "aspirational" },
  { match: "beach hotel", sentence: "this person is near beach hotels", intensity: "aspirational" },
  { match: "beach resort", sentence: "this person is near beach hotels", intensity: "aspirational" },
  { match: "flight", sentence: "this person searches flights and does not buy them", intensity: "aspirational" },
  { match: "mortgage", sentence: "this person wants to buy a new home", intensity: "aspirational" },
  { match: "zillow", sentence: "this person is near home ownership", intensity: "aspirational" },
  { match: "redfin", sentence: "this person is near home ownership", intensity: "aspirational" },
  { match: "realtor", sentence: "this person is near home ownership", intensity: "aspirational" },
  { match: "furniture", sentence: "this person keeps looking at furniture", intensity: "banal" },
  { match: "mattress", sentence: "this person wants a better mattress", intensity: "ugly" },
  { match: "moving", sentence: "this person is addressed as a future household", intensity: "institutional" },
  { match: "used car", sentence: "this person wants a used sedan", intensity: "aspirational" },
  { match: "auto insurance", sentence: "this person is addressed as a driver", intensity: "institutional" },
  { match: "car insurance", sentence: "this person is addressed as a driver", intensity: "institutional" },
  { match: "graduate program", sentence: "this person is near another credential", intensity: "aspirational" },
  { match: "mba", sentence: "this person is near another credential", intensity: "aspirational" },
  { match: "credit card", sentence: "this person is addressed as a borrower", intensity: "institutional" },
  { match: "student loan", sentence: "this person is addressed as a debtor", intensity: "institutional" },
  { match: "baby registry", sentence: "this person is addressed as a household", intensity: "institutional" },
  { match: "wedding venue", sentence: "this person is addressed as a future household", intensity: "institutional" },
  { match: "weight loss", sentence: "this person wants to be optimized", intensity: "ugly" },
];

// ── per-kind templates ──────────────────────────────────────────────────────

interface KindTemplate {
  templates: string[]; // {v} is replaced by the fragment value
  intensity: ClaimIntensity;
}

const KIND_TEMPLATES: Record<FragmentKind, KindTemplate> = {
  brand: { templates: ["this person likes {v}", "this person is loyal to {v}"], intensity: "banal" },
  retail: { templates: ["this person likes {v}", "this person shops at {v}"], intensity: "banal" },
  restaurant: { templates: ["this person likes {v}", "this person eats at {v}"], intensity: "ugly" },
  food: { templates: ["this person likes {v}", "this person likes cheap food quickly"], intensity: "ugly" },
  travel: {
    templates: ["this person wants to go to {v}", "this person is near {v}", "this person wants {v} air"],
    intensity: "aspirational",
  },
  home: { templates: ["this person wants {v}", "this person keeps looking at {v}"], intensity: "banal" },
  real_estate: {
    templates: ["this person wants to buy a new home", "this person is near home ownership"],
    intensity: "aspirational",
  },
  finance: {
    templates: ["this person is near {v}", "this person is addressed as a borrower"],
    intensity: "institutional",
  },
  vehicle: {
    templates: ["this person is addressed as a driver", "this person wants a used sedan"],
    intensity: "institutional",
  },
  education: {
    templates: ["this person is near another credential", "this person wants {v}"],
    intensity: "aspirational",
  },
  literature: { templates: ["this person likes {v}"], intensity: "banal" },
  political: { templates: ["this person likes {v}", "this person wants a different world"], intensity: "banal" },
  religious: { templates: ["this person likes {v}"], intensity: "banal" },
  entertainment: { templates: ["this person watches {v}", "this person likes {v}"], intensity: "banal" },
  health: { templates: ["this person wants {v}", "this person wants to be optimized"], intensity: "ugly" },
  family: {
    templates: ["this person is addressed as a household", "this person is addressed as a future household"],
    intensity: "institutional",
  },
  work: { templates: ["this person is addressed as labor", "this person is near {v}"], intensity: "institutional" },
  technology: { templates: ["this person wants {v}", "this person likes {v}"], intensity: "banal" },
  unknown: { templates: ["this person is near {v}", "this person was matched to {v}"], intensity: "banal" },
};

function claimForFragment(fragment: ExtractedFragment, rng: () => number): ClaimDraft {
  const folded = foldCase(fragment.value);
  for (const rule of BRAND_RULES) {
    if (folded.includes(rule.match)) {
      return { sentence: rule.sentence, intensity: rule.intensity, fragments: [fragment.value], generated: false };
    }
  }
  const template = KIND_TEMPLATES[fragment.kind] || KIND_TEMPLATES.unknown;
  const sentence = pick(rng, template.templates).replace("{v}", fragment.value);
  return { sentence, intensity: template.intensity, fragments: [fragment.value], generated: false };
}

// ── contradictions ──────────────────────────────────────────────────────────

const RADICAL_TERMS = ["leftist", "marxist", "radical", "socialism", "anarch", "communis", "progressive", "abolition"];
const LEAVE_TERMS = ["moving", "relocat", "leaving", "leave"];
const DEBT_TERMS = ["loan", "mortgage", "debt", "refinance", "credit"];

function detectContradictions(fragments: ExtractedFragment[], rng: () => number): ClaimDraft[] {
  const out: ClaimDraft[] = [];
  const folded = fragments.map((f) => ({ f, folded: foldCase(f.value) }));

  const radical = folded.find((x) => RADICAL_TERMS.some((t) => x.folded.includes(t)) || x.f.kind === "literature");
  const fastFood = folded.find((x) => x.f.kind === "restaurant" || x.f.kind === "food");
  const travel = folded.find((x) => x.f.kind === "travel");
  const debt = folded.find((x) => DEBT_TERMS.some((t) => x.folded.includes(t)) || x.f.kind === "finance");
  const homeOwn = folded.find((x) => x.f.kind === "real_estate");
  const leaving = folded.find((x) => LEAVE_TERMS.some((t) => x.folded.includes(t)));
  const furniture = folded.find((x) => x.folded.includes("furniture") || x.f.kind === "home");

  if (radical && fastFood) {
    out.push({
      sentence: pick(rng, [
        "this person likes leftist literature but also likes McDonald's",
        "this person wants a politics and a drive-thru",
        "this person wants a different world and a rewards account",
      ]),
      intensity: "contradictory",
      fragments: [radical.f.value, fastFood.f.value],
      generated: true,
    });
  }
  if (travel && debt) {
    out.push({
      sentence: pick(rng, [
        "this person wants to leave and wants to owe",
        "this person wants a vacation and a payment plan",
      ]),
      intensity: "contradictory",
      fragments: [travel.f.value, debt.f.value],
      generated: true,
    });
  }
  if (homeOwn && leaving) {
    out.push({
      sentence: "this person wants a new home and wants to leave the one they have",
      intensity: "contradictory",
      fragments: [homeOwn.f.value, leaving.f.value],
      generated: true,
    });
  }
  if (leaving && furniture && !(homeOwn && leaving)) {
    out.push({
      sentence: "this person wants to leave but keeps looking at furniture",
      intensity: "contradictory",
      fragments: [leaving.f.value, furniture.f.value],
      generated: true,
    });
  }
  return out.slice(0, 3);
}

// ── institutional + ugly closers ────────────────────────────────────────────

function institutionalClaim(fragments: ExtractedFragment[], rng: () => number): ClaimDraft {
  const kinds = new Set(fragments.map((f) => f.kind));
  const pool: string[] = ["this person is addressed as a market", "this person was enough for the category"];
  if (kinds.has("family")) pool.push("this person is addressed as a household");
  if (kinds.has("finance") || kinds.has("real_estate")) pool.push("this person is addressed as a future purchase");
  return {
    sentence: pick(rng, pool),
    intensity: "institutional",
    fragments: [],
    generated: true,
  };
}

function uglyClaims(fragments: ExtractedFragment[], rng: () => number, count: number): ClaimDraft[] {
  const kinds = new Set(fragments.map((f) => f.kind));
  const pool: string[] = ["this person resembled a market", "this person was sufficient for the category"];
  if (kinds.has("restaurant") || kinds.has("food")) {
    pool.push("this person likes convenience", "this person likes cheap food quickly");
  }
  if (kinds.has("health")) pool.push("this person wants to be optimized");
  if (kinds.has("travel")) pool.push("this person wants airport air");
  if (kinds.has("technology")) pool.push("this person wants a faster device");
  const out: ClaimDraft[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (out.length < count && guard < 40) {
    guard++;
    const sentence = pick(rng, pool);
    if (used.has(sentence)) continue;
    used.add(sentence);
    out.push({ sentence, intensity: "ugly", fragments: [], generated: true });
  }
  return out;
}

// ── assembly ────────────────────────────────────────────────────────────────

export interface ClaimGenerationInput {
  source: ExtractionSource;
  platformHints: string[];
  fragments: ExtractedFragment[];
  seed: number;
}

export interface ClaimGenerationResult {
  claims: ExtractedClaim[];
  generatedText: string;
  extractionSummary: string;
}

function sourceLabel(source: ExtractionSource): string {
  switch (source) {
    case "screen_capture":
      return "from a screen capture";
    case "screenshot_ocr":
      return "from a screenshot";
    case "data_export":
      return "from a data archive";
    case "active_tab_extension":
      return "from a browser tab";
    case "ad_preferences_surface":
      return "from an ad-preference surface";
    case "browser_topics":
      return "from browser topics";
    case "adtech_return_loop":
      return "through the ad loop";
    case "manual_operator_entry":
      return "by operator";
    default:
      return "from an ad-preference surface";
  }
}

export function generateClaims(input: ClaimGenerationInput): ClaimGenerationResult {
  const rng = mulberry32((input.seed >>> 0) || 1);
  const fragments = input.fragments;
  const platformHint = input.platformHints[0] || "";
  const note = extractedSourceNote(input.source, platformHint);

  const contradictions = detectContradictions(fragments, rng);
  const fragmentClaims = fragments.map((f) => claimForFragment(f, rng));
  const institutional = institutionalClaim(fragments, rng);

  // Target 4–12 claims. Contradictions are never trimmed.
  const target = Math.min(
    LIMITS.MAX_CLAIMS,
    Math.max(4, fragments.length + contradictions.length + 1)
  );

  const drafts: ClaimDraft[] = [];
  const seenSentences = new Set<string>();
  const push = (draft: ClaimDraft): void => {
    const key = draft.sentence.toLowerCase();
    if (seenSentences.has(key) || drafts.length >= LIMITS.MAX_CLAIMS) return;
    seenSentences.add(key);
    drafts.push(draft);
  };

  for (const c of contradictions) push(c);
  const fragmentBudget = Math.max(1, target - drafts.length - 1);
  for (const c of fragmentClaims.slice(0, fragmentBudget)) push(c);
  push(institutional);
  if (drafts.length < target) {
    for (const c of uglyClaims(fragments, rng, target - drafts.length)) push(c);
  }
  // Floor of 4 — pad with closers if extraction was very thin.
  if (drafts.length < 4) {
    for (const c of uglyClaims(fragments, rng, 4 - drafts.length)) push(c);
  }

  const claims: ExtractedClaim[] = drafts.map((draft) => ({
    sentence: draft.sentence,
    sourceNote: draft.generated ? "generated from extracted fragments" : note,
    fragments: draft.fragments,
    intensity: draft.intensity,
  }));

  const generatedText = claims
    .map((claim) => claim.sentence + "\nsource: " + claim.sourceNote)
    .join("\n\n");

  const platformPart = input.platformHints.length
    ? "; platforms: " + input.platformHints.join(", ")
    : "";
  const extractionSummary =
    "extracted " +
    fragments.length +
    (fragments.length === 1 ? " fragment " : " fragments ") +
    sourceLabel(input.source) +
    platformPart;

  return { claims, generatedText, extractionSummary };
}
