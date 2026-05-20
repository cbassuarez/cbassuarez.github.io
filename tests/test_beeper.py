from pathlib import Path
import sqlite3
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

import unittest

from soc_console.beeper import (
    ActivityEvent,
    BeeperEvent,
    CodexSnapshot,
    CodexThread,
    append_event,
    collect_snapshot,
    event_from_record,
    parse_apply_patch_targets,
    read_events,
    read_recent_threads,
    render_snapshot,
)
from soc_console.cli import build_parser


class BeeperCodexParseTests(unittest.TestCase):
    def thread(self) -> CodexThread:
        return CodexThread(
            id="thread-123456",
            title="Generate sidecar",
            cwd="/Users/seb/project-a",
            updated_at_ms=123,
            rollout_path=Path("/tmp/missing.jsonl"),
            model="gpt-5",
        )

    def test_parse_apply_patch_targets_only_file_headers(self) -> None:
        targets = parse_apply_patch_targets(
            "\n".join(
                [
                    "*** Begin Patch",
                    "*** Add File: src/new.py",
                    "+secret body should not leak",
                    "*** Update File: src/existing.py",
                    "-old body should not leak",
                    "*** Delete File: src/gone.py",
                    "*** End Patch",
                ]
            )
        )

        self.assertEqual(
            targets,
            (
                ("add", "src/new.py"),
                ("update", "src/existing.py"),
                ("delete", "src/gone.py"),
            ),
        )

    def test_patch_apply_end_reports_file_metadata_not_content(self) -> None:
        event = event_from_record(
            {
                "type": "event_msg",
                "timestamp": "2026-05-20T00:00:00Z",
                "payload": {
                    "type": "patch_apply_end",
                    "success": True,
                    "changes": {
                        "/tmp/a.py": {"type": "add", "content": "do not show this"},
                        "/tmp/b.py": {"type": "update", "diff": "do not show this either"},
                    },
                },
            },
            self.thread(),
        )

        self.assertIsNotNone(event)
        assert event is not None
        self.assertEqual(event.kind, "codegen")
        self.assertIn("patch", event.message)
        self.assertIn("/tmp/a.py", event.detail)
        self.assertNotIn("do not show", event.message + event.detail)

    def test_reasoning_items_are_ignored(self) -> None:
        event = event_from_record(
            {
                "type": "response_item",
                "timestamp": "2026-05-20T00:00:00Z",
                "payload": {"type": "reasoning", "encrypted_content": "hidden"},
            },
            self.thread(),
        )

        self.assertIsNone(event)

    def test_exec_command_end_keeps_public_summary_small(self) -> None:
        event = event_from_record(
            {
                "type": "event_msg",
                "timestamp": "2026-05-20T00:00:00Z",
                "payload": {
                    "type": "exec_command_end",
                    "command": ["python3", "-m", "unittest"],
                    "cwd": "/tmp/work",
                    "exit_code": 1,
                    "aggregated_output": "FAIL: test_example\n" + ("x" * 200),
                },
            },
            self.thread(),
        )

        self.assertIsNotNone(event)
        assert event is not None
        self.assertEqual(event.kind, "command")
        self.assertEqual(event.severity, "error")
        self.assertIn("python3 -m unittest", event.detail)
        self.assertIn("FAIL: test_example", event.detail)
        self.assertLessEqual(len(event.detail), 160)


class BeeperStateTests(unittest.TestCase):
    def test_read_recent_threads_from_codex_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            codex_home = Path(tmpdir)
            with sqlite3.connect(codex_home / "state_5.sqlite") as conn:
                conn.execute(
                    """
                    create table threads (
                        id text,
                        title text,
                        cwd text,
                        updated_at_ms integer,
                        rollout_path text,
                        model text,
                        reasoning_effort text,
                        agent_role text,
                        archived integer
                    )
                    """
                )
                conn.execute(
                    """
                    insert into threads values (
                        'thread-a',
                        'Cross repo work',
                        '/tmp/repo-a',
                        42,
                        '/tmp/rollout.jsonl',
                        'gpt-5',
                        'medium',
                        '',
                        0
                    )
                    """
                )

            threads = read_recent_threads(codex_home)

        self.assertEqual(len(threads), 1)
        self.assertEqual(threads[0].title, "Cross repo work")
        self.assertEqual(threads[0].cwd, "/tmp/repo-a")
        self.assertEqual(threads[0].model, "gpt-5")

    def test_collect_snapshot_does_not_require_a_repo(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            codex_home = Path(tmpdir)
            rollout = codex_home / "rollout.jsonl"
            rollout.write_text(
                '{"type":"event_msg","timestamp":"2026-05-20T00:00:00Z",'
                '"payload":{"type":"task_started"}}\n',
                encoding="utf-8",
            )
            with sqlite3.connect(codex_home / "state_5.sqlite") as conn:
                conn.execute(
                    """
                    create table threads (
                        id text,
                        title text,
                        cwd text,
                        updated_at_ms integer,
                        rollout_path text,
                        model text,
                        reasoning_effort text,
                        agent_role text,
                        archived integer
                    )
                    """
                )
                conn.execute(
                    "insert into threads values ('thread-a','Work','/tmp/elsewhere',1,?,?, '', '', 0)",
                    (str(rollout), "gpt-5"),
                )
            events = codex_home / "events.jsonl"

            snapshot = collect_snapshot(codex_home, events)

        self.assertIsNone(snapshot.error)
        self.assertEqual(snapshot.threads[0].cwd, "/tmp/elsewhere")
        self.assertEqual(snapshot.activity[0].message, "turn started")


class BeeperEventTests(unittest.TestCase):
    def test_append_and_read_events(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "events.jsonl"
            append_event(path, kind="note", severity="info", message="hello")
            append_event(path, kind="approval", severity="warn", message="waiting")

            events = read_events(path)

        self.assertEqual(len(events), 2)
        self.assertEqual(events[0].message, "hello")
        self.assertEqual(events[1].kind, "approval")

    def test_render_snapshot_has_codex_lanes(self) -> None:
        snapshot = CodexSnapshot(
            codex_home=Path("/tmp/codex"),
            threads=(
                CodexThread(
                    id="thread-123456",
                    title="Cross repo work",
                    cwd="/tmp/project-a",
                    updated_at_ms=1,
                    rollout_path=Path("/tmp/rollout.jsonl"),
                    model="gpt-5",
                ),
            ),
            activity=(
                ActivityEvent(
                    at="2026-05-20T00:00:00Z",
                    thread_id="thread-123456",
                    title="Cross repo work",
                    cwd="/tmp/project-a",
                    kind="codegen",
                    severity="info",
                    message="patch update: 1 file(s)",
                    detail="/tmp/project-a/src/a.py",
                ),
            ),
            manual_events=(BeeperEvent("2026-05-20T00:00:01Z", "note", "info", "hello"),),
        )

        rendered = render_snapshot(snapshot)

        self.assertIn("[Pulse]", rendered)
        self.assertIn("[Threads]", rendered)
        self.assertIn("[Codegen]", rendered)
        self.assertIn("[Events]", rendered)
        self.assertNotIn("[Files]", rendered)
        self.assertNotIn("[Diff Window]", rendered)


class BeeperCliTests(unittest.TestCase):
    def test_beeper_parser(self) -> None:
        args = build_parser().parse_args(["beeper", "--codex-home", "/tmp/codex", "--no-ui", "--once"])

        self.assertEqual(args.subcommand, "beeper")
        self.assertEqual(args.codex_home, "/tmp/codex")
        self.assertTrue(args.no_ui)
        self.assertTrue(args.once)

    def test_beeper_event_parser(self) -> None:
        args = build_parser().parse_args(
            ["beeper-event", "--kind", "approval", "--severity", "warn", "--message", "need approval"]
        )

        self.assertEqual(args.subcommand, "beeper-event")
        self.assertEqual(args.kind, "approval")
        self.assertEqual(args.severity, "warn")

    def test_beeper_run_parser_keeps_command(self) -> None:
        args = build_parser().parse_args(["beeper-run", "--cwd", "/tmp", "--", "python3", "-m", "unittest"])

        self.assertEqual(args.subcommand, "beeper-run")
        self.assertEqual(args.cwd, "/tmp")
        self.assertEqual(args.command, ["--", "python3", "-m", "unittest"])


if __name__ == "__main__":
    unittest.main()
