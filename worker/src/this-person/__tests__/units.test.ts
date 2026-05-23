// this person — unit tests for the pure extraction modules.
// Run with: npm run test:this-person

import test from "node:test";
import assert from "node:assert/strict";

import {
  parsePreviewRequest,
  parseAppendRequest,
  sanitizeLabel,
  zeroPad,
  LIMITS,
  type ExtractedFragment,
} from "../types";
import { normalizeText } from "../extraction/normalizeText";
import { classifyFragment } from "../extraction/classifyFragment";
import { extractFragments } from "../extraction/extractFragments";
import { redactText, isRedactedEmpty, containsIdentifier } from "../extraction/redactIdentifiers";
import { generateClaims } from "../extraction/generateClaims";
import {
  buildGoogleDataPortabilityEntry,
  extractGoogleAdInterestCandidatesFromText,
} from "../googleDataPortability";

function frag(value: string, kind: ExtractedFragment["kind"]): ExtractedFragment {
  return { value, kind, confidence: 0.85, includeInWall: true };
}

function hasEmoji(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x1f000) return true;
    if (code >= 0x2600 && code <= 0x27bf) return true;
  }
  return false;
}

test("normalizeText splits, trims, and drops blank lines", () => {
  assert.deepEqual(normalizeText("a\n\n  b  \r\nc"), ["a", "b", "c"]);
});

test("classifyFragment maps brands and categories to kinds", () => {
  assert.equal(classifyFragment("Starbucks"), "restaurant");
  assert.equal(classifyFragment("Target"), "retail");
  assert.equal(classifyFragment("Mortgage rates"), "real_estate");
  assert.equal(classifyFragment("Cabo San Lucas"), "travel");
  assert.equal(classifyFragment("leftist literature"), "literature");
  assert.equal(classifyFragment("zzxxqq gibberish"), "unknown");
});

test("extractFragments keeps signal and drops interface boilerplate", () => {
  const fragments = extractFragments([
    "Your ad topics",
    "Starbucks",
    "Coffee",
    "Learn more",
    "Settings",
    "Home & Garden / Furniture",
  ]);
  const values = fragments.map((f) => f.value);
  assert.ok(values.includes("Starbucks"));
  assert.ok(values.includes("Home & Garden / Furniture"));
  assert.ok(!values.includes("Learn more"));
  assert.ok(!values.includes("Settings"));
});

test("redactIdentifiers removes emails and phone numbers", () => {
  const email = redactText("reach me at person@example.com today");
  assert.ok(email.text.includes("[redacted]"));
  assert.ok(email.found.includes("email"));
  assert.equal(containsIdentifier("call 555-123-4567 please"), true);
  assert.equal(isRedactedEmpty("[redacted]"), true);
  assert.equal(isRedactedEmpty("Starbucks"), false);
});

test("generateClaims is deterministic for a given seed", () => {
  const fragments = [frag("Starbucks", "restaurant"), frag("Cabo", "travel")];
  const a = generateClaims({ source: "screenshot_ocr", platformHints: [], fragments, seed: 42 });
  const b = generateClaims({ source: "screenshot_ocr", platformHints: [], fragments, seed: 42 });
  assert.equal(a.generatedText, b.generatedText);
});

test("generateClaims produces 4-12 claims with no emoji", () => {
  for (let seed = 0; seed < 16; seed++) {
    const result = generateClaims({
      source: "data_export",
      platformHints: ["Google My Ad Center"],
      fragments: [frag("Target", "retail")],
      seed,
    });
    assert.ok(result.claims.length >= 4 && result.claims.length <= 12);
    assert.ok(!hasEmoji(result.generatedText));
  }
});

test("generateClaims preserves brands with assertive 'likes' grammar", () => {
  const starbucks = generateClaims({
    source: "screenshot_ocr", platformHints: [], fragments: [frag("Starbucks", "restaurant")], seed: 3,
  });
  assert.ok(starbucks.claims.some((c) => c.sentence === "this person likes Starbucks"));

  const mcd = generateClaims({
    source: "screenshot_ocr", platformHints: [], fragments: [frag("McDonald's", "restaurant")], seed: 3,
  });
  assert.ok(mcd.claims.some((c) => c.sentence === "this person likes McDonald's"));

  const mortgage = generateClaims({
    source: "data_export", platformHints: [], fragments: [frag("mortgage pre-approval", "real_estate")], seed: 3,
  });
  assert.ok(mortgage.claims.some((c) => c.sentence === "this person wants to buy a new home"));
});

test("generateClaims surfaces contradictions", () => {
  const result = generateClaims({
    source: "data_export",
    platformHints: [],
    fragments: [frag("leftist literature", "literature"), frag("McDonald's", "restaurant")],
    seed: 9,
  });
  assert.ok(result.claims.some((c) => c.intensity === "contradictory"));
});

test("parsePreviewRequest rejects unknown sources", () => {
  const result = parsePreviewRequest({ source: "exfiltrate", fragments: [frag("x", "brand")] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "bad_source");
});

test("parsePreviewRequest rejects an empty fragment set", () => {
  const result = parsePreviewRequest({ source: "screenshot_ocr", fragments: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "no_fragments");
});

test("parsePreviewRequest caps the fragment count", () => {
  const many = Array.from({ length: 80 }, (_, i) => frag("brand-" + i, "brand"));
  const result = parsePreviewRequest({ source: "data_export", fragments: many });
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(result.data.fragments.length <= LIMITS.MAX_FRAGMENTS);
});

test("pasted HTML survives as inert text, not markup", () => {
  const payload = "<script>alert(1)</script>";
  const result = parsePreviewRequest({
    source: "manual_operator_entry",
    fragments: [{ value: payload, kind: "brand", confidence: 0.8, includeInWall: true }],
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.fragments[0].value, payload);
});

test("parseAppendRequest requires a numeric seed", () => {
  const bad = parseAppendRequest({ source: "screenshot_ocr", fragments: [frag("Target", "retail")], seed: "x" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.error, "bad_seed");

  const ok = parseAppendRequest({ source: "screenshot_ocr", fragments: [frag("Target", "retail")], seed: 7 });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.data.seed, 7);
});

test("sanitizeLabel strips control characters and caps length", () => {
  assert.equal(sanitizeLabel("a b\tc", 80), "a b c");
  assert.equal(sanitizeLabel("  spaced   out  ", 80), "spaced out");
  assert.equal(sanitizeLabel("toolong", 4), "tool");
});

test("zeroPad pads to four digits and never truncates", () => {
  assert.equal(zeroPad(7), "0007");
  assert.equal(zeroPad(42), "0042");
  assert.equal(zeroPad(12345), "12345");
});

test("Google Data Portability parser extracts liked My Ad Center topics", () => {
  const candidates = extractGoogleAdInterestCandidatesFromText(JSON.stringify([
    {
      header: "My Ad Center",
      title: "Chose to see more ads about Coffee",
      products: ["Ads"],
      time: "2026-05-01T12:00:00Z",
    },
  ]));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].label, "Coffee");
  assert.equal(candidates[0].relation, "likes");
  assert.equal(candidates[0].claimSentence, "this person chose to see more ads about Coffee");
});

test("Google Data Portability parser preserves fewer and blocked uncertainty", () => {
  const candidates = extractGoogleAdInterestCandidatesFromText(JSON.stringify([
    { header: "My Ad Center", title: "Chose to see fewer ads about Cars", products: ["Ads"] },
    { header: "My Ad Center", title: "Blocked an ad about Payday loans", products: ["Ads"] },
  ]));
  assert.deepEqual(candidates.map((candidate) => candidate.relation), ["less", "blocked"]);
  assert.ok(candidates[0].claimSentence.includes("fewer ads about Cars"));
  assert.ok(candidates[1].claimSentence.includes("blocked an ad about Payday loans"));
});

test("Google Data Portability parser handles associated advertiser records", () => {
  const candidates = extractGoogleAdInterestCandidatesFromText(JSON.stringify([
    {
      header: "Google Ads",
      title: "Ad topics",
      titleUrl: "https://ads.google.com/topic/Sneakers",
      products: ["Ads"],
    },
  ]));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].label, "Sneakers");
  assert.equal(candidates[0].relation, "associated");
  assert.equal(candidates[0].claimSentence, "Google associated this person with Sneakers");
});

test("Google Data Portability parser redacts identifiers and ignores empty exports", () => {
  const empty = extractGoogleAdInterestCandidatesFromText(JSON.stringify([{ header: "Search", title: "Coffee" }]));
  assert.equal(empty.length, 0);

  const candidates = extractGoogleAdInterestCandidatesFromText(JSON.stringify([
    {
      header: "My Ad Center",
      title: "Chose to see more ads about person@example.com",
      products: ["Ads"],
    },
  ]));
  assert.equal(candidates.length, 0);
});

test("Google Data Portability entry builder emits google_data_portability source claims", () => {
  const candidates = extractGoogleAdInterestCandidatesFromText(JSON.stringify([
    { header: "My Ad Center", title: "Liked an ad about Hotels", products: ["Ads"] },
  ]));
  const built = buildGoogleDataPortabilityEntry(candidates);
  assert.equal(built.claims.length, 1);
  assert.equal(built.fragments[0].platformHint, "Google My Ad Center");
  assert.ok(built.generatedText.includes("this person liked an ad about Hotels"));
});

test("ad_preferences_surface is an accepted parseAppendRequest source", () => {
  // The new "this person" path stamps every web-signals payload with this
  // source on the worker before parseAppendRequest runs.
  const ok = parseAppendRequest({
    source: "ad_preferences_surface",
    platformHints: ["Chrome 131 on macOS", "googletagmanager.com"],
    fragments: [
      frag("Comics", "entertainment"),
      frag("en-US", "unknown"),
      frag("Google Ads", "brand"),
    ],
    seed: 12345,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.data.source, "ad_preferences_surface");
    assert.equal(ok.data.fragments.length, 3);
    assert.ok(ok.data.platformHints.includes("Chrome 131 on macOS"));
  }
});

test("generateClaims on a web-signals payload reads as the consented industry source", () => {
  const result = generateClaims({
    source: "ad_preferences_surface",
    platformHints: ["Chrome 131 on macOS"],
    fragments: [
      frag("Comics", "entertainment"),
      frag("Travel & Transportation", "travel"),
      frag("Google Ads", "brand"),
    ],
    seed: 7,
  });
  assert.ok(result.claims.length >= 4);
  assert.ok(!hasEmoji(result.generatedText));
  assert.ok(
    result.claims.some((c) => c.sourceNote.includes("ad-preference surface")) ||
    result.claims.some((c) => c.sourceNote.includes("generated from extracted fragments"))
  );
});
