"""
Tests for ops/optiplex/status-light.py.

Run from the repo root:
    python3 -m unittest ops.optiplex.test_status_light

or directly:
    python3 ops/optiplex/test_status_light.py

Like print-queue.py, the deployed script is hyphenated so it's loaded via
importlib. Tests use BulbProxy in dry-run mode and override env paths to
point at a tmp tree — no lifxlan, no real bulb, no /var/lib/tmayd writes.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).parent
SCRIPT = HERE / "status-light.py"

_spec = importlib.util.spec_from_file_location("status_light", SCRIPT)
sl = importlib.util.module_from_spec(_spec)
# Register before exec so @dataclass (Py 3.14) can resolve cls.__module__.
sys.modules["status_light"] = sl
_spec.loader.exec_module(sl)


def make_env(root: Path, **overrides: str) -> dict[str, str]:
    """Build an env dict pointed at a temp tree."""
    env = dict(sl.DEFAULTS)
    env["TMAYD_LOCAL_QUEUE"] = str(root / "queue")
    env["TMAYD_LOCAL_PROCESSING"] = str(root / "processing")
    env["TMAYD_LOCAL_PRINTED"] = str(root / "printed")
    env["TMAYD_LOCAL_FAILED"] = str(root / "failed")
    env["TMAYD_LOCAL_STATUS"] = str(root / "status")
    env["TMAYD_LIGHT_DRY_RUN"] = "1"
    env.update(overrides)
    for sub in ("queue", "processing", "printed", "failed", "status"):
        (root / sub).mkdir(parents=True, exist_ok=True)
    return env


def write_heartbeat(status_dir: Path, *, pending_moderation: int = 0,
                    printer_online: bool = True, age_seconds: float = 0.0) -> None:
    p = status_dir / "heartbeat_ok"
    p.write_text(json.dumps({
        "at": "2026-05-12T00:00:00Z",
        "pending_moderation": pending_moderation,
        "printer_online": printer_online,
        "queue_depth": 0,
    }), encoding="utf-8")
    if age_seconds > 0:
        past = time.time() - age_seconds
        os.utime(p, (past, past))


# ── helpers ──────────────────────────────────────────────────────────────


class TmpRootTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.env = make_env(self.root)

    def tearDown(self) -> None:
        self._tmp.cleanup()


# ── StateEvaluator: priority ladder ──────────────────────────────────────


class PriorityLadder(TmpRootTest):
    def test_no_heartbeat_is_network_lost(self):
        ev = sl.StateEvaluator(self.env).evaluate(now=time.time())
        self.assertEqual(ev.state, "NETWORK_LOST")

    def test_stale_heartbeat_is_network_lost(self):
        write_heartbeat(self.root / "status", age_seconds=120)
        ev = sl.StateEvaluator(self.env).evaluate(now=time.time())
        self.assertEqual(ev.state, "NETWORK_LOST")

    def test_fresh_heartbeat_idle(self):
        write_heartbeat(self.root / "status")
        ev = sl.StateEvaluator(self.env).evaluate(now=time.time())
        self.assertEqual(ev.state, "IDLE")

    def test_pending_moderation_promotes_to_moderation(self):
        write_heartbeat(self.root / "status", pending_moderation=2)
        ev = sl.StateEvaluator(self.env).evaluate(now=time.time())
        self.assertEqual(ev.state, "MODERATION")
        self.assertEqual(ev.pending_moderation, 2)

    def test_processing_file_beats_moderation(self):
        write_heartbeat(self.root / "status", pending_moderation=2)
        (self.root / "processing" / "DAY-20260512-0001.txt").write_text("x")
        ev = sl.StateEvaluator(self.env).evaluate(now=time.time())
        self.assertEqual(ev.state, "PRINTING")

    def test_failed_file_beats_printing(self):
        write_heartbeat(self.root / "status")
        (self.root / "processing" / "DAY-20260512-0001.txt").write_text("x")
        (self.root / "failed" / "DAY-20260512-0001.txt").write_text("x")
        ev = sl.StateEvaluator(self.env).evaluate(now=time.time())
        self.assertEqual(ev.state, "ERROR")

    def test_printer_offline_is_error(self):
        write_heartbeat(self.root / "status", printer_online=False)
        ev = sl.StateEvaluator(self.env).evaluate(now=time.time())
        self.assertEqual(ev.state, "ERROR")

    def test_network_lost_outranks_everything(self):
        # Even with files everywhere, no heartbeat dominates.
        (self.root / "processing" / "DAY-20260512-0001.txt").write_text("x")
        (self.root / "failed" / "DAY-20260512-0001.txt").write_text("x")
        ev = sl.StateEvaluator(self.env).evaluate(now=time.time())
        self.assertEqual(ev.state, "NETWORK_LOST")


# ── StateEvaluator: edge detection ───────────────────────────────────────


class EdgeDetection(TmpRootTest):
    def setUp(self) -> None:
        super().setUp()
        write_heartbeat(self.root / "status")
        self.eval = sl.StateEvaluator(self.env)

    def test_received_edge_fires_once_per_touch(self):
        sentinel = self.root / "status" / "last_enqueue"
        sentinel.touch()
        ev1 = self.eval.evaluate(now=time.time())
        self.assertIn("RECEIVED", ev1.edges)
        # Same mtime → no re-fire on subsequent ticks.
        ev2 = self.eval.evaluate(now=time.time())
        self.assertNotIn("RECEIVED", ev2.edges)
        # New touch → fires again.
        future = time.time() + 1.0
        os.utime(sentinel, (future, future))
        ev3 = self.eval.evaluate(now=time.time() + 1.0)
        self.assertIn("RECEIVED", ev3.edges)

    def test_old_sentinel_does_not_fire(self):
        # A sentinel older than the edge window must not produce a flash on
        # service start (otherwise restarting would re-flash for past jobs).
        sentinel = self.root / "status" / "last_enqueue"
        sentinel.touch()
        old = time.time() - 60
        os.utime(sentinel, (old, old))
        ev = self.eval.evaluate(now=time.time())
        self.assertNotIn("RECEIVED", ev.edges)

    def test_printed_edge(self):
        sentinel = self.root / "status" / "last_printed"
        sentinel.touch()
        ev = self.eval.evaluate(now=time.time())
        self.assertIn("PRINTED", ev.edges)


# ── Renderer: command emission ───────────────────────────────────────────


class RendererBasics(TmpRootTest):
    def _renderer(self) -> tuple[sl.Renderer, sl.BulbProxy]:
        bulb = sl.BulbProxy(dry_run=True)
        return sl.Renderer(bulb, self.env), bulb

    def test_enter_idle_emits_idle_color(self):
        r, bulb = self._renderer()
        r.tick(sl.Evaluation(state="IDLE"), now=100.0)
        self.assertEqual(len(bulb.commands), 1)
        hsbk, dur = bulb.commands[0]
        self.assertEqual(hsbk, sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_IDLE"]))
        self.assertEqual(dur, int(self.env["TMAYD_LIGHT_DUR_IDLE_ENTER"]))

    def test_enter_printing_emits_green(self):
        r, bulb = self._renderer()
        r.tick(sl.Evaluation(state="PRINTING"), now=100.0)
        hsbk, _ = bulb.commands[-1]
        self.assertEqual(hsbk, sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_GREEN"]))

    def test_moderation_breathes_alternating(self):
        r, bulb = self._renderer()
        # Initial entry: hi phase.
        r.tick(sl.Evaluation(state="MODERATION"), now=100.0)
        first = bulb.commands[-1]
        self.assertEqual(first[0], sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_AMBER_HI"]))
        # Advance just past the breathe duration → lo phase.
        breathe_s = int(self.env["TMAYD_LIGHT_DUR_BREATHE"]) / 1000.0
        r.tick(sl.Evaluation(state="MODERATION"), now=100.0 + breathe_s + 0.01)
        self.assertEqual(bulb.commands[-1][0], sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_AMBER_LO"]))
        # Another breathe later → back to hi.
        r.tick(sl.Evaluation(state="MODERATION"), now=100.0 + 2 * breathe_s + 0.02)
        self.assertEqual(bulb.commands[-1][0], sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_AMBER_HI"]))

    def test_received_flash_then_return_to_base(self):
        r, bulb = self._renderer()
        # Enter IDLE first.
        r.tick(sl.Evaluation(state="IDLE"), now=100.0)
        bulb.commands.clear()
        # RECEIVED edge during IDLE → flash, then schedule return to idle.
        r.tick(sl.Evaluation(state="IDLE", edges=["RECEIVED"]), now=100.5)
        self.assertEqual(bulb.commands[-1][0], sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_AMBER_FLASH"]))
        # Advance past the rise → return should fire.
        rise_s = int(self.env["TMAYD_LIGHT_DUR_FLASH_RISE"]) / 1000.0
        r.tick(sl.Evaluation(state="IDLE"), now=100.5 + rise_s + 0.01)
        self.assertEqual(bulb.commands[-1][0], sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_IDLE"]))

    def test_printed_edge_returns_to_idle(self):
        r, bulb = self._renderer()
        # Already in PRINTING when the edge arrives.
        r.tick(sl.Evaluation(state="PRINTING"), now=100.0)
        bulb.commands.clear()
        r.tick(sl.Evaluation(state="PRINTING", edges=["PRINTED"]), now=100.1)
        self.assertEqual(bulb.commands[-1][0], sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_GREEN_FLASH"]))
        rise_s = int(self.env["TMAYD_LIGHT_DUR_FLASH_RISE"]) / 1000.0
        # After the rise, return is to IDLE (a successful print clears the active job).
        r.tick(sl.Evaluation(state="PRINTING"), now=100.1 + rise_s + 0.01)
        self.assertEqual(bulb.commands[-1][0], sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_IDLE"]))

    def test_keepalive_reissues_idle_after_interval(self):
        r, bulb = self._renderer()
        r.tick(sl.Evaluation(state="IDLE"), now=100.0)
        keepalive_s = int(self.env["TMAYD_LIGHT_KEEPALIVE_SECONDS"])
        # Just before keepalive → no new command.
        baseline = len(bulb.commands)
        r.tick(sl.Evaluation(state="IDLE"), now=100.0 + keepalive_s - 1)
        self.assertEqual(len(bulb.commands), baseline)
        # Past keepalive → re-issue.
        r.tick(sl.Evaluation(state="IDLE"), now=100.0 + keepalive_s + 1)
        self.assertEqual(len(bulb.commands), baseline + 1)
        self.assertEqual(bulb.commands[-1][0], sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_IDLE"]))


# ── BulbProxy: backoff schedule on failure ───────────────────────────────


class BackoffSchedule(unittest.TestCase):
    def test_backoff_schedule_monotonic_and_capped(self):
        # Sanity: schedule starts small and tops out.
        sched = sl.BulbProxy.BACKOFF_SCHEDULE
        self.assertEqual(sched[0], 1.0)
        self.assertGreater(sched[-1], sched[-2])
        for a, b in zip(sched, sched[1:]):
            self.assertGreaterEqual(b, a)

    def test_no_crash_when_lifxlan_missing(self):
        # The proxy must never raise out — discovery failure just returns
        # False from set_color and schedules the next retry.
        bulb = sl.BulbProxy(dry_run=False)
        # Force the import path to "missing" by pre-poisoning sys.modules.
        import sys as _sys
        sentinel = object()
        prev = _sys.modules.get("lifxlan", sentinel)
        _sys.modules["lifxlan"] = None  # type: ignore[assignment]
        try:
            ok = bulb.set_color((0, 0, 0, 3500), 100, now=0.0)
        finally:
            if prev is sentinel:
                _sys.modules.pop("lifxlan", None)
            else:
                _sys.modules["lifxlan"] = prev
        self.assertFalse(ok)
        # Backoff advanced; next call within the backoff window also fails
        # without attempting discovery.
        self.assertGreater(bulb._next_retry_at, 0.0)


# ── dry-run command shape ────────────────────────────────────────────────


class DryRunOutput(TmpRootTest):
    def test_simulate_error_emits_red_command(self):
        # End-to-end: building a renderer + ticking with state=ERROR yields
        # a red hi set_color first.
        bulb = sl.BulbProxy(dry_run=True)
        r = sl.Renderer(bulb, self.env)
        r.tick(sl.Evaluation(state="ERROR"), now=100.0)
        self.assertGreater(len(bulb.commands), 0)
        hsbk, _ = bulb.commands[-1]
        self.assertEqual(hsbk, sl.parse_hsbk(self.env["TMAYD_LIGHT_HSBK_RED_HI"]))


if __name__ == "__main__":
    unittest.main()
