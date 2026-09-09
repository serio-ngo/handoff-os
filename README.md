# handoff-os

Claude Code burns context on three things: whole files read for one line, the same bytes
re-sent every turn, and subagent waves nobody can read back. handoff-os stops all three at the
`PreToolUse` hook — before the tokens are spent.

Lightweight, zero dependencies, fully offline: pattern matching in Node. No model calls, no API
keys, no network, no telemetry.

[![context re-send](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.resendRatio&suffix=x&label=context%20re-send&color=blue)](docs/BENCHMARK.md) [![guard caught](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.recall&suffix=%25&label=guard%20caught&color=brightgreen)](docs/BENCHMARK.md) [![wrongly blocked](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.fpRate&suffix=%25&label=wrongly%20blocked&color=brightgreen)](docs/BENCHMARK.md)

[![plugin logic](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.logicLines&suffix=%20lines&label=plugin%20logic)](plugins/handoff-os/scripts) [![dependencies](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.dependencies&label=dependencies&color=brightgreen)](package.json) [![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)

[![version](https://img.shields.io/github/package-json/v/serio-ngo/handoff-os?label=version)](plugins/handoff-os/.claude-plugin/plugin.json) [![license](https://img.shields.io/github/license/serio-ngo/handoff-os)](LICENSE)

![handoff-os admitting a small read, refusing a 38KB read, capping a 20-agent opus wave and blocking a send, then printing session totals](docs/demo.svg)

## What changes for you

- One question about one line no longer costs the whole file. Reads over 24 KB are refused, with a slice or a scout offered instead.
- Nothing is billed twice. A file already in context, or a search already answered, is refused on repeat.
- Subagent fan-outs stay readable. Three agents per wave, the cheapest model that can do the job.
- Nothing irreversible happens by accident. Sends, payments, publishes, merges, deletes and credential writes stop before they run and wait for a human.

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
| Measured over 3 turns | Tokens | Share |
|---|---|---|
| Read volume the session asked for | ~690 | 100% |
| **Kept out** | **~43** | **6%** |
| — re-read dedup | ~43 | 6% |
| — whole-file cap | ~0 | 0% |
| — moved to a subagent | ~0 | 0% |
| Admitted to the main thread | ~647 | 94% |

| Context tax — the plugin's own footprint | Tokens |
|---|---|
| Session card, always in context | ~313 |
| Skill descriptions, always in context | ~177 |
| Agent descriptions, always in context | ~92 |
| **Total footprint** | **~581** |
| **Net kept out minus footprint** | **~-538** |

| Measured billing | Tokens |
|---|---|
| Fresh — input + output + cache write | 1,440,133 |
| Cache-read | 30,124,746 |
| **Context re-send ratio** | **20.9×** |
| Re-sends removed, kept × turns that followed | ~0 |

Guard actions: 4. Token counts are file bytes / 4 from this repo's own local ledger, an estimate; the billing figures are measured. Method: [docs/BENCHMARK.md](docs/BENCHMARK.md).
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

> Shell wrappers are unwrapped first, so `powershell -Command`, `cmd /c`, `bash -c` and
> `-EncodedCommand` get no free pass. Four evasions still do: [SECURITY.md](SECURITY.md).

## What ships

<!-- inventory -->
| What ships | Count |
|---|---|
| Guard logic | **1012** lines of Node across 7 scripts (897 non-blank) |
| Pattern rules | **47** |
| Hooks | **6** handlers on 6 events |
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
> started with.

| Surface | Hooks run |
|---|---|
| Claude Code CLI, VS Code, JetBrains, desktop Code tab | yes |
| claude.ai chat, the API, any other harness | no — nothing loads `hooks.json`, so no rule fires |

> Installed is not the same as enforcing. Confirm with `npm run doctor`.

### OpenCode

Install: clone this repo, point `plugin` at the loader in `opencode.json`, restart opencode:

`"plugin": ["file:///path/to/handoff-os/.opencode/plugin/handoff-os.ts"]`

Update with a plain `git pull` — file-based plugins never cache.

Every tool call then runs the same guards. A refusal stops the call, tells the model why, and
lands in the repo audit log with the reason. Works with any model — dispatches are judged on
content, never on provider or model name. Session data lands in the repo ledger, where
`npm run benchmark` picks it up. Not covered on this harness: connector (`mcp`) calls pass
through unjudged, and there is no blocking verify gate.

Every tool call runs the same guards. A refusal stops the call and tells the model why, and
the reason lands in the repo audit log. Works with any model — dispatches are judged on
content, never on provider or model name. Session data lands in the repo ledger, where
`npm run benchmark` picks it up. Not covered on this harness: connector (`mcp`) calls pass
through unjudged, and there is no blocking verify gate.

## Configuration

| Variable | Effect |
|---|---|
| `HANDOFF_STATS=0` | Silence the kept-out line. On by default. |
| `HANDOFF_LOCK_GIT=1` | Block all state-changing git commands, including commits. |
| `HANDOFF_MCP_ALLOW=action,action` | Allow named connector actions the egress lock would block. |
| `HANDOFF_DENY_SUBAGENT_MODELS=model,model` | Deny these model tiers for subagents. Default `opus,fable`. |
| `HANDOFF_OS_DIR=/path` | Store session state and audit files outside the project. |

> Node 22 or later. `settings/policy.json` holds the `deny` list, because permission rules cannot
> ship inside a plugin.

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
