# Benchmark

<sub><b>Answers</b> · what the guard refused, would refuse and blocks — ledger · replay · track A · <a href="../README.md">README</a></sub>

<!-- ledger · replay · track A -->

| Track | Question | Status |
|---|---|---|
| Ledger | what the guard refused in live sessions | runs on every Stop hook |
| Replay | what the guard would refuse on recorded real traffic | `npm run benchmark:replay` |
| Track A | does the guard block what it claims to | `npm run benchmark:eval`, gated in CI |

## Cost and limits

| Limit | Detail |
|---|---|
| Ordinary tasks | cost more tokens, not fewer — the guard buys a ceiling on the tail, not an average saving |
| Cowork | hooks do not fire there |
| OpenCode | its subagents bypass the guard |
| Known bypasses | four, listed open in [Track A](#track-a) |

## Context savings — what `npm run benchmark` prints

| Figure | Definition |
|---|---|
| `read volume` | every byte the session asked to put in the main thread |
| `kept out` | the part refused before entry |
| Share | `kept / read volume` |

| Line | Counter | Credited |
|---|---|---|
| re-read dedup | `bytes` | full file size — already in context, byte-identical |
| whole-file cap | `deferred` | full file size at refusal |
| moved to a subagent | `offload` | bytes read under a non-`main` actor |
| admitted | `read` | bytes let into the main thread |
| repeat query, runaway cap | `queries`, `caps` | counted only; output size unknown at `PreToolUse` |
| dispatched scout / runner | `scouts`, `runners` | counted only; their reads credit `offload` |
| plugin footprint | — | session card + skill and agent descriptions, chars / 4, always in context |

| Share rule | Why |
|---|---|
| `queries` and `caps` earn no tokens | guard cannot know the `Grep` result size |
| `net` is kept-out tokens minus footprint | the window cost in tokens; negative when the window did no whole-file reads |
| a retried refusal credits once | first refusal stamps `actor + path + mtime:size + rule`; repeats skip the byte credit |
| the follow-up read lands in the denominator | slice or scout read after a cap counts as `admitted` or `offload` |

- Only the current ledger format parses; older lines skip, never guessed.
- Bytes / 4 estimates tokens; never billing.

| Denominator | Scope |
|---|---|
| Counts | unsliced main-thread `Read` calls; shell-spotted whole-file reads |
| Misses | slices, `Grep` output, `Bash` output, subagent returns |
| Read as | share of whole-file read volume, not of the window |

## Billing — measured, not estimated

| Field | Source |
|---|---|
| `fresh` | `input_tokens` + `output_tokens` + `cache_creation_input_tokens`, from transcript `usage` |
| `cache-read` | `cache_read_input_tokens`, from transcript `usage` |
| Fallback | every transcript under `~/.claude/projects/<slug>/` when no ledger line carries billing |
| `context re-send ratio` | `cache-read / fresh`; the mechanism exploited, not the plugin |

| `re-sends removed` | Rule |
|---|---|---|
| Credit | `kept bytes × turns that followed`, per stamped line, per session |
| Sessions | turn counts restart per session; a drop closes one, opens the next |
| Weight | re-sends would be cache-read tokens at 0.1× input; tokens only |

## Replay — the guard against recorded traffic

```bash
npm run benchmark:replay
```

- Input: this project's transcripts under `~/.claude/projects/<slug>/`; every `Read`, `Grep`, `Glob`, `Bash` call, in order, one sandbox ledger per session.

| Property | Value |
|---|---|
| Input | real tool calls from real sessions, not fixtures |
| Isolation | one temp `HANDOFF_OS_DIR` per session, matching that session's dedup state |
| Loop | open — a refusal cannot change what the agent did next |
| Misses | shell pipelines and `$(...)`, which the read budget cannot size |
| Bias | guarded sessions produce fewer hits, so the count is a floor |

- Answers what the guard catches on this stream.

<!-- handoff-replay -->
| The maintainer's 16 sessions — run it on yours | Count | Share of judged |
|---|---|---|
| Tool calls recorded | 2,141 | — |
| Judged by the guard | 1,473 | 100% |
| **Refused** | **76** | **5%** |
| — egress lock | 67 | 5% |
| — whole-file cap | 5 | 0% |
| — re-read dedup | 4 | 0% |

Every `Read`, `Grep`, `Glob` and `Bash` call from this machine's Claude Code transcripts, re-fed to the guard in order, one sandbox per session. Open-loop: a refusal cannot change what the agent did next, so this is what the guard catches on that exact stream, not a counterfactual. Reproduce with `npm run benchmark:replay`.
<!-- /handoff-replay -->

## Live ledger — what the guard did on this machine

<!-- handoff-stats -->
| Measured over 23 turns | Tokens | Share |
|---|---|---|
| Read volume the session asked for | ~233.4k | 100% |
| **Kept out** | **~25.0k** | **11%** |
| — re-read dedup | ~4,700 | 2% |
| — whole-file cap | ~0 | 0% |
| — moved to a subagent | ~0 | 0% |
| Admitted to the main thread | ~208.5k | 89% |

| Context tax — the plugin's own footprint | Tokens |
|---|---|
| Session card, always in context | ~42 |
| Skill descriptions, always in context | ~61 |
| Agent descriptions, always in context | ~43 |
| **Total footprint** | **~146** |
| Per turn, on top of that | **0** (since 1.6.0) |
| **Net kept out minus footprint** | **~24.8k** |

| Measured billing | Tokens |
|---|---|
| Fresh — input + output + cache write | 3,384,835 |
| Cache-read | 184,782,240 |
| **Context re-send ratio** | **54.6×** |
| Re-sends removed, kept × turns that followed | ~4.6M |

Guard actions: 21. Token counts are file bytes / 4 from this repo's own local ledger, an estimate; the billing figures are measured. Method: [Billing](#billing--measured-not-estimated).
<!-- /handoff-stats -->

## Track A

| Item | Value |
|---|---|
| Corpus | `tooling/corpus/guard-corpus.jsonl`, labelled; case counts in the `<!-- eval-results -->` block below |
| Runner | `npm run benchmark:eval`, exits 1 on a miss, gated in CI |
| Verdict | ask = held (exit 2 counts too) |
| `origin` field | `spec` = derived from the rule table, self-confirming · `probe` = found by adversarial probing · `regression` = reproduces a shipped bug |
| Scoring | recall never without false-positive rate; `known_gap` cases scored apart |

- Same corpus, same scoring, any `PreToolUse` guard on stdin:

```bash
HANDOFF_EVAL_GUARD="node ../other-guard/hook.mjs" npm run benchmark:eval
```

- No third-party guard run here. Self-test with published method.

## Comparison

```bash
npm run benchmark:compare
```

| Comparator | What it models | Fair to it |
|---|---|---|
| `none` | no guard, permission prompts only | The floor. Shows the corpus is not satisfiable by doing nothing. |
| `policy` | Claude Code `permissions.deny` globs, read from `tooling/settings/policy.json` | The real built-in alternative. Loses on connector and file-content cases because a glob cannot express them. |
| `keyword` | a pattern-list `PreToolUse` hook, ~35 dangerous-pattern regexes | The shape most published guard hooks ship. Graded on the same cases, including the safe ones. |
| `denyall` | block every tool call | The ceiling. Perfect recall, useless in practice — this is why recall is never reported alone. |

<!-- guard-scores -->
| Guard | Caught | Wrongly blocked | F1 |
|---|---|---|---|
| no guard, permission prompts only | 0% | 0% | 0.00 |
| Claude Code permissions.deny globs | 13% | 6% | 0.21 |
| a pattern-list PreToolUse hook | 25% | 12% | 0.36 |
| block every tool call | 100% | 100% | 0.65 |
| **serio-focus** | 100% | 0% | 1.00 |

33 cases, 2026-09-15; the comparators are mechanism baselines in `tooling/benchmark/baselines.mjs`, not vendor code.

25 of 33 scored cases are `spec` (rule-derived), 3 `probe`, 5 `regression`; recall here is a regression check, not a detection rate.
<!-- /guard-scores -->

- Mechanism baselines from published rule shapes, not vendor code; no product named.
- Same case list, same scoring; `tooling/benchmark/baselines.mjs` committed for repeat or dispute.
- `tooling/results/scores.json` written by the same run; feeds the README badges.
- Cost is context tax: the plugin's own footprint against the rot it keeps out, per window, in the ledger report.
- Spawn milliseconds print on `--latency` runs only; machine-specific, never published, never in `scores.json`.
- Multiple roots aggregate: `node tooling/benchmark/benchmark.mjs <repo…> [--write]`; combined totals print, outputs land in the first root.

<!-- eval-results -->
Run 2026-09-15 · 33 cases · guard `plugins/serio-focus/scripts/guard.mjs` · ask = held.

| Metric | Value |
|---|---|
| Recall | 16/16 (100%) |
| Precision | 16/16 (100%) |
| False-positive rate | 0/17 (0%) |
| F1 | 1.00 |
| Recall 95% CI (Wilson) | 80–100% — n=16 |
| FP-rate 95% CI (Wilson) | 0–19% — n=17 |
| Recall by origin | spec 14/14 (100%) · probe 1/1 (100%) · regression 1/1 (100%) |
| Known bypasses caught | n/a |

Confusion: TP 16 · FN 0 · FP 0 · TN 17. Bypasses scored apart.

25 of 33 scored cases are `spec` (rule-derived), 3 `probe`, 5 `regression`; recall here is a regression check, not a detection rate.
<!-- /eval-results -->
