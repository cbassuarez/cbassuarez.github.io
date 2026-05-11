// Environment bindings declared in wrangler.jsonc. Keep in sync.

export interface Env {
  DB: D1Database;
  CAPTURES?: R2Bucket;

  RATE_LIMIT_TMAYD_SUBMIT?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  RATE_LIMIT_TMAYD_BRIDGE?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };

  // Vars
  TMAYD_ENV: string; // "production" | "development" | "test"
  TMAYD_ALLOWED_ORIGINS: string;
  TMAYD_HEARTBEAT_STALE_SECONDS: string;
  TMAYD_RATE_WINDOW_SECONDS: string;
  TMAYD_RATE_MAX_REQUESTS: string;
  TMAYD_MIN_CHARS: string;
  TMAYD_MAX_CHARS: string;
  MODERATION_MODE: string; // "deterministic_only" | "bedrock" | "strict"
  TMAYD_ALLOW_TEST_TURNSTILE: string;
  TMAYD_ALLOW_DETERMINISTIC_ONLY_IN_PROD: string;
  TMAYD_LEASE_SECONDS: string;
  TMAYD_MAX_ATTEMPTS: string;

  // Secrets
  TURNSTILE_SECRET_KEY?: string;
  TMAYD_BRIDGE_TOKEN?: string;
  TMAYD_ADMIN_TOKEN?: string;
  TMAYD_RATE_HASH_SALT?: string;
  BEDROCK_GUARDRAIL_ID?: string;
  BEDROCK_GUARDRAIL_VERSION?: string;
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
}

export type ModerationResult =
  | { ok: true; cleaned: string; moderationVersion: string }
  | { ok: false; kind: "soft" | "hard"; reason: string; message: string };

export interface PublicStatus {
  status:
    | "inactive"
    | "offline"
    | "idle"
    | "printing"
    | "capturing"
    | "reset_required"
    | "maintenance";
  intakeOpen: boolean;
  printingOpen: boolean;
  archiveOpen: boolean;
  lastHeartbeatAt: string;
  message: string;
}

export const MODERATION_VERSION = "tmayd-det-1";
