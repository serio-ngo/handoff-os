# handoff-os

Claude Code re-reads files it already has, greps the same pattern twice, and pulls a 40 KB file into
context to answer one question about line 12. Context is re-sent on every turn, so a byte admitted
early keeps being billed — measured across this repo's own ten sessions, **every fresh token was
re-read from cache more than 30 times**. handoff-os refuses those reads at the hook, before they
enter the thread, and books what it refused. Every number below is generated from that ledger and
this machine's session transcripts, not written by hand.

[![kept out of context](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.keptPct&suffix=%25%20of%20read%20volume&label=kept%20out%20of%20context&color=brightgreen)](docs/BENCHMARK.md)
[![re-send ratio](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.resendRatio&suffix=x&label=context%20re-send&color=blue)](docs/BENCHMARK.md)
[![guard caught](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.recall&suffix=%25&label=guard%20caught&color=brightgreen)](docs/BENCHMARK.md)
[![plugin logic](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.logicLines&suffix=%20lines&label=plugin%20logic)](plugins/handoff-os/scripts)
[![dependencies](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.dependencies&label=dependencies&color=brightgreen)](package.json)
[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![version](https://img.shields.io/github/package-json/v/serio-ngo/handoff-os?label=version)](plugins/handoff-os/.claude-plugin/plugin.json)
[![license](https://img.shields.io/github/license/serio-ngo/handoff-os)](LICENSE)

![handoff-os refusing a 38KB read, a repeat grep, a fourth subagent, a merge and a send](docs/demo.svg)

## What it saved

<!-- handoff-stats -->
| Measured over 39 turns | Tokens | Share |
|---|---|---|
| Read volume the session asked for | ~74.2k | 100% |
| **Kept out of context** | **~49.7k** | **67%** |
| — re-read dedup | ~0 | 0% |
| — whole-file cap | ~49.7k | 67% |
| — moved to a subagent | ~0 | 0% |
| Admitted to the main thread | ~24.4k | 33% |

| Measured billing, 10 session transcripts | Tokens |
|---|---|
| Fresh — input + output + cache write | 13,195,835 |
| Cache-read | 460,320,159 |
| **Context re-send ratio** | **34.9×** |
| Cache-read avoided, kept × ratio | ~1.7M |

Guard actions: 77. Token counts are file bytes / 4 from this repo's own local ledger, an estimate; the billing figures are measured. Method: [docs/BENCHMARK.md](docs/BENCHMARK.md).
<!-- /handoff-stats -->

## Where the savings come from

| Rule | Refuses | Credited as saved |
|---|---|---|
| Re-read dedup | a file already in context, byte-identical | the whole file |
| Whole-file cap | a read over 24 KB | the whole file |
| Subagent offload | nothing — routes the read to a scout | bytes the scout read, never in this thread |
| Session ceiling | whole-file reads past 500 KB | the refused file |
| Repeat query | a Grep or Glob already answered this session | counted, no tokens credited |
| Runaway query cap | a content Grep with no `head_limit` | counted, no tokens credited |

## How the numbers are produced

Every block writes bytes to `.claude/.session-*.json`, the Stop hook folds that into `audit/*.jsonl`
next to real `input`/`output`/`cache_read` counts read out of the session transcript, and
`npm run benchmark` sums it.

| Figure | Source |
|---|---|
| Kept out of context, admitted, share | file bytes / 4 — an estimate, never billing |
| Fresh and cache-read tokens | measured, from the transcript `usage` blocks |
| Cache-read avoided | kept tokens × the measured re-send ratio — an extrapolation |

## Read it yourself

```bash
npm run benchmark
```

## The guard

Sends, payments, publishes, merges, deletes and credential writes exit 2 before they run, and a
done-claim with no verification run behind it is refused.

<!-- guard-scores -->
| Guard | Caught | Wrongly blocked | F1 |
|---|---|---|---|
| no guard, permission prompts only | 0% | 0% | 0.00 |
| Claude Code permissions.deny globs | 23% | 7% | 0.36 |
| a pattern-list PreToolUse hook | 46% | 15% | 0.58 |
| block every tool call | 100% | 100% | 0.72 |
| **handoff-os** | 100% | 0% | 1.00 |

66 cases, 2026-09-08; the comparators are mechanism baselines in `eval/baselines.mjs`, not vendor code. [Method](docs/BENCHMARK.md).
<!-- /guard-scores -->

Shell wrappers are unwrapped first, so `powershell -Command`, `cmd /c`, `bash -c` and
`-EncodedCommand` get no free pass; four evasions still do, and they are listed in
[SECURITY.md](SECURITY.md).

## What ships

<!-- inventory -->
| What ships | Count |
|---|---|
| Guard logic | **926** lines of Node across 6 scripts (817 non-blank) |
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

Restart Claude Code, because hooks load at session start and a running session keeps the version it
started with.

## Configuration

| Variable | Effect |
|---|---|
| `HANDOFF_STATS=1` | Print the saved-tokens line after every reply. |
| `HANDOFF_LOCK_GIT=1` | Block all state-changing git commands, including commits. |
| `HANDOFF_MCP_ALLOW=action,action` | Allow named connector actions the egress lock would block. |
| `HANDOFF_DENY_SUBAGENT_MODELS=model,model` | Deny these model tiers for subagents. Default `opus,fable`. |
| `HANDOFF_OS_DIR=/path` | Store session state and audit files outside the project. |

Node 22 or later, and `settings/policy.json` holds the `deny` list because permission rules cannot
ship inside a plugin.

## Limits

| Limit | Rule |
|---|---|
| Token counts | Bytes / 4 is an estimate; only the billing figures are measured. |
| Counterfactual | The ledger records what was refused, not a paired session proving the bill fell. |
| Surface | Only where Claude Code runs plugin hooks. |
| Matching | Pattern-based shell matching can be evaded; run it alongside OS permissions. |
| Reproduction | Self-measured on one machine, and nobody has independently reproduced it. |

## License

[Apache-2.0](LICENSE), maintained by serio-ngo.

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) ·
[docs/BENCHMARK.md](docs/BENCHMARK.md) · [docs/MANIFEST.md](docs/MANIFEST.md)
