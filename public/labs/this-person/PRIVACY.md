# Privacy & consent — this person

This work uses consented Google Data Portability data. It does not accept
substitute browser-provided or manually supplied profile data.

## What happens

1. You choose to connect Google My Ad Center.
2. Google shows its OAuth consent screen for the Data Portability scope
   `dataportability.myactivity.myadcenter`.
3. Google prepares an archive for `myactivity.myadcenter`.
4. The worker downloads Google's signed archive URLs, extracts ad-interest
   activity, redacts identifiers, and discards raw archive contents.
5. You review sanitized interests before anything becomes public.

## What is stored briefly

During the archive job, encrypted job state may contain OAuth tokens and the
Google archive job ID. This state is stored in `HITS_KV` with a hard maximum
TTL of 7 days. After a successful parse, the worker removes tokens, calls
Google authorization reset on a best-effort basis, and keeps only sanitized
candidate interests briefly so you can append selected records.

## What public entries contain

Public entries contain selected ad-interest labels, relation language supported
by Google's returned records, source notes, a public number, and append order.
The grammar preserves uncertainty: the page says "this person chose to see more
ads about X" only when the record supports that verb; otherwise it says
"Google associated this person with X" or similar.

## What is not stored

- Raw Google archive files.
- OAuth tokens after parse/failure cleanup.
- Substitute browser-provided or manually supplied profile data.
- Emails, phone numbers, addresses, payment-card patterns, account IDs, long
  token-like strings, or raw URLs when detected by the sanitizer.
- IP addresses, user agents, referrers, cookies, client storage identifiers, or
  precise timestamps in this app's durable repository.

Cloudflare, Google, and the browser still process network metadata as part of
normal hosting/OAuth/API operation. That is outside the durable public
repository this code writes.
