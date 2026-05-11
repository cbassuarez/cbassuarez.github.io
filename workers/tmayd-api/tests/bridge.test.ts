import { SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTables, ensureMigrations, seedDefaults, seedFreshBridge } from "./setup";

const BRIDGE_TOKEN = "test-bridge-token-xxxxxxxxxxxxxxxxxx";

beforeAll(async () => {
  await ensureMigrations();
});

beforeEach(async () => {
  await clearTables();
  await seedDefaults();
  await seedFreshBridge();
});

async function bridgePost(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return SELF.fetch(`https://api.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...headers
    },
    body: JSON.stringify(body)
  });
}

async function publicPost(text: string): Promise<{ publicCode: string }> {
  const res = await SELF.fetch("https://api.test/api/tmayd/submissions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": `203.0.113.${Math.floor(Math.random() * 200) + 10}`
    },
    body: JSON.stringify({ text, consent: true, turnstileToken: "test" })
  });
  return (await res.json()) as { publicCode: string };
}

describe("bridge auth", () => {
  it("rejects heartbeat without bearer", async () => {
    const res = await SELF.fetch("https://api.test/api/tmayd/bridge/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bridge_id: "x" })
    });
    expect(res.status).toBe(401);
  });

  it("rejects heartbeat with wrong token", async () => {
    const res = await SELF.fetch("https://api.test/api/tmayd/bridge/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer nope" },
      body: JSON.stringify({ bridge_id: "x" })
    });
    expect(res.status).toBe(401);
  });
});

describe("bridge heartbeat", () => {
  it("upserts heartbeat row", async () => {
    const res = await bridgePost("/api/tmayd/bridge/heartbeat", {
      bridge_id: "tmayd-bridge",
      status: "idle",
      printer_online: true,
      camera_online: false,
      local_queue_depth: 0
    });
    expect(res.status).toBe(200);
    const { env } = await import("cloudflare:test");
    const row = await (env.DB as D1Database)
      .prepare("SELECT status, printer_online FROM bridge_heartbeats WHERE bridge_id = ?1")
      .bind("tmayd-bridge")
      .first();
    expect((row as { status: string }).status).toBe("idle");
    expect((row as { printer_online: number }).printer_online).toBe(1);
  });
});

describe("bridge pull/ack", () => {
  it("leases a queued job and returns acceptedText", async () => {
    const { publicCode } = await publicPost("today was unremarkable and the rain was steady");
    const res = await bridgePost("/api/tmayd/bridge/jobs/pull", { max: 1, bridge_id: "tmayd-bridge" });
    expect(res.status).toBe(200);
    const data = await res.json() as { jobs: Array<{ publicCode: string; acceptedText: string; leaseId: string }> };
    expect(data.jobs.length).toBe(1);
    expect(data.jobs[0].publicCode).toBe(publicCode);
    expect(data.jobs[0].acceptedText.length).toBeGreaterThan(0);
    expect(typeof data.jobs[0].leaseId).toBe("string");
  });

  it("does not re-lease a leased job before expiry", async () => {
    await publicPost("today was unremarkable and the rain was steady");
    await bridgePost("/api/tmayd/bridge/jobs/pull", { max: 1 });
    const second = await bridgePost("/api/tmayd/bridge/jobs/pull", { max: 1 });
    const data = await second.json() as { jobs: unknown[] };
    expect(data.jobs.length).toBe(0);
  });

  it("ack marks job + submission printed", async () => {
    const { publicCode } = await publicPost("today was unremarkable and the rain was steady");
    const pull = await bridgePost("/api/tmayd/bridge/jobs/pull", { max: 1 });
    const pullData = await pull.json() as { jobs: Array<{ publicCode: string; leaseId: string }> };
    const job = pullData.jobs[0];

    const ack = await bridgePost(
      `/api/tmayd/bridge/jobs/${job.publicCode}/printed`,
      { lease_id: job.leaseId }
    );
    expect(ack.status).toBe(200);

    const { env } = await import("cloudflare:test");
    const subRow = await (env.DB as D1Database)
      .prepare("SELECT status FROM submissions WHERE public_code = ?1")
      .bind(publicCode)
      .first();
    expect((subRow as { status: string }).status).toBe("printed");
    const jobRow = await (env.DB as D1Database)
      .prepare("SELECT job_state FROM print_jobs WHERE public_code = ?1")
      .bind(publicCode)
      .first();
    expect((jobRow as { job_state: string }).job_state).toBe("printed");
  });

  it("duplicate ack is idempotent", async () => {
    const { publicCode } = await publicPost("today was unremarkable and the rain was steady");
    const pull = await bridgePost("/api/tmayd/bridge/jobs/pull", { max: 1 });
    const job = (await pull.json() as { jobs: Array<{ publicCode: string; leaseId: string }> }).jobs[0];
    const first = await bridgePost(
      `/api/tmayd/bridge/jobs/${publicCode}/printed`,
      { lease_id: job.leaseId }
    );
    expect(first.status).toBe(200);
    const second = await bridgePost(
      `/api/tmayd/bridge/jobs/${publicCode}/printed`,
      { lease_id: job.leaseId }
    );
    expect(second.status).toBe(200);
    const data = await second.json() as { idempotent?: boolean };
    expect(data.idempotent).toBe(true);
  });

  it("lease expiry re-queues the job", async () => {
    const { publicCode } = await publicPost("today was unremarkable and the rain was steady");
    await bridgePost("/api/tmayd/bridge/jobs/pull", { max: 1 });

    const { env } = await import("cloudflare:test");
    await (env.DB as D1Database)
      .prepare("UPDATE print_jobs SET leased_until = ?2 WHERE public_code = ?1")
      .bind(publicCode, new Date(Date.now() - 60_000).toISOString())
      .run();

    const second = await bridgePost("/api/tmayd/bridge/jobs/pull", { max: 1 });
    const data = await second.json() as { jobs: Array<{ publicCode: string }> };
    expect(data.jobs.length).toBe(1);
    expect(data.jobs[0].publicCode).toBe(publicCode);
  });

  it("failed ack re-queues unless dead", async () => {
    const { publicCode } = await publicPost("today was unremarkable and the rain was steady");
    const pull = await bridgePost("/api/tmayd/bridge/jobs/pull", { max: 1 });
    const job = (await pull.json() as { jobs: Array<{ publicCode: string; leaseId: string }> }).jobs[0];
    const fail = await bridgePost(
      `/api/tmayd/bridge/jobs/${publicCode}/failed`,
      { lease_id: job.leaseId, error: "printer timed out" }
    );
    expect(fail.status).toBe(200);
    const data = await fail.json() as { requeued: boolean };
    expect(data.requeued).toBe(true);
  });
});
