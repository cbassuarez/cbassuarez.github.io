import type { Env } from "../types";

/**
 * Constant-time string compare to avoid timing side-channel on token check.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function extractBearer(request: Request): string | null {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice("bearer ".length).trim();
}

export function authBridge(request: Request, env: Env): { ok: boolean; reason: string } {
  if (!env.TMAYD_BRIDGE_TOKEN) {
    return { ok: false, reason: "bridge_token_not_configured" };
  }
  const token = extractBearer(request);
  if (!token) return { ok: false, reason: "missing_bearer" };
  return safeEqual(token, env.TMAYD_BRIDGE_TOKEN)
    ? { ok: true, reason: "ok" }
    : { ok: false, reason: "bad_bridge_token" };
}

export function authAdmin(request: Request, env: Env): { ok: boolean; reason: string } {
  if (!env.TMAYD_ADMIN_TOKEN) {
    return { ok: false, reason: "admin_token_not_configured" };
  }
  const token = extractBearer(request);
  if (!token) return { ok: false, reason: "missing_bearer" };
  return safeEqual(token, env.TMAYD_ADMIN_TOKEN)
    ? { ok: true, reason: "ok" }
    : { ok: false, reason: "bad_admin_token" };
}

/**
 * Hashes CF-Connecting-IP with a per-deployment salt. Never logs raw IP.
 * Result is short hex prefix; collisions are tolerable for rate limiting.
 */
export async function hashClientIp(request: Request, env: Env): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const salt = env.TMAYD_RATE_HASH_SALT || "tmayd-default-salt";
  const data = new TextEncoder().encode(`${salt}\n${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 16; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
