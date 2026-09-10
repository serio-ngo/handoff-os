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
npm run benchmark:ab -- --model <id> --n 5 --no-micro
```

<!-- ab-results -->
| Status | Not run: dry-run on 2026-09-10 |
|---|---|
| Plugin | 1.6.0, footprint ~273 tok |
| Prices | https://platform.claude.com/docs/en/pricing.md, read 2026-09-10 |

```bash
npm run benchmark:ab -- --model claude-haiku-4-5-20251001
```
<!-- /ab-results -->
