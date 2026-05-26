# cbassuarez.github.io

Public site, labs, and Workers for `cbassuarez.com`.

## Surfaces

| Surface | Location | Runtime | Notes |
| --- | --- | --- | --- |
| Main site | `src/`, `public/` | Vite + React on GitHub Pages | Routes for `/`, `/works`, `/about`, `/contact`, `/labs`, and static-lab wrappers. |
| Static labs | `public/labs/` | Plain HTML/JS/CSS assets | Lab pages are framework-free unless they are generated branded outputs. |
| seb-feed Worker | `workers/seb-feed/` | Cloudflare Workers | Feed, visitor counts, guestbook, contact, shared string, corpus, presence, and this-person APIs. |
| TMAYD Worker | `workers/tmayd-api/` | Cloudflare Workers, D1, R2 | API for `/api/tmayd/*` and `/d/*`, consumed by the TMAYD gallery frontend. |
| CLI service | `cli-server/` | Go service on Fly | SSH/Gemini entry into the site's public content. |

## Route Ownership

| Route | Owner |
| --- | --- |
| `/`, `/works`, `/about`, `/contact`, `/labs` | Main Vite app |
| `/labs/*` | Static assets in `public/labs/`, sometimes wrapped by `src/App.jsx` for local dev |
| `/labs/works-list/` | Canonical Praetorius-generated works surface |
| `/labs/work-list/` | Silent compatibility alias to `/labs/works-list/` |
| `/api/feed`, `/api/hit`, `/api/guestbook`, `/api/contact` | `workers/seb-feed` |
| `/api/string/*`, `/api/corpus/*`, `/api/this-person/*`, `/api/presence` | `workers/seb-feed` |
| `/api/tmayd/*`, `/d/*` | `workers/tmayd-api` |

## Local Development

```bash
npm ci
npm run dev
```

TMAYD has its own package boundary:

```bash
npm ci --prefix workers/tmayd-api
npm --prefix workers/tmayd-api run dev
```

The `seb-feed` Worker can be run directly with Wrangler:

```bash
WRANGLER_LOG_PATH=.wrangler/logs npx --yes wrangler dev --config workers/seb-feed/wrangler.toml
```

## Checks

Install both package boundaries first:

```bash
npm ci
npm ci --prefix workers/tmayd-api
```

```bash
npm run build
npm run test:this-person
npm run test:seb-feed
npm run dry-run:seb-feed
npm run test:tmayd-api
npm run typecheck:tmayd-api
npm run dry-run:tmayd-api
```

`npm run ci:all` runs the full public-repo check set.

## Asset Policy

Intentional public assets stay in Git: shipped lab bundles, audio used by public pages, score PDFs, stills, and generated model files that are loaded at runtime.

Local state and scratch files do not belong in Git: Wrangler state, Playwright snapshots, Python bytecode, rejected patches, temporary `.orig` files, and built binaries.
