"""CLI entrypoint for the SOC talk console."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

from .beeper import append_event, resolve_event_log, run_beeper, run_beeper_command
from .ingest import ContextIngestPipeline
from .runtime import build_runtime
from .tmux_orchestrator import TmuxOrchestrator
from .tmux_profiles import TmuxProfiles
from .tui import run_tui
from .rehearsal import RehearsalRunner
from .reasoning import ReasoningRequest


def _json_dump(payload: object) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=True))


def cmd_ingest() -> int:
    runtime = build_runtime()
    corpus = runtime.corpus
    payload = {
        "snippet_count": len(corpus.snippets),
        "missing_paths": list(corpus.missing_paths),
        "projects": {
            project_id: len(corpus.for_project(project_id))
            for project_id in runtime.dossiers.ids()
        },
    }
    _json_dump(payload)
    return 0


def cmd_reason(query: str, project: str | None, command: str) -> int:
    runtime = build_runtime()
    card = runtime.reasoner.generate_card(
        ReasoningRequest(
            command=command,
            query=query,
            scene_id=runtime.stage.current_scene.id,
            baton_owner=runtime.stage.baton_owner,
            project_id=project,
        )
    )
    _json_dump(
        {
            "claim": card.claim,
            "evidence": list(card.evidence),
            "inference": card.inference,
            "confidence": card.confidence,
            "counterpoint": card.counterpoint,
            "mode": card.mode,
            "model": card.model,
        }
    )
    return 0


def cmd_command(command_str: str) -> int:
    runtime = build_runtime()
    result = runtime.commands.execute(command_str)
    _json_dump(
        {
            "ok": result.ok,
            "command": result.command,
            "message": result.message,
            "payload": result.payload,
        }
    )
    return 0 if result.ok else 1


def cmd_rehearse(mode: str) -> int:
    runtime = build_runtime()
    runner = RehearsalRunner(stage=runtime.stage, commands=runtime.commands)

    if mode == "dry-run":
        report = runner.dry_run()
        _json_dump(asdict(report))
        return 0

    if mode == "network":
        _json_dump(asdict(runner.network_degradation_drill()))
        return 0

    if mode == "media":
        _json_dump(asdict(runner.media_desync_recovery_drill()))
        return 0

    if mode == "audience":
        _json_dump(asdict(runner.audience_intervention_drill()))
        return 0

    summary = runner.run_all_drills()
    payload = {
        "dry_run": asdict(summary["dry_run"]),
        "drills": [asdict(item) for item in summary["drills"]],
        "all_passed": summary["all_passed"],
    }
    _json_dump(payload)
    return 0 if payload["all_passed"] else 1


def cmd_tmux(profile_name: str, action: str, scene: str | None) -> int:
    profiles = TmuxProfiles.load_default()
    profile = profiles.get(profile_name)
    orchestrator = TmuxOrchestrator(profile)

    if action == "print-plan":
        plan = orchestrator.build_plan()
        _json_dump({"profile": profile_name, "commands": list(plan.shell_lines())})
        return 0

    if action == "bootstrap":
        orchestrator.run_plan()
        return 0

    if action == "switch-layout":
        if not scene:
            raise SystemExit("--scene is required for switch-layout")
        cmd = orchestrator.switch_layout_for_scene(scene)
        _json_dump({"executed": cmd})
        return 0

    raise SystemExit(f"Unknown tmux action: {action}")


def cmd_beeper(codex_home: str, events: str | None, interval: float, no_ui: bool, once: bool, beep: bool) -> int:
    return run_beeper(
        codex_home=Path(codex_home),
        events_path=resolve_event_log(events),
        interval=interval,
        no_ui=no_ui,
        once=once,
        beep=beep,
    )


def cmd_beeper_event(kind: str, severity: str, message: str, events: str | None) -> int:
    event = append_event(
        resolve_event_log(events),
        kind=kind,
        severity=severity,
        message=message,
    )
    _json_dump({"ok": True, "event": event.to_json()})
    return 0


def cmd_beeper_run(cwd: str, events: str | None, command: list[str]) -> int:
    return run_beeper_command(
        command=command,
        cwd=Path(cwd).expanduser().resolve(),
        events_path=resolve_event_log(events),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="soc-console")
    sub = parser.add_subparsers(dest="subcommand", required=True)

    sub.add_parser("ingest", help="Run canonical ingest and print summary")

    run_parser = sub.add_parser("run", help="Run Textual UI")
    run_parser.add_argument("--no-ui", action="store_true", help="Use command-line REPL fallback")

    reason_parser = sub.add_parser("reason", help="Generate one reasoning card")
    reason_parser.add_argument("query")
    reason_parser.add_argument("--project")
    reason_parser.add_argument("--command", default="context", choices=["context", "compare", "synthesize"])

    cmd_parser = sub.add_parser("command", help="Execute one command palette instruction")
    cmd_parser.add_argument("command_string")

    rehearse_parser = sub.add_parser("rehearse", help="Run rehearsal simulation")
    rehearse_parser.add_argument(
        "--mode",
        default="all",
        choices=["all", "dry-run", "network", "media", "audience"],
    )

    tmux_parser = sub.add_parser("tmux", help="tmux bootstrap + layout actions")
    tmux_parser.add_argument("action", choices=["bootstrap", "print-plan", "switch-layout"])
    tmux_parser.add_argument("--profile", default="seminar-default")
    tmux_parser.add_argument("--scene")

    beeper_parser = sub.add_parser("beeper", help="Watch Codex session activity and beeper events")
    beeper_parser.add_argument("--codex-home", default="~/.codex", help="Codex home directory to watch")
    beeper_parser.add_argument("--events", help="JSONL event log path")
    beeper_parser.add_argument("--interval", type=float, default=1.0, help="Refresh interval in seconds")
    beeper_parser.add_argument("--no-ui", action="store_true", help="Use plain terminal redraw")
    beeper_parser.add_argument("--once", action="store_true", help="Render one snapshot and exit")
    beeper_parser.add_argument("--beep", action="store_true", help="Ring terminal bell on attention transitions")

    beeper_event_parser = sub.add_parser("beeper-event", help="Append an event to the beeper stream")
    beeper_event_parser.add_argument("--kind", default="note", choices=["note", "approval", "failure", "command-start", "command-finish"])
    beeper_event_parser.add_argument("--severity", default="info", choices=["info", "warn", "error", "urgent"])
    beeper_event_parser.add_argument("--message", required=True)
    beeper_event_parser.add_argument("--events", help="JSONL event log path")

    beeper_run_parser = sub.add_parser("beeper-run", help="Run a command while logging beeper events")
    beeper_run_parser.add_argument("--cwd", default=".", help="Working directory for the command")
    beeper_run_parser.add_argument("--events", help="JSONL event log path")
    beeper_run_parser.add_argument("command", nargs=argparse.REMAINDER)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.subcommand == "ingest":
        return cmd_ingest()

    if args.subcommand == "run":
        runtime = build_runtime()
        run_tui(runtime, force_repl=args.no_ui)
        return 0

    if args.subcommand == "reason":
        return cmd_reason(args.query, args.project, args.command)

    if args.subcommand == "command":
        return cmd_command(args.command_string)

    if args.subcommand == "rehearse":
        return cmd_rehearse(args.mode)

    if args.subcommand == "tmux":
        return cmd_tmux(args.profile, args.action, args.scene)

    if args.subcommand == "beeper":
        return cmd_beeper(args.codex_home, args.events, args.interval, args.no_ui, args.once, args.beep)

    if args.subcommand == "beeper-event":
        return cmd_beeper_event(args.kind, args.severity, args.message, args.events)

    if args.subcommand == "beeper-run":
        return cmd_beeper_run(args.cwd, args.events, args.command)

    parser.error(f"Unknown subcommand: {args.subcommand}")
    return 2


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
