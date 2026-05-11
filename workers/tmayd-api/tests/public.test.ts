import { SELF } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTables, ensureMigrations, seedDefaults, seedFreshBridge } from "./setup";

const ORIGIN = "https://cbassuarez.com";

beforeAll(async () => {
  await ensureMigrations();
});

beforeEach(async () => {
  await clearTables();
  await seedDefaults();
  await seedFreshBridge();
});

async function get(path: string): Promise<Response> {
  return SELF.fetch(`https://api.test${path}`, {
    headers: { origin: ORIGIN }
  });
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return SELF.fetch(`https://api.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "cf-connecting-ip": "203.0.113.7",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

describe("public read endpoints", () => {
  it("status returns normalised shape", async () => {
    const res = await get("/api/tmayd/status");
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data).toEqual(
      expect.objectContaining({
        intakeOpen: expect.any(Boolean),
        printingOpen: expect.any(Boolean),
        archiveOpen: expect.any(Boolean),
        lastHeartbeatAt: expect.any(String),
        message: expect.any(String),
        status: expect.any(String)
      })
    );
  });

  it("live/latest returns inactive shape", async () => {
    const res = await get("/api/tmayd/live/latest");
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.status).toBe("inactive");
    expect(data.imageUrl).toBe("");
    expect(data.width).toBe(0);
  });

  it("reels/today returns empty manifest", async () => {
    const res = await get("/api/tmayd/reels/today");
    expect(res.status).toBe(200);
    const data = await res.json() as { frames: unknown[]; derived: Record<string, unknown> };
    expect(Array.isArray(data.frames)).toBe(true);
    expect(data.frames.length).toBe(0);
    expect(data.derived.contactSheetUrl).toBe("");
  });

  it("reels/:date rejects bad date", async () => {
    const res = await get("/api/tmayd/reels/not-a-date");
    expect(res.status).toBe(404);
  });

  it("reels/:date returns manifest for valid date", async () => {
    const res = await get("/api/tmayd/reels/2026-05-11");
    expect(res.status).toBe(200);
    const data = await res.json() as { date: string };
    expect(data.date).toBe("2026-05-11");
  });
});

describe("submissions: acceptance", () => {
  const validBody = (over: Record<string, unknown> = {}) => ({
    text: "today felt slow and the windows were warm",
    consent: true,
    turnstileToken: "test-token",
    ...over
  });

  it("accepts a valid submission and returns publicCode", async () => {
    const res = await post("/api/tmayd/submissions", validBody());
    expect(res.status).toBe(200);
    const data = await res.json() as { status: string; publicCode: string };
    expect(data.status).toBe("accepted");
    expect(data.publicCode).toMatch(/^DAY-\d{8}-\d{4}$/);
  });

  it("inserts into submissions and creates a print_job", async () => {
    const res = await post("/api/tmayd/submissions", validBody());
    const data = await res.json() as { publicCode: string };
    const { env } = await import("cloudflare:test");
    const sub = await (env.DB as D1Database).prepare(
      "SELECT status, accepted_text FROM submissions WHERE public_code = ?1"
    ).bind(data.publicCode).first();
    expect(sub).toBeTruthy();
    expect((sub as { status: string }).status).toBe("accepted");
    const job = await (env.DB as D1Database).prepare(
      "SELECT job_state FROM print_jobs WHERE public_code = ?1"
    ).bind(data.publicCode).first();
    expect((job as { job_state: string }).job_state).toBe("queued");
  });

  it("requires consent", async () => {
    const res = await post("/api/tmayd/submissions", validBody({ consent: false }));
    expect(res.status).toBe(400);
  });
});

describe("submissions: rejection and no-raw-text persistence", () => {
  async function expectHardReject(text: string): Promise<void> {
    const res = await post("/api/tmayd/submissions", {
      text,
      consent: true,
      turnstileToken: "test-token"
    });
    expect(res.status).toBe(400);
    const data = await res.json() as { status: string; kind: string; message: string };
    expect(data.status).toBe("rejected");
    expect(data.kind).toBe("hard");

    // Critical: raw text must never be persisted.
    const { env } = await import("cloudflare:test");
    const subs = await (env.DB as D1Database).prepare(
      "SELECT accepted_text FROM submissions"
    ).all();
    for (const row of (subs.results as Array<{ accepted_text: string }>)) {
      expect(row.accepted_text).not.toContain(text);
    }
    // And not echoed back in response either.
    expect(data.message.toLowerCase()).not.toContain(text.toLowerCase());
  }

  it("rejects URLs without persisting", async () => {
    await expectHardReject("today I read https://example.com/very-private and felt fine");
  });

  it("rejects bare domains without persisting", async () => {
    await expectHardReject("today I scrolled example.com and rested afterwards too");
  });

  it("rejects emails without persisting", async () => {
    await expectHardReject("write me at alice.example@example.com if you also feel slow");
  });

  it("rejects phone numbers without persisting", async () => {
    await expectHardReject("today my dad called 415-555-1212 and we talked for hours");
  });

  it("rejects short messages", async () => {
    const res = await post("/api/tmayd/submissions", {
      text: "hi",
      consent: true,
      turnstileToken: "test-token"
    });
    expect(res.status).toBe(400);
  });

  it("rejects messages over max chars", async () => {
    const text = "a".repeat(800);
    const res = await post("/api/tmayd/submissions", {
      text,
      consent: true,
      turnstileToken: "test-token"
    });
    expect(res.status).toBe(400);
  });
});

describe("submissions: intake gates", () => {
  it("returns unavailable when force-closed", async () => {
    await seedDefaults({ FORCE_INTAKE_CLOSED: "true" });
    const res = await post("/api/tmayd/submissions", {
      text: "today was a normal kind of day, nothing in particular happened",
      consent: true,
      turnstileToken: "test-token"
    });
    expect(res.status).toBe(503);
    const data = await res.json() as { status: string };
    expect(data.status).toBe("unavailable");
  });

  it("returns unavailable when bridge stale", async () => {
    const { env } = await import("cloudflare:test");
    await (env.DB as D1Database).prepare(
      "UPDATE bridge_heartbeats SET last_seen_at = ?1"
    ).bind(new Date(Date.now() - 5 * 60 * 1000).toISOString()).run();

    const res = await post("/api/tmayd/submissions", {
      text: "today was a normal kind of day, nothing in particular happened",
      consent: true,
      turnstileToken: "test-token"
    });
    expect(res.status).toBe(503);
  });
});

describe("submissions: rate limiting", () => {
  it("returns 429 after exceeding window cap", async () => {
    const body = {
      text: "today was a normal kind of day, nothing in particular happened",
      consent: true,
      turnstileToken: "test-token"
    };
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await post("/api/tmayd/submissions", body);
      lastStatus = res.status;
      if (res.status === 429) break;
    }
    expect(lastStatus).toBe(429);
  });
});
