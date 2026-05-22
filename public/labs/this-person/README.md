# this person

A consented extraction repository.

Targeted advertising already extracts, classifies, predicts, and addresses
people continuously. This work makes one unusually explicit instance of that
process: a participant knowingly exposes an ad-profile surface — a screenshot, a
screen, a browser tab, or an account-data archive — the work extracts
categories and desire-fragments from it, and the extracted portrait is returned
as a public "this person" wall entry.

> this already happens. this time, you get the page.

The repository contains **only people who chose extraction** — only successful
extracted portraits. It is not a record of everyone who loads the page. It is
not a refusal archive. It is an extraction apparatus.

## Routes

| URL | Role |
| --- | --- |
| `/labs/this-person/` | Default public route. Landing → consent → extraction chamber, standalone on a laptop or desktop. |
| `/labs/this-person/extract/` | The extraction chamber directly. `?terminal=1` is the gallery screen-capture station. `?operator=1` exposes operator entry. |
| `/labs/this-person/import/` | Receives an extension / bookmarklet payload from the URL fragment. |
| `/labs/this-person/gallery/` | Gallery landing — points to the wall, the terminal, and the submission QR. |
| `/labs/this-person/submit/` | Mobile / gallery submission route (the wall's QR target). Screenshot-first. |
| `/labs/this-person/wall/` | The repository wall. Only successful extracted portraits. |
| `/labs/this-person/admin/` | Inspect counts and source mix; export / clear (token-gated). |
| `/labs/this-person/return/` | The returned-through-ad route. |

## Extraction methods

All extraction runs **in the browser**. Raw screenshots, raw screen frames,
and raw archives are never uploaded; the only thing sent to the server is the
participant-approved set of fragments.

- **Screenshot OCR** — upload screenshots of an ad-preference page; local OCR
  reads them. The fastest phone-native path; the primary `/submit` route.
- **Screen capture** — the strongest laptop path. The browser's own Screen
  Capture picker shares a tab/window; a still frame is taken and OCR'd; the
  stream is stopped immediately after. The basis of the gallery terminal.
- **Data-export ingestion** — upload a platform data export (ZIP / JSON / HTML
  / CSV / TXT). It is walked in the browser for advertising-relevant text.
- **Active-tab extension** — the optional Chrome extension in `extension/`
  sends the visible text of the current tab to `/import`.
- **Browser topics** — a minor source. The browser is asked, on explicit
  request, for advertising topics; if it returns nothing, nothing is appended.
- **Operator entry** — an admin/dev repair route for a successful extraction
  whose OCR failed. Not part of the public artwork language.

## What is appended — and what is not

**Appended:** the participant-approved fragments, the generated third-person
claims, their source notes, the generated text, the extraction source and
platform hints, and a public monotonic number.

**Never appended:** failed, canceled, unsupported, empty, or refused attempts.
These surface a private state inside the chamber and end there. The repository
performs targeting, not refusal — a failure is not a record, so it is not on
the wall. Raw screenshots, raw archives, and raw OCR text are never appended
and never persisted.

## Run locally

Two processes — the worker and the static site:

```
# 1. backend
cd worker
npx wrangler dev          # API on http://localhost:8787

# 2. static frontend (repo root, another terminal)
npm run build:this-person
npm run dev               # Vite serves public/ on http://localhost:5173
```

Open the work pointed at the local worker:

```
http://localhost:5173/labs/this-person/?api=http://localhost:8787
```

The `?api=` override is honoured by every route. The pages' Content-Security-
Policy already allows `localhost:8787`.

### On a LAN (gallery dev)

Serve the frontend with `npm run dev -- --host` and run the worker with
`npx wrangler dev --ip 0.0.0.0`. Phones on the same network open
`http://<laptop-ip>:5173/labs/this-person/submit/?api=http://<laptop-ip>:8787`.
In production no LAN is needed — the work is reachable on cbassuarez.com.

## Run the installation

1. **The wall** — open `…/labs/this-person/wall/?kiosk=1` on the projection or
   monitor. The spacebar pauses the auto-scroll; kiosk mode hides chrome.
2. **The extraction terminal** — open `…/labs/this-person/extract/?terminal=1`
   on a laptop station beside an ad-preference page. It emphasizes screen
   capture and active-tab import.
3. **Phones** — the wall and `/gallery/` render a QR to `/submit/`. Audience
   phones scan it; nothing needs to be installed.

`/labs/this-person/gallery/` collects all three in one page for the operator.

## OCR configuration

OCR uses **tesseract.js**, lazy-loaded from a CDN (jsdelivr) the first time a
participant starts a screenshot or screen-capture extraction — never on initial
load, never for wall viewers. No configuration and no API key are required.
The relevant CDN origins are allowed in the Content-Security-Policy of the
extraction routes only.

## Adtech return loop (optional, off by default)

After a portrait is appended the chamber offers "enter the return loop." With
adtech disabled (the default) this is purely the local wall note — "this person
entered the return loop." With adtech enabled it also places the browser into a
real advertising audience so the page may return later as an ad.

No ad script is in the initial HTML; tags load only after the participant opts
in. No extracted profile text, no category names, and no OCR text are ever sent
to ad platforms — only a neutral participation event. The artwork does not
receive the hidden platform dossier.

Configure on the worker (`worker/wrangler.toml` vars + `wrangler secret`):

```
ENABLE_ADTECH = "true"
ENABLE_GOOGLE_ADS = "true"      # then: wrangler secret put GOOGLE_ADS_ID
ENABLE_META_PIXEL = "true"      # then: wrangler secret put META_PIXEL_ID
# optional: wrangler secret put GOOGLE_ADS_REMARKETING_LABEL
```

Account IDs are secrets — do not hardcode live IDs in git.

## Export / clear the repository

Open `/labs/this-person/admin/` and enter the admin token
(`THIS_PERSON_ADMIN_TOKEN`):

- **export JSON / export TXT** — download the whole repository.
- **clear repository** — permanently delete every entry; numbering restarts at
  `0001`. Export first.

With no `THIS_PERSON_ADMIN_TOKEN` configured, the admin page shows no
destructive controls and the clear/export endpoints reject every request.

## Safety & hygiene

The work keeps its extractive content — brands, contradictions, aspiration,
ugly consumer categories, class markers, "likes" and "wants" grammar. It still
implements ordinary software safety: HTML is escaped (every surface renders
with `textContent`); uploads are size- and type-checked; archives have entry,
size, and bomb caps; screen-capture tracks are stopped after capture; there is
no hidden capture, no credential capture, no login automation; identifier
patterns (email, phone, address, card, token) are redacted before preview and
again on the server; nothing auto-submits — the participant reviews every
portrait before it is appended.

## Deployment (cbassuarez.com/labs/this-person)

- **Frontend** — static; `npm run build:this-person` writes the committed
  `*.bundle.js` files; the site's normal build deploys `public/`.
- **Backend** — the `seb-feed` Cloudflare Worker. `cd worker && npx wrangler
  deploy` applies the `v4-this-person-room` Durable Object migration. Set the
  admin token: `npx wrangler secret put THIS_PERSON_ADMIN_TOKEN`.

The repository persists in the Durable Object's SQLite storage and survives
worker restarts and redeploys.

## Non-goals

No full advertising-profile extraction. No scraping of Meta, Google, or any
account. No login automation, no credential capture, no hidden tracking, no
analytics. The work reflects visible, exposed, profile-surface data back as a
public text — it does not reach behind the surface.
