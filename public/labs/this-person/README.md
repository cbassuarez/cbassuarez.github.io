# this person

An art piece in the shape of an ordinary page load.

A visitor presses one button. The page does exactly what almost every
commercial site does silently against its visitors:

1. asks Chrome for the topics it has decided this browser is interested in
   this week (the Topics API);
2. reads the user-agent client hints, screen / locale / WebGL / canvas
   surface, and Privacy-Sandbox feature presence;
3. fires real Google Ads / GA4 and Meta Pixel beacons against this browser,
   using configured IDs (so the visitor's real Google and Meta ad profiles
   are touched, for real);
4. shows the visitor the exact payload, in third-person, before anything is
   appended to the public wall.

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

A handful of Google Data Portability endpoints (`google/start`, `google/callback`,
`google/job`, `google/append`) and the retired `preview` / `append` / `enroll`
endpoints are left in the worker but are no longer the data path. The current
work flows entirely through `/web-signals/append`.

## Worker configuration

These are all `wrangler secret put`:

```
THIS_PERSON_ADMIN_TOKEN              # gates /admin/clear and /admin/export
THIS_PERSON_GA4_MEASUREMENT_ID       # e.g. G-XXXXXXXXXX — what gtag.js sends to
THIS_PERSON_GOOGLE_ADS_ID            # e.g. AW-XXXXXXXXXX — optional conversion id
THIS_PERSON_META_PIXEL_ID            # numeric Meta Pixel id
```

If no ad-tech IDs are configured, the page still runs the browser-side reads
(Topics API, client hints, fingerprint) and appends an entry — it just doesn't
fire outbound beacons. The wall entry honestly reflects which networks were
actually pinged.

## Storage

The Durable Object stores only the public `ExtractedPerson` model: source,
platform hints, sanitized fragments, generated claims, append order, and the
optional coarse hour. No IPs, no user agents, no referrers, no fingerprint
hashes, no tokens.

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
