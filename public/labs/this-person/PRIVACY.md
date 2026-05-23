# Privacy & consent — this person

This work performs, with the visitor's consent, the same operations that
every commercial site quietly performs against its visitors:

1. asks Chrome for the Topics API's projection of this browser's history;
2. reads the user-agent client hints and the fingerprint surface;
3. fires real Google Ads / GA4 and Meta Pixel beacons against this browser.

The visitor sees the resulting payload before anything becomes public, and
chooses whether to append it to the wall.

## What goes out on consent

- One `gtag.js` page-view + `view_this_person` event to
  `googletagmanager.com` / `google-analytics.com` against the configured GA4
  measurement ID (and, if set, Google Ads conversion ID). Google now
  considers this browser to have visited a site tagged with that ID.
- One Meta Pixel `PageView` to `connect.facebook.net` / `facebook.com`
  against the configured pixel ID. Meta now considers this browser to have
  visited a site tagged with that pixel.
- A normal browsing-topics observation handshake with Google. Calling
  `document.browsingTopics()` also marks this origin as having observed
  Topics, which influences future calls.

These calls are real. They reach the real ad networks. They are the artistic
gesture of the work.

## What is read from the browser

- `document.browsingTopics()` — Chrome's history-derived ad-targeting topics.
- `navigator.userAgentData.getHighEntropyValues(...)` — full client hints.
- screen size / color depth / pixel ratio, languages, timezone,
  `hardwareConcurrency`, `deviceMemory`, `navigator.connection`.
- WebGL vendor / renderer, a small canvas fingerprint hash, an OfflineAudio
  fingerprint number.
- `globalPrivacyControl`, `doNotTrack`, `cookieEnabled`,
  `cookieDeprecationLabel`, and Privacy Sandbox feature presence.

These are exactly what an ad-tech library reads on every page load. The
fingerprint hashes stay in the browser; only the sanitized fragments derived
from this surface are sent to the worker.

## What public entries contain

The public `ExtractedPerson` carries:

- the source (`ad_preferences_surface`),
- platform hints (e.g. `Chrome 131.0 on macOS 15.0`, third-party hosts the
  page touched after consent),
- sanitized fragments (Topic leaves, language code, timezone, the names of
  the ad networks that fired),
- third-person claim sentences ("this person likes Comics", "this person
  was just shown to Meta"),
- the append order, and an optional coarse hour.

## What is not stored

- Raw fingerprint hashes (canvas, audio, WebGL renderer string).
- IPs, user-agent strings, referrers, cookies, client storage identifiers,
  precise timestamps.
- Anything the visitor uploaded, screenshotted, or pasted (the work no
  longer accepts any of those).

Cloudflare, Google, and Meta still process network metadata as part of
hosting and ad-tech operation. That is outside the durable public
repository this code writes — and it is precisely the point.
