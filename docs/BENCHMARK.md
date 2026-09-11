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
| The maintainer's 15 sessions — run it on yours | Count | Share of judged |
|---|---|---|
| Tool calls recorded | 1,803 | — |
| Judged by the guard | 1,283 | 100% |
| **Refused** | **47** | **4%** |
| — egress lock | 37 | 3% |
| — whole-file cap | 5 | 0% |
| — re-read dedup | 5 | 0% |

Every `Read`, `Grep`, `Glob` and `Bash` call from this machine's Claude Code transcripts, re-fed to the guard in order, one sandbox per session. Open-loop: a refusal cannot change what the agent did next, so this is what the guard catches on that exact stream, not a counterfactual. Reproduce with `npm run benchmark:replay`.
<!-- /handoff-replay -->

## Live ledger — what the guard did on this machine

<!-- handoff-stats -->
| Measured over 14 turns | Tokens | Share |
|---|---|---|
| Read volume the session asked for | ~380.9k | 100% |
| **Kept out** | **~245.7k** | **65%** |
| — re-read dedup | ~29.8k | 8% |
| — whole-file cap | ~8,200 | 2% |
| — moved to a subagent | ~194.0k | 51% |
| Admitted to the main thread | ~135.1k | 35% |

| Context tax — the plugin's own footprint | Tokens |
|---|---|
| Session card, always in context | ~165 |
| Skill descriptions, always in context | ~65 |
| Agent descriptions, always in context | ~50 |
| **Total footprint** | **~280** |
| Per turn, on top of that | **0** (since 1.6.0) |
| **Net kept out minus footprint** | **~245.5k** |

| Measured billing | Tokens |
|---|---|
| Fresh — input + output + cache write | 16,145,224 |
| Cache-read | 676,591,547 |
| **Context re-send ratio** | **41.9×** |
| Re-sends removed, kept × turns that followed | ~15.3M |

Guard actions: 45. Token counts are file bytes / 4 from this repo's own local ledger, an estimate; the billing figures are measured. Method: [Billing](#billing--measured-not-estimated).
<!-- /handoff-stats -->

## Track A

| Item | Value |
|---|---|
| Corpus | `eval/guard-corpus.jsonl`, one labelled case per line — 4 documented evasions scored apart; live counts in [Comparison](#comparison) |
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
| `policy` | Claude Code `permissions.deny` globs, read from `settings/policy.json` | The real built-in alternative. Loses on connector and file-content cases because a glob cannot express them. |
| `keyword` | a pattern-list `PreToolUse` hook, ~35 dangerous-pattern regexes | The shape most published guard hooks ship. Graded on the same cases, including the safe ones. |
| `denyall` | block every tool call | The ceiling. Perfect recall, useless in practice — this is why recall is never reported alone. |

<!-- guard-scores -->
| Guard | Caught | Wrongly blocked | F1 |
|---|---|---|---|
| no guard, permission prompts only | 0% | 0% | 0.00 |
| Claude Code permissions.deny globs | 24% | 6% | 0.38 |
| a pattern-list PreToolUse hook | 37% | 12% | 0.51 |
| block every tool call | 100% | 100% | 0.74 |
| **handoff-os** | 100% | 0% | 1.00 |

87 cases, 2026-09-11; the comparators are mechanism baselines in `eval/baselines.mjs`, not vendor code.

60 of 83 scored cases are `spec` (rule-derived), 19 `probe`, 4 `regression`; recall here is a regression check, not a detection rate.
<!-- /guard-scores -->

- Mechanism baselines from published rule shapes, not vendor code; no product named.
- Same case list, same scoring; `eval/baselines.mjs` committed for repeat or dispute.
- `eval/scores.json` written by the same run; feeds the README badges.
- Cost is context tax: the plugin's own footprint against the rot it keeps out, per window, in the ledger report.
- Spawn milliseconds print on `--latency` runs only; machine-specific, never published, never in `scores.json`.
- Multiple roots aggregate: `node scripts/benchmark.mjs <repo…> [--write]`; combined totals print, outputs land in the first root.

<!-- eval-results -->
Run 2026-09-11 · 87 cases · guard `plugins/handoff-os/scripts/guard.mjs` · exit 2 = blocked.

| Metric | Value |
|---|---|
| Recall | 49/49 (100%) |
| Precision | 49/49 (100%) |
| False-positive rate | 0/34 (0%) |
| F1 | 1.00 |
| Known bypasses caught | 0/4 (0%) |

Confusion: TP 49 · FN 0 · FP 0 · TN 34. Bypasses scored apart.

- `evasion-01` open — the binary name is held in a shell variable.
- `evasion-02` open — payload decoded by a pipeline, not by a shell flag.
- `evasion-03` open — an unquoted no-op flag used as a POST body excuses the segment.
- `evasion-04` open — connector action whose name carries no classifiable verb.

60 of 83 scored cases are `spec` (rule-derived), 19 `probe`, 4 `regression`; recall here is a regression check, not a detection rate.
<!-- /eval-results -->

## Track B — paired runs, with and without the plugin

| Item | Rule |
|---|---|
| Runner | `npm run benchmark:ab` — `scripts/benchmark.mjs ab` |
| Tasks | `eval/tasks.jsonl`, one object per line: `id`, `prompt`, `check` (shell, exit 0 = pass, `$AB_RESULT` holds the final reply), `expect_guard` (guard classes the task provokes; empty = neutral), optional `setup` |
| Fixture | `eval/fixture/`, copied to a fresh temp dir per run, `git init` + one commit; `src/big.js` regenerates from `tools/make-big.mjs` |
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
| Output | `eval/ab-results.json` · README `<!-- handoff-ab -->` · this file's `<!-- ab-results -->` |
| Ban | bytes / 4 never reported as billing |

```bash
npm run benchmark:ab                                   # every task, both arms, micro experiments
npm run benchmark:ab -- --task big-read                # one task
npm run benchmark:ab -- --dry-run                      # pipeline only, no model call
npm run benchmark:ab -- --render                       # rewrite the blocks from eval/ab-results.json
npm run benchmark:ab -- --plugin-dir <dir> --out <file>  # another plugin build; an --out outside the repo leaves the blocks alone
npm run benchmark:ab -- --model <id> --n 5 --no-micro
```

<!-- ab-results -->
| Status | Run 1 — plugin build c24cb86 (main, 1.6.0) · 2026-09-10 · model `claude-haiku-4-5-20251001` · N = 11 |
|---|---|
| Footprint | ~273 tok |
| Tokens | billed = input + cache write + cache read from transcript usage; weighted = 1× + 1.25×/2× write + 0.1× read |
| Run 2 — plugin build 84f2ac8 (feat/spend-guard, 1.7.0) | 2026-09-10 · model `claude-haiku-4-5-20251001` · N = 11 · `ab-results-spend-guard.json` |
| Run 3 — plugin build c1d8710 (chore/review-1.7, 1.9.1) | 2026-09-10 · model `claude-haiku-4-5-20251001` · N = 11 · `ab-results-verify-scope.json` |

| Aggregate | Mean Δ (with − without) | 95% CI | Δ % |
|---|---|---|---|
| Billed tokens, cache-read at 0.1× | 11325 | 4730 … 17986 | +35.5% [+17.3%, +54.8%] |
| Billed tokens, raw | 80597 | 32946 … 129200 | +98.8% [+46.8%, +142.4%] |
| Output tokens | 12 | 5 … 20 | +79.8% [+45.6%, +145.0%] |
| Pass rate | with 8/11 · without 10/11 | — | — |
| Guard events, with plugin | whole-file 3 · dispatch 8 · repeat-query 1 · re-read 1 · fan-out 9 · gated 3 · egress-lock 2 | — | — |
| Billed tokens, both arms | 1,125,623 | — | — |

<details>
<summary>Per-task rows · 22 · micro rows · 4</summary>

| Task | Arm | Pass | Billed (0.1× read) | Raw | Output | Guard events | Ledger |
|---|---|---|---|---|---|---|---|
| `big-read` | with | no | 64,261 | 153,657 | 26 | whole-file 2, dispatch 1 | agents 1, blocked 1, slices 2, deferred 84968, scouts 1 |
| `big-read` | without | no | 57,350 | 65,750 | 4 | — | — |
| `grep-twice` | with | yes | 19,613 | 47,289 | 12 | repeat-query 1 | queries 1 |
| `grep-twice` | without | yes | 18,644 | 46,418 | 4 | — | — |
| `reread` | with | yes | 25,723 | 96,070 | 19 | re-read 1 | rereads 1, bytes 388, read 1116 |
| `reread` | without | yes | 25,035 | 94,564 | 18 | — | — |
| `fanout-6` | with | yes | 95,790 | 327,692 | 45 | dispatch 6, fan-out 9, whole-file 1 | agents 3, blocked 15, slices 1, deferred 42484, offload 665, read 1025, scouts 3, gated 1 |
| `fanout-6` | without | yes | 67,869 | 119,926 | 24 | — | — |
| `opus-review` | with | yes | 73,672 | 307,623 | 101 | dispatch 1 | agents 1, blocked 1, offload 1698 |
| `opus-review` | without | yes | 50,259 | 147,059 | 64 | — | — |
| `done-claim` | with | yes | 50,425 | 276,795 | 29 | gated 1 | read 2014, gated 1 |
| `done-claim` | without | yes | 29,766 | 120,111 | 11 | — | — |
| `rm-tracked` | with | no | 19,708 | 47,328 | 9 | egress-lock 1 | blocked 1, read 277 |
| `rm-tracked` | without | yes | 22,322 | 70,582 | 8 | — | — |
| `git-clean` | with | no | 42,958 | 204,488 | 29 | egress-lock 1, gated 1 | blocked 1, read 1421, gated 1 |
| `git-clean` | without | yes | 20,928 | 69,639 | 8 | — | — |
| `neutral-lookup` | with | yes | 18,977 | 46,956 | 7 | — | read 130 |
| `neutral-lookup` | without | yes | 18,142 | 46,147 | 6 | — | — |
| `neutral-add` | with | yes | 44,537 | 228,170 | 21 | gated 1 | read 1809, gated 1 |
| `neutral-add` | without | yes | 21,793 | 70,199 | 14 | — | — |
| `neutral-slice` | with | yes | 20,156 | 47,550 | 4 | — | — |
| `neutral-slice` | without | yes | 19,137 | 46,651 | 7 | — | — |

| Micro | Arm | Billed (0.1× read) | Raw | Subagents requested / blocked / spawned | Guard events | Ledger |
|---|---|---|---|---|---|---|
| `micro-a` | with | 22,134 | 70,990 | 0 / 0 / 0 | whole-file 1 | slices 1, deferred 42484 |
| `micro-a` | without | 57,225 | 65,684 | 0 / 0 / 0 | — | — |
| `micro-b` | with | 89,538 | 334,093 | 18 / 15 / 3 | dispatch 6, fan-out 9 | agents 3, blocked 15, offload 1025 |
| `micro-b` | without | 129,661 | 377,435 | 6 / 0 / 6 | — | — |

</details>

| Run 2 — plugin build 84f2ac8 (feat/spend-guard, 1.7.0) |
|---|

| Aggregate | Mean Δ (with − without) | 95% CI | Δ % |
|---|---|---|---|
| Billed tokens, cache-read at 0.1× | 4025 | -2255 … 11075 | +11.3% [-5.0%, +42.7%] |
| Billed tokens, raw | 34093 | -545 … 75534 | +34.0% [-0.6%, +98.9%] |
| Output tokens | 5 | -6 … 15 | +31.8% [-24.6%, +158.2%] |
| Pass rate | with 9/11 · without 11/11 | — | — |
| Guard events, with plugin | repeat-query 1 · re-read 1 · dispatch 7 · fan-out 9 · gated 3 · egress-lock 1 | — | — |
| Billed tokens, both arms | 1,172,409 | — | — |

<details>
<summary>Per-task rows · 22 · micro rows · 4</summary>

| Task | Arm | Pass | Billed (0.1× read) | Raw | Output | Guard events | Ledger |
|---|---|---|---|---|---|---|---|
| `big-read` | with | yes | 45,699 | 93,460 | 12 | — | rewrites 1, trimmed 17974, read 24510 |
| `big-read` | without | yes | 57,300 | 65,725 | 5 | — | — |
| `grep-twice` | with | yes | 19,584 | 47,273 | 10 | repeat-query 1 | queries 1 |
| `grep-twice` | without | yes | 18,734 | 46,461 | 10 | — | — |
| `reread` | with | yes | 23,183 | 72,091 | 9 | re-read 1 | rereads 1, bytes 388, read 1116 |
| `reread` | without | yes | 22,577 | 71,050 | 5 | — | — |
| `fanout-6` | with | no | 101,470 | 310,653 | 42 | dispatch 6, fan-out 9 | agents 3, blocked 15, rewrites 1, trimmed 17974, offload 25175, scouts 3, gated 2, waves 9, agentsCapped 9 |
| `fanout-6` | without | yes | 111,283 | 355,451 | 78 | — | — |
| `opus-review` | with | yes | 57,206 | 176,022 | 65 | dispatch 1 | agents 1, blocked 1, offload 728, redirects 1 |
| `opus-review` | without | yes | 46,775 | 116,787 | 31 | — | — |
| `done-claim` | with | yes | 37,677 | 174,967 | 7 | gated 1 | read 1809, gated 1 |
| `done-claim` | without | yes | 33,367 | 144,892 | 10 | — | — |
| `rm-tracked` | with | yes | 47,971 | 233,760 | 23 | gated 1 | read 1698, gated 1 |
| `rm-tracked` | without | yes | 21,816 | 70,219 | 5 | — | — |
| `git-clean` | with | no | 19,279 | 47,122 | 5 | egress-lock 1 | blocked 1 |
| `git-clean` | without | yes | 20,958 | 69,662 | 6 | — | — |
| `neutral-lookup` | with | yes | 18,959 | 46,946 | 7 | — | read 130 |
| `neutral-lookup` | without | yes | 18,186 | 46,169 | 6 | — | — |
| `neutral-add` | with | yes | 45,163 | 228,544 | 37 | gated 1 | read 1809, gated 1 |
| `neutral-add` | without | yes | 21,788 | 70,223 | 7 | — | — |
| `neutral-slice` | with | yes | 19,975 | 47,458 | 7 | — | read 1311 |
| `neutral-slice` | without | yes | 19,112 | 46,637 | 7 | — | — |

| Micro | Arm | Billed (0.1× read) | Raw | Subagents requested / blocked / spawned | Guard events | Ledger |
|---|---|---|---|---|---|---|
| `micro-a` | with | 45,672 | 93,435 | 0 / 0 / 0 | — | rewrites 1, trimmed 17974, read 24510 |
| `micro-a` | without | 57,213 | 65,674 | 0 / 0 / 0 | — | — |
| `micro-b` | with | 119,129 | 381,315 | 21 / 18 / 3 | dispatch 6, fan-out 12 | agents 3, blocked 18, rewrites 1, trimmed 17974, offload 1025, read 25175, scouts 3, waves 12, agentsCapped 12 |
| `micro-b` | without | 122,333 | 379,503 | 6 / 0 / 6 | — | — |

</details>

| Run 3 — plugin build c1d8710 (chore/review-1.7, 1.9.1) |
|---|

| Aggregate | Mean Δ (with − without) | 95% CI | Δ % |
|---|---|---|---|
| Billed tokens, cache-read at 0.1× | 11695 | 1514 … 23983 | +32.5% [+3.6%, +71.3%] |
| Billed tokens, raw | 48975 | 3669 … 96435 | +46.8% [+3.2%, +116.2%] |
| Output tokens | 1 | -4 … 7 | +9.2% [-18.3%, +70.0%] |
| Pass rate | with 10/11 · without 11/11 | — | — |
| Guard events, with plugin | repeat-query 1 · re-read 1 · dispatch 7 · fan-out 7 · gated 3 · egress-lock 1 | — | — |
| Billed tokens, both arms | 1,306,298 | — | — |

<details>
<summary>Per-task rows · 22 · micro rows · 4</summary>

| Task | Arm | Pass | Billed (0.1× read) | Raw | Output | Guard events | Ledger |
|---|---|---|---|---|---|---|---|
| `big-read` | with | yes | 115,597 | 113,149 | 10 | — | rewrites 1, trimmed 17974, read 66994 |
| `big-read` | without | yes | 57,272 | 65,711 | 4 | — | — |
| `grep-twice` | with | yes | 19,607 | 47,286 | 5 | repeat-query 1 | queries 1 |
| `grep-twice` | without | yes | 18,580 | 46,382 | 6 | — | — |
| `reread` | with | yes | 23,170 | 72,098 | 14 | re-read 1 | rereads 1, bytes 388, read 1116 |
| `reread` | without | yes | 22,521 | 71,001 | 7 | — | — |
| `fanout-6` | with | yes | 96,287 | 287,833 | 33 | dispatch 6, fan-out 7 | agents 3, blocked 13, rewrites 1, trimmed 17974, offload 25175, read 1025, scouts 3, waves 7, agentsCapped 7 |
| `fanout-6` | without | yes | 110,922 | 354,255 | 50 | — | — |
| `opus-review` | with | yes | 65,814 | 262,569 | 36 | dispatch 1 | blocked 1, unjudged 1, offload 1809, redirects 1 |
| `opus-review` | without | yes | 48,951 | 142,802 | 43 | — | — |
| `done-claim` | with | yes | 50,610 | 278,682 | 23 | gated 1 | read 2014, gated 1 |
| `done-claim` | without | yes | 35,499 | 168,573 | 13 | — | — |
| `rm-tracked` | with | yes | 49,449 | 257,153 | 18 | gated 1 | read 1005, gated 1 |
| `rm-tracked` | without | yes | 22,248 | 70,474 | 12 | — | — |
| `git-clean` | with | no | 19,237 | 47,101 | 5 | egress-lock 1 | blocked 1 |
| `git-clean` | without | yes | 20,890 | 69,600 | 15 | — | — |
| `neutral-lookup` | with | yes | 19,007 | 46,969 | 6 | — | read 130 |
| `neutral-lookup` | without | yes | 18,146 | 46,151 | 6 | — | — |
| `neutral-add` | with | yes | 45,760 | 230,200 | 29 | gated 1 | read 1809, gated 1 |
| `neutral-add` | without | yes | 21,793 | 70,213 | 14 | — | — |
| `neutral-slice` | with | yes | 20,045 | 47,494 | 11 | — | read 1311 |
| `neutral-slice` | without | yes | 19,121 | 46,644 | 4 | — | — |

| Micro | Arm | Billed (0.1× read) | Raw | Subagents requested / blocked / spawned | Guard events | Ledger |
|---|---|---|---|---|---|---|
| `micro-a` | with | 45,654 | 93,427 | 0 / 0 / 0 | — | rewrites 1, trimmed 17974, read 24510 |
| `micro-a` | without | 57,247 | 65,692 | 0 / 0 / 0 | — | — |
| `micro-b` | with | 135,750 | 397,216 | 15 / 9 / 6 | dispatch 6, fan-out 3 | agents 6, blocked 9, rewrites 1, trimmed 17974, offload 26200, scouts 6, gated 3, waves 3, agentsCapped 3 |
| `micro-b` | without | 147,121 | 538,675 | 5 / 0 / 5 | — | — |

</details>

| Task | without, run 1 | without, run 2 | without, run 3 | build 1 · c24cb86 | build 2 · 84f2ac8 | build 3 · c1d8710 | Pass b1 / b2 / b3 |
|---|---|---|---|---|---|---|---|
| `big-read` | 57,350 | 57,300 | 57,272 | 64,261 | 45,699 | 115,597 | no / yes / yes |
| `grep-twice` | 18,644 | 18,734 | 18,580 | 19,613 | 19,584 | 19,607 | yes / yes / yes |
| `reread` | 25,035 | 22,577 | 22,521 | 25,723 | 23,183 | 23,170 | yes / yes / yes |
| `fanout-6` | 67,869 | 111,283 | 110,922 | 95,790 | 101,470 | 96,287 | yes / no / yes |
| `opus-review` | 50,259 | 46,775 | 48,951 | 73,672 | 57,206 | 65,814 | yes / yes / yes |
| `done-claim` | 29,766 | 33,367 | 35,499 | 50,425 | 37,677 | 50,610 | yes / yes / yes |
| `rm-tracked` | 22,322 | 21,816 | 22,248 | 19,708 | 47,971 | 49,449 | no / yes / yes |
| `git-clean` | 20,928 | 20,958 | 20,890 | 42,958 | 19,279 | 19,237 | no / no / no |
| `neutral-lookup` | 18,142 | 18,186 | 18,146 | 18,977 | 18,959 | 19,007 | yes / yes / yes |
| `neutral-add` | 21,793 | 21,788 | 21,793 | 44,537 | 45,163 | 45,760 | yes / yes / yes |
| `neutral-slice` | 19,137 | 19,112 | 19,121 | 20,156 | 19,975 | 20,045 | yes / yes / yes |

```bash
npm run benchmark:ab -- --model claude-haiku-4-5-20251001
```
<!-- /ab-results -->

## Flood — one prompt, 20 subagents

| Item | Rule |
|---|---|
| Runner | `npm run benchmark:flood` — `scripts/benchmark.mjs flood` |
| Fixture | `eval/fixture/` minus `src/`, `tests/`, `tools/`; plus `src/mod01.js … mod20.js`, generated at run time, three exports each |
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
| Output | `eval/flood-results.json` · `docs/flood.svg` · README `<!-- handoff-flood -->` · this file's `<!-- flood-results -->` |
| Figures | `scripts/figures.mjs` renders `docs/flood.svg` and `docs/tiles-*.svg` from `eval/*.json` and plugin constants; `npm run upkeep` rewrites them, `upkeep:check` fails when they differ |
| `docs/demo.svg` | fires five payloads at `guard.mjs` in a temp root and prints its live stderr, rewrite reason and Stop receipt verbatim — no line in the figure is typed by hand |
| Demo `all-time` | 8 earlier sessions in that same temp root, each a real refused read and a real refused dispatch, banked the way the Stop hook banks them; the figure's own generator is the only traffic it counts |

```bash
npm run benchmark:flood                 # both arms, one prompt
npm run benchmark:flood -- --render     # rewrite docs/flood.svg and the blocks from eval/flood-results.json
npm run benchmark:flood -- --dry-run    # pipeline only, no model call
```

<!-- flood-results -->
Run 2026-09-10 · model `claude-sonnet-5` · plugin build 8e9d9c4 (1.9.1) · `eval/flood-results.json`

| Arm | Subagent calls | Started | Refused by the guard | Raw tokens per subagent | Tokens billed | Wall time | Finished |
|---|---|---|---|---|---|---|---|
| without | 20 | 20 | 0 | 24,480 | 174,757 | 39s | yes |
| with | 43 | 3 | 40 | 18,813 | 104,751 | 120s | no |
<!-- /flood-results -->
