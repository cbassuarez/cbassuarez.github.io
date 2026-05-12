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

describe("/d/:publicCode resolver", () => {
  // Direct row insert keeps these tests independent of the submission /
  // moderation / rate-limit pipeline. The resolver only cares that a row
  // exists with the given public_code.
  async function seedSubmission(publicCode: string, status = "accepted"): Promise<string> {
    const { env } = await import("cloudflare:test");
    const id = `id-${publicCode}`;
    await (env.DB as D1Database)
      .prepare(
        "INSERT INTO submissions (id, public_code, accepted_text, display_name, status, moderation_version, created_at) " +
          "VALUES (?1, ?2, ?3, NULL, ?4, 'v1', ?5)"
      )
      .bind(id, publicCode, "secret accepted text not exposed by resolver", status, new Date().toISOString())
      .run();
    return id;
  }

  async function getNoRedirect(path: string): Promise<Response> {
    return SELF.fetch(`https://api.test${path}`, {
      redirect: "manual",
      headers: { origin: ORIGIN }
    });
  }

  it("redirects 302 to frontend day route for a known publicCode", async () => {
    const code = "DAY-20260511-0001";
    await seedSubmission(code);

    const res = await getNoRedirect(`/d/${code}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/labs/tell-me-about-your-day/day/${code}`);
  });

  it("returns 404 for a well-formed but unknown publicCode", async () => {
    const res = await getNoRedirect("/d/DAY-20260511-9999");
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns 404 for malformed publicCode (wrong prefix)", async () => {
    const res = await getNoRedirect("/d/NIGHT-20260511-0001");
    expect(res.status).toBe(404);
  });

  it("returns 404 for malformed publicCode (too few seq digits)", async () => {
    const res = await getNoRedirect("/d/DAY-20260511-1");
    expect(res.status).toBe(404);
  });

  it("returns 404 for malformed publicCode (non-numeric tail)", async () => {
    const res = await getNoRedirect("/d/DAY-20260511-abcd");
    expect(res.status).toBe(404);
  });

  it("accepts 5+ digit sequence (\\d{4,}) per format spec", async () => {
    const code = "DAY-20260511-12345";
    await seedSubmission(code);

    const res = await getNoRedirect(`/d/${code}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/labs/tell-me-about-your-day/day/${code}`);
  });

  it("does not leak internal IDs, accepted text, or moderation metadata", async () => {
    const code = "DAY-20260511-0007";
    const internalId = await seedSubmission(code);

    const res = await getNoRedirect(`/d/${code}`);
    const body = await res.text();
    // The internal submission UUID is never sent; neither is the raw text.
    expect(body).not.toContain(internalId);
    expect(body).not.toContain("secret accepted text");
    expect(body).not.toContain("moderation_version");
    expect(body).not.toContain("v1");
  });

  it("404 body is opaque (no row details)", async () => {
    const res = await getNoRedirect("/d/DAY-20260511-9998");
    const body = await res.text();
    expect(body).not.toContain("submission");
    expect(body).not.toContain("public_code");
    expect(body).not.toContain("DAY-20260511-9998");
  });
});
