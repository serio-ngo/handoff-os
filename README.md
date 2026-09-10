# handoff-os

handoff-os is a spend guard for Claude Code. It acts at the `PreToolUse` and `Stop` hooks, before
the tokens are spent, and books what it did in four units: a wave of expensive subagents prevented,
an expensive dispatch redirected to the cheap scout or runner, a whole-file read or re-read trimmed
or stopped, and a done-claim held until a verification run passes. Every session ends with a
one-line receipt in those units. Measured paired, with and without the plugin on 11 tasks, it does
not bill fewer tokens on general work (+11.3%, 95% CI −5.0 to +42.7); it saves on the cases it was
built for — a whole-file read −20%, a 6-agent fan-out −3% — and stops egress: [Track B](docs/BENCHMARK.md).

What it stops: a fourth agent in a 90-second wave, an opus or fable dispatch with no `QUALITY:`
flag, a whole-file read over 24 KB (rewritten to the first lines that fit instead of refused), a
byte-identical re-read, the ninth whole file in one thread (handed to a scout), a content grep
without `head_limit` (capped at 50 lines), and any call that sends, pays, publishes, merges or
deletes.

What it counts: exact counts of waves capped, agents held back, dispatches redirected, reads
trimmed, re-reads stopped and done-claims gated, plus the exact byte delta a rewrite kept out of the
window.

What it does not do: it cannot touch thinking or output tokens, the cache re-send multiplier, or
what Claude Code already does on its own (unchanged-file re-read suppression, the 30,000-character
Bash output cap); its hooks never fire in Cowork, and OpenCode subagent calls bypass it.

Lightweight, zero dependencies, fully offline: pattern matching in Node. No model calls, no API
keys, no network, no telemetry.

[![guard caught](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.recall&suffix=%25&label=guard%20caught&color=brightgreen)](docs/BENCHMARK.md) [![wrongly blocked](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.fpRate&suffix=%25&label=wrongly%20blocked&color=brightgreen)](docs/BENCHMARK.md)

[![plugin logic](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.logicLines&suffix=%20lines&label=plugin%20logic)](plugins/handoff-os/scripts) [![dependencies](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.dependencies&label=dependencies&color=brightgreen)](package.json) [![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)

[![version](https://img.shields.io/github/package-json/v/serio-ngo/handoff-os?label=version)](plugins/handoff-os/.claude-plugin/plugin.json) [![license](https://img.shields.io/github/license/serio-ngo/handoff-os)](LICENSE)

![handoff-os refusing a 38KB read, capping a 20-agent ultrathink opus wave and blocking a send, then printing session totals](docs/demo.svg)

## What changes for you

- A wave stops at three agents, and the receipt says how many were held back.
- An opus or fable dispatch that names no `QUALITY:` flag is refused with the scout or runner named instead; haiku input is 1/5 of the opus price.
- One question about one line no longer costs the whole file. A read over 24 KB is trimmed to the first lines that fit, a re-read of unchanged bytes is stopped, and after eight whole files the next one is handed to a scout with the dispatch ready to paste.
- A "done" claim waits for a real verification run, and the receipt counts every claim it gated.
- Nothing irreversible happens by accident. Sends, payments, publishes, merges, deletes and credential writes stop before they run and wait for a human.

## How to read the numbers

| Number | Kind |
|---|---|
| Receipt and ledger counts: waves capped, agents held back, redirects, reads trimmed, re-reads stopped, done-claims gated | measured, exact counts of guard actions |
| Bytes kept out, trimmed, admitted | measured bytes; `Read` and shell slices are estimated from a 200-line sample of line length |
| Tokens | estimated, bytes / 4; never billing |
| Price ratios on the receipt | the published per-token price table (`PRICES` in `ledger.mjs`), not this repo's traffic |
| Guard caught, wrongly blocked | regression suite of 68 self-written cases, not a detection rate |
| Cache re-send | measured on the maintainer's transcripts; Claude Code's caching, not the plugin's |
| Paired Δ billed tokens, pass rate | measured by `npm run benchmark:ab` at N=11, one model tier; the general-task delta is positive, so no token-savings claim is made here — [Track B](docs/BENCHMARK.md) |

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
| Guard logic | **1304** lines of Node across 7 scripts (1174 non-blank) |
| Pattern rules | **61** |
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

### OpenCode — supported, subagent calls unjudged

Why it works here: the same guard judges every tool call, whatever model you pick, so a refusal still stops the call, explains itself, and lands in the repo ledger for `npm run benchmark`.

Install: clone this repo, point `plugin` at the loader in `opencode.json`, restart opencode:

`"plugin": ["file:///path/to/handoff-os/.opencode/plugin/handoff-os.ts"]`

Update with a plain `git pull` — file-based plugins never cache.

What is not covered here: connector (`mcp`) calls pass through unjudged, subagent tool calls skip `tool.execute.before` (`sst/opencode#5894`), and there is no blocking verify gate.

### Cowork — hooks do not fire

Why it is partial: skills, connectors, and subagents run in Cowork, but plugin command hooks (`PreToolUse`, `PostToolUse`) currently never fire there — the host spawns with `--setting-sources user`, which silently skips plugin scope (upstream issues `anthropics/claude-code#27398`, `#51281`, `#51904`).

What still helps when hooks do run: the guard already judges `mcp__workspace__bash` payloads (`command` / `script` / `code`) for egress, destructive git, and secret writes, just like `Bash`.

What to do until hooks fire: copy the `deny` list from `settings/policy.json` into user scope as a fallback, and read Cowork runs from `local-agent-mode-sessions/*/audit.jsonl` or the Compliance API instead of `audit/*.jsonl`, which `npm run benchmark` never sees.

## Configuration

- `HANDOFF_STATS=0` silences the session receipt once you trust the gate.
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
- Slices enter the denominator as estimates from sampled line length; `Grep` output, dispatch prompts and subagent returns are still invisible to it.
- A bare read at the head of a pipe is booked at the Bash output cap as an upper bound; reads behind `$(…)`, backticks or interpreter one-liners are counted as unsized, never sized.
- A rewrite is auto-approved (`permissionDecision: allow`) so it costs no round trip; the trimmed input reads the same file, and permission deny rules still apply to it.
- Coverage ends where hooks stop loading, so chat, API, and unhooked harnesses run unguarded.
- Pattern matching can be evaded (see `SECURITY.md`), so run it alongside OS permissions, never instead of them.
- All figures are self-measured on one machine and unreproduced, so rerun `npm run benchmark:replay` before you cite them.

## License

[Apache-2.0](LICENSE), maintained by serio-ngo.

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) ·
[docs/BENCHMARK.md](docs/BENCHMARK.md) · [docs/MANIFEST.md](docs/MANIFEST.md) ·
[docs/PLAN-1.6.md](docs/PLAN-1.6.md) · [docs/COMPARABLES.md](docs/COMPARABLES.md) ·
[docs/CLAIMS-AUDIT.md](docs/CLAIMS-AUDIT.md)
