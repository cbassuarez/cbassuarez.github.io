# this person test notes

## Local unavailable state

Run the frontend against a worker without Google Data Portability secrets. The
public route should state that the real source is unavailable and should not
offer any substitute data-entry method.

## OAuth flow

With a verified Google OAuth client and Data Portability access:

1. Open `/labs/this-person/?api=<worker>`.
2. Start the Google My Ad Center flow.
3. Confirm the callback redirects back with `#google_job=...`.
4. Confirm polling reaches a review screen only after Google returns completed
   archive URLs.
5. Remove at least one candidate, append the rest, and confirm the wall updates.

## Empty and failure states

Mock or trigger:

- in-progress archive job,
- complete job with no extractable My Ad Center records,
- failed or cancelled archive job,
- expired token,
- Google `RESOURCE_EXHAUSTED`.

Each case should end without a public entry unless selected candidates are
successfully appended.

## Static removal checks

Confirm the public route and bundles expose only the Google Data Portability
flow and no legacy ingestion controls.
