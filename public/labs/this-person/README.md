# this person

A consented Google ad-interest confessional.

The work asks a participant to authorize the official Google Data Portability
API for My Ad Center activity. Google prepares an archive; the worker downloads
it from Google's signed URLs, extracts ad-interest records, redacts identifiers,
and shows the participant a review screen. Only selected sanitized interests
become public wall entries.

This is Google-only. Legacy ingestion methods were removed rather than hidden.

## Routes

| URL | Role |
| --- | --- |
| `/labs/this-person/` | Public Google consent and review flow. |
| `/labs/this-person/wall/` | Public repository wall. |
| `/labs/this-person/gallery/` | Installation helper with wall links and QR. |
| `/labs/this-person/admin/` | Counts, exports, and clear controls. |
| `/labs/this-person/return/` | Legacy route pointing back to the Google flow. |

## Worker API

| Endpoint | Role |
| --- | --- |
| `GET /api/this-person/config` | Reports whether Google Data Portability is configured. |
| `GET /api/this-person/google/start` | Starts OAuth with PKCE and signed state. |
| `GET /api/this-person/google/callback` | Exchanges the OAuth code and starts the portability archive job. |
| `GET /api/this-person/google/job?id=...` | Polls the archive job, parses completed archive URLs, and returns sanitized candidates. |
| `POST /api/this-person/google/append` | Appends selected server-sanitized candidate IDs. |
| `GET /api/this-person/state` / `socket` | Wall state and live updates. |
| `GET /api/this-person/admin/export`, `POST /admin/clear` | Token-gated admin controls. |

Retired public endpoints (`preview`, `append`, `enroll`) return `410`.

## Google configuration

Set these worker secrets/config values:

```
GOOGLE_DP_CLIENT_ID
GOOGLE_DP_CLIENT_SECRET
GOOGLE_DP_REDIRECT_URI
GOOGLE_DP_STATE_SECRET
GOOGLE_DP_TOKEN_ENCRYPTION_KEY
```

The OAuth client must have the Data Portability scope:

```
https://www.googleapis.com/auth/dataportability.myactivity.myadcenter
```

The archive request exports:

```
myactivity.myadcenter
```

Without this configuration the public page reports that the real source is
unavailable and does not fake an entry.

## Storage

OAuth tokens and archive job state are encrypted before being stored in
`HITS_KV`. Pending jobs expire after at most 7 days. After the worker downloads
and parses completed archive URLs, it calls Google's authorization reset
endpoint on a best-effort basis, removes tokens from the stored job, and keeps
only sanitized review candidates for a short append window.

The durable wall stores only public entries: source, platform hints, selected
sanitized fragments, generated claims/source notes, append order, and optional
coarse time.

## Local development

```
cd worker
npx wrangler dev

# separate terminal at repo root
npm run build:this-person
npm run dev
```

Open:

```
http://localhost:5173/labs/this-person/?api=http://localhost:8787
```

Local OAuth requires a matching Google redirect URI if you want to exercise the
full consent flow. Otherwise the page should show the unavailable state.
