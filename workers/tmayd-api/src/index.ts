import type { Env } from "./types";
import { corsPreflight, json } from "./lib/json";
import {
  handleLiveLatest,
  handlePublicCodeRedirect,
  handleReelsForDate,
  handleReelsToday,
  handleStatus,
  handleSubmission
} from "./routes/public";
import {
  handleFailed,
  handleHeartbeat,
  handlePrinted,
  handlePull
} from "./routes/bridge";
import {
  handleAdminGetSettings,
  handleAdminSetSetting
} from "./routes/admin";

const REEL_DATE_RE = /^\/api\/tmayd\/reels\/(\d{4}-\d{2}-\d{2})$/;
const PRINTED_RE = /^\/api\/tmayd\/bridge\/jobs\/(DAY-\d{8}-\d{4,})\/printed$/;
const FAILED_RE = /^\/api\/tmayd\/bridge\/jobs\/(DAY-\d{8}-\d{4,})\/failed$/;
// Public receipt resolver: cbassuarez.com/d/{publicCode}. Matches loosely so
// malformed codes still hit our handler and return 404 instead of leaking
// through to GH Pages.
const PUBLIC_CODE_PATH_RE = /^\/d\/([^/?#]+)\/?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight for browser-facing paths only.
    if (method === "OPTIONS" && path.startsWith("/api/tmayd/")) {
      if (path.startsWith("/api/tmayd/bridge/") || path.startsWith("/api/tmayd/admin/")) {
        return new Response(null, { status: 204 });
      }
      return corsPreflight(request, env);
    }

    try {
      // Public receipt resolver: /d/{publicCode} — what printed rMQRs link to.
      // Matched first so it short-circuits before the /api/tmayd/* table.
      const publicCodeMatch = PUBLIC_CODE_PATH_RE.exec(path);
      if (method === "GET" && publicCodeMatch) {
        return await handlePublicCodeRedirect(request, env, publicCodeMatch[1]);
      }

      // Public GETs
      if (method === "GET" && path === "/api/tmayd/status") {
        return await handleStatus(request, env);
      }
      if (method === "GET" && path === "/api/tmayd/live/latest") {
        return await handleLiveLatest(request, env);
      }
      if (method === "GET" && path === "/api/tmayd/reels/today") {
        return await handleReelsToday(request, env);
      }
      const reelMatch = REEL_DATE_RE.exec(path);
      if (method === "GET" && reelMatch) {
        return await handleReelsForDate(request, env, reelMatch[1]);
      }

      // Public POST
      if (method === "POST" && path === "/api/tmayd/submissions") {
        return await handleSubmission(request, env);
      }

      // Bridge endpoints
      if (method === "POST" && path === "/api/tmayd/bridge/heartbeat") {
        return await handleHeartbeat(request, env);
      }
      if (method === "POST" && path === "/api/tmayd/bridge/jobs/pull") {
        return await handlePull(request, env);
      }
      const printedMatch = PRINTED_RE.exec(path);
      if (method === "POST" && printedMatch) {
        return await handlePrinted(request, env, printedMatch[1]);
      }
      const failedMatch = FAILED_RE.exec(path);
      if (method === "POST" && failedMatch) {
        return await handleFailed(request, env, failedMatch[1]);
      }

      // Admin endpoints
      if (method === "GET" && path === "/api/tmayd/admin/settings") {
        return await handleAdminGetSettings(request, env);
      }
      if (method === "POST" && path === "/api/tmayd/admin/settings") {
        return await handleAdminSetSetting(request, env);
      }

      // Liveness probe
      if (method === "GET" && path === "/api/tmayd/health") {
        return json({ ok: true, env: env.TMAYD_ENV }, { status: 200 });
      }

      return new Response("not found", { status: 404 });
    } catch (err) {
      console.error("tmayd_unhandled", {
        path,
        method,
        message: err instanceof Error ? err.message : String(err)
      });
      return new Response(JSON.stringify({ ok: false, reason: "internal" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
  }
};
