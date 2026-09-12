# Benchmark

<sub><b>Answers</b> · what the guard refused, would refuse, blocks, and bills — ledger · replay · track A · track B · flood · <a href="../README.md">README</a></sub>

<!-- ledger · replay · track A · track B · flood -->

| Track | Question | Status |
|---|---|---|
| Ledger | what the guard refused in live sessions | runs on every Stop hook |
| Replay | what the guard would refuse on recorded real traffic | `npm run benchmark:replay` |
| Track A | does the guard block what it claims to | `npm run benchmark:eval`, gated in CI |
| Track B | does the bill actually fall | `npm run benchmark:ab` |
| Flood | what one 20-subagent prompt costs, with and without | `npm run benchmark:flood` |

## Cost and limits

<img src="tiles-cost.svg" width="720" alt="Cost and limits: more tokens on ordinary tasks; Cowork hooks do not fire; OpenCode subagents bypass the guard">

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

- Answers what the guard catches on this stream. Not Track B.

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
| Measured over 16 turns | Tokens | Share |
|---|---|---|
| Read volume the session asked for | ~381.1k | 100% |
| **Kept out** | **~245.7k** | **64%** |
| — re-read dedup | ~29.8k | 8% |
| — whole-file cap | ~8,200 | 2% |
| — moved to a subagent | ~194.0k | 51% |
| Admitted to the main thread | ~135.3k | 36% |

| Context tax — the plugin's own footprint | Tokens |
|---|---|
| Session card, always in context | ~162 |
| Skill descriptions, always in context | ~65 |
| Agent descriptions, always in context | ~50 |
| **Total footprint** | **~277** |
| Per turn, on top of that | **0** (since 1.6.0) |
| **Net kept out minus footprint** | **~245.5k** |

| Measured billing | Tokens |
|---|---|
| Fresh — input + output + cache write | 18,488,496 |
| Cache-read | 839,063,368 |
| **Context re-send ratio** | **45.4×** |
| Re-sends removed, kept × turns that followed | ~15.3M |

Guard actions: 47. Token counts are file bytes / 4 from this repo's own local ledger, an estimate; the billing figures are measured. Method: [Billing](#billing--measured-not-estimated).
<!-- /handoff-stats -->

## Track A

| Item | Value |
|---|---|
| Corpus | `tooling/corpus/guard-corpus.jsonl`, labelled; case counts in the `<!-- eval-results -->` block below |
| Runner | `npm run benchmark:eval`, exits 1 on a miss, gated in CI |
| Verdict | exit 2 means blocked |
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
| Claude Code permissions.deny globs | 16% | 5% | 0.27 |
| a pattern-list PreToolUse hook | 36% | 11% | 0.50 |
| block every tool call | 100% | 100% | 0.73 |
| **handoff-os** | 100% | 0% | 1.00 |

91 cases, 2026-09-12; the comparators are mechanism baselines in `tooling/benchmark/baselines.mjs`, not vendor code.

61 of 87 scored cases are `spec` (rule-derived), 22 `probe`, 4 `regression`; recall here is a regression check, not a detection rate.
<!-- /guard-scores -->

- Mechanism baselines from published rule shapes, not vendor code; no product named.
- Same case list, same scoring; `tooling/benchmark/baselines.mjs` committed for repeat or dispute.
- `tooling/results/scores.json` written by the same run; feeds the README badges.
- Cost is context tax: the plugin's own footprint against the rot it keeps out, per window, in the ledger report.
- Spawn milliseconds print on `--latency` runs only; machine-specific, never published, never in `scores.json`.
- Multiple roots aggregate: `node tooling/benchmark/benchmark.mjs <repo…> [--write]`; combined totals print, outputs land in the first root.

<!-- eval-results -->
Run 2026-09-12 · 91 cases · guard `plugins/handoff-os/scripts/guard.mjs` · exit 2 = blocked.

| Metric | Value |
|---|---|
| Recall | 50/50 (100%) |
| Precision | 50/50 (100%) |
| False-positive rate | 0/37 (0%) |
| F1 | 1.00 |
| Known bypasses caught | 0/4 (0%) |

Confusion: TP 50 · FN 0 · FP 0 · TN 37. Bypasses scored apart.

- `evasion-01` open — the binary name is held in a shell variable.
- `evasion-02` open — payload decoded by a pipeline, not by a shell flag.
- `evasion-03` open — an unquoted no-op flag used as a POST body excuses the segment.
- `evasion-04` open — connector action whose name carries no classifiable verb.

61 of 87 scored cases are `spec` (rule-derived), 22 `probe`, 4 `regression`; recall here is a regression check, not a detection rate.
<!-- /eval-results -->

## Track B — paired runs, with and without the plugin

| Item | Rule |
|---|---|
| Runner | `npm run benchmark:ab` — `tooling/benchmark/benchmark.mjs ab` |
| Tasks | `tooling/corpus/tasks.jsonl`, one object per line: `id`, `prompt`, `check` (shell, exit 0 = pass, `$AB_RESULT` holds the final reply), `expect_guard` (guard classes the task provokes; empty = neutral), optional `setup` |
| Fixture | `tooling/benchmark/fixture/`, copied to a fresh temp dir per run, `git init` + one commit; `src/big.js` regenerates from `tools/make-big.mjs` |
| Arms | A: `claude -p --plugin-dir plugins/handoff-os` · B: same command without it; `--output-format stream-json --max-turns 12 --setting-sources project --strict-mcp-config`, tools `Read,Grep,Glob,Bash,Edit,Write,Agent,Task` |
| Order | random per task, seeded (`--seed`) |
| Meter | `usage` of every assistant message, deduplicated by `request_id`; subagent messages included |
| Billed tokens | raw = `input + cache_write + cache_read`; weighted = `input + 1.25× write(5m) + 2× write(1h) + 0.1× read` |
| Guard events | `PreToolUse … hook error` tool results classified by rule text; `gated` from the Stop hook |
| Ledger | arm A only: every counter in `.claude/.session-*.json` of the temp dir, `saved` + `lifetime` |
| Footprint | session card + skill and agent descriptions, chars / 4; already inside arm A billing — reported, never subtracted |
| Δ | with − without per task; mean, and share of the without-arm total, bootstrap 95% CI over 10,000 resamples |
| Quality gate | pass rate per arm beside tokens; a token drop with a pass drop is a loss |
| Micro | `micro-a` whole-file read of `src/big.js` · `micro-b` six-subagent fan-out; per arm billed tokens, subagents requested / blocked / spawned |
| Budget | stops once cumulative billed tokens pass `--budget` (default 2000000 tok); partial results still written |
| Output | `tooling/results/ab-results.json`, overwritten each run — only the current run is kept · this file's `<!-- ab-results -->` |
| Ban | bytes / 4 never reported as billing |

```bash
npm run benchmark:ab                                   # every task, both arms, micro experiments
npm run benchmark:ab -- --task big-read                # one task
npm run benchmark:ab -- --dry-run                      # pipeline only, no model call
npm run benchmark:ab -- --render                       # rewrite the blocks from tooling/results/ab-results.json
npm run benchmark:ab -- --plugin-dir <dir> --out <file>  # another plugin build; an --out outside the repo leaves the blocks alone
npm run benchmark:ab -- --model <id> --n 5 --no-micro
```

<!-- ab-results -->
| Status | Run 1 — plugin build a9c5212 (chore/readability-restructure, 1.10.2) · 2026-09-12 · model `claude-haiku-4-5-20251001` · N = 11 |
|---|---|
| Footprint | ~275 tok |
| Tokens | billed = input + cache write + cache read from transcript usage; weighted = 1× + 1.25×/2× write + 0.1× read |
| History | overwritten each run — only the current run is kept, no history files |
| Paid off | **`micro-b` -67,268 (-55.6%)** · **`fanout-6` -16,413 (-14.6%)** · **`micro-a` -11,570 (-20.2%)** billed (0.1× read); guard fired 20×, expected-hit 7/8 |
| Cost | +4,363 tok [-1,104 tok, +9,372 tok], +12.1% [-2.3%, +30.3%] — CI includes zero; pass with 9/11, without 11/11; misses `rm-tracked`, `git-clean` — blocked by egress-lock (intended: destructive prompts) |

| Aggregate | Mean Δ (with − without) | 95% CI | Δ % |
|---|---|---|---|
| Billed tokens, cache-read at 0.1× | 4363 | -1104 … 9372 | +12.1% [-2.3%, +30.3%] |
| Billed tokens, raw | 22325 | -3965 … 47386 | +22.3% [-2.4%, +59.6%] |
| Pass rate | with 9/11 · without 11/11 | — | — |
| Guard events, with plugin | repeat-query 1 · re-read 1 · dispatch 7 · fan-out 4 · gated 2 · egress-lock 5 | — | — |
| Billed tokens, both arms | 1,116,735 | — | — |

<details>
<summary>Per-task rows · 22 · micro rows · 4</summary>

| Task | Arm | Pass | Billed (0.1× read) | Raw | Output | Guard events | Ledger |
|---|---|---|---|---|---|---|---|
| `big-read` | with | yes | 76,666 | 93,765 | 7 | — | rewrites 1, trimmed 17974, read 24510 |
| `big-read` | without | yes | 57,333 | 65,790 | 2 | — | — |
| `grep-twice` | with | yes | 19,674 | 47,369 | 5 | repeat-query 1 | queries 1 |
| `grep-twice` | without | yes | 18,797 | 46,539 | 6 | — | — |
| `reread` | with | yes | 23,288 | 72,270 | 9 | re-read 1 | rereads 1, bytes 388, read 1116 |
| `reread` | without | yes | 22,619 | 71,146 | 5 | — | — |
| `fanout-6` | with | yes | 95,679 | 286,979 | 27 | dispatch 6, fan-out 4 | agents 3, blocked 10, rewrites 1, trimmed 17974, offload 25175, scouts 3, waves 4, agentsCapped 4 |
| `fanout-6` | without | yes | 112,092 | 356,749 | 44 | — | — |
| `opus-review` | with | yes | 55,876 | 159,691 | 29 | dispatch 1 | agents 1, blocked 1, offload 728, redirects 1 |
| `opus-review` | without | yes | 50,619 | 133,640 | 19 | — | — |
| `done-claim` | with | yes | 43,440 | 224,935 | 10 | gated 1 | read 1809, gated 1 |
| `done-claim` | without | yes | 31,206 | 122,099 | 10 | — | — |
| `rm-tracked` | with | no | 27,116 | 97,786 | 16 | egress-lock 2 | blocked 2, read 277 |
| `rm-tracked` | without | yes | 22,288 | 70,566 | 5 | — | — |
| `git-clean` | with | no | 28,796 | 120,609 | 11 | egress-lock 3 | blocked 3 |
| `git-clean` | without | yes | 21,120 | 69,868 | 6 | — | — |
| `neutral-lookup` | with | yes | 19,092 | 47,058 | 6 | — | read 130 |
| `neutral-lookup` | without | yes | 18,295 | 46,274 | 7 | — | — |
| `neutral-add` | with | yes | 33,654 | 147,238 | 20 | gated 1 | read 388, gated 1 |
| `neutral-add` | without | yes | 21,794 | 70,281 | 5 | — | — |
| `neutral-slice` | with | yes | 20,106 | 47,571 | 7 | — | read 1311 |
| `neutral-slice` | without | yes | 19,227 | 46,740 | 6 | — | — |

| Micro | Arm | Billed (0.1× read) | Raw | Subagents requested / blocked / spawned | Guard events | Ledger |
|---|---|---|---|---|---|---|
| `micro-a` | with | 45,767 | 93,609 | 0 / 0 / 0 | — | rewrites 1, trimmed 17974, read 24510 |
| `micro-a` | without | 57,337 | 65,789 | 0 / 0 / 0 | — | — |
| `micro-b` | with | 53,793 | 193,902 | 11 / 8 / 3 | dispatch 5, fan-out 3 | agents 3, blocked 8, offload 1069, scouts 3, waves 3, agentsCapped 3 |
| `micro-b` | without | 121,061 | 377,293 | 6 / 0 / 6 | — | — |

</details>

```bash
npm run benchmark:ab -- --model claude-haiku-4-5-20251001
```
<!-- /ab-results -->

## Flood — one prompt, 20 subagents

| Item | Rule |
|---|---|
| Runner | `npm run benchmark:flood` — `tooling/benchmark/benchmark.mjs flood` |
| Fixture | `tooling/benchmark/fixture/` minus `src/`, `tests/`, `tools/`; plus `src/mod01.js … mod20.js`, generated at run time, three exports each |
| Prompt | one: launch one subagent per module, all 20 in parallel, then one line per module |
| Arms | without the plugin first, then `--plugin-dir plugins/handoff-os`; same flags as Track B, `--max-turns 25` |
| Model | `claude-sonnet-5` by default; `--model <id>` |
| Subagent calls | `Agent` / `Task` tool calls in the transcript |
| Started | `subagent_stats.spawned` from the result event |
| Refused | subagent calls answered by a `PreToolUse` hook error |
| Tokens billed | `input + cache write + 0.1 × cache read`, transcript `usage`, subagents included |
| Raw tokens per subagent | `input + cache write + cache read` of one subagent's messages, grouped by `parent_tool_use_id`, mean over the arm |
| Finished | reply names all 20 modules |
| Budget | stops once cumulative billed tokens pass `--budget` (default 2,000,000); partial result still written |
| Output | `tooling/results/flood-results.json` · `docs/flood.svg` · README `<!-- handoff-flood -->` · this file's `<!-- flood-results -->` |
| Figures | `tooling/cli/figures.mjs` renders `docs/flood.svg`, `docs/tiles-*.svg`, `docs/demo.svg` from `tooling/results/*.json` and plugin constants; `npm run upkeep` rewrites them, `upkeep:check` fails when they differ |

```bash
npm run benchmark:flood                 # both arms, one prompt
npm run benchmark:flood -- --render     # rewrite docs/flood.svg and the blocks from tooling/results/flood-results.json
npm run benchmark:flood -- --dry-run    # pipeline only, no model call
```

<!-- flood-results -->
Run 2026-09-10 · model `claude-sonnet-5` · plugin build 8e9d9c4 (1.9.1) · `tooling/results/flood-results.json`

| Arm | Subagent calls | Started | Refused by the guard | Raw tokens per subagent | Tokens billed | Wall time | Finished |
|---|---|---|---|---|---|---|---|
| without | 20 | 20 | 0 | 24,480 | 174,757 | 39s | yes |
| with | 43 | 3 | 40 | 18,813 | 104,751 | 120s | no |
<!-- /flood-results -->
