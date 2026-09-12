<div align="center">

# handoff-os

**Stops Claude Code from burning your limit on a subagent flood.**

[![version](https://img.shields.io/github/package-json/v/serio-ngo/handoff-os?label=version&color=1f6feb)](plugins/handoff-os/.claude-plugin/plugin.json)
[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![license](https://img.shields.io/github/license/serio-ngo/handoff-os?color=1f6feb)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-1f6feb)](#install)

[![guard caught](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Ftooling%2Fresults%2Fscores.json&query=%24.recall&suffix=%25&label=guard%20caught&color=2da44e)](docs/BENCHMARK.md)
[![wrongly blocked](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Ftooling%2Fresults%2Fscores.json&query=%24.fpRate&suffix=%25&label=wrongly%20blocked&color=2da44e)](docs/BENCHMARK.md)
[![plugin logic](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Ftooling%2Fresults%2Fscores.json&query=%24.logicLines&suffix=%20lines&label=plugin%20logic&color=57606a)](plugins/handoff-os/scripts)
[![dependencies](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Ftooling%2Fresults%2Fscores.json&query=%24.dependencies&label=dependencies&color=2da44e)](package.json)

<!-- handoff-demo -->
<img src="docs/demo.svg" width="807" alt="handoff-os session: Read src/big.js · 35 KB → HANDOFF OS: big.js is 35KB; trimmed to its first 384 lines · Agent model:opus · &quot;review the diff&quot; → DISPATCH BUDGET: model opus is denied for subagents (HANDOFF_DENY_SUBAGENT_MODELS) · Agent model:sonnet · &quot;review src/parse.js&quot;, allowed · Agent ×2 model:haiku · &quot;summarize one module each&quot;, allowed · Agent model:haiku · number 4 in the same wave → FAN-OUT CAP: subagent 4, wave capped at 3 (HANDOFF_MAX_PER_WAVE) · gmail send_message → EGRESS LOCK: blocked mcp__gmail__send_message — &quot;send&quot; sends outward or destroys a record · handoff-os · 2 blocked · 1 trimmed · 1 held">
<!-- /handoff-demo -->

<sub>[Install](#install) · [What it does](#what-it-does) · [Proof](#proof) · [Method](docs/BENCHMARK.md) · [Contributing](CONTRIBUTING.md)</sub>

</div>

## Example

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

| Guard | Notes |
|---|---|
| Fan-out cap | `HANDOFF_MAX_PER_WAVE=3`, `HANDOFF_WAVE_MS=60000` — excess waits for the next wave. |
| Read budget | Files over 24 KB arrive trimmed; an unchanged file is never re-sent. |
| Dispatch budget | Every subagent names a tier; `HANDOFF_DENY_SUBAGENT_MODELS=opus,fable` never reviews. |
| Egress lock | Shell, PowerShell and connectors alike; single actions reopen via `HANDOFF_MCP_ALLOW`. |
| Verify gate | A "done" claim needs a real `verify` (else check, typecheck, build) run; stands down after two blocks. |
| Git writes | `git push`, `commit`, `checkout` are not blocked by the plugin; deny them with `npm run sync` (opt back in with `--unlock git`). |
| Session receipt | Printed at Stop; `HANDOFF_STATS=0` silences it. |

<img src="docs/tiles-wins.svg" width="720" alt="Wins: subagents held back; read volume kept out; billed on subagent fan-out">

## Proof

Every case is labelled in `tooling/corpus/guard-corpus.jsonl` and re-scored on each run against four
comparators. Cost, limits and full method: [docs/BENCHMARK.md](docs/BENCHMARK.md).

<div align="center">
<sub>

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [docs/BENCHMARK.md](docs/BENCHMARK.md) · [docs/MANIFEST.md](docs/MANIFEST.md) · [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md) · [Apache-2.0](LICENSE)

</sub>
</div>
