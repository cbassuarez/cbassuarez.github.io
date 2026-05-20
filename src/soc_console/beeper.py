"""Ambient Codex-wide activity sidecar."""

from __future__ import annotations

import json
import sqlite3
import subprocess
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


DEFAULT_EVENT_LOG = Path("/private/tmp/codex-beeper/events.jsonl")
MAX_ACTIVITY = 80
MAX_EVENTS = 16
MAX_THREADS = 8


@dataclass(frozen=True)
class CodexThread:
    id: str
    title: str
    cwd: str
    updated_at_ms: int
    rollout_path: Path
    model: str = ""
    reasoning_effort: str = ""
    agent_role: str = ""


@dataclass(frozen=True)
class ActivityEvent:
    at: str
    thread_id: str
    title: str
    cwd: str
    kind: str
    severity: str
    message: str
    detail: str = ""
    exit_code: int | None = None


@dataclass(frozen=True)
class BeeperEvent:
    at: str
    kind: str
    severity: str
    message: str
    command: tuple[str, ...] = ()
    exit_code: int | None = None

    def to_json(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "at": self.at,
            "kind": self.kind,
            "severity": self.severity,
            "message": self.message,
        }
        if self.command:
            payload["command"] = list(self.command)
        if self.exit_code is not None:
            payload["exit_code"] = self.exit_code
        return payload

    @classmethod
    def from_json(cls, payload: dict[str, object]) -> "BeeperEvent":
        command_raw = payload.get("command", [])
        command = tuple(str(item) for item in command_raw) if isinstance(command_raw, list) else ()
        exit_code = payload.get("exit_code")
        return cls(
            at=str(payload.get("at", "")),
            kind=str(payload.get("kind", "note")),
            severity=str(payload.get("severity", "info")),
            message=str(payload.get("message", "")),
            command=command,
            exit_code=exit_code if isinstance(exit_code, int) else None,
        )


@dataclass(frozen=True)
class CodexSnapshot:
    codex_home: Path
    threads: tuple[CodexThread, ...]
    activity: tuple[ActivityEvent, ...]
    manual_events: tuple[BeeperEvent, ...]
    error: str | None = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_codex_home() -> Path:
    return Path("~/.codex").expanduser().resolve()


def default_event_log() -> Path:
    return DEFAULT_EVENT_LOG


def resolve_event_log(path: str | None) -> Path:
    return Path(path).expanduser().resolve() if path else default_event_log()


def append_event(
    path: Path,
    *,
    kind: str,
    severity: str,
    message: str,
    command: Sequence[str] = (),
    exit_code: int | None = None,
) -> BeeperEvent:
    event = BeeperEvent(
        at=now_iso(),
        kind=kind,
        severity=severity,
        message=message,
        command=tuple(command),
        exit_code=exit_code,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(event.to_json(), ensure_ascii=True) + "\n")
    return event


def read_events(path: Path, *, limit: int = MAX_EVENTS) -> tuple[BeeperEvent, ...]:
    if not path.exists():
        return ()
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    events: list[BeeperEvent] = []
    for line in lines[-limit:]:
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            events.append(BeeperEvent.from_json(payload))
    return tuple(events)


def read_recent_threads(codex_home: Path, *, limit: int = MAX_THREADS) -> tuple[CodexThread, ...]:
    db_path = codex_home / "state_5.sqlite"
    if not db_path.exists():
        return ()
    query = """
        select
            id,
            title,
            cwd,
            updated_at_ms,
            rollout_path,
            coalesce(model, ''),
            coalesce(reasoning_effort, ''),
            coalesce(agent_role, '')
        from threads
        where coalesce(archived, 0) = 0
        order by updated_at_ms desc
        limit ?
    """
    uri = f"file:{db_path}?mode=ro"
    with sqlite3.connect(uri, uri=True, timeout=1.0) as conn:
        rows = conn.execute(query, (limit,)).fetchall()
    return tuple(
        CodexThread(
            id=str(row[0]),
            title=str(row[1]),
            cwd=str(row[2]),
            updated_at_ms=int(row[3] or 0),
            rollout_path=Path(str(row[4])),
            model=str(row[5] or ""),
            reasoning_effort=str(row[6] or ""),
            agent_role=str(row[7] or ""),
        )
        for row in rows
    )


def tail_jsonl(path: Path, *, limit: int = 220) -> tuple[dict[str, Any], ...]:
    if not path.exists():
        return ()
    lines: deque[str] = deque(maxlen=limit)
    with path.open("r", encoding="utf-8", errors="ignore") as file:
        for line in file:
            lines.append(line)
    records: list[dict[str, Any]] = []
    for line in lines:
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            records.append(payload)
    return tuple(records)


def _trim(value: str, width: int) -> str:
    value = " ".join(value.split())
    if len(value) <= width:
        return value
    return value[: max(width - 3, 0)] + "..."


def _compact_path(path: str) -> str:
    home = str(Path.home())
    if path.startswith(home):
        return "~" + path[len(home) :]
    return path


def _safe_json(value: str) -> dict[str, Any]:
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def summarize_tool_call(payload: dict[str, Any]) -> tuple[str, str]:
    name = str(payload.get("name", "tool"))
    args = _safe_json(str(payload.get("arguments", "")))
    if name == "exec_command":
        return name, _trim(str(args.get("cmd", "")), 120)
    if name == "view_image":
        return name, _compact_path(str(args.get("path", "")))
    if name == "imagegen":
        return name, _trim(str(args.get("prompt", "")), 120)
    return name, _trim(json.dumps(args, ensure_ascii=True), 120) if args else ""


def parse_apply_patch_targets(value: str) -> tuple[tuple[str, str], ...]:
    targets: list[tuple[str, str]] = []
    for line in value.splitlines():
        for marker, action in (
            ("*** Add File: ", "add"),
            ("*** Update File: ", "update"),
            ("*** Delete File: ", "delete"),
        ):
            if line.startswith(marker):
                targets.append((action, _compact_path(line[len(marker) :].strip())))
    return tuple(targets)


def summarize_apply_patch_input(value: str) -> str:
    targets = parse_apply_patch_targets(value)
    if not targets:
        return "apply_patch requested"
    return "apply_patch requested: " + ", ".join(f"{action}:{path}" for action, path in targets[:4])


def summarize_patch_end(payload: dict[str, Any]) -> tuple[str, str, str]:
    success = bool(payload.get("success"))
    changes = payload.get("changes")
    files: list[str] = []
    actions: list[str] = []
    if isinstance(changes, dict):
        for path, item in changes.items():
            files.append(_compact_path(str(path)))
            if isinstance(item, dict):
                actions.append(str(item.get("type", "change")))
    action_label = "/".join(sorted(set(actions))) if actions else "change"
    severity = "info" if success else "error"
    message = f"patch {action_label}: {len(files)} file(s)"
    return severity, message, ", ".join(files[:5])


def summarize_command_output(payload: dict[str, Any]) -> str:
    for key in ("aggregated_output", "stdout", "stderr"):
        value = payload.get(key)
        if isinstance(value, str):
            line = next((item.strip() for item in value.splitlines() if item.strip()), "")
            if line:
                return _trim(line, 120)
    return ""


def event_from_record(record: dict[str, Any], thread: CodexThread) -> ActivityEvent | None:
    timestamp = str(record.get("timestamp", ""))
    payload = record.get("payload")
    if not isinstance(payload, dict):
        return None
    payload_type = str(payload.get("type", ""))

    if record.get("type") == "response_item":
        if payload_type == "reasoning":
            return None
        if payload_type == "function_call":
            name, detail = summarize_tool_call(payload)
            return ActivityEvent(timestamp, thread.id, thread.title, thread.cwd, "tool-call", "info", name, detail)
        if payload_type == "custom_tool_call":
            name = str(payload.get("name", "custom-tool"))
            if name == "apply_patch":
                return ActivityEvent(
                    timestamp,
                    thread.id,
                    thread.title,
                    thread.cwd,
                    "codegen",
                    "info",
                    summarize_apply_patch_input(str(payload.get("input", ""))),
                )
            return ActivityEvent(timestamp, thread.id, thread.title, thread.cwd, "tool-call", "info", name)
        if payload_type == "message":
            role = str(payload.get("role", "assistant"))
            content = payload.get("content", [])
            text_parts = [
                str(item.get("text", ""))
                for item in content
                if isinstance(item, dict) and item.get("type") in {"output_text", "input_text"}
            ]
            text = _trim(" ".join(text_parts), 140)
            if not text:
                return None
            return ActivityEvent(timestamp, thread.id, thread.title, thread.cwd, f"{role}-message", "info", text)

    if record.get("type") == "event_msg":
        if payload_type == "patch_apply_end":
            severity, message, detail = summarize_patch_end(payload)
            return ActivityEvent(timestamp, thread.id, thread.title, thread.cwd, "codegen", severity, message, detail)
        if payload_type == "exec_command_end":
            command_raw = payload.get("command", [])
            command = " ".join(str(item) for item in command_raw) if isinstance(command_raw, list) else ""
            exit_code = payload.get("exit_code")
            exit_code_int = exit_code if isinstance(exit_code, int) else None
            severity = "info" if exit_code_int == 0 else "error"
            output = summarize_command_output(payload)
            detail = _trim(command, 120)
            if output:
                detail = f"{detail} | {output}" if detail else output
            return ActivityEvent(
                timestamp,
                thread.id,
                thread.title,
                str(payload.get("cwd") or thread.cwd),
                "command",
                severity,
                f"command exit {exit_code_int}",
                detail,
                exit_code_int,
            )
        if payload_type == "image_generation_end":
            return ActivityEvent(
                timestamp,
                thread.id,
                thread.title,
                thread.cwd,
                "asset-gen",
                "info",
                f"image generation {payload.get('status', 'updated')}",
            )
        if payload_type == "task_started":
            return ActivityEvent(timestamp, thread.id, thread.title, thread.cwd, "turn", "info", "turn started")
        if payload_type == "task_complete":
            return ActivityEvent(timestamp, thread.id, thread.title, thread.cwd, "turn", "info", "turn complete")
        if payload_type == "turn_aborted":
            return ActivityEvent(timestamp, thread.id, thread.title, thread.cwd, "turn", "warn", "turn aborted")
        if payload_type in {"user_message", "agent_message"}:
            return ActivityEvent(timestamp, thread.id, thread.title, thread.cwd, payload_type, "info", payload_type)
    return None


def collect_activity(threads: Sequence[CodexThread], *, per_thread_lines: int = 600) -> tuple[ActivityEvent, ...]:
    events: list[ActivityEvent] = []
    for thread in threads:
        for record in tail_jsonl(thread.rollout_path, limit=per_thread_lines):
            event = event_from_record(record, thread)
            if event is not None:
                events.append(event)
    return tuple(sorted(events, key=lambda item: item.at)[-MAX_ACTIVITY:])


def collect_snapshot(codex_home: Path, events_path: Path) -> CodexSnapshot:
    codex_home = codex_home.expanduser().resolve()
    try:
        threads = read_recent_threads(codex_home)
        return CodexSnapshot(
            codex_home=codex_home,
            threads=threads,
            activity=collect_activity(threads),
            manual_events=read_events(events_path),
        )
    except (sqlite3.Error, OSError) as exc:
        return CodexSnapshot(
            codex_home=codex_home,
            threads=(),
            activity=(),
            manual_events=read_events(events_path),
            error=str(exc),
        )


def render_snapshot(snapshot: CodexSnapshot, *, width: int = 100) -> str:
    latest = snapshot.activity[-1] if snapshot.activity else None
    code_events = sum(1 for event in snapshot.activity if event.kind == "codegen")
    errors = sum(1 for event in snapshot.activity if event.severity in {"warn", "error", "urgent"})
    pulse = f"threads={len(snapshot.threads)} activity={len(snapshot.activity)} codegen={code_events} alerts={errors}"
    if latest:
        pulse += f" | latest={latest.kind} {latest.at}"
    lines = ["Codex Beeper", "=" * 12, "", "[Pulse]", pulse]
    if snapshot.error:
        lines.append(_trim(f"codex state error: {snapshot.error}", width))

    lines.extend(["", "[Threads]"])
    if snapshot.threads:
        for thread in snapshot.threads:
            model = f" | {thread.model}" if thread.model else ""
            lines.append(
                _trim(
                    f"{thread.id[:8]} {thread.title}{model} | {_compact_path(thread.cwd)}",
                    width,
                )
            )
    else:
        lines.append("no active Codex threads found")

    lines.extend(["", "[Codegen]"])
    codegen = [event for event in snapshot.activity if event.kind in {"codegen", "asset-gen"}]
    if codegen:
        for event in codegen[-8:]:
            detail = f" | {event.detail}" if event.detail else ""
            lines.append(_trim(f"{event.at} {event.message}{detail}", width))
    else:
        lines.append("no recent patch or asset-generation events")

    lines.extend(["", "[Events]"])
    event_rows = [
        event
        for event in snapshot.activity
        if event.kind not in {"codegen", "asset-gen"} or event.severity in {"warn", "error", "urgent"}
    ]
    if event_rows:
        for event in event_rows[-10:]:
            cwd = _compact_path(event.cwd)
            cwd_label = f" {cwd}" if cwd else ""
            code = f" exit={event.exit_code}" if event.exit_code is not None else ""
            detail = f" | {event.detail}" if event.detail else ""
            lines.append(_trim(f"{event.at} {event.severity}/{event.kind}{code}{cwd_label}: {event.message}{detail}", width))
    else:
        lines.append("no recent activity")

    if snapshot.manual_events:
        for event in snapshot.manual_events[-MAX_EVENTS:]:
            command = f" [{' '.join(event.command)}]" if event.command else ""
            code = f" exit={event.exit_code}" if event.exit_code is not None else ""
            lines.append(_trim(f"{event.at} {event.severity}/{event.kind}{command}{code}: {event.message}", width))
    return "\n".join(lines)


def should_beep(previous: CodexSnapshot | None, current: CodexSnapshot) -> bool:
    previous_keys = set()
    if previous is not None:
        previous_keys = {
            (event.at, event.thread_id, event.kind, event.message)
            for event in (*previous.activity, *manual_as_activity(previous.manual_events))
        }
    for event in (*current.activity, *manual_as_activity(current.manual_events)):
        key = (event.at, event.thread_id, event.kind, event.message)
        if key in previous_keys:
            continue
        if event.severity in {"warn", "error", "urgent"} or event.kind in {"approval", "failure"}:
            return True
    return False


def manual_as_activity(events: Sequence[BeeperEvent]) -> tuple[ActivityEvent, ...]:
    return tuple(
        ActivityEvent(
            at=event.at,
            thread_id="manual",
            title="manual",
            cwd="",
            kind=event.kind,
            severity=event.severity,
            message=event.message,
            detail=" ".join(event.command),
            exit_code=event.exit_code,
        )
        for event in events
    )


def print_bell() -> None:
    print("\a", end="", flush=True)


def run_plain_beeper(
    *,
    codex_home: Path,
    events_path: Path,
    interval: float,
    once: bool,
    beep: bool,
) -> int:
    previous: CodexSnapshot | None = None
    while True:
        snapshot = collect_snapshot(codex_home, events_path)
        if beep and should_beep(previous, snapshot):
            print_bell()
        if not once:
            print("\033[H\033[J", end="")
        print(render_snapshot(snapshot))
        if once:
            return 0 if snapshot.error is None else 1
        previous = snapshot
        time.sleep(interval)


try:  # pragma: no cover - availability depends on local environment
    from textual.app import App, ComposeResult
    from textual.containers import Grid
    from textual.widgets import Footer, Header, Static

    TEXTUAL_AVAILABLE = True
except Exception:  # pragma: no cover
    TEXTUAL_AVAILABLE = False
    App = object  # type: ignore


if TEXTUAL_AVAILABLE:  # pragma: no branch

    class BeeperApp(App[None]):
        CSS = """
        Screen {
            layout: vertical;
        }

        #grid {
            grid-size: 2 2;
            grid-rows: 1fr 1fr;
            grid-columns: 1fr 1fr;
            height: 1fr;
        }

        Static {
            border: solid $accent;
            padding: 0 1;
            overflow-y: auto;
        }
        """

        BINDINGS = [("escape", "quit", "Quit")]

        def __init__(self, *, codex_home: Path, events_path: Path, interval: float, beep: bool) -> None:
            super().__init__()
            self.codex_home = codex_home
            self.events_path = events_path
            self.interval = interval
            self.beep = beep
            self.previous: CodexSnapshot | None = None

        def compose(self) -> ComposeResult:
            yield Header(show_clock=True)
            with Grid(id="grid"):
                yield Static("", id="pulse")
                yield Static("", id="threads")
                yield Static("", id="codegen")
                yield Static("", id="activity")
            yield Footer()

        def on_mount(self) -> None:
            self.set_interval(self.interval, self.refresh_beeper)
            self.refresh_beeper()

        def refresh_beeper(self) -> None:
            snapshot = collect_snapshot(self.codex_home, self.events_path)
            if self.beep and should_beep(self.previous, snapshot):
                print_bell()
            rendered = render_snapshot(snapshot).split("\n\n")
            self.query_one("#pulse", Static).update(rendered[0] + "\n\n" + rendered[1])
            self.query_one("#threads", Static).update(rendered[2])
            self.query_one("#codegen", Static).update(rendered[3])
            self.query_one("#activity", Static).update(rendered[4])
            self.previous = snapshot


def run_beeper(
    *,
    codex_home: Path,
    events_path: Path,
    interval: float = 1.0,
    no_ui: bool = False,
    once: bool = False,
    beep: bool = False,
) -> int:
    if TEXTUAL_AVAILABLE and not no_ui and not once:
        BeeperApp(codex_home=codex_home, events_path=events_path, interval=interval, beep=beep).run()
        return 0
    return run_plain_beeper(
        codex_home=codex_home,
        events_path=events_path,
        interval=interval,
        once=once,
        beep=beep,
    )


def run_beeper_command(*, command: Sequence[str], cwd: Path, events_path: Path) -> int:
    command = tuple(item for item in command if item != "--")
    if not command:
        append_event(events_path, kind="failure", severity="error", message="no command provided")
        return 2
    append_event(events_path, kind="command-start", severity="info", message="command started", command=command)
    try:
        result = subprocess.run(list(command), cwd=cwd)
    except FileNotFoundError as exc:
        append_event(
            events_path,
            kind="failure",
            severity="error",
            message=str(exc),
            command=command,
            exit_code=127,
        )
        return 127
    kind = "command-finish" if result.returncode == 0 else "failure"
    severity = "info" if result.returncode == 0 else "error"
    append_event(
        events_path,
        kind=kind,
        severity=severity,
        message="command finished" if result.returncode == 0 else "command failed",
        command=command,
        exit_code=result.returncode,
    )
    return result.returncode
