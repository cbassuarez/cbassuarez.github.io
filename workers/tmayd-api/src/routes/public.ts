import type { Env } from "../types";
import { isProd, json, nowIso, readJsonBody, uuid } from "../lib/json";
import {
  deterministicModerate,
  moderateDisplayName
} from "../lib/moderation";
import { verifyTurnstile } from "../lib/turnstile";
import { hashClientIp } from "../lib/auth";
import {
  checkSubmissionRate,
  maybeGcAttempts,
  platformRateOk,
  recordAttempt
} from "../lib/rate-limit";
import { nextPublicCode } from "../lib/public-code";
import { resolveStatus, statusFromResolved } from "../lib/settings";

export async function handleStatus(request: Request, env: Env): Promise<Response> {
  const resolved = await resolveStatus(env);
  return json(statusFromResolved(resolved), { status: 200 }, request, env);
}

export async function handleLiveLatest(request: Request, env: Env): Promise<Response> {
  // Camera not wired in this phase.
  return json(
    {
      status: "inactive",
      imageUrl: "",
      observedAt: "",
      width: 0,
      height: 0,
      caption: "Camera not wired yet."
    },
    { status: 200 },
    request,
    env
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function handleReelsToday(request: Request, env: Env): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10);
  return json(emptyManifest(today), { status: 200 }, request, env);
}

export async function handleReelsForDate(
  request: Request,
  env: Env,
  date: string
): Promise<Response> {
  if (!DATE_RE.test(date)) {
    return json({ error: "bad_date" }, { status: 400 }, request, env);
  }
  return json(emptyManifest(date), { status: 200 }, request, env);
}

function emptyManifest(date: string) {
  const compact = date.replace(/-/g, "");
  return {
    date,
    reelId: `R${compact}-A`,
    status: "open",
    generatedAt: nowIso(),
    frames: [],
    derived: {
      contactSheetUrl: "",
      stripUrls: [],
      timelapseUrl: ""
    }
  };
}

interface SubmissionBody {
  text?: unknown;
  consent?: unknown;
  displayName?: unknown;
  turnstileToken?: unknown;
  "cf-turnstile-response"?: unknown;
}

export async function handleSubmission(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody<SubmissionBody>(request);
  if (!body || typeof body !== "object") {
    return json(
      { status: "rejected", kind: "hard", message: "Invalid request body." },
      { status: 400 },
      request,
      env
    );
  }

  if (body.consent !== true) {
    return json(
      {
        status: "rejected",
        kind: "hard",
        message: "Consent is required before submission."
      },
      { status: 400 },
      request,
      env
    );
  }

  const ipHash = await hashClientIp(request, env);

  // Platform-level coarse limiter (best-effort).
  if (!(await platformRateOk(env.RATE_LIMIT_TMAYD_SUBMIT, ipHash))) {
    return json(
      { status: "rate_limited", message: "Too many submissions. Please try again later." },
      { status: 429 },
      request,
      env
    );
  }

  // App-level fine-grained limiter.
  const rate = await checkSubmissionRate(env, ipHash);
  if (!rate.ok) {
    await recordAttempt(env, ipHash, "rate_limited");
    return json(
      { status: "rate_limited", message: "Too many submissions. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Reset": rate.resetAt } },
      request,
      env
    );
  }

  // Apparatus / intake gates.
  const resolved = await resolveStatus(env);
  const intakeOpen =
    !resolved.forceClosed &&
    !resolved.maintenance &&
    (resolved.heartbeatFresh || resolved.allowQueueWhenOffline);

  if (!intakeOpen) {
    await recordAttempt(env, ipHash, "unavailable");
    return json(
      {
        status: "unavailable",
        message:
          resolved.maintenanceMessage ||
          "The machine is temporarily not accepting messages. Please try again later."
      },
      { status: 503 },
      request,
      env
    );
  }

  // Moderation mode gate.
  const mode = env.MODERATION_MODE || "deterministic_only";
  const detOnlyAllowed = env.TMAYD_ALLOW_DETERMINISTIC_ONLY_IN_PROD === "true";
  if (isProd(env) && mode === "deterministic_only" && !detOnlyAllowed) {
    await recordAttempt(env, ipHash, "unavailable");
    return json(
      {
        status: "unavailable",
        message: "The machine is temporarily not accepting messages. Please try again later."
      },
      { status: 503 },
      request,
      env
    );
  }

  // Turnstile verification. Fails closed in production.
  const tokenFromBody =
    typeof body.turnstileToken === "string"
      ? body.turnstileToken
      : typeof body["cf-turnstile-response"] === "string"
        ? (body["cf-turnstile-response"] as string)
        : undefined;
  const ip = request.headers.get("cf-connecting-ip") || undefined;
  const turnstile = await verifyTurnstile(tokenFromBody, ip, env);
  if (!turnstile.ok) {
    await recordAttempt(env, ipHash, "turnstile_failed");
    return json(
      {
        status: "rejected",
        kind: "hard",
        message: "Verification failed. Please reload the page and try again."
      },
      { status: 400 },
      request,
      env
    );
  }

  // Validate + moderate the body. NEVER store raw input until accepted.
  const text = typeof body.text === "string" ? body.text : "";
  const minChars = parseInt(env.TMAYD_MIN_CHARS, 10) || 3;
  const maxChars = parseInt(env.TMAYD_MAX_CHARS, 10) || 700;
  const result = deterministicModerate(text, { minChars, maxChars });
  if (!result.ok) {
    await recordAttempt(env, ipHash, result.kind);
    await env.DB.prepare(
      "INSERT INTO rejection_counts (id, reason, created_at) VALUES (?1, ?2, ?3)"
    )
      .bind(uuid(), result.reason, nowIso())
      .run();
    return json(
      { status: "rejected", kind: result.kind, message: result.message },
      { status: 400 },
      request,
      env
    );
  }

  const displayNameRaw =
    typeof body.displayName === "string" ? body.displayName : "";
  const dn = moderateDisplayName(displayNameRaw);
  if (!dn.ok) {
    await recordAttempt(env, ipHash, dn.kind);
    await env.DB.prepare(
      "INSERT INTO rejection_counts (id, reason, created_at) VALUES (?1, ?2, ?3)"
    )
      .bind(uuid(), dn.reason, nowIso())
      .run();
    return json(
      { status: "rejected", kind: dn.kind, message: dn.message },
      { status: 400 },
      request,
      env
    );
  }

  // Accepted. Allocate publicCode, insert submission + print job.
  const publicCode = await nextPublicCode(env);
  const id = uuid();
  const created = nowIso();

  const tx = env.DB.batch([
    env.DB.prepare(
      "INSERT INTO submissions (id, public_code, accepted_text, display_name, status, moderation_version, created_at) " +
        "VALUES (?1, ?2, ?3, ?4, 'accepted', ?5, ?6)"
    ).bind(id, publicCode, result.cleaned, dn.cleaned || null, result.moderationVersion, created),
    env.DB.prepare(
      "INSERT INTO print_jobs (id, public_code, job_state, attempts, created_at) " +
        "VALUES (?1, ?2, 'queued', 0, ?3)"
    ).bind(uuid(), publicCode, created)
  ]);

  try {
    await tx;
  } catch (err) {
    // If the rare publicCode UNIQUE collision occurs, surface as unavailable;
    // the client can retry. We do NOT echo the raw error.
    await recordAttempt(env, ipHash, "unavailable");
    return json(
      {
        status: "unavailable",
        message: "Could not record submission. Please try again."
      },
      { status: 500 },
      request,
      env
    );
  }

  await recordAttempt(env, ipHash, "accepted");
  await maybeGcAttempts(env);

  return json(
    {
      status: "accepted",
      publicCode,
      message: "Your message entered the print queue."
    },
    { status: 200 },
    request,
    env
  );
}
