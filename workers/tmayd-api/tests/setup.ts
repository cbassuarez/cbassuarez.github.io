import { env, applyD1Migrations } from "cloudflare:test";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    TMAYD_BRIDGE_TOKEN?: string;
    TMAYD_ADMIN_TOKEN?: string;
    [k: string]: unknown;
  }
}

let migrated = false;

export async function ensureMigrations(): Promise<void> {
  if (migrated) return;
  await applyD1Migrations(env.DB as D1Database, [
    {
      name: "0001_init.sql",
      queries: (await readMigration("0001_init.sql"))
    }
  ]);
  migrated = true;
}

async function readMigration(name: string): Promise<string[]> {
  // Inline the migration here at test time to avoid file I/O concerns in worker
  // test pool. Source of truth remains migrations/*.sql; mirrored for the test
  // harness only. If you edit the migration, mirror the change here.
  if (name === "0001_init.sql") {
    return SQL_0001.split(";").map((s) => s.trim()).filter(Boolean).map((s) => s + ";");
  }
  return [];
}

const SQL_0001 = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS day_counters (date TEXT PRIMARY KEY, next_seq INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, public_code TEXT UNIQUE NOT NULL, accepted_text TEXT NOT NULL, display_name TEXT, status TEXT NOT NULL, moderation_version TEXT NOT NULL, created_at TEXT NOT NULL, printed_at TEXT, captured_at TEXT);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions (status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions (created_at);
CREATE TABLE IF NOT EXISTS print_jobs (id TEXT PRIMARY KEY, public_code TEXT UNIQUE NOT NULL, job_state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, lease_id TEXT, leased_until TEXT, last_error TEXT, created_at TEXT NOT NULL, pulled_at TEXT, acked_at TEXT);
CREATE INDEX IF NOT EXISTS idx_print_jobs_state_lease ON print_jobs (job_state, leased_until);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created_at ON print_jobs (created_at);
CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY, public_code TEXT NOT NULL, captured_at TEXT NOT NULL, raw_url TEXT, crop_url TEXT, thumb_url TEXT, width INTEGER DEFAULT 0, height INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_captures_public_code ON captures (public_code);
CREATE INDEX IF NOT EXISTS idx_captures_captured_at ON captures (captured_at);
CREATE TABLE IF NOT EXISTS bridge_heartbeats (bridge_id TEXT PRIMARY KEY, status TEXT NOT NULL, printer_online INTEGER NOT NULL DEFAULT 0, camera_online INTEGER NOT NULL DEFAULT 0, local_queue_depth INTEGER NOT NULL DEFAULT 0, last_printed_public_code TEXT, last_error TEXT, last_seen_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submission_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_attempts_ip_time ON submission_attempts (ip_hash, created_at);
CREATE TABLE IF NOT EXISTS rejection_counts (id TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_rejection_reason_time ON rejection_counts (reason, created_at);
`;

export async function clearTables(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM submissions"),
    env.DB.prepare("DELETE FROM print_jobs"),
    env.DB.prepare("DELETE FROM bridge_heartbeats"),
    env.DB.prepare("DELETE FROM submission_attempts"),
    env.DB.prepare("DELETE FROM rejection_counts"),
    env.DB.prepare("DELETE FROM day_counters"),
    env.DB.prepare("DELETE FROM settings")
  ]);
}

export async function seedDefaults(overrides: Record<string, string> = {}): Promise<void> {
  const defaults: Record<string, string> = {
    FORCE_INTAKE_CLOSED: "false",
    MAINTENANCE_MODE: "false",
    MAINTENANCE_MESSAGE: "",
    ALLOW_QUEUE_WHEN_BRIDGE_OFFLINE: "false",
    ...overrides
  };
  for (const [k, v] of Object.entries(defaults)) {
    await env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
      .bind(k, v, new Date().toISOString())
      .run();
  }
}

export async function seedFreshBridge(): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO bridge_heartbeats (bridge_id, status, printer_online, camera_online, local_queue_depth, last_seen_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(bridge_id) DO UPDATE SET status=excluded.status, printer_online=excluded.printer_online, last_seen_at=excluded.last_seen_at"
  )
    .bind("tmayd-bridge", "idle", 1, 0, 0, new Date().toISOString())
    .run();
}
