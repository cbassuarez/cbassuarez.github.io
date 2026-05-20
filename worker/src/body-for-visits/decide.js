// Server-agnostic decision logic for a qualify request.
// The DO calls this with the small slice of state it has fetched from SQLite;
// everything below is pure and testable.

import { classifyUA } from "./bot.js";

export const SESSION_QUOTA_LIMIT_DEFAULT = 5;
export const SESSION_QUOTA_WINDOW_MS_DEFAULT = 60 * 60 * 1000; // 1h

// inputs:
//   ua            — raw user-agent string
//   sessionWindowCount — human events from this session inside the rolling quota window
//   prevRole      — role of the last token currently in body_json, or null
//   prevToken     — the last token string in body_json, or null
//   humanEventIndex — 1-based index for THIS event if it would be appended
//                     (i.e. existing_human_event_count + 1)
//   seed          — integer for deterministic selection (e.g. low 32 bits of ip_hash)
//   now           — ms epoch (defaults to Date.now())
//   sessionQuotaLimit — max accepted human events per session quota window
//   model         — rolling context from inferModel(); shapes selection
//                   toward the corpus's own recent history.
//   selector      — required generation function (the net-backed selector
//                   built by the Durable Object).
//
// returns one of:
//   { action: "cooldown" }
//   { action: "bot", bucket }
//   { action: "withhold", reason }
//   { action: "append", token, role, ua_class: "browser" }
export function decideQualify({
  ua,
  sessionWindowCount = 0,
  prevRole,
  prevToken,
  humanEventIndex,
  seed,
  now = Date.now(),
  sessionQuotaLimit = SESSION_QUOTA_LIMIT_DEFAULT,
  model = null,
  selector,
}) {
  const bot = classifyUA(ua);
  if (bot.isBot) {
    return { action: "bot", bucket: bot.bucket };
  }
  if (Number(sessionWindowCount || 0) >= sessionQuotaLimit) {
    return { action: "cooldown" };
  }
  if (typeof selector !== "function") {
    return { action: "withhold", reason: "no_selector" };
  }
  const next = selector(
    prevRole,
    humanEventIndex,
    seed >>> 0,
    prevToken,
    model
  );
  if (!next || !next.token || !next.role) {
    return { action: "withhold", reason: "generator" };
  }
  const { token, role } = next;
  return { action: "append", token, role, ua_class: "browser" };
}
