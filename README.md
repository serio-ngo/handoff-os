<div align="center">

# handoff-os

**Stops Claude Code from burning your limit on a subagent flood.**

[![version](https://img.shields.io/github/package-json/v/serio-ngo/handoff-os?label=version&color=1f6feb)](plugins/handoff-os/.claude-plugin/plugin.json)
[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![license](https://img.shields.io/github/license/serio-ngo/handoff-os?color=1f6feb)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-1f6feb)](#install)

[![guard caught](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.recall&suffix=%25&label=guard%20caught&color=2da44e)](docs/BENCHMARK.md)
[![wrongly blocked](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.fpRate&suffix=%25&label=wrongly%20blocked&color=2da44e)](docs/BENCHMARK.md)
[![plugin logic](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.logicLines&suffix=%20lines&label=plugin%20logic&color=57606a)](plugins/handoff-os/scripts)
[![dependencies](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.dependencies&label=dependencies&color=2da44e)](package.json)

<img src="docs/demo.svg" width="860" alt="One session: a 35 KB read arrives trimmed, a 100-agent workflow is capped at 3, an opus review goes to sonnet, a send stops, a haiku lookup runs, and the Stop receipt prints the count">

<sub>[Install](#install) · [What it does](#what-it-does) · [Proof](#proof) · [Method](docs/BENCHMARK.md) · [Contributing](CONTRIBUTING.md)</sub>

</div>

Claude Code can launch 20 subagents in one turn. A 5-hour window goes in seconds.

The hook caps each wave at 3 and queues the rest.

<!-- handoff-flood -->
<img src="docs/flood.svg" width="720" alt="20 subagents requested. Without the guard 20 start at once; with it 3 start and the rest wait for the next wave.">
<!-- /handoff-flood -->

## Install

```text
/plugin marketplace add serio-ngo/handoff-os
/plugin install handoff-os@serio-ngo
```

Restart Claude Code. Hooks load at session start.

## What it does

<img src="docs/tiles-stops.svg" width="720" alt="Stops: 3 subagents per wave; 24 KB whole-file read cap; destructive git and rm calls; Done with no verification run">

| Guard | One line |
|---|---|
| Fan-out cap | Three subagents start; the rest go in the next wave. |
| Read budget | A file over 24 KB arrives trimmed instead of whole, and the same unchanged file never arrives twice. |
| Dispatch budget | Every subagent names a tier, and a review goes to sonnet. |
| Egress lock | Sends, payments, publishes, merges and deletes stop before they run — shell, PowerShell and connectors alike. |
| Verify gate | A "done" claim needs a real run behind it. |
| Branch and PR | The agent opens the branch and the pull request; the merge stays yours. |
| Audit trail | One local line per action, appended as it happens. |
| Session receipt | The Stop hook prints what the session kept out of context. |

<img src="docs/tiles-counts.svg" width="720" alt="Counts: subagents held back; read volume kept out; receipt printed at Stop">

## Proof

<img src="docs/tiles-proof.svg" width="720" alt="Proof: share of the labelled corpus caught; share wrongly blocked; labelled cases gated in CI">

Every case is labelled in `eval/guard-corpus.jsonl` and re-scored on each run against four
comparators. Cost, limits and full method: [docs/BENCHMARK.md](docs/BENCHMARK.md).

<img src="docs/tiles-never.svg" width="720" alt="Does not: 0 model calls, 0 network calls, 0 dependencies">

<div align="center">
<sub>

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [docs/BENCHMARK.md](docs/BENCHMARK.md) · [docs/MANIFEST.md](docs/MANIFEST.md) · [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md) · [Apache-2.0](LICENSE)

</sub>
</div>
