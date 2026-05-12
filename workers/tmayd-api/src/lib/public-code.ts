import type { Env } from "../types";

/**
 * Generate the next DAY-YYYYMMDD-NNNN code for the current UTC day.
 *
 * D1 lacks Postgres-style RETURNING-on-update atomicity in all versions, so we
 * use a small retry loop that:
 *   1. INSERT OR IGNORE a (date, 1) row, then SELECT next_seq.
 *   2. UPDATE day_counters SET next_seq = next_seq + 1 WHERE date = ? AND next_seq = ?
 *      — this is a guarded conditional update; if another worker bumped the row,
 *      the WHERE fails and the loop retries.
 *
 * Public codes are also UNIQUE in the submissions table, so any rare race that
 * slipped through still fails the eventual INSERT and we'd retry.
 */
export async function nextPublicCode(env: Env, now = new Date()): Promise<string> {
  const dateKey = formatDateKey(now);

  for (let attempt = 0; attempt < 6; attempt++) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO day_counters (date, next_seq) VALUES (?1, 1)"
    )
      .bind(dateKey)
      .run();

    const row = await env.DB.prepare(
      "SELECT next_seq FROM day_counters WHERE date = ?1"
    )
      .bind(dateKey)
      .first<{ next_seq: number }>();

    const current = row?.next_seq ?? 1;

    const upd = await env.DB.prepare(
      "UPDATE day_counters SET next_seq = next_seq + 1 WHERE date = ?1 AND next_seq = ?2"
    )
      .bind(dateKey, current)
      .run();

    if (upd.meta.changes && upd.meta.changes > 0) {
      return `DAY-${dateKey}-${String(current).padStart(4, "0")}`;
    }
    // Otherwise retry.
  }
  throw new Error("public_code_alloc_exhausted");
}

export function formatDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// Allocator pads to 4 digits, but \d{4,} keeps validation future-proof for the
// unlikely case of >9999 submissions in a single UTC day (the daily counter
// would naturally grow to 5+ digits without padding). Format itself is
// unchanged: DAY-YYYYMMDD-NNNN.
const PUBLIC_CODE_RE = /^DAY-\d{8}-\d{4,}$/;
export function isValidPublicCode(code: string): boolean {
  return typeof code === "string" && PUBLIC_CODE_RE.test(code);
}
