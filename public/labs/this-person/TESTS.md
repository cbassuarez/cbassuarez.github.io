# this person — test notes

## Browser-side flow

In a Chromium browser, on a non-incognito profile that has accumulated some
browsing history:

1. Open `/labs/this-person/?api=<worker>`.
2. Press **reveal what they see**.
3. Confirm the review screen shows:
   - a Topics block (possibly empty on a freshly-cleared profile — the note
     should explain why);
   - client hints with at least a brand and platform;
   - the fingerprint block with WebGL, canvas, and audio hashes;
   - the privacy / sandbox block;
   - the **industry tags fired** block listing every configured network;
   - a preview entry that mirrors the eventual wall entry.
4. Press **append to the repository** and confirm the wall updates.

## No-ad-tech worker

Run the page against a worker with no `THIS_PERSON_GA4_MEASUREMENT_ID` and
no `THIS_PERSON_META_PIXEL_ID`. The page should:

- still run the browser-side reads,
- show "No real ad-tech IDs are configured…" on the landing,
- still allow an append, and the wall entry should honestly omit the
  "shown to Google / Meta" claims.

## Non-Chromium browser

Open the page in Firefox or Safari. The Topics block should explain that
this browser does not expose the Topics API. Client hints should be empty.
Fingerprint, privacy, and the fired-tags block should still populate.

## CSP

Open DevTools → Network on the landing route. After consent, confirm the
browser actually fetches `googletagmanager.com/gtag/js?id=...` and
`connect.facebook.net/.../fbevents.js` without CSP violations. The wall
route (`/labs/this-person/wall/`) should keep its tight CSP and not load
any third-party scripts.

## Worker

- `GET /api/this-person/config` returns the new `adtech.{googleAds,metaPixel}`
  shape and still includes `googleDataPortability` for legacy clients.
- `POST /api/this-person/web-signals/append` rejects empty fragment lists
  with 400, oversize bodies with 413, and rate-limit floods with 429.
- A successful append returns a `person` whose `source` is
  `ad_preferences_surface` and whose claims were generated server-side
  (the client cannot forge claim sentences).

## Retired surfaces

- `/preview`, `/append`, `/enroll` still return 410.
- The Google Data Portability OAuth endpoints remain wired for legacy use
  but are not the consent surface's primary path.
