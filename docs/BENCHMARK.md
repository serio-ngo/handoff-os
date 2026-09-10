# Benchmark

<!-- ledger · replay · track A · track B -->

| Track | Question | Status |
|---|---|---|
| Ledger | what the guard refused in live sessions | runs on every Stop hook |
| Replay | what the guard would refuse on recorded real traffic | `npm run benchmark:replay` |
| Track A | does the guard block what it claims to | `npm run benchmark:eval`, gated in CI |
| Track B | does the bill actually fall | `npm run benchmark:ab` |

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
| `net` is kept-out tokens minus footprint | the window price of the gate; negative when the window did no whole-file reads |
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
|---|---|
| Credit | `kept bytes × turns that followed`, per stamped line, per session |
| Sessions | turn counts restart per session; a drop closes one, opens the next |
| Price | re-sends would be cache-read tokens, priced below input; still not a bill |

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

## Track A

| Item | Value |
|---|---|
| Corpus | `eval/guard-corpus.jsonl`, 72 labelled cases — 68 scored, 4 documented evasions apart |
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

- Mechanism baselines from published rule shapes, not vendor code; no product named.
- Same case list, same scoring; `eval/baselines.mjs` committed for repeat or dispute.
- `eval/scores.json` written by the same run; feeds the README badges.
- Cost is context tax: the plugin's own footprint against the rot it keeps out, per window, in the ledger report and the README stats block.
- Spawn milliseconds print on `--latency` runs only; machine-specific, never published, never in `scores.json`.
- Multiple roots aggregate: `node scripts/benchmark.mjs <repo…> [--write]`; combined totals print, outputs land in the first root.

<!-- eval-results -->
Run 2026-09-10 · 72 cases · guard `plugins/handoff-os/scripts/guard.mjs` · exit 2 = blocked.

| Metric | Value |
|---|---|
| Recall | 39/39 (100%) |
| Precision | 39/39 (100%) |
| False-positive rate | 0/29 (0%) |
| F1 | 1.00 |
| Known bypasses caught | 0/4 (0%) |

Confusion: TP 39 · FN 0 · FP 0 · TN 29. Bypasses scored apart.

- `evasion-01` open — the binary name is held in a shell variable.
- `evasion-02` open — payload decoded by a pipeline, not by a shell flag.
- `evasion-03` open — an unquoted no-op flag used as a POST body excuses the segment.
- `evasion-04` open — connector action whose name carries no classifiable verb.

48 of 68 scored cases are `spec` (rule-derived), 19 `probe`, 1 `regression`; recall here is a regression check, not a detection rate.
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
| Cost | weighted tokens × `PRICES` (list price, data-comment line in `scripts/benchmark.mjs`); the CLI's `total_cost_usd` recorded beside it |
| Guard events | `PreToolUse … hook error` tool results classified by rule text; `gated` from the Stop hook |
| Ledger | arm A only: every counter in `.claude/.session-*.json` of the temp dir, `saved` + `lifetime` |
| Footprint | session card + skill and agent descriptions, chars / 4; already inside arm A billing — reported, never subtracted |
| Δ | with − without per task; mean, and share of the without-arm total, bootstrap 95% CI over 10,000 resamples |
| Quality gate | pass rate per arm beside tokens; a token drop with a pass drop is a loss |
| Micro | `micro-a` whole-file read of `src/big.js` · `micro-b` six-subagent fan-out; per arm billed tokens, cost, subagents requested / blocked / spawned |
| Budget | stops once the CLI's cumulative cost passes `--budget` (default $5); partial results still written |
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
| Status | Run on 2026-09-10 · model `claude-haiku-4-5-20251001` · N = 11 |
|---|---|
| Plugin | 1.6.0, footprint ~273 tok |
| Prices | <https://platform.claude.com/docs/en/about-claude/pricing>, read 2026-09-10 |

| Aggregate | Mean Δ (with − without) | 95% CI | Δ % |
|---|---|---|---|
| Billed tokens, cache-read at 0.1× | 11325 | 4730 … 17986 | +35.5% [+17.3%, +54.8%] |
| Billed tokens, raw | 80597 | 32946 … 129200 | +98.8% [+46.8%, +142.4%] |
| Output tokens | 12 | 5 … 20 | +79.8% [+45.6%, +145.0%] |
| Cost, USD | +$0.0114 | +$0.0048 … +$0.0181 | +35.6% [+17.4%, +54.9%] |
| Pass rate | with 8/11 · without 10/11 | — | — |

| Task | Arm | Pass | Billed (0.1× read) | Raw | Output | Cost | Guard events | Ledger |
|---|---|---|---|---|---|---|---|---|
| `big-read` | with | no | 64,261 | 153,657 | 26 | $0.0644 | whole-file 2, dispatch 1 | agents 1, blocked 1, slices 2, deferred 84968, scouts 1 |
| `big-read` | without | no | 57,350 | 65,750 | 4 | $0.0574 | — | — |
| `grep-twice` | with | yes | 19,613 | 47,289 | 12 | $0.0197 | repeat-query 1 | queries 1 |
| `grep-twice` | without | yes | 18,644 | 46,418 | 4 | $0.0187 | — | — |
| `reread` | with | yes | 25,723 | 96,070 | 19 | $0.0258 | re-read 1 | rereads 1, bytes 388, read 1116 |
| `reread` | without | yes | 25,035 | 94,564 | 18 | $0.0251 | — | — |
| `fanout-6` | with | yes | 95,790 | 327,692 | 45 | $0.0960 | dispatch 6, fan-out 9, whole-file 1 | agents 3, blocked 15, slices 1, deferred 42484, offload 665, read 1025, scouts 3, gated 1 |
| `fanout-6` | without | yes | 67,869 | 119,926 | 24 | $0.0680 | — | — |
| `opus-review` | with | yes | 73,672 | 307,623 | 101 | $0.0742 | dispatch 1 | agents 1, blocked 1, offload 1698 |
| `opus-review` | without | yes | 50,259 | 147,059 | 64 | $0.0506 | — | — |
| `done-claim` | with | yes | 50,425 | 276,795 | 29 | $0.0506 | gated 1 | read 2014, gated 1 |
| `done-claim` | without | yes | 29,766 | 120,111 | 11 | $0.0298 | — | — |
| `rm-tracked` | with | no | 19,708 | 47,328 | 9 | $0.0198 | egress-lock 1 | blocked 1, read 277 |
| `rm-tracked` | without | yes | 22,322 | 70,582 | 8 | $0.0224 | — | — |
| `git-clean` | with | no | 42,958 | 204,488 | 29 | $0.0431 | egress-lock 1, gated 1 | blocked 1, read 1421, gated 1 |
| `git-clean` | without | yes | 20,928 | 69,639 | 8 | $0.0210 | — | — |
| `neutral-lookup` | with | yes | 18,977 | 46,956 | 7 | $0.0190 | — | read 130 |
| `neutral-lookup` | without | yes | 18,142 | 46,147 | 6 | $0.0182 | — | — |
| `neutral-add` | with | yes | 44,537 | 228,170 | 21 | $0.0446 | gated 1 | read 1809, gated 1 |
| `neutral-add` | without | yes | 21,793 | 70,199 | 14 | $0.0219 | — | — |
| `neutral-slice` | with | yes | 20,156 | 47,550 | 4 | $0.0202 | — | — |
| `neutral-slice` | without | yes | 19,137 | 46,651 | 7 | $0.0192 | — | — |

| Micro | Arm | Billed (0.1× read) | Raw | Cost | Subagents requested / blocked / spawned | Guard events |
|---|---|---|---|---|---|---|
| `micro-a` | with | 22,134 | 70,990 | $0.0222 | 0 / 0 / 0 | whole-file 1 |
| `micro-a` | without | 57,225 | 65,684 | $0.0572 | 0 / 0 / 0 | — |
| `micro-b` | with | 89,538 | 334,093 | $0.0897 | 18 / 15 / 3 | dispatch 6, fan-out 9 |
| `micro-b` | without | 129,661 | 377,435 | $0.1300 | 6 / 0 / 6 | — |

```bash
npm run benchmark:ab -- --model claude-haiku-4-5-20251001
```
<!-- /ab-results -->
