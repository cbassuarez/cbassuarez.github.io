import { describe, expect, it } from "vitest";
import { bedrockConfigured, bedrockModerate } from "../src/lib/bedrock";
import { moderateSubmission, moderationReady } from "../src/lib/moderation";
import type { Env } from "../src/types";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    TMAYD_ENV: "production",
    TMAYD_ALLOWED_ORIGINS: "https://cbassuarez.com",
    TMAYD_HEARTBEAT_STALE_SECONDS: "90",
    TMAYD_RATE_WINDOW_SECONDS: "600",
    TMAYD_RATE_MAX_REQUESTS: "3",
    TMAYD_MIN_CHARS: "3",
    TMAYD_MAX_CHARS: "700",
    MODERATION_MODE: "deterministic_only",
    TMAYD_ALLOW_TEST_TURNSTILE: "false",
    TMAYD_ALLOW_DETERMINISTIC_ONLY_IN_PROD: "true",
    TMAYD_LEASE_SECONDS: "120",
    TMAYD_MAX_ATTEMPTS: "5",
    ...overrides
  } as Env;
}

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    })) as unknown as typeof fetch;
}

const FULL_BEDROCK_ENV = {
  BEDROCK_GUARDRAIL_ID: "g-12345",
  BEDROCK_GUARDRAIL_VERSION: "1",
  AWS_REGION: "us-west-2",
  AWS_ACCESS_KEY_ID: "AKIAFAKEFAKEFAKEFAKE",
  AWS_SECRET_ACCESS_KEY: "fakefakefakefakefakefakefakefakefakefake"
} as const;

describe("bedrockConfigured", () => {
  it("false when nothing set", () => {
    expect(bedrockConfigured(makeEnv())).toBe(false);
  });
  it("false when partially set", () => {
    expect(
      bedrockConfigured(makeEnv({ BEDROCK_GUARDRAIL_ID: "g-1", AWS_REGION: "us-west-2" }))
    ).toBe(false);
  });
  it("true when all required vars set", () => {
    expect(bedrockConfigured(makeEnv(FULL_BEDROCK_ENV))).toBe(true);
  });
});

describe("bedrockModerate (mocked transport)", () => {
  it("rejects when not configured", async () => {
    const r = await bedrockModerate("hello", makeEnv());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bedrock_not_configured");
  });

  it("passes through when action=NONE", async () => {
    const env = makeEnv({ ...FULL_BEDROCK_ENV, MODERATION_MODE: "bedrock" });
    const r = await bedrockModerate("today the windows were warm", env, fakeFetch(200, { action: "NONE" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.moderationVersion).toMatch(/\+bedrock$/);
  });

  it("rejects when action=GUARDRAIL_INTERVENED with pii reason", async () => {
    const env = makeEnv({ ...FULL_BEDROCK_ENV, MODERATION_MODE: "bedrock" });
    const r = await bedrockModerate(
      "today my email is fake@example.com",
      env,
      fakeFetch(200, {
        action: "GUARDRAIL_INTERVENED",
        assessments: [
          {
            sensitiveInformationPolicy: {
              piiEntities: [{ type: "EMAIL", action: "BLOCKED" }]
            }
          }
        ]
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("pii_email");
  });

  it("rejects when action=GUARDRAIL_INTERVENED with content filter", async () => {
    const env = makeEnv({ ...FULL_BEDROCK_ENV, MODERATION_MODE: "bedrock" });
    const r = await bedrockModerate(
      "today I had a complicated thought",
      env,
      fakeFetch(200, {
        action: "GUARDRAIL_INTERVENED",
        assessments: [
          {
            contentPolicy: { filters: [{ type: "HATE", confidence: "HIGH", action: "BLOCKED" }] }
          }
        ]
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("content_hate");
  });

  it("fail-closes on HTTP error", async () => {
    const env = makeEnv({ ...FULL_BEDROCK_ENV, MODERATION_MODE: "bedrock" });
    const r = await bedrockModerate("anything", env, fakeFetch(500, { error: "boom" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bedrock_http_500");
  });

  it("does not echo input in rejection message", async () => {
    const env = makeEnv({ ...FULL_BEDROCK_ENV, MODERATION_MODE: "bedrock" });
    const secret = "very-private-payload-text-12345";
    const r = await bedrockModerate(
      secret,
      env,
      fakeFetch(200, {
        action: "GUARDRAIL_INTERVENED",
        assessments: [{ sensitiveInformationPolicy: { piiEntities: [{ type: "NAME", action: "BLOCKED" }] } }]
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain(secret);
      expect(r.reason).not.toContain(secret);
    }
  });
});

describe("moderateSubmission orchestrator", () => {
  const opts = { minChars: 3, maxChars: 700 };

  it("deterministic_only: skips bedrock entirely", async () => {
    const env = makeEnv({ MODERATION_MODE: "deterministic_only", TMAYD_ALLOW_DETERMINISTIC_ONLY_IN_PROD: "true" });
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await moderateSubmission("today was unremarkable and slow", env, opts, fetcher);
    expect(r.ok).toBe(true);
    expect(called).toBe(false);
  });

  it("bedrock mode: regex blocks before AWS call", async () => {
    const env = makeEnv({ ...FULL_BEDROCK_ENV, MODERATION_MODE: "bedrock" });
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response(JSON.stringify({ action: "NONE" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await moderateSubmission("read https://example.com today", env, opts, fetcher);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("url");
    expect(called).toBe(false);
  });

  it("bedrock mode: calls AWS when det layer passes", async () => {
    const env = makeEnv({ ...FULL_BEDROCK_ENV, MODERATION_MODE: "bedrock" });
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response(JSON.stringify({ action: "NONE" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await moderateSubmission("today was unremarkable and slow", env, opts, fetcher);
    expect(r.ok).toBe(true);
    expect(called).toBe(true);
    if (r.ok) expect(r.moderationVersion).toMatch(/\+bedrock$/);
  });

  it("bedrock mode without credentials: fails closed", async () => {
    const env = makeEnv({ MODERATION_MODE: "bedrock" });
    const r = await moderateSubmission("today was unremarkable and slow", env, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bedrock_not_configured");
  });

  it("unknown mode: fails closed", async () => {
    const env = makeEnv({ MODERATION_MODE: "wishful" });
    const r = await moderateSubmission("today was unremarkable and slow", env, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("moderation_misconfigured");
  });

  it("strict mode rejects on bedrock intervention", async () => {
    const env = makeEnv({ ...FULL_BEDROCK_ENV, MODERATION_MODE: "strict" });
    const fetcher = fakeFetch(200, {
      action: "GUARDRAIL_INTERVENED",
      assessments: [{ contentPolicy: { filters: [{ type: "VIOLENCE", action: "BLOCKED" }] } }]
    });
    const r = await moderateSubmission("today was unremarkable and slow", env, opts, fetcher);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("content_violence");
  });
});

describe("moderationReady", () => {
  it("deterministic_only with flag: ready", () => {
    expect(
      moderationReady(
        makeEnv({ MODERATION_MODE: "deterministic_only", TMAYD_ALLOW_DETERMINISTIC_ONLY_IN_PROD: "true" })
      ).ready
    ).toBe(true);
  });
  it("deterministic_only without flag: not ready", () => {
    expect(
      moderationReady(
        makeEnv({ MODERATION_MODE: "deterministic_only", TMAYD_ALLOW_DETERMINISTIC_ONLY_IN_PROD: "false" })
      ).ready
    ).toBe(false);
  });
  it("bedrock with credentials: ready", () => {
    expect(moderationReady(makeEnv({ ...FULL_BEDROCK_ENV, MODERATION_MODE: "bedrock" })).ready).toBe(true);
  });
  it("bedrock without credentials: not ready", () => {
    expect(moderationReady(makeEnv({ MODERATION_MODE: "bedrock" })).ready).toBe(false);
  });
});
