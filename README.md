# CalArts Agentic TUI Talk Console

Python + Textual + tmux performance system for a 60-minute doctoral seminar built around:

- Cybernetics dissertation corpus
- LetGo
- THE TUB
- Praetorius
- Dex / dexDRONES

## Features

- Stage engine with explicit scene state machine
- Strict schema contracts for dossiers, scripts, reasoning cards, and tmux layouts
- Cloud-first OpenAI reasoning with tool-restricted local retrieval
- Verbose public rationale stream (claim/evidence/inference/confidence/counterpoint)
- tmux orchestration with scene-aware layout profiles
- Constrained co-pilot command palette and shared baton switching
- Fallback-first resilience (local retrieval + precomputed cards)

## Quick Start

```bash
cd /Users/seb/Documents/New\ project\ 2
python3 -m soc_console.cli ingest
python3 -m soc_console.cli rehearse --mode dry-run
python3 -m soc_console.cli run
```

To force plain REPL mode (no Textual UI):

```bash
python3 -m soc_console.cli run --no-ui
```

If `textual` is not installed, install dependencies:

```bash
python3 -m pip install -e .
```

For cloud reasoning:

```bash
export OPENAI_API_KEY="..."
```

## tmux bootstrap

```bash
./scripts/tmux_bootstrap.sh seminar-default
```

Switch layouts during performance:

```bash
./scripts/tmux_switch_layout.sh scene-media-focus
```

## Test Suite

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```

For the corpus pure modules (lexicon, grammar, fold, bot, decision):

```bash
node --test worker/test/body-for-visits.*.test.js
```

## /labs/corpus — (to)complete

A single shared linguistic body, mutated only by qualifying human visits. Each
visit that is *visible* (`document.visibilityState === "visible"`) for at least
two seconds, and that has not already contributed within the server-side
cooldown, appends one grammar-aware token to the body. There is no form, no
input. The medium is the visited networked surface.

The artwork has three layers, only one of which is the work:

- **The live work** — `https://cbassuarez.com/labs/corpus/`. The page
  served right now, with whatever the body holds at this moment, whatever folds
  beneath it, whatever corruption fringe the bots have deposited today. This is
  the only layer that is the work; the others document it.
- **The event journal** — `GET /api/corpus/export.json`. Append-only.
  Never pruned. Every qualifying visit since launch, in order. The journal is
  the work's substrate; folding only compresses what is *shown*, not what is
  recorded.
- **The static snapshot** — `GET /api/corpus/snapshot.html`. A frozen,
  self-contained HTML rendering of the current visible body. Useful for
  citation and preservation. Documentation, not the work.

### Deployment notes

The DO and rate-limit binding live on the existing `seb-feed` worker:

- Durable Object binding `BFV_ROOM` → class `BodyForVisitsRoom` (SQLite-backed)
- Migration tag `v3-bfv-room` with `new_sqlite_classes = ["BodyForVisitsRoom"]`
- Rate-limit binding `RATE_LIMIT_BFV_QUALIFY` (namespace_id 1009; 6/60s)
- Secret `BFV_HASH_SALT` — used to salt the (ephemeral) IP and session hashes
  before storage. Set once per environment: `wrangler secret put BFV_HASH_SALT`.
  No raw IPs, no full user-agents, are ever written.

### Manual test checklist

1. Open `/labs/corpus/` in a fresh incognito window. After ~2s of
   foreground dwell, one new token fades in; status reads
   `visible visit qualified`.
2. Reload. Status reads `visit withheld · session already recorded`;
   body is unchanged.
3. Visit from a second device or browser; new mutation appears.
4. `curl -A 'GPTBot/1.0' -H 'content-type: application/json' \
     -d '{"session_id":"00000000-0000-0000-0000-000000000001"}' \
     https://seb-feed.cbassuarez.workers.dev/api/corpus/qualify`
   → body unchanged; `corruption_count` and `fringe` grow.
5. `curl https://seb-feed.cbassuarez.workers.dev/api/corpus/snapshot.html`
   returns a standalone HTML document with the current ISO timestamp in a
   `static snapshot taken at …` line.
6. `curl https://seb-feed.cbassuarez.workers.dev/api/corpus/export.json | jq '.events | length'`
   increases monotonically across visits.
