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
| Status | Run 1 — plugin build a9c5212 (chore/readability-restructure, 1.10.2) · 2026-09-12 · model `claude-haiku-4-5-20251001` · N = 11 |
|---|---|
| Billed tokens | raw = input + cache write + cache read, from transcript `usage`; weighted = 1× input + 1.25× write (5 min) + 2× write (1 h) + 0.1× read |

| Aggregate | Mean Δ billed, cache-read at 0.1× (with − without) | 95% CI | N | Pass with / without |
|---|---|---|---|---|
| Billed tokens | +4,363 tok, +12.1% | -1,104 tok … +9,372 tok | 11 | 9/11 · 11/11 |

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
Run 2026-09-10 · model `claude-sonnet-5` · plugin build 8e9d9c4 (1.9.1) · `tooling/results/flood-results.json`

| Arm | Subagent calls | Started | Refused by the guard | Raw tokens per subagent | Tokens billed | Wall time | Finished |
|---|---|---|---|---|---|---|---|
| without | 20 | 20 | 0 | 24,480 | 174,757 | 39s | yes |
| with | 43 | 3 | 40 | 18,813 | 104,751 | 120s | no |
<!-- /flood-results -->
