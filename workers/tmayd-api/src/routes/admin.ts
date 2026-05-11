import type { Env } from "../types";
import { authAdmin } from "../lib/auth";
import { json, readJsonBody } from "../lib/json";
import { getSetting, setSetting } from "../lib/settings";

const ALLOWED_KEYS = new Set([
  "FORCE_INTAKE_CLOSED",
  "MAINTENANCE_MODE",
  "MAINTENANCE_MESSAGE",
  "ALLOW_QUEUE_WHEN_BRIDGE_OFFLINE"
]);

interface SettingsBody {
  key?: unknown;
  value?: unknown;
}

export async function handleAdminGetSettings(
  request: Request,
  env: Env
): Promise<Response> {
  const auth = authAdmin(request, env);
  if (!auth.ok) return jsonErr(401, auth.reason);
  const values: Record<string, string> = {};
  for (const k of ALLOWED_KEYS) {
    values[k] = await getSetting(env, k, "");
  }
  return json({ ok: true, settings: values }, { status: 200 }, request, env);
}

export async function handleAdminSetSetting(
  request: Request,
  env: Env
): Promise<Response> {
  const auth = authAdmin(request, env);
  if (!auth.ok) return jsonErr(401, auth.reason);
  const body = await readJsonBody<SettingsBody>(request, 4096);
  if (!body || typeof body !== "object") return jsonErr(400, "bad_body");
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const value = typeof body.value === "string" ? body.value.slice(0, 500) : "";
  if (!ALLOWED_KEYS.has(key)) return jsonErr(400, "bad_key");
  if (typeof body.value !== "string") return jsonErr(400, "bad_value");
  await setSetting(env, key, value);
  return json({ ok: true, key, value }, { status: 200 }, request, env);
}

function jsonErr(status: number, reason: string): Response {
  return new Response(JSON.stringify({ ok: false, reason }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
