#!/usr/bin/env python3
"""
Upload the REPL audio plan to R2 using `wrangler r2 object put --remote`.

Idempotent: HEADs the public r2.dev URL first and skips files that already
exist with the right size. Files are uploaded with immutable cache headers
so browsers never re-validate.

Usage:
  scripts/r2-upload-audio.py [--plan scripts/r2-upload-plan.json]
                             [--public-base https://pub-xxx.r2.dev]
                             [--parallel 24]
                             [--limit N]
                             [--dry-run]

Generate the plan with the inline python in the README; consumed format is
{"bucket": "...", "items": [{"local": "<path>", "key": "<r2-key>"}, ...]}
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

DEFAULT_PUBLIC_BASE = "https://pub-7802f263808041f9a0310452f02f7c77.r2.dev"
CACHE_CONTROL = "public,max-age=31536000,immutable"


def head_existing(url: str, timeout: float = 4.0) -> tuple[bool, int]:
    """Return (exists, content_length). Treat any non-200 as missing."""
    req = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                cl = int(resp.headers.get("content-length", "0") or 0)
                return True, cl
            return False, 0
    except Exception:
        return False, 0


def put_object(bucket: str, key: str, local: str) -> tuple[bool, str]:
    """Single-file PUT through wrangler with retry-on-429 exponential backoff.
    The CF R2 management API rate-limits aggressively; we back off up to ~30s
    and retry up to 5 times before giving up on the file."""
    wrangler = shutil.which("wrangler") or "npx"
    if wrangler == "npx":
        cmd = [
            "npx", "--prefix", "workers/tmayd-api", "wrangler",
            "r2", "object", "put", f"{bucket}/{key}",
            "--file", local, "--remote",
            "--cache-control", CACHE_CONTROL,
        ]
    else:
        cmd = [
            wrangler, "r2", "object", "put", f"{bucket}/{key}",
            "--file", local, "--remote",
            "--cache-control", CACHE_CONTROL,
        ]
    last_err = ""
    for attempt in range(5):
        try:
            result = subprocess.run(
                cmd,
                capture_output=True, text=True, timeout=120,
                env={**os.environ, "WRANGLER_LOG": "error"},
            )
            if result.returncode == 0:
                return True, ""
            out = (result.stderr or result.stdout)
            last_err = out.strip().splitlines()[-1] if out.strip() else "unknown"
            if "429" in out or "Too Many Requests" in out or "throttling" in out:
                # Exponential backoff with jitter.
                time.sleep(min(30, 2 ** attempt) + (os.getpid() % 7) * 0.1)
                continue
            return False, last_err
        except subprocess.TimeoutExpired:
            last_err = "timeout"
            time.sleep(min(30, 2 ** attempt))
        except Exception as exc:
            return False, str(exc)
    return False, last_err


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--plan", default="scripts/r2-upload-plan.json")
    p.add_argument("--public-base", default=DEFAULT_PUBLIC_BASE)
    p.add_argument("--parallel", type=int, default=16)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--skip-head", action="store_true",
                   help="Don't HEAD-check; upload everything (will overwrite).")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    plan = json.load(open(args.plan))
    bucket = plan["bucket"]
    items = plan["items"]
    if args.limit:
        items = items[: args.limit]

    print(f"plan: {len(items)} items, bucket={bucket}, parallel={args.parallel}", flush=True)

    # Step 1: filter to items needing upload via parallel HEAD.
    to_upload: list[dict] = []
    skipped = 0
    if args.skip_head:
        to_upload = list(items)
    else:
        print("phase 1: HEAD-checking existing objects…", flush=True)
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=64) as ex:
            futs = {
                ex.submit(head_existing, f"{args.public_base}/{it['key']}"): it
                for it in items
            }
            done = 0
            for fut in as_completed(futs):
                it = futs[fut]
                exists, remote_size = fut.result()
                local_size = os.path.getsize(it["local"]) if os.path.isfile(it["local"]) else 0
                if exists and remote_size == local_size and local_size > 0:
                    skipped += 1
                else:
                    to_upload.append(it)
                done += 1
                if done % 500 == 0:
                    print(f"  HEAD progress: {done}/{len(items)}", flush=True)
        print(f"phase 1 done in {time.time()-t0:.1f}s: skip={skipped}, upload={len(to_upload)}",
              flush=True)

    if args.dry_run:
        for it in to_upload[:5]:
            print(" would upload:", it["local"], "->", it["key"])
        print(f"...{len(to_upload)} total")
        return 0

    if not to_upload:
        print("nothing to do.")
        return 0

    # Step 2: upload in parallel.
    print(f"phase 2: uploading {len(to_upload)} files at parallelism {args.parallel}", flush=True)
    t0 = time.time()
    done = 0
    failed: list[tuple[dict, str]] = []
    with ThreadPoolExecutor(max_workers=args.parallel) as ex:
        futs = {
            ex.submit(put_object, bucket, it["key"], it["local"]): it
            for it in to_upload
        }
        for fut in as_completed(futs):
            it = futs[fut]
            ok, err = fut.result()
            if not ok:
                failed.append((it, err))
            done += 1
            if done % 100 == 0 or done == len(to_upload):
                rate = done / max(1.0, time.time() - t0)
                remaining = (len(to_upload) - done) / max(0.1, rate)
                print(
                    f"  upload {done}/{len(to_upload)}  ({rate:.1f}/s, ~{remaining/60:.1f} min left)  "
                    f"failed_so_far={len(failed)}",
                    flush=True,
                )

    print(f"phase 2 done in {time.time()-t0:.1f}s. failed={len(failed)}", flush=True)
    if failed:
        log = Path("scripts/r2-upload-failures.json")
        log.write_text(json.dumps([{"item": it, "error": err} for it, err in failed], indent=2))
        print(f"wrote {log}", flush=True)
        for it, err in failed[:5]:
            print("  fail:", it["key"], "→", err)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
