# Privacy & consent — this person

This is an extraction artwork. It is plain about that. This document states
exactly how it handles what you expose to it.

## What this is

The work extracts visible advertising and profile data **that you choose to
expose** — a screenshot, a screen, a browser tab, or an account-data archive —
and turns it into a public "this person" portrait. The extraction happens in
front of you. You review the portrait before it is appended. The repository
contains only people who chose extraction.

## You are in control

- Nothing happens until you pass the consent notice and choose a method.
- You choose which surface, archive, screenshot, or tab to expose. Expose only
  what you are willing to see transformed into a public entry.
- The extracted text is shown to you in an editable pane — you can delete lines
  before anything is parsed.
- The parsed fragments are shown to you — you can exclude any of them.
- The portrait is shown to you in full before it is appended — you can remove
  individual claims, or discard the whole thing.
- **Nothing is sent to the server until you press "append this person."**

## What the app does NOT do

- It does not append failed, canceled, unsupported, empty, or refused attempts.
  Those end privately, inside the chamber.
- It does not ask for your name.
- It does not set cookies, use analytics, load external fonts, or use any
  client storage (`localStorage`, `sessionStorage`, `IndexedDB`).
- It does not capture your screen without the browser's own picker; the capture
  stream is stopped as soon as you are done.
- It does not capture passwords or credentials, automate login, or read hidden
  account data or network traffic.

## What is stored

By default the repository stores only the extracted portrait:

- a public number,
- the extraction source and platform hints,
- the approved fragments (their text, kind, and confidence),
- the generated claims and their source notes,
- the generated text,
- the append order,
- optionally a coarse append time rounded to the hour, only if enabled.

## What is NOT stored

- Raw screenshots, raw screen-capture frames, and raw archives.
- Full raw OCR text.
- Emails, phone numbers, street addresses, card numbers, and token-like
  strings — these are detected and redacted before the preview, and again on
  the server.
- IP addresses, user agents, referrers, cookies, storage identifiers, session
  identifiers, precise timestamps, and raw request headers.

OCR runs in your browser; no image is uploaded to be read. Archives are walked
in your browser; the archive itself is never uploaded.

## What public entries contain

A "this person" entry is blunt advertising grammar. It may contain brand names,
ad categories, topics, inferred desires, contradictions, class markers, and
embarrassing consumer specificity, each with a note of the surface it was
extracted from. That bluntness is the work. Expose accordingly.

## The OCR engine

The OCR engine (tesseract.js) is downloaded from a public CDN the first time
you start a screenshot or screen-capture extraction. That CDN request fetches
program code only; it carries none of your images or text. OCR itself runs
locally in your browser.

## The return loop (optional)

If the operator has enabled the adtech return loop and you choose to enter it,
third-party ad platforms (Google, Meta) will process identifiers as part of
their normal advertising systems in order to place this browser into an
audience. The artwork sends them only a neutral event about participation — no
profile text, no category names, no OCR text. The artwork does not receive the
hidden platform dossier. With adtech disabled (the default), entering the loop
is only a local note on the wall and contacts no third party.

## Server logging

This work's request handlers log nothing about visitors and store only the
portrait described above. Rate limiting uses Cloudflare's platform limiter,
keyed by a constant — not by visitor IP — so this code retains no identifier.
Cloudflare's edge, like any host, processes IP addresses to route requests and
may keep transient operational logs outside this project's control; that is a
property of the hosting platform, not of this code.
