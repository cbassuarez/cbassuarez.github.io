import type { Env } from "../types";

export function isProd(env: Env): boolean {
  return env.TMAYD_ENV === "production";
}

function allowedOriginsFromEnv(env: Env): string[] {
  return env.TMAYD_ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsHeadersFor(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedOriginsFromEnv(env);
  const isDev = !isProd(env);
  const allowOrigin =
    isDev || allowed.includes(origin) ? origin || "*" : allowed[0] || "";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

export function corsPreflight(request: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeadersFor(request, env) });
}

export function json(
  body: unknown,
  init: ResponseInit = {},
  request?: Request,
  env?: Env
): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  };
  if (request && env) {
    Object.assign(headers, corsHeadersFor(request, env));
  }
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return crypto.randomUUID();
}

export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes = 8 * 1024
): Promise<T | null> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
