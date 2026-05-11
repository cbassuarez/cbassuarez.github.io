import type { Env } from "../types";
import { nowIso } from "./json";

export interface RateCheckResult {
  ok: boolean;
  remaining: number;
  resetAt: string;
}

/**
 * Application-level rate limit, backed by D1.
 *
 * Counts submission attempts (any outcome) within a sliding window keyed by
 * hashed IP. If `windowSeconds * maxRequests` is exceeded, returns ok=false.
 */
export async function checkSubmissionRate(
  env: Env,
  ipHash: string
): Promise<RateCheckResult> {
  const windowSeconds = parseInt(env.TMAYD_RATE_WINDOW_SECONDS, 10) || 600;
  const maxRequests = parseInt(env.TMAYD_RATE_MAX_REQUESTS, 10) || 3;
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM submission_attempts WHERE ip_hash = ?1 AND created_at >= ?2"
  )
    .bind(ipHash, cutoff)
    .first<{ c: number }>();

  const count = row?.c ?? 0;
  const remaining = Math.max(0, maxRequests - count);
  const resetAt = new Date(Date.now() + windowSeconds * 1000).toISOString();
  return { ok: count < maxRequests, remaining, resetAt };
}

export async function recordAttempt(
  env: Env,
  ipHash: string,
  result: string
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO submission_attempts (ip_hash, result, created_at) VALUES (?1, ?2, ?3)"
  )
    .bind(ipHash, result, nowIso())
    .run();
}

/**
 * Best-effort use of the platform rate-limit binding (coarse spike control).
 * Returns true if allowed or binding is missing.
 */
export async function platformRateOk(
  binding: Env["RATE_LIMIT_TMAYD_SUBMIT"] | undefined,
  key: string
): Promise<boolean> {
  if (!binding) return true;
  try {
    const { success } = await binding.limit({ key });
    return success;
  } catch {
    return true; // fail open on platform binding hiccup
  }
}

/**
 * Periodic best-effort GC. Runs cheaply on every submission attempt.
 * Removes attempts older than the configured window * 4.
 */
export async function maybeGcAttempts(env: Env): Promise<void> {
  if (Math.random() > 0.05) return;
  const windowSeconds = parseInt(env.TMAYD_RATE_WINDOW_SECONDS, 10) || 600;
  const cutoff = new Date(Date.now() - windowSeconds * 4 * 1000).toISOString();
  await env.DB.prepare("DELETE FROM submission_attempts WHERE created_at < ?1")
    .bind(cutoff)
    .run();
}
