# handoff-os

A Claude Code plugin that does three things at the `PreToolUse` hook: keeps bytes out of the context
window, stops the same bytes being re-sent on every turn, and caps subagent waves before they fan
out. Hooks and scripts only — no model calls, no network, no dependencies.

[![context re-send](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.resendRatio&suffix=x&label=context%20re-send&color=blue)](docs/BENCHMARK.md)
[![guard caught](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.recall&suffix=%25&label=guard%20caught&color=brightgreen)](docs/BENCHMARK.md)
[![wrongly blocked](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.fpRate&suffix=%25&label=wrongly%20blocked&color=brightgreen)](docs/BENCHMARK.md)
[![plugin logic](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.logicLines&suffix=%20lines&label=plugin%20logic)](plugins/handoff-os/scripts)
[![dependencies](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.dependencies&label=dependencies&color=brightgreen)](package.json)
[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![version](https://img.shields.io/github/package-json/v/serio-ngo/handoff-os?label=version)](plugins/handoff-os/.claude-plugin/plugin.json)
[![license](https://img.shields.io/github/license/serio-ngo/handoff-os)](LICENSE)

![handoff-os admitting a small read, refusing a 38KB read, capping a 20-agent opus wave and blocking a send, then printing session totals](docs/demo.svg)

## What it optimises

| Target | Problem | Rule |
|---|---|---|
| Context window | a 40 KB file admitted to answer one question about line 12 | whole-file cap at 24 KB, session ceiling at 500 KB |
| Cache | context is re-sent every turn, so an early byte is billed for the rest of the session | re-read dedup, repeat-query block |
| Subagent waves | a fan-out spawns more agents than their returns can be read | 3 per wave, model tier per job, citation contract on return |
| Irreversible acts | sends, payments, publishes, merges, deletes, credential writes | egress lock, exit 2 before the call runs |

## Rules

| Rule | Refuses | Credited |
|---|---|---|
| Re-read dedup | a file already in context, byte-identical | the whole file, once per refusal |
| Whole-file cap | a read over 24 KB | the whole file, once per refusal |
| Session ceiling | main-thread whole-file reads past 500 KB | the refused file |
| Subagent offload | nothing — routes the read to a scout | bytes the scout read, never in this thread |
| Repeat query | a `Grep` or `Glob` already answered this session | counted, no tokens credited |
| Runaway query cap | a content `Grep` with no `head_limit` | counted, no tokens credited |
| Fan-out cap | the 4th subagent in a 60 s wave | counted |
| Dispatch budget | a subagent with no model, or `opus`/`fable` without `QUALITY:` | counted |
| Egress lock | sends, payments, publishes, merges, deletes, credential writes | counted |
| Verify gate | a done-claim with no verification run behind it | counted |

## Measured — replayed against real traffic

<!-- handoff-replay -->
| Replayed over 11 real sessions | Count | Share of judged |
|---|---|---|
| Tool calls recorded | 1,280 | — |
| Judged by the guard | 927 | 100% |
| **Refused** | **36** | **4%** |
| — egress lock | 33 | 4% |
| — re-read dedup | 3 | 0% |

Every `Read`, `Grep`, `Glob` and `Bash` call from this machine's Claude Code transcripts, re-fed to the guard in order, one sandbox per session. Open-loop: a refusal cannot change what the agent did next, so this is what the guard catches on that exact stream, not a counterfactual. Reproduce with `npm run benchmark:replay`.
<!-- /handoff-replay -->

## Measured — live ledger

<!-- handoff-stats -->
| Measured over 2 turns | Tokens | Share |
|---|---|---|
| Read volume the session asked for | ~382 | 100% |
| **Kept out** | **~0** | **0%** |
| — re-read dedup | ~0 | 0% |
| — whole-file cap | ~0 | 0% |
| — moved to a subagent | ~0 | 0% |
| Admitted to the main thread | ~382 | 100% |

| Context tax — the plugin's own footprint | Tokens |
|---|---|
| Session card, always in context | ~313 |
| Skill descriptions, always in context | ~177 |
| Agent descriptions, always in context | ~92 |
| **Total footprint** | **~581** |
| **Net kept out minus footprint** | **~-581** |

| Measured billing | Tokens |
|---|---|
| Fresh — input + output + cache write | 1,440,133 |
| Cache-read | 30,124,746 |
| **Context re-send ratio** | **20.9×** |
| Re-sends removed, kept × turns that followed | ~0 |

Guard actions: 2. Token counts are file bytes / 4 from this repo's own local ledger, an estimate; the billing figures are measured. Method: [docs/BENCHMARK.md](docs/BENCHMARK.md).
<!-- /handoff-stats -->

## Guard against the alternatives

<!-- guard-scores -->
| Guard | Caught | Wrongly blocked | F1 |
|---|---|---|---|
| no guard, permission prompts only | 0% | 0% | 0.00 |
| Claude Code permissions.deny globs | 23% | 7% | 0.36 |
| a pattern-list PreToolUse hook | 46% | 14% | 0.58 |
| block every tool call | 100% | 100% | 0.71 |
| **handoff-os** | 100% | 0% | 1.00 |

68 cases, 2026-09-09; the comparators are mechanism baselines in `eval/baselines.mjs`, not vendor code. [Method](docs/BENCHMARK.md).
<!-- /guard-scores -->

Shell wrappers are unwrapped first, so `powershell -Command`, `cmd /c`, `bash -c` and
`-EncodedCommand` get no free pass. Four evasions still do: [SECURITY.md](SECURITY.md).

## What ships

<!-- inventory -->
| What ships | Count |
|---|---|
| Guard logic | **940** lines of Node across 6 scripts (833 non-blank) |
| Pattern rules | **47** |
| Hooks | **6** handlers on 6 events |
| Skills | **3** |
| Subagents | **2** |
| Runtime dependencies | **0** |
| Network calls, API keys, model calls | **0** |
<!-- /inventory -->

## Install

```text
/plugin marketplace add serio-ngo/handoff-os
/plugin install handoff-os@serio-ngo
```

Hooks load at session start, so restart Claude Code — a running session keeps the version it started
with.

| Surface | Hooks run |
|---|---|
| Claude Code CLI, VS Code, JetBrains, desktop Code tab | yes |
| claude.ai chat, the API, any other harness | no — nothing loads `hooks.json`, so no rule fires |

Installed is not the same as enforcing. Confirm with `npm run doctor`.

## Configuration

| Variable | Effect |
|---|---|
| `HANDOFF_STATS=0` | Silence the kept-out line. On by default. |
| `HANDOFF_LOCK_GIT=1` | Block all state-changing git commands, including commits. |
| `HANDOFF_MCP_ALLOW=action,action` | Allow named connector actions the egress lock would block. |
| `HANDOFF_DENY_SUBAGENT_MODELS=model,model` | Deny these model tiers for subagents. Default `opus,fable`. |
| `HANDOFF_OS_DIR=/path` | Store session state and audit files outside the project. |

Node 22 or later. `settings/policy.json` holds the `deny` list, because permission rules cannot ship
inside a plugin.

## Limits

| Limit | Rule |
|---|---|
| Token counts | Bytes / 4 is an estimate. Only the billing figures are measured. |
| Counterfactual | The ledger records what was refused, never a paired session proving the bill fell. |
| Replay | Open-loop — a refusal cannot change what the agent did next. Not a counterfactual. |
| Denominator | Only whole-file reads are counted. Slices, `Grep` output and subagent returns are not. |
| Shell-heavy sessions | Reads issued through pipelines are invisible to the read budget. |
| Surface | Only where Claude Code runs plugin hooks. |
| Matching | Pattern-based shell matching can be evaded. Run it alongside OS permissions. |
| Reproduction | Self-measured on one machine. Nobody has independently reproduced it. |

## License

[Apache-2.0](LICENSE), maintained by serio-ngo.

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) ·
[docs/BENCHMARK.md](docs/BENCHMARK.md) · [docs/MANIFEST.md](docs/MANIFEST.md)
