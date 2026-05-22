# Acceptance tests — this person

Automated unit tests cover the pure extraction modules. The browser and
integration behaviours are manual; the steps are below.

## Automated

```
npm run test:this-person
```

Covers (`worker/src/this-person/__tests__/units.test.ts`): text normalization;
fragment classification; fragment extraction (signal kept, boilerplate
dropped); identifier redaction; deterministic claim generation, 4–12 claims, no
emoji, brand preservation with "likes"/"wants" grammar, contradiction surfacing;
payload validation (bad source, empty fragment set, fragment caps, numeric
seed); pasted HTML preserved as inert text.

## Manual

Run the worker (`npx wrangler dev`) and the static site (`npm run dev`), then
open the routes with `?api=http://localhost:8787`.

### 1. Wall model
Confirm the repository accepts only extracted portraits. There is no refusal,
unsupported, empty, or error entry type in the data model or the wall.

### 2. Screenshot OCR
`/submit/` → consent → "extract from screenshot" → upload a screenshot of an
ad-preference page → OCR text appears in the editable pane → fragments appear →
"generate person" → preview → "append this person" → it reaches the wall.

### 3. Screen capture
`/extract/` → "extract from screen" → "expose surface" opens the browser's
native picker → "capture visible surface" grabs a frame → confirm the stream
stops after "read surface" → OCR / review / append works.

### 4. Archive ingestion
"extract from data archive" → upload a small ZIP / JSON / CSV / TXT → the
scanner surfaces ad/profile fragment candidates → review → append. An oversized
archive is rejected with a private failure, not a crash.

### 5. Identifier redaction
Include an email, phone number, or address in an uploaded surface. Confirm it
is shown as `[redacted]` in the fragment review, before any preview.

### 6. Claim generator
Starbucks → "this person likes Starbucks"; McDonald's → "this person likes
McDonald's"; a Cabo / beach-hotel fragment → a Cabo / beach-hotel claim;
mortgage / Zillow → "wants to buy a new home" / "near home ownership"; leftist
literature together with McDonald's → a contradiction claim.

### 7. Conceptual non-sanitization
Brand names are not removed. Contradictions are preserved. Banal consumer
categories remain visible. Claims use "likes" and "wants".

### 8. No failed wall entries
Cancel the screen-capture picker → a private state, no append. Mock an OCR
failure (or upload an unreadable image) → a private state, no append. Browser
topics returning nothing → a private state, no append.

### 9. Preview gate
Watch the Network tab through a whole extraction: no request to the worker
fires until "append this person" is pressed. (`/preview` fires only when
"generate person" is pressed; `/append` only on the final confirm.)

### 10. Persistence
Append an entry, restart / redeploy the worker, reload `/wall/` — the entry is
still present (Durable Object SQLite). Confirm no raw screenshot, raw archive,
or full OCR text is present in the admin JSON export.

### 11. Wall live update
Open `/wall/` and `/submit/` side by side. Append from `/submit/`. The wall
shows the new portrait within a second, with no refresh.

### 12. Admin
With no `THIS_PERSON_ADMIN_TOKEN`: `/admin/` shows inspection only, no
destructive controls; the clear endpoint returns 403. With a token: export JSON,
export TXT, and clear all work; the source distribution count is shown.

### 13. Return loop
With adtech off (default): no ad script loads at any point; "enter the return
loop" only adds the local wall note. With adtech configured: confirm ad tags
load only after "enter the return loop" is pressed, never on initial load, and
that no profile text or category name is sent as an event parameter.

### 14. Extension import
Load `extension/` unpacked, click it on an ad-preference page, and confirm it
opens `/import#payload=…`. The payload is in the fragment; confirm (Network
tab) nothing is sent to the worker before the preview.

### 15. XSS
Paste `<script>alert(1)</script>` via operator entry, or include script-like
text in a screenshot. Confirm it appears on the wall as literal, inert text —
it never executes (every surface renders with `textContent`).
