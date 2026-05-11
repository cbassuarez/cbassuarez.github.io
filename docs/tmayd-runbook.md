# TMAYD Production Runbook

This is the operator's runbook for the TMAYD ("Tell Me About Your Day") public
artwork: a thermal-receipt printing apparatus whose submission funnel is the
public web at `cbassuarez.com/labs/tell-me-about-your-day`.

## Architecture in one breath

```
   Visitor browser
        │  POST https://cbassuarez.com/api/tmayd/submissions  (Turnstile token)
        ▼
   Cloudflare Worker  (workers/tmayd-api)
        │  D1: submissions, print_jobs, settings, bridge_heartbeats, …
        │  R2: tmayd-captures  (camera, future)
        │  Secrets: TURNSTILE_SECRET_KEY, TMAYD_BRIDGE_TOKEN,
        │           TMAYD_ADMIN_TOKEN, TMAYD_RATE_HASH_SALT
        │
        │  ▲ outbound-only HTTPS polling
        │  │
   OptiPlex (tmayd-bridge.local — building Wi-Fi, no public inbound)
        │  /opt/tmayd/bin/cloud-poller.py   (systemd: tmayd-cloud-poller.service)
        │  /opt/tmayd/bin/print-queue.py    (systemd: tmayd-print-queue.{path,service,timer})
        │  /var/lib/tmayd/{queue,processing,printed,failed,cloud}
        ▼
   Epson TM-T receipt printer @ 192.168.50.2:9100
```

The OptiPlex never accepts inbound traffic from the public internet. The
public site never talks to the OptiPlex directly. Every accepted message is
durable in D1 before any local machine sees it; bridge ack closes the loop.

## Production cutover state (as of 2026-05-11)

- Worker `tmayd-api` deployed.
- Routes: `cbassuarez.com/api/tmayd/*`, `www.cbassuarez.com/api/tmayd/*`.
- D1 database `tmayd` provisioned (id in `wrangler.jsonc`).
- R2 bucket `tmayd-captures` provisioned (empty; camera phase).
- OptiPlex service `tmayd-cloud-poller.service` enabled and active.
- End-to-end print + ack verified once: `DAY-20260511-0001`.
- Default state: `FORCE_INTAKE_CLOSED=true` — submissions return `unavailable`
  until an operator explicitly opens intake.

## Day-to-day health checks

```bash
# Public surface (anyone, no auth)
curl -s https://cbassuarez.com/api/tmayd/health
curl -s https://cbassuarez.com/api/tmayd/status | jq

# Bridge process
ssh tmayd-bridge.local 'systemctl is-active tmayd-cloud-poller.service'
ssh tmayd-bridge.local 'sudo journalctl -u tmayd-cloud-poller -n 50 --no-pager'

# Print queue surface
ssh tmayd-bridge.local 'ls /var/lib/tmayd/queue /var/lib/tmayd/processing /var/lib/tmayd/printed /var/lib/tmayd/failed'

# Worker logs (tail)
cd workers/tmayd-api && npx wrangler tail
```

`lastHeartbeatAt` in the public status response should be within ~30 seconds
of "now". If it drifts past 90 seconds, the worker reports `status: offline`
and refuses submissions (or queues them only if `ALLOW_QUEUE_WHEN_BRIDGE_OFFLINE=true`).

## Opening / closing intake

Settings live in D1 and are mutated via the admin endpoint, which requires
the `TMAYD_ADMIN_TOKEN` bearer.

```bash
ADMIN=$(echo "<your admin token>")

# Open intake
curl -X POST -H "authorization: Bearer $ADMIN" -H "content-type: application/json" \
  -d '{"key":"FORCE_INTAKE_CLOSED","value":"false"}' \
  https://cbassuarez.com/api/tmayd/admin/settings

# Close intake immediately (kill switch)
curl -X POST -H "authorization: Bearer $ADMIN" -H "content-type: application/json" \
  -d '{"key":"FORCE_INTAKE_CLOSED","value":"true"}' \
  https://cbassuarez.com/api/tmayd/admin/settings

# Set a maintenance message
curl -X POST -H "authorization: Bearer $ADMIN" -H "content-type: application/json" \
  -d '{"key":"MAINTENANCE_MESSAGE","value":"Back at noon. Intake closed for paper change."}' \
  https://cbassuarez.com/api/tmayd/admin/settings

# Allow queueing when bridge is offline (jobs print when bridge returns)
curl -X POST -H "authorization: Bearer $ADMIN" -H "content-type: application/json" \
  -d '{"key":"ALLOW_QUEUE_WHEN_BRIDGE_OFFLINE","value":"true"}' \
  https://cbassuarez.com/api/tmayd/admin/settings

# Inspect all settings
curl -H "authorization: Bearer $ADMIN" https://cbassuarez.com/api/tmayd/admin/settings | jq
```

Hard maintenance mode (`MAINTENANCE_MODE=true`) takes precedence over everything
and surfaces `status: maintenance` to the public.

## Secrets

| Name                     | Where           | Rotated by                                            |
|--------------------------|-----------------|-------------------------------------------------------|
| `TURNSTILE_SECRET_KEY`   | Worker secret   | `wrangler secret put TURNSTILE_SECRET_KEY`            |
| `TMAYD_BRIDGE_TOKEN`     | Worker + OptiPlex | rotate both: `wrangler secret put …`, then update /etc/tmayd/cloud.env |
| `TMAYD_ADMIN_TOKEN`      | Worker secret   | `wrangler secret put TMAYD_ADMIN_TOKEN`               |
| `TMAYD_RATE_HASH_SALT`   | Worker secret   | rotating invalidates current rate-limit ledger; safe  |
| `BEDROCK_*`              | Worker secret (optional) | unset until guardrails are wired              |

`/etc/tmayd/cloud.env` lives on the OptiPlex at mode `0600 root:root`.
`/etc/tmayd/printer.env` is the existing printer config and is untouched by
this rollout.

## Rollback paths

### A. "Intake is causing problems, close it RIGHT NOW"
```bash
curl -X POST -H "authorization: Bearer $ADMIN" -H "content-type: application/json" \
  -d '{"key":"FORCE_INTAKE_CLOSED","value":"true"}' \
  https://cbassuarez.com/api/tmayd/admin/settings
```
~5s of propagation. Submissions return `unavailable` immediately.

### B. "The worker is broken, revert to the previous version"
```bash
cd workers/tmayd-api
npx wrangler deployments list
# pick a known-good Version ID
npx wrangler rollback <version-id>
```

### C. "Take the OptiPlex out of the loop"
```bash
ssh tmayd-bridge.local 'sudo systemctl stop tmayd-cloud-poller.service'
# Cloud accumulates print_jobs in 'queued' state, intake auto-closes after 90s.
```

To resume:
```bash
ssh tmayd-bridge.local 'sudo systemctl start tmayd-cloud-poller.service'
# Queued jobs are pulled in arrival order on the next poll.
```

### D. "Pull intake offline, drain the local queue manually"
```bash
ssh tmayd-bridge.local 'sudo systemctl stop tmayd-cloud-poller.service'
# Existing print-queue.service still drains /var/lib/tmayd/queue/*.txt files
# that were already pulled. To stop physical printing entirely:
ssh tmayd-bridge.local 'sudo systemctl stop tmayd-print-queue.path tmayd-print-queue.timer'
# Move any pending files out of the queue:
ssh tmayd-bridge.local 'mv /var/lib/tmayd/queue/*.txt /var/lib/tmayd/cloud/quarantine/'
```

### E. "Reset a stuck job"
```bash
cd workers/tmayd-api
# Force a job back to queued state
npx wrangler d1 execute tmayd --remote --command \
  "UPDATE print_jobs SET job_state='queued', lease_id=NULL, leased_until=NULL, attempts=0 WHERE public_code='DAY-YYYYMMDD-NNNN'"
```

### F. "Mark a job dead"
```bash
npx wrangler d1 execute tmayd --remote --command \
  "UPDATE print_jobs SET job_state='dead' WHERE public_code='DAY-YYYYMMDD-NNNN'"
```

## Bridge lifecycle

The bridge polls every `TMAYD_POLL_SECONDS` (default 5s), heartbeats every
`TMAYD_HEARTBEAT_SECONDS` (default 30s), and uses an idempotency directory at
`/var/lib/tmayd/cloud/<publicCode>/` with:

- `lease.json`         — the most recent lease seen.
- `queued.json`        — written after the local `.txt` lands in the queue.
- `printed_acked.json` — written after the cloud accepts a `printed` ack.
- `failed_acked.json`  — written after the cloud accepts a `failed` ack.

If the bridge crashes mid-flow, on restart it re-walks `/var/lib/tmayd/printed`
and `/var/lib/tmayd/failed`, finds any publicCode in `cloud/<>` whose
`printed_acked.json` is missing, and retries the ack. No duplicate prints,
no duplicate acks.

## D1 schema cheat sheet

| Table                  | Read for                                                     |
|------------------------|--------------------------------------------------------------|
| `submissions`          | what was accepted and survives publicly                       |
| `print_jobs`           | what is being printed / has printed / failed / is dead       |
| `bridge_heartbeats`    | apparatus liveness (last_seen_at, printer_online)             |
| `settings`             | runtime gates (intake, maintenance, queue-when-offline)       |
| `submission_attempts`  | rate-limit ledger (hashed IP only; no text)                  |
| `rejection_counts`     | aggregate counts by reason (`url|email|phone|ssn|…`); no text |
| `day_counters`         | per-day sequence numbers for `DAY-YYYYMMDD-NNNN`              |

Quick recent-day summary:
```bash
npx wrangler d1 execute tmayd --remote --command \
  "SELECT public_code, status, printed_at FROM submissions ORDER BY created_at DESC LIMIT 10"
```

## Privacy invariants (do not weaken)

1. **No raw rejected text persists.** `submissions.accepted_text` only holds
   POST-moderation accepted text. Rejected requests insert only an aggregate
   row in `rejection_counts` (`reason` column, no body).
2. **Hashed IPs only.** `submission_attempts.ip_hash` is HMAC-SHA256(salt, IP)
   truncated to 16 bytes. Raw `CF-Connecting-IP` is never persisted and is
   redacted from logs.
3. **No display-name realism allowed.** `moderateDisplayName` soft-rejects
   anything that looks like a "First Last" or contains a phone/email/URL.
4. **Public messages are generic.** `tmayd-api` never echoes the rejected
   string back; the public message is a non-specific instruction to revise.
5. **Bridge logs never include accepted_text.** The poller logs only event
   names, statuses, byte counts, and publicCodes.

## Camera / archive (out of scope for this phase)

`/api/tmayd/live/latest` always returns the inactive shape today. The reels
endpoints return an empty manifest. When wiring the camera:

- Upload frames to R2 bucket `CAPTURES`.
- Insert rows into `captures` keyed by `public_code`.
- Wire `/api/tmayd/live/latest` to read the newest row.
- Wire `/api/tmayd/reels/:date` to enumerate `captures` for that day.

This rollout intentionally leaves those endpoints' shape correct so the
frontend keeps rendering empty-archive UI without errors.

## Known limitations

- Moderation is `deterministic_only`. Bedrock Guardrails integration is
  stubbed (env vars defined; the moderation call is not yet wired). With
  `TMAYD_ALLOW_DETERMINISTIC_ONLY_IN_PROD=true`, the worker accepts a
  best-effort regex pipeline. Tighten later by setting Bedrock secrets and
  flipping `MODERATION_MODE=bedrock`.
- No image captures yet; the camera path is wire-shaped only.
- The OptiPlex has a local `tmayd-status.service` listening on
  `0.0.0.0:8080`. It is on a private building Wi-Fi and is **not** the public
  surface. Do not port-forward it.

## Quick reference: secrets I generated for this rollout

Generated locally to `/tmp/tmayd-{bridge,admin,rate-salt}-token` and uploaded
via `wrangler secret put`. Treat as live credentials; rotate as needed.

- `TMAYD_BRIDGE_TOKEN` shared with `/etc/tmayd/cloud.env` on the OptiPlex.
- `TMAYD_ADMIN_TOKEN` is the bearer for `/api/tmayd/admin/settings`.
- `TMAYD_RATE_HASH_SALT` is internal; rotating clears the in-flight rate
  window (acceptable trade-off).

After verifying the runbook end-to-end, delete the `/tmp/tmayd-*-token`
plaintext files from this workstation.
