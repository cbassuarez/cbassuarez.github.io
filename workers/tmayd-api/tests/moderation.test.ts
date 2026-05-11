import { describe, expect, it } from "vitest";
import { deterministicModerate, moderateDisplayName } from "../src/lib/moderation";

const opts = { minChars: 3, maxChars: 700 };

describe("deterministicModerate", () => {
  it("accepts an ordinary reflection", () => {
    const r = deterministicModerate("today felt long and i was quiet about it", opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cleaned.length).toBeGreaterThan(0);
  });

  it("rejects URLs", () => {
    const r = deterministicModerate("read https://example.com today", opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("url");
  });

  it("rejects bare domains", () => {
    const r = deterministicModerate("scrolled example.com a lot", opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("url");
  });

  it("rejects emails", () => {
    const r = deterministicModerate("write me alice@example.com", opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("email");
  });

  it("rejects phone numbers", () => {
    const r = deterministicModerate("call me 415-555-1212 anytime today", opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("phone");
  });

  it("rejects SSNs", () => {
    const r = deterministicModerate("my ssn is 123-45-6789 lol", opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ssn");
  });

  it("rejects addresses", () => {
    const r = deterministicModerate("the box is at 123 Main Street", opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("address");
  });

  it("rejects ZIP codes", () => {
    const r = deterministicModerate("postal code 94110 today", opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("address");
  });

  it("rejects length too short", () => {
    const r = deterministicModerate("a", opts);
    expect(r.ok).toBe(false);
  });

  it("rejects length too long", () => {
    const r = deterministicModerate("x".repeat(800), opts);
    expect(r.ok).toBe(false);
  });

  it("normalises whitespace but preserves intentional breaks", () => {
    const r = deterministicModerate("today\n\nfelt\n\n\nslow", opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cleaned).toBe("today\n\nfelt\n\nslow");
  });
});

describe("moderateDisplayName", () => {
  it("accepts blank and short non-name handles", () => {
    expect(moderateDisplayName("").ok).toBe(true);
    expect(moderateDisplayName("bunny").ok).toBe(true);
    expect(moderateDisplayName("anon-23").ok).toBe(true);
  });

  it("soft-rejects realistic first+last names", () => {
    const r = moderateDisplayName("Alice Doe");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("soft");
  });

  it("soft-rejects display names with PII", () => {
    const r = moderateDisplayName("call 415-555-1212");
    expect(r.ok).toBe(false);
  });
});
