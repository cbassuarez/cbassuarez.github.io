# this person

An art piece in the shape of an ordinary page load.

A visitor presses one button. The page does exactly what almost every
commercial site does silently against its visitors, all in one flow:

1. asks Chrome for the topics it has decided this browser is interested in
   this week (the Topics API);
2. reads the user-agent client hints, screen / locale / WebGL / canvas
   surface, and Privacy-Sandbox feature presence;
3. fires real Google Ads / GA4 and Meta Pixel beacons against this browser,
   using configured IDs (so the visitor's real Google and Meta ad profiles
   are touched, for real), and renders a real Google Ad Manager slot;
4. when configured, opens a Google sign-in in a **popup** (the main page never
   navigates away) and reads, on consent, what the account hands over —
   YouTube subscriptions + likes and profile demographics;
5. assembles the served ad, the browser reads, and the Google account data
   into one combined review, in third-person, then appends a single merged
   entry to the public wall.

The Google sign-in is optional enrichment: decline it, close the popup, or
have it blocked, and the flow proceeds with the silent read alone.

Browser history itself is not exposed to JavaScript — the Topics list is
Chrome's projection of history into the v2 ad-targeting taxonomy. Nothing
the visitor uploaded, nothing screenshotted. The only "consent" gate is the
button.

## Routes

| URL | Role |
| --- | --- |
| `/labs/this-person/` | The consent surface (the work itself). |
| `/labs/this-person/wall/` | Public repository wall. |
| `/labs/this-person/gallery/` | Installation helper with wall links and QR. |
| `/labs/this-person/admin/` | Counts, exports, and clear controls. |
| `/labs/this-person/return/` | Legacy stub pointing back to the consent surface. |

## Worker API

| Endpoint | Role |
| --- | --- |
| `GET /api/this-person/config` | Reports admin status and which ad-tech IDs are configured. |
| `POST /api/this-person/web-signals/append` | Accepts the sanitized signal bundle, generates claims server-side, appends to the wall. |
| `GET /api/this-person/state` / `socket` | Wall state and live updates. |
| `GET /api/this-person/admin/export`, `POST /api/this-person/admin/clear` | Token-gated admin controls. |

Everything appends through `/web-signals/append`. When `GOOGLE_DP_*` is
configured, the begin button also opens the Google OAuth endpoints
(`google/start?mode=popup`, `google/callback`, `google/job`) in a popup so the
worker can read, on consent, the account's **YouTube subscriptions + liked
videos** (YouTube Data API) and **profile demographics** — gender,
birthday-derived age, employer (People API). The callback fetches these
synchronously, stores only the sanitized candidates as a ready job (no
access/refresh token is ever retained), and — in popup mode — returns a small
HTML page that `postMessage`s the job id back to the opener and closes itself
(the main page never navigates). The client polls `google/job`, then passes the
job id + selected candidate ids on the **single** `/web-signals/append` call,
which merges them into one entry. `google/append` is superseded (left in place,
unused).

The originally-scaffolded Google Data Portability (My Ad Center) read is
deliberately not used: that API is EEA-only and refuses US accounts. The dead
archive-job helpers and `google/append` remain in the worker but are no longer
on the path. The retired `preview` / `append` / `enroll` endpoints return 410.

## Worker configuration

These are all `wrangler secret put`:

```
THIS_PERSON_ADMIN_TOKEN              # gates /admin/clear and /admin/export
THIS_PERSON_GA4_MEASUREMENT_ID       # e.g. G-XXXXXXXXXX — what gtag.js sends to
THIS_PERSON_GOOGLE_ADS_ID            # e.g. AW-XXXXXXXXXX — optional conversion id
THIS_PERSON_META_PIXEL_ID            # numeric Meta Pixel id
```

The Google Ad Manager slot uses `GAM_NETWORK_CODE`, `GAM_AD_UNIT_PATH`,
`GAM_SERVICE_ACCOUNT_EMAIL`, `GAM_SERVICE_ACCOUNT_PRIVATE_KEY`, and optional
`GAM_SLOT_SIZES`.

The optional Google account read needs an OAuth web client with the **YouTube
Data API v3** and **People API** enabled, and these scopes on the consent
screen: `youtube.readonly`, `userinfo.profile`, `user.birthday.read`,
`user.gender.read`, `user.organization.read`. Same five secrets:

```
GOOGLE_DP_CLIENT_ID                  # OAuth 2.0 web client id
GOOGLE_DP_CLIENT_SECRET              # OAuth 2.0 client secret
GOOGLE_DP_REDIRECT_URI               # <worker>/api/this-person/google/callback
GOOGLE_DP_STATE_SECRET               # random string (HMAC key for state/cookie)
GOOGLE_DP_TOKEN_ENCRYPTION_KEY       # random string (AES key for the short-lived job blob)
```

If no ad-tech IDs are configured, the page still runs the browser-side reads
(Topics API, client hints, fingerprint) and appends an entry — it just doesn't
fire outbound beacons. The wall entry honestly reflects which networks were
actually pinged.

## Storage

The Durable Object stores only the public `ExtractedPerson` model: source,
platform hints, sanitized fragments, generated claims, the consented page/ad
snapshot, append order, and the optional coarse hour. No IPs, no user agents,
no referrers, no fingerprint hashes, no tokens.

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

Without configured ad-tech IDs the page runs the browser reads but won't
load external ad scripts. The Topics API only returns topics in Chromium
browsers, on HTTPS, with a non-incognito profile that has accumulated
observation history.
