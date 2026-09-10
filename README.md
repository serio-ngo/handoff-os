# handoff-os

handoff-os refuses four things at Claude Code's `PreToolUse` hook, before the tokens are spent: a
whole file read for one line, a byte-identical re-read of a file already in context, a subagent
wave nobody can read back, and any call that sends, pays, publishes, merges or deletes.

Lightweight, zero dependencies, fully offline: pattern matching in Node. No model calls, no API
keys, no network, no telemetry.

[![guard caught](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.recall&suffix=%25&label=guard%20caught&color=brightgreen)](docs/BENCHMARK.md) [![wrongly blocked](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.fpRate&suffix=%25&label=wrongly%20blocked&color=brightgreen)](docs/BENCHMARK.md)

[![plugin logic](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.logicLines&suffix=%20lines&label=plugin%20logic)](plugins/handoff-os/scripts) [![dependencies](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.dependencies&label=dependencies&color=brightgreen)](package.json) [![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)

[![version](https://img.shields.io/github/package-json/v/serio-ngo/handoff-os?label=version)](plugins/handoff-os/.claude-plugin/plugin.json) [![license](https://img.shields.io/github/license/serio-ngo/handoff-os)](LICENSE)

![handoff-os refusing a 38KB read, capping a 20-agent ultrathink opus wave and blocking a send, then printing session totals](docs/demo.svg)

## What changes for you

- One question about one line no longer costs the whole file. Reads over 24 KB are refused, with a slice or a scout offered instead.
- Nothing is billed twice. A file already in context, or a search already answered, is refused on repeat.
- Subagent fan-outs stay readable. Three agents per wave, the cheapest model that can do the job.
- Nothing irreversible happens by accident. Sends, payments, publishes, merges, deletes and credential writes stop before they run and wait for a human.

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
| Paired runs, 11 tasks × 2 arms, 2026-09-10, model `claude-haiku-4-5-20251001` | Value |
|---|---|
| Δ billed tokens, with − without, cache-read at 0.1× | **+35.5%** [+17.3%, +54.8%] |
| Δ billed tokens, raw sum of input + cache write + cache read | +98.8% [+46.8%, +142.4%] |
| Δ output tokens | +79.8% [+45.6%, +145.0%] |
| Δ cost per task, list price | **+$0.0114** [+$0.0048, +$0.0181] |
| Pass rate, with plugin | 8/11 |
| Pass rate, without plugin | 10/11 |
| Guard events, with plugin | fan-out 9 · dispatch 8 · whole-file 3 · gated 3 · egress-lock 2 · repeat-query 1 · re-read 1 |
| Plugin footprint, always in context | ~273 tok |
| Total spend, both arms | $1.70 |

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
| Claude Code permissions.deny globs | 21% | 7% | 0.33 |
| a pattern-list PreToolUse hook | 46% | 14% | 0.59 |
| block every tool call | 100% | 100% | 0.73 |
| **handoff-os** | 100% | 0% | 1.00 |

72 cases, 2026-09-10; the comparators are mechanism baselines in `eval/baselines.mjs`, not vendor code. [Method](docs/BENCHMARK.md).

48 of 68 scored cases are `spec` (rule-derived), 19 `probe`, 1 `regression`; recall here is a regression check, not a detection rate.
<!-- /guard-scores -->

> Shell wrappers are unwrapped first, so `powershell -Command`, `cmd /c`, `bash -c` and
> `-EncodedCommand` get no free pass. Four evasions still do: [SECURITY.md](SECURITY.md).

## What ships

<!-- inventory -->
| What ships | Count |
|---|---|
| Guard logic | **1004** lines of Node across 7 scripts (892 non-blank) |
| Pattern rules | **48** |
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

> Hooks load at session start, so restart Claude Code — a running session keeps the version it
> started with. Installed is not the same as enforcing: confirm with `npm run doctor`.

### OpenCode — supported

Why it works here: the same guard judges every tool call, whatever model you pick, so a refusal still stops the call, explains itself, and lands in the repo ledger for `npm run benchmark`.

Install: clone this repo, point `plugin` at the loader in `opencode.json`, restart opencode:

`"plugin": ["file:///path/to/handoff-os/.opencode/plugin/handoff-os.ts"]`

Update with a plain `git pull` — file-based plugins never cache.

What is not covered here: connector (`mcp`) calls pass through unjudged, and there is no blocking verify gate.

### Cowork — supported with limits

Why it is partial: skills, connectors, and subagents run in Cowork, but plugin command hooks (`PreToolUse`, `PostToolUse`) currently never fire there — the host spawns with `--setting-sources user`, which silently skips plugin scope (upstream issues `anthropics/claude-code#27398`, `#51281`, `#51904`).

What still helps when hooks do run: the guard already judges `mcp__workspace__bash` payloads (`command` / `script` / `code`) for egress, destructive git, and secret writes, just like `Bash`.

What to do until hooks fire: copy the `deny` list from `settings/policy.json` into user scope as a fallback, and read Cowork runs from `local-agent-mode-sessions/*/audit.jsonl` or the Compliance API instead of `audit/*.jsonl`, which `npm run benchmark` never sees.

## Configuration

- `HANDOFF_STATS=0` silences the kept-out line once you trust the gate.
- `HANDOFF_LOCK_GIT=1` blocks every state-changing git command, including commits, when merges must stay human.
- `HANDOFF_MCP_ALLOW=action,action` allows the named connector actions the egress lock would otherwise stop.
- `HANDOFF_DENY_SUBAGENT_MODELS=model,model` keeps the listed tiers off subagent dispatches (default `opus,fable`, because review belongs on sonnet).
- `HANDOFF_OS_DIR=/path` stores session state and audit files outside the project when the repo must stay clean.

> Node 22 or later. `settings/policy.json` holds the `deny` list, because permission rules cannot
> ship inside a plugin.

## Limits

- Token counts are bytes / 4 estimates; only the billing figures are measured, so never price from the estimate.
- The ledger records what was refused, never a paired session proving the bill fell, so there is no counterfactual yet.
- Replay is open-loop — a refusal cannot change what the agent did next — so it shows catches on that stream, not savings.
- Only whole-file reads count toward the denominator; slices, `Grep` output, and subagent returns are invisible to it.
- Shell-heavy sessions hide reads inside pipelines, which the read budget cannot size.
- Coverage ends where hooks stop loading, so chat, API, and unhooked harnesses run unguarded.
- Pattern matching can be evaded (see `SECURITY.md`), so run it alongside OS permissions, never instead of them.
- All figures are self-measured on one machine and unreproduced, so rerun `npm run benchmark:replay` before you cite them.

## License

[Apache-2.0](LICENSE), maintained by serio-ngo.

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) ·
[docs/BENCHMARK.md](docs/BENCHMARK.md) · [docs/MANIFEST.md](docs/MANIFEST.md) ·
[docs/PLAN-1.6.md](docs/PLAN-1.6.md) · [docs/COMPARABLES.md](docs/COMPARABLES.md)
