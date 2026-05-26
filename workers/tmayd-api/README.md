# tmayd-api — Cloudflare Worker

Public API + bridge endpoints for the TMAYD ("Tell Me About Your Day") artwork.
This Worker is deployed separately from the GitHub Pages site.

## Local dev

```bash
npm install
npx wrangler d1 migrations apply tmayd --local
npm run dev
```

## Tests

```bash
npm run test
npm run typecheck
WRANGLER_LOG_PATH=.wrangler/logs npm run deploy -- --dry-run
```

Uses `@cloudflare/vitest-pool-workers` with an in-memory D1.

## Deploy

```bash
# 1. one-time provisioning
npx wrangler d1 create tmayd
# copy database_id into wrangler.jsonc

# 2. secrets
echo "<turnstile_secret>" | npx wrangler secret put TURNSTILE_SECRET_KEY
openssl rand -hex 32 | npx wrangler secret put TMAYD_BRIDGE_TOKEN
openssl rand -hex 32 | npx wrangler secret put TMAYD_ADMIN_TOKEN
openssl rand -hex 32 | npx wrangler secret put TMAYD_RATE_HASH_SALT

# 3. migrations
npx wrangler d1 migrations apply tmayd --remote

# 4. ship
npx wrangler deploy
```

## Endpoints

Public (no auth, CORS locked to `cbassuarez.com`):

- `GET /api/tmayd/status`
- `GET /api/tmayd/live/latest`
- `GET /api/tmayd/reels/today`
- `GET /api/tmayd/reels/:date`
- `POST /api/tmayd/submissions`

Bridge (Bearer `TMAYD_BRIDGE_TOKEN`):

- `POST /api/tmayd/bridge/heartbeat`
- `POST /api/tmayd/bridge/jobs/pull`
- `POST /api/tmayd/bridge/jobs/:publicCode/printed`
- `POST /api/tmayd/bridge/jobs/:publicCode/failed`

Admin (Bearer `TMAYD_ADMIN_TOKEN`):

- `GET /api/tmayd/admin/settings`
- `POST /api/tmayd/admin/settings`  body: `{"key":"...","value":"..."}`

## Module layout

```
src/
├── index.ts              router
├── types.ts              Env, ModerationResult, PublicStatus, MODERATION_VERSION
├── lib/
│   ├── json.ts           json/cors/preflight/uuid/nowIso/readJsonBody
│   ├── turnstile.ts      verifyTurnstile (fail-closed in prod)
│   ├── auth.ts           authBridge, authAdmin, hashClientIp
│   ├── rate-limit.ts     D1-backed sliding-window limiter
│   ├── moderation.ts     deterministicModerate, moderateDisplayName
│   ├── public-code.ts    nextPublicCode (atomic retry loop)
│   └── settings.ts       resolveStatus + statusFromResolved
└── routes/
    ├── public.ts         GETs + POST submissions
    ├── bridge.ts         heartbeat, pull, printed, failed
    └── admin.ts          settings get/set
migrations/
└── 0001_init.sql
tests/
├── setup.ts              D1 migration mirror + helpers
├── moderation.test.ts
├── public.test.ts
├── bridge.test.ts
└── bedrock.test.ts
```
