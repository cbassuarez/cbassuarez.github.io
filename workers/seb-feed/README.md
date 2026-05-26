# seb-feed Worker

Shared Cloudflare Worker for site and lab APIs.

## Local dev

From the repo root:

```bash
WRANGLER_LOG_PATH=.wrangler/logs npx --yes wrangler dev --config workers/seb-feed/wrangler.toml
```

## Checks

```bash
npm run test:seb-feed
npm run dry-run:seb-feed
```

## Public surfaces

- `GET /api/feed`
- `GET /api/hit`
- `GET|POST /api/guestbook`
- `POST /api/contact`
- `POST /api/string/pluck`
- `GET /api/string/recent`
- `GET /api/corpus/*`
- `GET|POST /api/this-person/*`
- `GET /api/presence`
- `GET /api/health`
