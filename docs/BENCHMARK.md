# Benchmark

<sub><b>Answers</b> · does the guard block what it claims, and what does it cost · track A · track B · flood · <a href="../README.md">README</a></sub>

| Track | Question | Command |
|---|---|---|
| Track A | does the guard block what it claims to | `npm run benchmark:eval`, gated in CI; `npm run benchmark:compare` adds the four comparators |
| Track B | does the bill fall, task by task | `npm run benchmark:ab` |
| Flood | what one 20-subagent prompt costs, with and without | `npm run benchmark:flood` |

<img src="tiles-cost.svg" width="720" alt="Cost and limits: more tokens on ordinary tasks; Cowork hooks do not fire; OpenCode subagents run unguarded">

| Limit | Detail |
|---|---|
| Ordinary tasks | cost more tokens, not fewer — the guard buys a ceiling on the tail, not an average saving |
| Cowork | hooks do not fire there |
| OpenCode | its subagents run unguarded |

## Track A

| Item | Value |
|---|---|
| Corpus | `tooling/corpus/guard-corpus.jsonl`, one labelled case per line |
| Verdict | exit 2 = blocked |
| `origin` | `spec` derived from the rule table · `probe` found by probing · `regression` reproduces a shipped bug |
| Scoring | recall never without false-positive rate; a `spec`-heavy corpus makes recall a regression check, not a detection rate |
| Other guards | `HANDOFF_EVAL_GUARD="node ../other-guard/hook.mjs" npm run benchmark:eval` — same corpus, same scoring |
| Output | `tooling/results/scores.json`, feeds the README badges |

<!-- eval-results -->
Run 2026-09-12 · 66 cases · guard `plugins/handoff-os/scripts/guard.mjs` · exit 2 = blocked.

| Metric | Value |
|---|---|
| Recall | 34/34 (100%) |
| Precision | 34/34 (100%) |
| False-positive rate | 0/32 (0%) |
| F1 | 1.00 |

Confusion: TP 34 · FN 0 · FP 0 · TN 32.

48 of 66 scored cases are `spec` (rule-derived), 16 `probe`, 2 `regression`; recall here is a regression check, not a detection rate.
<!-- /eval-results -->

| Comparator | Models | Note |
|---|---|---|
| `none` | no guard, permission prompts only | the floor |
| `policy` | Claude Code `permissions.deny` globs from `tooling/settings/policy.json` | the built-in alternative; a glob cannot express connector or content cases |
| `keyword` | a `PreToolUse` hook with ~35 dangerous-pattern regexes | the shape most published guard hooks ship |
| `denyall` | block every tool call | the ceiling: perfect recall, useless |

<!-- guard-scores -->
| Guard | Caught | Wrongly blocked | F1 |
|---|---|---|---|
| no guard, permission prompts only | 0% | 0% | 0.00 |
| Claude Code permissions.deny globs | 24% | 6% | 0.36 |
| a pattern-list PreToolUse hook | 41% | 13% | 0.54 |
| block every tool call | 100% | 100% | 0.68 |
| **handoff-os** | 100% | 0% | 1.00 |

66 cases, 2026-09-12; the comparators are mechanism baselines in `tooling/benchmark/baselines.mjs`, not vendor code.

48 of 66 scored cases are `spec` (rule-derived), 16 `probe`, 2 `regression`; recall here is a regression check, not a detection rate.
<!-- /guard-scores -->

## Track B

| Item | Rule |
|---|---|
| Tasks | `tooling/corpus/tasks.jsonl`: `id`, `prompt`, `check` (shell, exit 0 = pass, `$AB_RESULT` holds the final reply), `expect_guard`, optional `setup` |
| Fixture | `tooling/benchmark/fixture/`, copied to a fresh temp dir per run, `git init` + one commit |
| Arms | A: `claude -p --plugin-dir plugins/handoff-os` · B: the same command without it; `--max-turns 12 --setting-sources project --strict-mcp-config`, tools `Read,Grep,Glob,Bash,Edit,Write,Agent,Task` |
| Order | random per task, seeded (`--seed`) |
| Meter | `usage` of every assistant message, deduplicated by `request_id`, subagents included |
| Guard events | `PreToolUse … hook error` tool results classified by rule text |
| Δ | with − without per task; mean and share of the without-arm total, bootstrap 95% CI over 10,000 resamples |
| Quality | pass rate per arm beside tokens; a token drop with a pass drop is a loss |
| Micro | `micro-a` whole-file read of `src/big.js` · `micro-b` six-subagent fan-out |
| Budget | stops once billed tokens pass `--budget` (default 2,000,000); partial results still written |
| Output | `tooling/results/ab-results.json`, overwritten each run, and the block below |

```bash
npm run benchmark:ab                                     # every task, both arms, micro experiments
npm run benchmark:ab -- --task big-read                  # one task
npm run benchmark:ab -- --dry-run                        # pipeline only, no model call
npm run benchmark:ab -- --render                         # rewrite the block from tooling/results/ab-results.json
npm run benchmark:ab -- --plugin-dir <dir> --out <file>  # another plugin build; an --out outside the repo leaves the block alone
npm run benchmark:ab -- --model <id> --n 5 --no-micro
```

<!-- ab-results -->
| Status | Run 1 — plugin build 10223b6 (chore/guard-only, 1.11.0) · 2026-09-12 · model `claude-haiku-4-5-20251001` · N = 11 |
|---|---|
| Billed tokens | raw = input + cache write + cache read, from transcript `usage`; weighted = 1× input + 1.25× write (5 min) + 2× write (1 h) + 0.1× read |

| Aggregate | Mean Δ billed, cache-read at 0.1× (with − without) | 95% CI | N | Pass with / without |
|---|---|---|---|---|
| Billed tokens | -984 tok, -2.7% | -10,019 tok … +6,077 tok | 11 | 9/11 · 11/11 |

<details>
<summary>Per-task rows · 22 · micro rows · 4</summary>

| Task | Arm | Pass | Billed (0.1× read) | Raw | Output | Guard events | Ledger |
|---|---|---|---|---|---|---|---|
| `big-read` | with | yes | 75,719 | 92,752 | 8 | — | trimmed 1 |
| `big-read` | without | yes | 57,373 | 65,809 | 4 | — | — |
| `grep-twice` | with | yes | 19,040 | 46,788 | 8 | repeat-query 1 | rereads 1 |
| `grep-twice` | without | yes | 21,286 | 69,970 | 9 | — | — |
| `reread` | with | yes | 25,113 | 95,064 | 13 | re-read 1 | rereads 1 |
| `reread` | without | yes | 22,684 | 71,203 | 10 | — | — |
| `fanout-6` | with | no | 80,361 | 191,995 | 28 | fan-out 6 | trimmed 1, held 6 |
| `fanout-6` | without | yes | 119,604 | 355,505 | 43 | — | — |
| `opus-review` | with | yes | 60,054 | 200,700 | 57 | dispatch 1 | blocked 1 |
| `opus-review` | without | yes | 47,427 | 118,433 | 32 | — | — |
| `done-claim` | with | yes | 31,246 | 121,247 | 12 | — | — |
| `done-claim` | without | yes | 36,440 | 169,300 | 27 | — | — |
| `rm-tracked` | with | yes | 22,359 | 70,785 | 5 | — | — |
| `rm-tracked` | without | yes | 22,029 | 70,472 | 8 | — | — |
| `git-clean` | with | no | 22,372 | 70,730 | 4 | egress-lock 2 | blocked 2 |
| `git-clean` | without | yes | 21,059 | 69,808 | 5 | — | — |
| `neutral-lookup` | with | yes | 18,516 | 46,506 | 6 | — | — |
| `neutral-lookup` | without | yes | 18,205 | 46,227 | 7 | — | — |
| `neutral-add` | with | yes | 22,091 | 70,672 | 12 | — | — |
| `neutral-add` | without | yes | 21,925 | 70,381 | 9 | — | — |
| `neutral-slice` | with | yes | 19,565 | 47,036 | 4 | — | — |
| `neutral-slice` | without | yes | 19,229 | 46,742 | 12 | — | — |

| Micro | Arm | Billed (0.1× read) | Raw | Subagents requested / blocked / spawned | Guard events | Ledger |
|---|---|---|---|---|---|---|
| `micro-a` | with | 84,506 | 112,395 | 0 / 0 / 0 | — | trimmed 1 |
| `micro-a` | without | 57,332 | 65,785 | 0 / 0 / 0 | — | — |
| `micro-b` | with | 103,432 | 402,060 | 9 / 3 / 6 | fan-out 3 | trimmed 1, held 3 |
| `micro-b` | without | 95,819 | 329,294 | 5 / 0 / 5 | — | — |

</details>

```bash
npm run benchmark:ab -- --model claude-haiku-4-5-20251001
```
<!-- /ab-results -->

## Flood

| Item | Rule |
|---|---|
| Fixture | `tooling/benchmark/fixture/` minus `src/`, `tests/`, `tools/`; plus `src/mod01.js … mod20.js`, generated at run time |
| Prompt | one: launch one subagent per module, all 20 in parallel, then one line per module |
| Arms | without the plugin first, then `--plugin-dir plugins/handoff-os`; Track B flags, `--max-turns 25` |
| Model | `claude-sonnet-5` by default; `--model <id>` |
| Started | `subagent_stats.spawned` from the result event |
| Refused | subagent calls answered by a `PreToolUse` hook error |
| Tokens billed | `input + cache write + 0.1 × cache read`, transcript `usage`, subagents included |
| Finished | the reply names all 20 modules |
| Output | `tooling/results/flood-results.json`, `docs/flood.svg`, the README figure and the block below |
| Figures | `tooling/cli/figures.mjs` renders every `docs/*.svg` from `tooling/results/*.json` and plugin constants; `npm run upkeep` rewrites them |

```bash
npm run benchmark:flood                 # both arms, one prompt
npm run benchmark:flood -- --render     # rewrite docs/flood.svg and the blocks from tooling/results/flood-results.json
npm run benchmark:flood -- --dry-run    # pipeline only, no model call
```

<!-- flood-results -->
Run 2026-09-12 · model `claude-sonnet-5` · plugin build 10223b6 (1.11.0) · `tooling/results/flood-results.json`

| Arm | Subagent calls | Started | Refused by the guard | Raw tokens per subagent | Tokens billed | Wall time | Finished |
|---|---|---|---|---|---|---|---|
| without | 20 | 20 | 0 | 26,371 | 211,553 | 65s | yes |
| with | 42 | 15 | 27 | 4,194 | 210,157 | 227s | no (exit 1) |
<!-- /flood-results -->
