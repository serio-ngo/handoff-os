# handoff-os

Spend guard for Claude Code. Acts at `PreToolUse` and `Stop`, before the tokens are spent.

Books every action in four units: 
waves held back, 
expensive dispatches redirected to scout or runner, 
whole-file reads trimmed or stopped, 
done-claims gated. 

Stops: a 4th agent in a 90-second wave · opus/fable dispatch with no `QUALITY:` flag ·
whole-file read over 24 KB (rewritten to a slice, not refused) · byte-identical re-read ·
9th whole file in one thread (handed to a scout) · content grep with no `head_limit` · any send, pay, publish, merge or delete.

Zero dependencies, fully offline, no model calls, no network, no telemetry.

[![guard caught](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.recall&suffix=%25&label=guard%20caught&color=brightgreen)](docs/BENCHMARK.md) [![wrongly blocked](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.fpRate&suffix=%25&label=wrongly%20blocked&color=brightgreen)](docs/BENCHMARK.md)

[![plugin logic](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.logicLines&suffix=%20lines&label=plugin%20logic)](plugins/handoff-os/scripts) [![dependencies](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.dependencies&label=dependencies&color=brightgreen)](package.json) [![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)

[![version](https://img.shields.io/github/package-json/v/serio-ngo/handoff-os?label=version)](plugins/handoff-os/.claude-plugin/plugin.json) [![license](https://img.shields.io/github/license/serio-ngo/handoff-os)](LICENSE)

![handoff-os refusing a 38KB read, capping a 20-agent ultrathink opus wave and blocking a send, then printing session totals](docs/demo.svg)

## What changes for you

- A wave stops at three agents; the receipt says how many were held back.
- An opus or fable dispatch with no `QUALITY:` flag is refused and a scout or runner is named instead (haiku uses ~1/5 tokens of opus).
- One question about one line stops costing the whole file: over 24 KB is trimmed, unchanged re-reads stop, past eight whole files the next goes to a scout with the dispatch ready to paste.
- A "done" claim waits for a real verification run.
- Sends, payments, publishes, merges, deletes and credential writes stop before they run.

## Measured — replayed against real traffic

<!-- handoff-replay -->
| The maintainer's 13 sessions — run it on yours | Count | Share of judged |
|---|---|---|
| Tool calls recorded | 1,481 | — |
| Judged by the guard | 1,078 | 100% |
| **Refused** | **39** | **4%** |
| — egress lock | 36 | 3% |
| — re-read dedup | 3 | 0% |


## Measured — paired runs, with and without the plugin

<!-- handoff-ab -->
| Run 1 — plugin build c24cb86 (main, 1.6.0) — 11 tasks × 2 arms, 2026-09-10, model `claude-haiku-4-5-20251001` | Value |
|---|---|
| Δ billed tokens, with − without, cache-read at 0.1× | **+35.5%** [+17.3%, +54.8%] |
| Δ billed tokens, raw sum of input + cache write + cache read | +98.8% [+46.8%, +142.4%] |
| Δ output tokens | +79.8% [+45.6%, +145.0%] |
| Δ billed tokens per task, cache-read at 0.1× | **+11,325 tok** [+4,730 tok, +17,986 tok] |
| Pass rate, with plugin | 8/11 |
| Pass rate, without plugin | 10/11 |
| Guard events, with plugin | fan-out 9 · dispatch 8 · whole-file 3 · gated 3 · egress-lock 2 · repeat-query 1 · re-read 1 |
| Plugin footprint, always in context | ~273 tok |
| Total billed tokens, both arms | 1,125,623 tok |
| Run 2 — plugin build 84f2ac8 (feat/spend-guard, 1.7.0): Δ billed tokens, cache-read at 0.1× | **+11.3%** [-5.0%, +42.7%] |
| Run 2 — plugin build 84f2ac8 (feat/spend-guard, 1.7.0): Δ billed tokens per task | **+4,025 tok** [-2,255 tok, +11,075 tok] |
| Run 2 — plugin build 84f2ac8 (feat/spend-guard, 1.7.0): pass rate, with / without | 9/11 / 11/11 |

Method: [docs/BENCHMARK.md](docs/BENCHMARK.md).

<!-- /handoff-ab -->


## Guard against the alternatives

<!-- guard-scores -->
| Guard | Caught | Wrongly blocked | F1 |
|---|---|---|---|
| Claude Code permissions.deny globs | 17% | 6% | 0.29 |
| a pattern-list PreToolUse hook | 39% | 11% | 0.53 |
| block every tool call | 100% | 100% | 0.72 |
| **handoff-os** | 100% | 0% | 1.00 |

[Method](docs/BENCHMARK.md).

## Install

```text
/plugin marketplace add serio-ngo/handoff-os
/plugin install handoff-os@serio-ngo
```

> Hooks load at session start: restart Claude Code, then confirm with `npm run doctor`.

OpenCode works (same guard, `opencode.json` loader), except connector calls pass unjudged and
subagent calls skip `tool.execute.before` (`sst/opencode#5894`). Cowork does not fire plugin
hooks (`--setting-sources user`), so copy the `deny` list from `settings/policy.json` there.

## Configuration

- `HANDOFF_STATS=0` silences the receipt once you trust the gate.
- `HANDOFF_LOCK_GIT=1` blocks every state-changing git command.
- `HANDOFF_MCP_ALLOW=action,action` allows named connector actions the egress lock would stop.
- `HANDOFF_DENY_SUBAGENT_MODELS=model,model` keeps tiers off dispatches (default `opus,fable`).
- `HANDOFF_OS_DIR=/path` keeps session state and audit files out of the repo.


## Limits

- Token counts are bytes / 4 estimates except transcript `usage`, which is measured.
- Replay is open-loop: catches on that stream, not savings.
- A rewrite is auto-approved so it costs no round trip; permission deny rules still apply.
- Coverage ends where hooks stop loading; pattern matching can be evaded ([SECURITY.md](SECURITY.md)).
- All figures are self-measured on one machine: rerun `npm run benchmark:replay` before you cite them.

## License

[Apache-2.0](LICENSE), maintained by serio-ngo.

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) ·
[docs/BENCHMARK.md](docs/BENCHMARK.md) · [docs/MANIFEST.md](docs/MANIFEST.md) ·
[docs/COMPARABLES.md](docs/COMPARABLES.md)
