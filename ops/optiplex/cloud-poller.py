#!/usr/bin/env python3
"""
TMAYD cloud poller / bridge.

Outbound-only HTTPS client for the cbassuarez.com/api/tmayd/* worker.
- Heartbeats every ~30s.
- Pulls one job at a time, writes /var/lib/tmayd/queue/{publicCode}.txt
  atomically (temp file + rename) so the existing print-queue.service path
  watcher fires exactly once.
- Watches /var/lib/tmayd/printed and /var/lib/tmayd/failed for the existing
  print-queue.py's success/failure signals and acks back to cloud.
- Idempotent: per-publicCode state is recorded under /var/lib/tmayd/cloud so
  that crashes and retries do not produce duplicate prints or duplicate acks.
- Never logs raw rejected text. Never exposes a local port.
"""

from __future__ import annotations

import json
import os
import re
import signal
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

ENV_FILE = Path("/etc/tmayd/cloud.env")

DEFAULTS = {
    "TMAYD_API_BASE": "https://cbassuarez.com",
    "TMAYD_BRIDGE_ID": "tmayd-bridge",
    "TMAYD_LOCAL_QUEUE": "/var/lib/tmayd/queue",
    "TMAYD_LOCAL_PRINTED": "/var/lib/tmayd/printed",
    "TMAYD_LOCAL_FAILED": "/var/lib/tmayd/failed",
    "TMAYD_LOCAL_CLOUD_STATE": "/var/lib/tmayd/cloud",
    "TMAYD_PRINTER_HOST": "192.168.50.2",
    "TMAYD_PRINTER_PORT": "9100",
    "TMAYD_HEARTBEAT_SECONDS": "30",
    "TMAYD_POLL_SECONDS": "5",
    "TMAYD_HTTP_TIMEOUT": "8",
}

PUBLIC_CODE_RE = re.compile(r"^DAY-\d{8}-\d{4}$")
PRINTED_RE = re.compile(r"^\d{8}T\d{6}Z-(DAY-\d{8}-\d{4})\.txt$")

# Maximum bytes we will read into memory for a single job. Cloud API enforces
# the 700-char ceiling; this is a hard local cap.
MAX_JOB_BYTES = 16 * 1024

# Stop flag set by signal handlers.
_RUNNING = True


def log(level: str, event: str, **fields: Any) -> None:
    """Structured journald-friendly logging. NEVER includes secrets or raw text."""
    safe: dict[str, Any] = {"lvl": level, "event": event}
    for k, v in fields.items():
        if isinstance(v, (str, int, float, bool)) or v is None:
            safe[k] = v
        else:
            safe[k] = repr(v)
    print(json.dumps(safe, sort_keys=True), flush=True)


def load_env(path: Path) -> dict[str, str]:
    """Build the runtime config.

    Precedence (highest first):
      1. os.environ — already populated by systemd's EnvironmentFile=,
         which is the canonical path under the service.
      2. /etc/tmayd/cloud.env — only read when this script is run standalone
         and the file is readable by the current user.
      3. DEFAULTS.
    """
    values = dict(DEFAULTS)

    # File fallback for standalone / ad-hoc runs. Best-effort: any permission
    # error means we just rely on os.environ + DEFAULTS.
    try:
        if path.exists():
            for raw in path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip().strip('"').strip("'")
    except (PermissionError, OSError):
        pass

    # Environment wins.
    for key in list(values.keys()) + [
        "TMAYD_API_BASE",
        "TMAYD_BRIDGE_ID",
        "TMAYD_BRIDGE_TOKEN",
        "TMAYD_LOCAL_QUEUE",
        "TMAYD_LOCAL_PRINTED",
        "TMAYD_LOCAL_FAILED",
        "TMAYD_LOCAL_CLOUD_STATE",
        "TMAYD_PRINTER_HOST",
        "TMAYD_PRINTER_PORT",
        "TMAYD_HEARTBEAT_SECONDS",
        "TMAYD_POLL_SECONDS",
        "TMAYD_HTTP_TIMEOUT",
    ]:
        env_v = os.environ.get(key)
        if env_v is not None and env_v != "":
            values[key] = env_v

    return values


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def probe_printer(host: str, port: int, timeout: float = 1.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def http_json(
    method: str,
    url: str,
    token: str,
    body: Optional[dict[str, Any]] = None,
    timeout: float = 8.0,
) -> tuple[int, dict[str, Any] | None]:
    headers = {
        "authorization": f"Bearer {token}",
        "accept": "application/json",
        "user-agent": "tmayd-bridge/0.1",
    }
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["content-type"] = "application/json"

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw.decode("utf-8")) if raw else None
            except Exception:
                return resp.status, None
    except urllib.error.HTTPError as exc:
        try:
            payload = exc.read()
            parsed = json.loads(payload.decode("utf-8")) if payload else None
        except Exception:
            parsed = None
        return exc.code, parsed
    except (urllib.error.URLError, socket.timeout) as exc:
        log("warn", "http_error", method=method, url=_safe_url(url), reason=str(exc))
        return 0, None


def _safe_url(url: str) -> str:
    # Strip query / fragment so we never accidentally log a token-bearing URL.
    return url.split("?", 1)[0]


def count_queue(path: Path) -> int:
    try:
        return sum(1 for p in path.iterdir() if p.is_file())
    except FileNotFoundError:
        return 0


def find_printed(public_code: str, printed_dir: Path) -> Optional[Path]:
    try:
        for entry in printed_dir.iterdir():
            if not entry.is_file():
                continue
            m = PRINTED_RE.match(entry.name)
            if m and m.group(1) == public_code:
                return entry
    except FileNotFoundError:
        return None
    return None


def find_failed(public_code: str, failed_dir: Path) -> Optional[Path]:
    candidate = failed_dir / f"{public_code}.txt"
    return candidate if candidate.is_file() else None


def atomic_write(path: Path, content: bytes) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp-" + str(os.getpid()))
    with open(tmp, "wb") as fh:
        fh.write(content)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


class Bridge:
    def __init__(self, env: dict[str, str]) -> None:
        self.api_base = env["TMAYD_API_BASE"].rstrip("/")
        self.bridge_id = env["TMAYD_BRIDGE_ID"]
        self.token = env.get("TMAYD_BRIDGE_TOKEN", "")
        self.queue = Path(env["TMAYD_LOCAL_QUEUE"])
        self.printed = Path(env["TMAYD_LOCAL_PRINTED"])
        self.failed = Path(env["TMAYD_LOCAL_FAILED"])
        self.cloud_state = Path(env["TMAYD_LOCAL_CLOUD_STATE"])
        self.printer_host = env["TMAYD_PRINTER_HOST"]
        self.printer_port = int(env["TMAYD_PRINTER_PORT"])
        self.heartbeat_seconds = int(env["TMAYD_HEARTBEAT_SECONDS"])
        self.poll_seconds = int(env["TMAYD_POLL_SECONDS"])
        self.http_timeout = float(env["TMAYD_HTTP_TIMEOUT"])

        for d in (self.queue, self.printed, self.failed, self.cloud_state):
            d.mkdir(parents=True, exist_ok=True)

        if not self.token:
            log("err", "config_missing", what="TMAYD_BRIDGE_TOKEN")
            sys.exit(2)

        self._last_heartbeat = 0.0

    # ---------- cloud state helpers -----------------------------------------
    def state_dir(self, public_code: str) -> Path:
        d = self.cloud_state / public_code
        d.mkdir(parents=True, exist_ok=True)
        return d

    def state_write(self, public_code: str, name: str, body: dict[str, Any]) -> None:
        atomic_write(self.state_dir(public_code) / name, json.dumps(body).encode("utf-8"))

    def state_exists(self, public_code: str, name: str) -> bool:
        return (self.state_dir(public_code) / name).is_file()

    def state_read(self, public_code: str, name: str) -> Optional[dict[str, Any]]:
        p = self.state_dir(public_code) / name
        if not p.is_file():
            return None
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return None

    # ---------- HTTP -------------------------------------------------------
    def post(self, path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any] | None]:
        return http_json("POST", f"{self.api_base}{path}", self.token, body, self.http_timeout)

    # ---------- core ops ---------------------------------------------------
    def heartbeat(self, last_error: Optional[str] = None) -> None:
        now = time.time()
        if now - self._last_heartbeat < self.heartbeat_seconds:
            return
        self._last_heartbeat = now

        printer_online = probe_printer(self.printer_host, self.printer_port)
        depth = count_queue(self.queue)

        # Determine last printed publicCode safely (newest file in printed/).
        last_printed = None
        try:
            entries = [e for e in self.printed.iterdir() if e.is_file()]
            if entries:
                newest = max(entries, key=lambda p: p.stat().st_mtime)
                m = PRINTED_RE.match(newest.name)
                if m:
                    last_printed = m.group(1)
        except FileNotFoundError:
            pass

        status, _ = self.post(
            "/api/tmayd/bridge/heartbeat",
            {
                "bridge_id": self.bridge_id,
                "status": "printing" if depth > 0 else "idle",
                "printer_online": printer_online,
                "camera_online": False,
                "local_queue_depth": depth,
                "last_printed_public_code": last_printed,
                "last_error": last_error,
            },
        )
        log(
            "info",
            "heartbeat",
            status=status,
            printer_online=printer_online,
            queue_depth=depth,
            last_printed=last_printed,
        )

    def pull_and_enqueue(self) -> Iterable[str]:
        status, body = self.post("/api/tmayd/bridge/jobs/pull", {"bridge_id": self.bridge_id, "max": 1})
        if status != 200 or not body or not body.get("ok"):
            log("warn", "pull_failed", status=status)
            return []
        jobs = body.get("jobs") or []
        enqueued: list[str] = []
        for job in jobs:
            public_code = job.get("publicCode")
            accepted_text = job.get("acceptedText")
            lease_id = job.get("leaseId")
            if not (isinstance(public_code, str) and PUBLIC_CODE_RE.match(public_code) and isinstance(accepted_text, str)):
                log("warn", "pull_bad_job")
                continue
            if not isinstance(lease_id, str) or not lease_id:
                log("warn", "pull_no_lease", public_code=public_code)
                continue

            self.state_write(public_code, "lease.json", {
                "lease_id": lease_id,
                "received_at": now_iso(),
            })
            already = self.state_exists(public_code, "queued.json") or self.state_exists(public_code, "printed_acked.json")
            target = self.queue / f"{public_code}.txt"
            in_printed = find_printed(public_code, self.printed) is not None
            in_failed = find_failed(public_code, self.failed) is not None

            if in_printed:
                log("info", "pull_already_printed", public_code=public_code)
                self.try_ack_printed(public_code, lease_id)
                continue

            if in_failed:
                log("info", "pull_already_failed", public_code=public_code)
                self.try_ack_failed(public_code, lease_id, reason="reaper_found_failed")
                continue

            if target.exists() or already:
                log("info", "pull_skip_already_queued", public_code=public_code)
                continue

            body_bytes = accepted_text.encode("utf-8")
            if len(body_bytes) > MAX_JOB_BYTES:
                log("err", "pull_too_large", public_code=public_code, bytes=len(body_bytes))
                self.try_ack_failed(public_code, lease_id, reason="local_too_large")
                continue

            atomic_write(target, body_bytes)
            self.state_write(public_code, "queued.json", {
                "queued_at": now_iso(),
                "bytes": len(body_bytes),
            })
            log("info", "queued", public_code=public_code, bytes=len(body_bytes))
            enqueued.append(public_code)

        return enqueued

    def reap_acks(self) -> None:
        """Walk printed/ and failed/ for any publicCode we have lease state for
        but have not yet acked back to the cloud."""
        try:
            entries = list(self.cloud_state.iterdir())
        except FileNotFoundError:
            return
        for d in entries:
            if not d.is_dir() or not PUBLIC_CODE_RE.match(d.name):
                continue
            public_code = d.name
            if self.state_exists(public_code, "printed_acked.json"):
                continue
            lease = self.state_read(public_code, "lease.json") or {}
            lease_id = lease.get("lease_id", "") if isinstance(lease, dict) else ""

            if find_printed(public_code, self.printed) is not None:
                self.try_ack_printed(public_code, lease_id)
            elif find_failed(public_code, self.failed) is not None:
                self.try_ack_failed(public_code, lease_id, reason="local_failed")

    def try_ack_printed(self, public_code: str, lease_id: str) -> None:
        status, body = self.post(
            f"/api/tmayd/bridge/jobs/{public_code}/printed",
            {"lease_id": lease_id} if lease_id else {},
        )
        if status == 200 and body and body.get("ok"):
            self.state_write(public_code, "printed_acked.json", {"acked_at": now_iso()})
            log("info", "ack_printed", public_code=public_code)
        else:
            log("warn", "ack_printed_failed", public_code=public_code, status=status)

    def try_ack_failed(self, public_code: str, lease_id: str, reason: str) -> None:
        status, body = self.post(
            f"/api/tmayd/bridge/jobs/{public_code}/failed",
            {"lease_id": lease_id, "error": reason} if lease_id else {"error": reason},
        )
        if status == 200 and body and body.get("ok"):
            self.state_write(public_code, "failed_acked.json", {"acked_at": now_iso(), "reason": reason})
            log("info", "ack_failed", public_code=public_code, reason=reason)
        else:
            log("warn", "ack_failed_failed", public_code=public_code, status=status, reason=reason)


def main() -> int:
    env = load_env(ENV_FILE)
    log("info", "starting", api_base=env["TMAYD_API_BASE"], bridge_id=env["TMAYD_BRIDGE_ID"])

    def _shutdown(*_: Any) -> None:
        global _RUNNING
        _RUNNING = False
        log("info", "shutdown_signal")

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    bridge = Bridge(env)

    while _RUNNING:
        try:
            bridge.heartbeat()
            bridge.reap_acks()
            bridge.pull_and_enqueue()
        except Exception as exc:
            log("err", "loop_exception", message=str(exc))
        for _ in range(bridge.poll_seconds):
            if not _RUNNING:
                break
            time.sleep(1)

    log("info", "stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
