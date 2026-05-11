-- TMAYD initial schema.
-- All timestamps are ISO-8601 UTC strings (TEXT) to keep D1 portable.

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS day_counters (
  date     TEXT PRIMARY KEY,                          -- YYYYMMDD
  next_seq INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id                 TEXT PRIMARY KEY,                -- uuid v4
  public_code        TEXT UNIQUE NOT NULL,            -- DAY-YYYYMMDD-NNNN
  accepted_text      TEXT NOT NULL,                   -- only POST-moderation accepted text
  display_name       TEXT,
  status             TEXT NOT NULL,                   -- accepted|queued|pulled|printed|captured|failed
  moderation_version TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  printed_at         TEXT,
  captured_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions (status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions (created_at);

CREATE TABLE IF NOT EXISTS print_jobs (
  id            TEXT PRIMARY KEY,                     -- uuid v4
  public_code   TEXT UNIQUE NOT NULL,
  job_state     TEXT NOT NULL,                        -- queued|leased|pulled|printed|failed|dead
  attempts      INTEGER NOT NULL DEFAULT 0,
  lease_id      TEXT,
  leased_until  TEXT,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  pulled_at     TEXT,
  acked_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_state_lease ON print_jobs (job_state, leased_until);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created_at ON print_jobs (created_at);

CREATE TABLE IF NOT EXISTS captures (
  id           TEXT PRIMARY KEY,
  public_code  TEXT NOT NULL,
  captured_at  TEXT NOT NULL,
  raw_url      TEXT,
  crop_url     TEXT,
  thumb_url    TEXT,
  width        INTEGER DEFAULT 0,
  height       INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_captures_public_code ON captures (public_code);
CREATE INDEX IF NOT EXISTS idx_captures_captured_at ON captures (captured_at);

CREATE TABLE IF NOT EXISTS bridge_heartbeats (
  bridge_id                TEXT PRIMARY KEY,
  status                   TEXT NOT NULL,
  printer_online           INTEGER NOT NULL DEFAULT 0,
  camera_online            INTEGER NOT NULL DEFAULT 0,
  local_queue_depth        INTEGER NOT NULL DEFAULT 0,
  last_printed_public_code TEXT,
  last_error               TEXT,
  last_seen_at             TEXT NOT NULL
);

-- Rate-limit ledger. Stores HASHED IP (HMAC-SHA256 with TMAYD_RATE_HASH_SALT)
-- only. Never raw IP. Old rows are GC'd by the periodic cleanup query in lib/db.
CREATE TABLE IF NOT EXISTS submission_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash      TEXT NOT NULL,                         -- salted HMAC of CF-Connecting-IP
  result       TEXT NOT NULL,                         -- accepted|soft|hard|invalid|rate_limited
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_ip_time ON submission_attempts (ip_hash, created_at);

-- Aggregate rejection counters by reason. NEVER stores raw text.
CREATE TABLE IF NOT EXISTS rejection_counts (
  id          TEXT PRIMARY KEY,                       -- uuid
  reason      TEXT NOT NULL,                          -- url|email|phone|ssn|address|length|profanity|displayname|other
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rejection_reason_time ON rejection_counts (reason, created_at);

-- Seed default settings. Defaults are intentionally conservative:
-- intake is force-closed until an operator opens it.
INSERT INTO settings (key, value, updated_at) VALUES
  ('FORCE_INTAKE_CLOSED',           'true',                                              '1970-01-01T00:00:00Z'),
  ('MAINTENANCE_MESSAGE',           'The machine is being prepared. Intake will open soon.', '1970-01-01T00:00:00Z'),
  ('ALLOW_QUEUE_WHEN_BRIDGE_OFFLINE','false',                                             '1970-01-01T00:00:00Z'),
  ('MAINTENANCE_MODE',              'false',                                             '1970-01-01T00:00:00Z')
ON CONFLICT(key) DO NOTHING;
