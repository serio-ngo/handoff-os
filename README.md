# handoff-os

Spend guard for Claude Code. Acts at `PreToolUse` and `Stop`, before the tokens are spent.
Books every action in four units: waves held back, expensive dispatches redirected to scout or
runner, whole-file reads trimmed or stopped, done-claims gated. Each session ends with a one-line
receipt in those units.

Paired with and without the plugin on 11 tasks, it bills **more** on general work (+11.3%,
95% CI −5.0 to +42.7). It saves on what it was built for — whole-file read −20%, 6-agent fan-out
−3% — and it stops egress cold: [Track B](docs/BENCHMARK.md).

Stops: a 4th agent in a 90-second wave · opus/fable dispatch with no `QUALITY:` flag ·
whole-file read over 24 KB (rewritten to a slice, not refused) · byte-identical re-read ·
9th whole file in one thread (handed to a scout) · content grep with no `head_limit` (capped at

50) · any send, pay, publish, merge or delete.

Counts: waves capped, agents held back, redirects, reads trimmed, re-reads stopped, claims gated,
plus the byte delta each rewrite kept out. Cannot touch thinking, output, or the cache re-send
multiplier. Zero dependencies, fully offline, no model calls, no network, no telemetry.

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

## Numbers in 30 seconds

| Number | Kind |
|---|---|
| Receipt counts | measured, exact guard actions |
| Bytes kept out / admitted | measured; slices estimated from a 200-line sample |
| Tokens | bytes / 4 estimate, or transcript `usage` measured — never anything else |
| Token ratios on the receipt | relative weights (`TOKEN_RATIOS` in `ledger.mjs`), not this repo's traffic |
| Guard caught / wrongly blocked | 85-case regression suite, not a detection rate |
| Paired Δ billed tokens, pass rate | `npm run benchmark:ab`, N=11; general delta is positive, so no savings claim here |

## Measured — replayed against real traffic

<!-- handoff-replay -->
| The maintainer's 13 sessions — run it on yours | Count | Share of judged |
|---|---|---|
| Tool calls recorded | 1,481 | — |
| Judged by the guard | 1,078 | 100% |
| **Refused** | **39** | **4%** |
| — egress lock | 36 | 3% |
| — re-read dedup | 3 | 0% |

Every `Read`, `Grep`, `Glob` and `Bash` call from this machine's Claude Code transcripts, re-fed to the guard in order, one sandbox per session. Open-loop: a refusal cannot change what the agent did next, so this is what the guard catches on that exact stream, not a counterfactual. Reproduce with `npm run benchmark:replay`.
<!-- /handoff-replay -->

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

Same prompt, same model, same fixture, arms in random order per task; 95% CI by bootstrap over paired differences. Negative Δ means the plugin arm billed less. Reproduce with `npm run benchmark:ab`. Per-task rows: `eval/ab-results.json`. Method: [docs/BENCHMARK.md](docs/BENCHMARK.md).
<!-- /handoff-ab -->

## Measured — live ledger

<!-- handoff-stats -->
No ledger turns recorded yet. Method: docs/BENCHMARK.md.
<!-- /handoff-stats -->

[![cache re-send (Claude, not the plugin)](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.resendRatio&suffix=x&label=cache%20re-send%20%28Claude%2C%20not%20the%20plugin%29&color=blue)](docs/BENCHMARK.md)

## Guard against the alternatives

<!-- guard-scores -->
| Guard | Caught | Wrongly blocked | F1 |
|---|---|---|---|
| no guard, permission prompts only | 0% | 0% | 0.00 |
| Claude Code permissions.deny globs | 17% | 6% | 0.29 |
| a pattern-list PreToolUse hook | 39% | 11% | 0.53 |
| block every tool call | 100% | 100% | 0.72 |
| **handoff-os** | 100% | 0% | 1.00 |

85 cases, 2026-09-10; the comparators are mechanism baselines in `eval/baselines.mjs`, not vendor code. [Method](docs/BENCHMARK.md).

58 of 81 scored cases are `spec` (rule-derived), 19 `probe`, 4 `regression`; recall here is a regression check, not a detection rate.
<!-- /guard-scores -->

> Shell wrappers are unwrapped first, so `powershell -Command`, `cmd /c`, `bash -c` and
> `-EncodedCommand` get no free pass. Four evasions still do: [SECURITY.md](SECURITY.md).

## What ships

<!-- inventory -->
| What ships | Count |
|---|---|
| Guard logic | **1392** lines of Node across 7 scripts (1245 non-blank) |
| Pattern rules | **66** |
| Hooks | **5** handlers on 5 events |
| Skills | **3** |
| Subagents | **2** |
| Third-party packages | **0** |
| Network calls, API keys, model calls | **0** |
<!-- /inventory -->

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
- Node 22 or later. `settings/policy.json` holds the `deny` list; permission rules cannot ship inside a plugin.

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
