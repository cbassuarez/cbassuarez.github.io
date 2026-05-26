# Workers

Cloudflare Worker projects live here.

| Worker | Purpose | Config |
| --- | --- | --- |
| `seb-feed` | Shared API for the site and labs: feed, hit counts, guestbook, contact, string, corpus, presence, and this-person. | `workers/seb-feed/wrangler.toml` |
| `tmayd-api` | TMAYD public, bridge, and admin API backed by D1/R2. | `workers/tmayd-api/wrangler.jsonc` |

Run checks from the repo root:

```bash
npm run test:seb-feed
npm run dry-run:seb-feed
npm run test:tmayd-api
npm run typecheck:tmayd-api
npm run dry-run:tmayd-api
```
