import type { Env } from "../types";
import { isProd } from "./json";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Cloudflare-published Turnstile test keys that always succeed.
const TEST_SECRETS = new Set([
  "1x0000000000000000000000000000000AA", // "always passes" test secret
  "2x0000000000000000000000000000000AA"  // "always blocks" test secret
]);

export interface TurnstileResult {
  ok: boolean;
  reason: string;
}

export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string | undefined,
  env: Env
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY;
  const allowTest = env.TMAYD_ALLOW_TEST_TURNSTILE === "true";

  if (!secret) {
    if (isProd(env)) {
      return { ok: false, reason: "turnstile_not_configured" };
    }
    return { ok: true, reason: "turnstile_skipped_dev" };
  }

  if (!token) {
    return { ok: false, reason: "missing_turnstile_token" };
  }

  // Dev/test-only bypass when explicitly opted in and a test secret is set.
  if (allowTest && TEST_SECRETS.has(secret)) {
    return { ok: token.length > 0, reason: "turnstile_test_mode" };
  }

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    if (!res.ok) {
      return { ok: false, reason: `turnstile_http_${res.status}` };
    }
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true, reason: "ok" };
    const codes = (data["error-codes"] || []).join(",") || "unknown";
    return { ok: false, reason: `turnstile_failed:${codes}` };
  } catch (err) {
    return { ok: false, reason: "turnstile_network_error" };
  }
}
