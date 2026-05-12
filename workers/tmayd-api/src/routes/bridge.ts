import type { Env } from "../types";
import { authBridge } from "../lib/auth";
import { json, nowIso, readJsonBody, uuid } from "../lib/json";
import { platformRateOk } from "../lib/rate-limit";
import { isValidPublicCode } from "../lib/public-code";

interface HeartbeatBody {
  bridge_id?: unknown;
  status?: unknown;
  printer_online?: unknown;
  camera_online?: unknown;
  local_queue_depth?: unknown;
  last_printed_public_code?: unknown;
  last_error?: unknown;
}

export async function handleHeartbeat(request: Request, env: Env): Promise<Response> {
  const auth = authBridge(request, env);
  if (!auth.ok) return jsonErr(401, auth.reason);

  if (!(await platformRateOk(env.RATE_LIMIT_TMAYD_BRIDGE, "heartbeat"))) {
    return jsonErr(429, "rate_limited");
  }

  const body = await readJsonBody<HeartbeatBody>(request, 4096);
  if (!body || typeof body !== "object") return jsonErr(400, "bad_body");

  const bridgeId =
    typeof body.bridge_id === "string" && body.bridge_id.trim()
      ? body.bridge_id.trim().slice(0, 64)
      : "tmayd-bridge";
  const status = typeof body.status === "string" ? body.status.slice(0, 32) : "unknown";
  const printerOnline = body.printer_online ? 1 : 0;
  const cameraOnline = body.camera_online ? 1 : 0;
  const queueDepth =
    typeof body.local_queue_depth === "number" ? Math.max(0, body.local_queue_depth | 0) : 0;
  const lastPrinted =
    typeof body.last_printed_public_code === "string" &&
    isValidPublicCode(body.last_printed_public_code)
      ? body.last_printed_public_code
      : null;
  const lastError =
    typeof body.last_error === "string"
      ? body.last_error.slice(0, 200).replace(/[\r\n]+/g, " ")
      : null;

  await env.DB.prepare(
    "INSERT INTO bridge_heartbeats (bridge_id, status, printer_online, camera_online, local_queue_depth, last_printed_public_code, last_error, last_seen_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) " +
      "ON CONFLICT(bridge_id) DO UPDATE SET " +
      "status=excluded.status, printer_online=excluded.printer_online, camera_online=excluded.camera_online, " +
      "local_queue_depth=excluded.local_queue_depth, last_printed_public_code=excluded.last_printed_public_code, " +
      "last_error=excluded.last_error, last_seen_at=excluded.last_seen_at"
  )
    .bind(bridgeId, status, printerOnline, cameraOnline, queueDepth, lastPrinted, lastError, nowIso())
    .run();

  // Count submissions that are awaiting human moderation. The bridge surfaces
  // this to the local status light so the operator can see "something is in
  // the queue, just not approved yet" without needing the dashboard.
  const pending = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM submissions WHERE status = 'accepted'"
  ).first<{ n: number }>();
  const pendingModeration = pending && typeof pending.n === "number" ? pending.n : 0;

  return json(
    { ok: true, observedAt: nowIso(), pending_moderation: pendingModeration },
    { status: 200 },
    request,
    env
  );
}

interface PullBody {
  bridge_id?: unknown;
  max?: unknown;
}

interface JobRow {
  id: string;
  public_code: string;
  job_state: string;
  attempts: number;
  lease_id: string | null;
  leased_until: string | null;
  created_at: string;
  pulled_at: string | null;
}

export async function handlePull(request: Request, env: Env): Promise<Response> {
  const auth = authBridge(request, env);
  if (!auth.ok) return jsonErr(401, auth.reason);
  if (!(await platformRateOk(env.RATE_LIMIT_TMAYD_BRIDGE, "pull"))) {
    return jsonErr(429, "rate_limited");
  }

  const body = (await readJsonBody<PullBody>(request, 1024)) || {};
  const max = Math.min(Math.max(1, (typeof body.max === "number" ? body.max | 0 : 1)), 5);
  const leaseSeconds = parseInt(env.TMAYD_LEASE_SECONDS, 10) || 120;
  const maxAttempts = parseInt(env.TMAYD_MAX_ATTEMPTS, 10) || 5;
  const now = new Date();
  const nowStr = now.toISOString();
  const until = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
  const leaseId = uuid();

  // Find candidates: queued jobs, OR jobs whose lease has expired.
  const candidates = await env.DB.prepare(
    "SELECT id, public_code, job_state, attempts, lease_id, leased_until, created_at, pulled_at " +
      "FROM print_jobs " +
      "WHERE (job_state = 'queued') OR (job_state = 'leased' AND (leased_until IS NULL OR leased_until < ?1)) " +
      "ORDER BY created_at ASC LIMIT ?2"
  )
    .bind(nowStr, max)
    .all<JobRow>();

  const leased: Array<{ publicCode: string; acceptedText: string; displayName: string | null; leaseId: string; attempts: number }> = [];

  for (const row of candidates.results || []) {
    const newAttempts = (row.attempts || 0) + 1;
    if (newAttempts > maxAttempts) {
      await env.DB.prepare(
        "UPDATE print_jobs SET job_state = 'dead', last_error = 'max_attempts_exceeded' WHERE id = ?1"
      )
        .bind(row.id)
        .run();
      continue;
    }

    // Conditional update: only claim if state is what we expect.
    const upd = await env.DB.prepare(
      "UPDATE print_jobs SET job_state = 'leased', lease_id = ?2, leased_until = ?3, attempts = ?4, pulled_at = ?5 " +
        "WHERE id = ?1 AND ((job_state = 'queued') OR (job_state = 'leased' AND (leased_until IS NULL OR leased_until < ?6)))"
    )
      .bind(row.id, leaseId, until, newAttempts, nowStr, nowStr)
      .run();

    if (!upd.meta.changes || upd.meta.changes === 0) continue;

    const sub = await env.DB.prepare(
      "SELECT accepted_text, display_name FROM submissions WHERE public_code = ?1"
    )
      .bind(row.public_code)
      .first<{ accepted_text: string; display_name: string | null }>();
    if (!sub) continue;

    // Reflect on submissions table for visibility.
    await env.DB.prepare(
      "UPDATE submissions SET status = 'pulled' WHERE public_code = ?1 AND status IN ('accepted','queued')"
    )
      .bind(row.public_code)
      .run();

    leased.push({
      publicCode: row.public_code,
      acceptedText: sub.accepted_text,
      displayName: sub.display_name,
      leaseId,
      attempts: newAttempts
    });
  }

  return json(
    {
      ok: true,
      leaseSeconds,
      leasedUntil: until,
      jobs: leased
    },
    { status: 200 },
    request,
    env
  );
}

interface AckBody {
  lease_id?: unknown;
  error?: unknown;
}

export async function handlePrinted(
  request: Request,
  env: Env,
  publicCode: string
): Promise<Response> {
  const auth = authBridge(request, env);
  if (!auth.ok) return jsonErr(401, auth.reason);
  if (!isValidPublicCode(publicCode)) return jsonErr(400, "bad_public_code");
  if (!(await platformRateOk(env.RATE_LIMIT_TMAYD_BRIDGE, "ack"))) {
    return jsonErr(429, "rate_limited");
  }
  const body = (await readJsonBody<AckBody>(request, 1024)) || {};
  const leaseId = typeof body.lease_id === "string" ? body.lease_id : null;
  const now = nowIso();

  // Idempotent: if already printed, return 200 silently.
  const job = await env.DB.prepare(
    "SELECT job_state, lease_id FROM print_jobs WHERE public_code = ?1"
  )
    .bind(publicCode)
    .first<{ job_state: string; lease_id: string | null }>();
  if (!job) return jsonErr(404, "not_found");
  if (job.job_state === "printed") {
    return json({ ok: true, idempotent: true }, { status: 200 }, request, env);
  }

  // Lease check is best-effort: we accept the ack even if lease expired, but
  // require it to match if both sides present a lease_id.
  if (leaseId && job.lease_id && job.lease_id !== leaseId) {
    return jsonErr(409, "lease_mismatch");
  }

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE print_jobs SET job_state = 'printed', acked_at = ?2 WHERE public_code = ?1"
    ).bind(publicCode, now),
    env.DB.prepare(
      "UPDATE submissions SET status = 'printed', printed_at = ?2 WHERE public_code = ?1"
    ).bind(publicCode, now)
  ]);

  return json({ ok: true }, { status: 200 }, request, env);
}

export async function handleFailed(
  request: Request,
  env: Env,
  publicCode: string
): Promise<Response> {
  const auth = authBridge(request, env);
  if (!auth.ok) return jsonErr(401, auth.reason);
  if (!isValidPublicCode(publicCode)) return jsonErr(400, "bad_public_code");
  if (!(await platformRateOk(env.RATE_LIMIT_TMAYD_BRIDGE, "ack"))) {
    return jsonErr(429, "rate_limited");
  }
  const body = (await readJsonBody<AckBody>(request, 1024)) || {};
  const leaseId = typeof body.lease_id === "string" ? body.lease_id : null;
  const errorMsg =
    typeof body.error === "string"
      ? body.error.slice(0, 200).replace(/[\r\n]+/g, " ")
      : null;

  const job = await env.DB.prepare(
    "SELECT job_state, attempts, lease_id FROM print_jobs WHERE public_code = ?1"
  )
    .bind(publicCode)
    .first<{ job_state: string; attempts: number; lease_id: string | null }>();
  if (!job) return jsonErr(404, "not_found");

  if (leaseId && job.lease_id && job.lease_id !== leaseId) {
    return jsonErr(409, "lease_mismatch");
  }

  const maxAttempts = parseInt(env.TMAYD_MAX_ATTEMPTS, 10) || 5;
  const dead = (job.attempts || 0) >= maxAttempts;
  const nextState = dead ? "dead" : "queued";

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE print_jobs SET job_state = ?2, lease_id = NULL, leased_until = NULL, last_error = ?3 WHERE public_code = ?1"
    ).bind(publicCode, nextState, errorMsg),
    env.DB.prepare(
      "UPDATE submissions SET status = CASE WHEN ?3 = 'dead' THEN 'failed' ELSE status END WHERE public_code = ?1"
    ).bind(publicCode, "", nextState)
  ]);

  return json({ ok: true, requeued: !dead }, { status: 200 }, request, env);
}

function jsonErr(status: number, reason: string): Response {
  return new Response(JSON.stringify({ ok: false, reason }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
