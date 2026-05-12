#!/usr/bin/env python3
"""
TMAYD status light.

Drives a single LIFX bulb over the local LAN via lifxlan to mirror the state
of the on-site print station. Reads file-IPC sentinels written by
cloud-poller.py and the existing queue/processing/printed/failed directories;
never writes to tmayd state. systemd's ReadOnlyPaths=/var/lib/tmayd enforces
that invariant at the OS level so this service cannot regress the print
pipeline.

Animation is driven by LIFX's server-side `set_color(hsbk, duration_ms)`: the
bulb's MCU interpolates the fade locally, so the only thing this script does
each tick is decide whether to issue the next set_color. That way a flaky AP
uplink (the most likely exhibit failure) can't cause the light to drop a
frame or hang on a half-fade.

State priority (highest wins):
    NETWORK_LOST > ERROR > PRINTING > MODERATION > IDLE

RECEIVED and PRINTED are one-shot edge pulses layered over the base state.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

ENV_FILE = Path("/etc/tmayd/light.env")

DEFAULTS = {
    "TMAYD_LOCAL_QUEUE": "/var/lib/tmayd/queue",
    "TMAYD_LOCAL_PROCESSING": "/var/lib/tmayd/processing",
    "TMAYD_LOCAL_PRINTED": "/var/lib/tmayd/printed",
    "TMAYD_LOCAL_FAILED": "/var/lib/tmayd/failed",
    "TMAYD_LOCAL_STATUS": "/var/lib/tmayd/status",
    "TMAYD_LIGHT_TICK_MS": "250",
    "TMAYD_LIGHT_STALE_SECONDS": "90",
    "TMAYD_LIGHT_EDGE_WINDOW_SECONDS": "3",
    "TMAYD_LIGHT_KEEPALIVE_SECONDS": "30",
    "TMAYD_LIGHT_DRY_RUN": "0",
    # HSBK quads (H, S, B, K). Saturation 65535 across the board — pure RGB,
    # K is unused at full sat. Indicator brightnesses, never lamp-bright.
    "TMAYD_LIGHT_HSBK_IDLE": "43690,65535,7000,3500",
    "TMAYD_LIGHT_HSBK_AMBER_LO": "6500,65535,8000,3500",
    "TMAYD_LIGHT_HSBK_AMBER_HI": "6500,65535,22000,3500",
    "TMAYD_LIGHT_HSBK_AMBER_FLASH": "6500,65535,40000,3500",
    "TMAYD_LIGHT_HSBK_GREEN": "21845,65535,32000,3500",
    "TMAYD_LIGHT_HSBK_GREEN_FLASH": "21845,65535,50000,3500",
    "TMAYD_LIGHT_HSBK_RED_LO": "0,65535,4000,3500",
    "TMAYD_LIGHT_HSBK_RED_HI": "0,65535,18000,3500",
    "TMAYD_LIGHT_HSBK_RED_LOST_LO": "0,65535,1500,3500",
    "TMAYD_LIGHT_HSBK_RED_LOST_HI": "0,65535,3500,3500",
    # Per-state durations (ms). Single fades, indicator cadence.
    "TMAYD_LIGHT_DUR_IDLE_ENTER": "600",
    "TMAYD_LIGHT_DUR_BREATHE": "1800",
    "TMAYD_LIGHT_DUR_BREATHE_LOST": "2500",
    "TMAYD_LIGHT_DUR_PRINTING_ENTER": "400",
    "TMAYD_LIGHT_DUR_FLASH_RISE": "80",
    "TMAYD_LIGHT_DUR_FLASH_FALL": "600",
    "TMAYD_LIGHT_DUR_PRINTED_FALL": "800",
}

STATES = ("NETWORK_LOST", "ERROR", "PRINTING", "MODERATION", "IDLE")


# ─── logging (mirrors cloud-poller.py for journald consistency) ──────────────

def log(level: str, event: str, **fields: Any) -> None:
    safe: dict[str, Any] = {"lvl": level, "event": event}
    for k, v in fields.items():
        if isinstance(v, (str, int, float, bool)) or v is None:
            safe[k] = v
        else:
            safe[k] = repr(v)
    print(json.dumps(safe, sort_keys=True), flush=True)


# ─── env loader (mirrors cloud-poller.py: env > file > defaults) ─────────────

def load_env(path: Path) -> dict[str, str]:
    values = dict(DEFAULTS)
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
    for key in list(values.keys()):
        env_v = os.environ.get(key)
        if env_v is not None and env_v != "":
            values[key] = env_v
    return values


def parse_hsbk(spec: str) -> tuple[int, int, int, int]:
    parts = [int(p.strip()) for p in spec.split(",")]
    if len(parts) != 4:
        raise ValueError(f"hsbk must be 4 ints, got {spec!r}")
    h, s, b, k = parts
    return (h & 0xFFFF, s & 0xFFFF, b & 0xFFFF, max(1500, min(9000, k)))


# ─── bulb proxy ──────────────────────────────────────────────────────────────

class BulbProxy:
    """Wraps lifxlan; never raises out. Exponential backoff on send failure.

    Discovery is broadcast-based and assumes a single bulb on the LAN — if more
    than one is found we pick the lowest MAC for determinism and log a
    warning.
    """

    BACKOFF_SCHEDULE = (1.0, 2.0, 4.0, 8.0, 30.0)

    def __init__(self, dry_run: bool = False) -> None:
        self.dry_run = dry_run
        self._light: Any = None
        self._backoff_idx = 0
        self._next_retry_at = 0.0
        # exposed for tests / dry-run inspection
        self.commands: list[tuple[tuple[int, int, int, int], int]] = []

    def _try_discover(self) -> None:
        if self.dry_run:
            self._light = "<dry-run>"
            return
        try:
            import lifxlan  # type: ignore
        except ImportError as exc:
            log("err", "lifxlan_missing", message=str(exc))
            self._light = None
            return
        try:
            lan = lifxlan.LifxLAN(None)
            lights = lan.get_lights() or []
        except Exception as exc:
            log("warn", "lifx_discover_failed", message=str(exc))
            self._light = None
            return
        if not lights:
            log("warn", "lifx_no_lights")
            self._light = None
            return
        # Deterministic pick across restarts.
        lights.sort(key=lambda L: getattr(L, "mac_addr", "") or "")
        if len(lights) > 1:
            log("warn", "lifx_multiple_lights", count=len(lights))
        self._light = lights[0]
        log("info", "lifx_bound", mac=getattr(self._light, "mac_addr", ""), ip=getattr(self._light, "ip_addr", ""))

    def _ensure(self, now: float) -> bool:
        if self._light is not None:
            return True
        if now < self._next_retry_at:
            return False
        self._try_discover()
        if self._light is None:
            wait = self.BACKOFF_SCHEDULE[min(self._backoff_idx, len(self.BACKOFF_SCHEDULE) - 1)]
            self._backoff_idx = min(self._backoff_idx + 1, len(self.BACKOFF_SCHEDULE) - 1)
            self._next_retry_at = now + wait
            return False
        self._backoff_idx = 0
        return True

    def set_color(self, hsbk: tuple[int, int, int, int], duration_ms: int, now: Optional[float] = None) -> bool:
        if now is None:
            now = time.time()
        self.commands.append((hsbk, duration_ms))
        if self.dry_run:
            log("info", "dry_set_color", hsbk=list(hsbk), duration_ms=duration_ms)
            return True
        if not self._ensure(now):
            return False
        try:
            # lifxlan signature: set_color(color, duration=0, rapid=False)
            # `rapid=True` skips the ack — we want it; missed frames are
            # benign and the bulb is doing the fade anyway.
            self._light.set_color(list(hsbk), duration=duration_ms, rapid=True)
            return True
        except Exception as exc:
            log("warn", "lifx_send_failed", message=str(exc))
            self._light = None  # force re-discover
            wait = self.BACKOFF_SCHEDULE[min(self._backoff_idx, len(self.BACKOFF_SCHEDULE) - 1)]
            self._backoff_idx = min(self._backoff_idx + 1, len(self.BACKOFF_SCHEDULE) - 1)
            self._next_retry_at = now + wait
            return False


# ─── state evaluator ─────────────────────────────────────────────────────────

@dataclass
class Evaluation:
    state: str                       # NETWORK_LOST | ERROR | PRINTING | MODERATION | IDLE
    edges: list[str] = field(default_factory=list)  # subset of {"RECEIVED", "PRINTED"}
    pending_moderation: int = 0


class StateEvaluator:
    def __init__(self, env: dict[str, str]) -> None:
        self.queue = Path(env["TMAYD_LOCAL_QUEUE"])
        self.processing = Path(env["TMAYD_LOCAL_PROCESSING"])
        self.printed = Path(env["TMAYD_LOCAL_PRINTED"])
        self.failed = Path(env["TMAYD_LOCAL_FAILED"])
        self.status_dir = Path(env["TMAYD_LOCAL_STATUS"])
        self.stale_seconds = int(env["TMAYD_LIGHT_STALE_SECONDS"])
        self.edge_window = float(env["TMAYD_LIGHT_EDGE_WINDOW_SECONDS"])
        # Per-sentinel "last mtime we already emitted an edge for". An edge
        # fires once per distinct mtime; redundant ticks within the window
        # don't re-fire.
        self._last_edge_mtime: dict[str, float] = {}

    @staticmethod
    def _has_files(p: Path) -> bool:
        try:
            return any(entry.is_file() for entry in p.iterdir())
        except FileNotFoundError:
            return False

    def _mtime(self, name: str) -> Optional[float]:
        try:
            return (self.status_dir / name).stat().st_mtime
        except FileNotFoundError:
            return None

    def _heartbeat_payload(self) -> tuple[Optional[float], dict[str, Any]]:
        p = self.status_dir / "heartbeat_ok"
        try:
            st = p.stat()
        except FileNotFoundError:
            return None, {}
        try:
            payload = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            payload = {}
        return st.st_mtime, payload if isinstance(payload, dict) else {}

    def _check_edge(self, name: str, now: float) -> bool:
        m = self._mtime(name)
        if m is None:
            return False
        if now - m > self.edge_window:
            # File exists but its event is too old; don't fire.
            self._last_edge_mtime[name] = m
            return False
        if self._last_edge_mtime.get(name) == m:
            return False
        self._last_edge_mtime[name] = m
        return True

    def evaluate(self, now: Optional[float] = None) -> Evaluation:
        if now is None:
            now = time.time()

        edges: list[str] = []
        if self._check_edge("last_enqueue", now):
            edges.append("RECEIVED")
        if self._check_edge("last_printed", now):
            edges.append("PRINTED")

        hb_mtime, hb_payload = self._heartbeat_payload()
        pending = 0
        printer_online = True
        if isinstance(hb_payload.get("pending_moderation"), (int, float)):
            pending = int(hb_payload["pending_moderation"])
        if isinstance(hb_payload.get("printer_online"), bool):
            printer_online = hb_payload["printer_online"]

        # Priority ladder.
        if hb_mtime is None or now - hb_mtime > self.stale_seconds:
            return Evaluation(state="NETWORK_LOST", edges=edges, pending_moderation=pending)
        if self._has_files(self.failed) or not printer_online:
            return Evaluation(state="ERROR", edges=edges, pending_moderation=pending)
        if self._has_files(self.processing):
            return Evaluation(state="PRINTING", edges=edges, pending_moderation=pending)
        if pending > 0:
            return Evaluation(state="MODERATION", edges=edges, pending_moderation=pending)
        return Evaluation(state="IDLE", edges=edges, pending_moderation=pending)


# ─── renderer ────────────────────────────────────────────────────────────────

class Renderer:
    """Maps Evaluation → bulb commands.

    Steady states (IDLE, PRINTING) re-issue set_color every keepalive interval
    in case the bulb was power-cycled.

    Breathing states (MODERATION, ERROR, NETWORK_LOST) schedule the next
    set_color via `_next_breathe_at`; one bulb command per fade direction.

    Edges (RECEIVED, PRINTED) issue a bright flash with a short rise, then
    schedule a return-to-base set_color via `_pending_return`. The base is
    re-evaluated at return-time so a flash during PRINTING returns to green,
    not to idle.
    """

    def __init__(self, bulb: BulbProxy, env: dict[str, str]) -> None:
        self.bulb = bulb
        self.idle = parse_hsbk(env["TMAYD_LIGHT_HSBK_IDLE"])
        self.amber_lo = parse_hsbk(env["TMAYD_LIGHT_HSBK_AMBER_LO"])
        self.amber_hi = parse_hsbk(env["TMAYD_LIGHT_HSBK_AMBER_HI"])
        self.amber_flash = parse_hsbk(env["TMAYD_LIGHT_HSBK_AMBER_FLASH"])
        self.green = parse_hsbk(env["TMAYD_LIGHT_HSBK_GREEN"])
        self.green_flash = parse_hsbk(env["TMAYD_LIGHT_HSBK_GREEN_FLASH"])
        self.red_lo = parse_hsbk(env["TMAYD_LIGHT_HSBK_RED_LO"])
        self.red_hi = parse_hsbk(env["TMAYD_LIGHT_HSBK_RED_HI"])
        self.red_lost_lo = parse_hsbk(env["TMAYD_LIGHT_HSBK_RED_LOST_LO"])
        self.red_lost_hi = parse_hsbk(env["TMAYD_LIGHT_HSBK_RED_LOST_HI"])

        self.dur_idle_enter = int(env["TMAYD_LIGHT_DUR_IDLE_ENTER"])
        self.dur_breathe = int(env["TMAYD_LIGHT_DUR_BREATHE"])
        self.dur_breathe_lost = int(env["TMAYD_LIGHT_DUR_BREATHE_LOST"])
        self.dur_printing_enter = int(env["TMAYD_LIGHT_DUR_PRINTING_ENTER"])
        self.dur_flash_rise = int(env["TMAYD_LIGHT_DUR_FLASH_RISE"])
        self.dur_flash_fall = int(env["TMAYD_LIGHT_DUR_FLASH_FALL"])
        self.dur_printed_fall = int(env["TMAYD_LIGHT_DUR_PRINTED_FALL"])
        self.keepalive_seconds = int(env["TMAYD_LIGHT_KEEPALIVE_SECONDS"])

        self._current_state: Optional[str] = None
        self._next_breathe_at: float = 0.0
        self._breathe_phase: int = 0
        self._next_keepalive_at: float = 0.0
        self._pending_return: Optional[tuple[tuple[int, int, int, int], int, float]] = None

    def _base_hsbk_for(self, state: str) -> tuple[tuple[int, int, int, int], int]:
        """Return (hsbk, duration_ms) that represents the steady or
        mid-breathe baseline for a state. Used by edge returns."""
        if state == "PRINTING":
            return (self.green, self.dur_printing_enter)
        if state == "MODERATION":
            return (self.amber_hi, self.dur_breathe)
        if state == "ERROR":
            return (self.red_hi, self.dur_breathe)
        if state == "NETWORK_LOST":
            return (self.red_lost_hi, self.dur_breathe_lost)
        return (self.idle, self.dur_idle_enter)

    def _enter_state(self, state: str, now: float) -> None:
        self._current_state = state
        self._breathe_phase = 0
        self._next_breathe_at = now
        if state == "IDLE":
            self.bulb.set_color(self.idle, self.dur_idle_enter, now)
            self._next_keepalive_at = now + self.keepalive_seconds
        elif state == "PRINTING":
            self.bulb.set_color(self.green, self.dur_printing_enter, now)
            self._next_keepalive_at = now + self.keepalive_seconds
        elif state == "MODERATION":
            # Start breathe at the bright phase so MODERATION is immediately
            # visible after a transition; the next breathe step will dim.
            self.bulb.set_color(self.amber_hi, self.dur_breathe, now)
            self._breathe_phase = 1
            self._next_breathe_at = now + self.dur_breathe / 1000.0
        elif state == "ERROR":
            self.bulb.set_color(self.red_hi, self.dur_breathe, now)
            self._breathe_phase = 1
            self._next_breathe_at = now + self.dur_breathe / 1000.0
        elif state == "NETWORK_LOST":
            self.bulb.set_color(self.red_lost_hi, self.dur_breathe_lost, now)
            self._breathe_phase = 1
            self._next_breathe_at = now + self.dur_breathe_lost / 1000.0
        log("info", "state_enter", state=state)

    def _sustain_state(self, state: str, now: float) -> None:
        if state in ("IDLE", "PRINTING"):
            if now >= self._next_keepalive_at:
                hsbk, dur = self._base_hsbk_for(state)
                self.bulb.set_color(hsbk, dur, now)
                self._next_keepalive_at = now + self.keepalive_seconds
            return
        # Breathing states: alternate hi/lo, advance schedule by duration.
        if now < self._next_breathe_at:
            return
        if state == "MODERATION":
            target = self.amber_lo if self._breathe_phase == 1 else self.amber_hi
            dur = self.dur_breathe
        elif state == "ERROR":
            target = self.red_lo if self._breathe_phase == 1 else self.red_hi
            dur = self.dur_breathe
        elif state == "NETWORK_LOST":
            target = self.red_lost_lo if self._breathe_phase == 1 else self.red_lost_hi
            dur = self.dur_breathe_lost
        else:
            return
        self.bulb.set_color(target, dur, now)
        self._breathe_phase ^= 1
        self._next_breathe_at = now + dur / 1000.0

    def _fire_edges(self, state: str, edges: list[str], now: float) -> None:
        # PRINTED beats RECEIVED if both fire on the same tick (the user just
        # saw a print complete; the new enqueue is the next cycle).
        if "PRINTED" in edges:
            self.bulb.set_color(self.green_flash, self.dur_flash_rise, now)
            # PRINTED always returns to IDLE — a successful print clears the
            # active job, so the bulb's resting place is idle blue.
            self._pending_return = (self.idle, self.dur_printed_fall, now + self.dur_flash_rise / 1000.0)
            log("info", "edge", kind="PRINTED")
            return
        if "RECEIVED" in edges:
            self.bulb.set_color(self.amber_flash, self.dur_flash_rise, now)
            base, base_dur = self._base_hsbk_for(state)
            self._pending_return = (base, max(base_dur, self.dur_flash_fall), now + self.dur_flash_rise / 1000.0)
            log("info", "edge", kind="RECEIVED")

    def tick(self, ev: Evaluation, now: Optional[float] = None) -> None:
        if now is None:
            now = time.time()
        if self._current_state != ev.state:
            self._enter_state(ev.state, now)
        else:
            self._sustain_state(ev.state, now)
        if ev.edges:
            self._fire_edges(ev.state, ev.edges, now)
        if self._pending_return is not None:
            hsbk, dur, due_at = self._pending_return
            if now >= due_at:
                self.bulb.set_color(hsbk, dur, now)
                self._pending_return = None
                # The post-edge return resets the breathe schedule so the
                # next breathe step doesn't fire instantly on top of the fall.
                self._next_breathe_at = now + dur / 1000.0


# ─── main loop ───────────────────────────────────────────────────────────────

_RUNNING = True


def _install_signal_handlers() -> None:
    def _shutdown(*_: Any) -> None:
        global _RUNNING
        _RUNNING = False
        log("info", "shutdown_signal")

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)


def run(env: dict[str, str], simulate: Optional[str] = None) -> int:
    tick_ms = int(env["TMAYD_LIGHT_TICK_MS"])
    dry_run = env["TMAYD_LIGHT_DRY_RUN"] not in ("0", "", "false", "False")
    bulb = BulbProxy(dry_run=dry_run)
    renderer = Renderer(bulb, env)
    evaluator = StateEvaluator(env)
    log("info", "starting", dry_run=dry_run, tick_ms=tick_ms, simulate=simulate or "")

    while _RUNNING:
        now = time.time()
        try:
            if simulate is not None:
                ev = Evaluation(state=simulate, edges=[], pending_moderation=0)
            else:
                ev = evaluator.evaluate(now)
            renderer.tick(ev, now)
        except Exception as exc:
            log("err", "tick_exception", message=str(exc))
        time.sleep(tick_ms / 1000.0)

    log("info", "stopped")
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="TMAYD LIFX status light")
    parser.add_argument("--dry-run", action="store_true", help="log commands, no bulb I/O")
    parser.add_argument("--simulate", choices=STATES, help="force a state, ignore filesystem")
    args = parser.parse_args(argv)

    env = load_env(ENV_FILE)
    if args.dry_run:
        env["TMAYD_LIGHT_DRY_RUN"] = "1"

    _install_signal_handlers()
    return run(env, simulate=args.simulate)


if __name__ == "__main__":
    sys.exit(main())
