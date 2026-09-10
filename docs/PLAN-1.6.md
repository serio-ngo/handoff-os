# Plan — 1.6

<!-- follow-up to PR #18; rows 0 and 1 landed in PR #19, rows 2–5 and 8 in the spend-guard PR; status per row -->

| Item | Value |
|---|---|
| Base | PR #18 (`context-tax-reduction`) |
| Goal | results a session can see, a reason to install, paired proof |
| Non-goal | competing with RTK / context-mode on output filtering |

## Verdict on 1.5.42 + #18

| Finding | Evidence |
|---|---|
| Nothing reduces model-side tokens; the guard only refuses | `guard.mjs:393`, `guard.mjs:403` exit 2 or 0; no `updatedInput` anywhere in `guard.mjs`; `audit.mjs` returns no `updatedToolOutput` |
| Read budget judges only `Read` and single-operand `cat`-family | `patterns.mjs:147` `WHOLE_FILE_READ`; `guard.mjs:108-116` `wholeFileReads` skips any chunk with `\|`, backtick or `$(` |
| Uncounted read shapes | `sed -n`, `head`, `tail`, `cat a b`, `Read` with `offset`/`limit` (`guard.mjs:132` `sliced`, `guard.mjs:171` books nothing), `grep`/`awk` dumps, interpreter reads |
| Verify gate and citation contract blocked uncounted | `verify.mjs:67-71`, `verify.mjs:141-147` on #18; fixed here with `gated` |
| Stop line is lifetime-cumulative, no per-session receipt | `ledger.mjs:77-90` `lifetimeLine`; `verify.mjs:73-93` `report` banks then zeroes |
| Track B never run | `docs/BENCHMARK.md` Track B `Status \| Not run` |
| Footprint exceeded kept-out on the maintainer's own ledger | `README.md` on `main`, `handoff-stats` block: net ~−538 tok over 4 turns |
| Replay: read budget refused 3 of 927 judged calls | `README.md` `handoff-replay` block on `main` (3 of 1,078 on #18); the other 33/36 refusals are egress |
| #18 left the version at 1.5.42 | `package.json:3`, `plugin.json:5`; `docs/CLAUDE_CODE_FACTS.md` — content without a version bump is a no-op on install |
| #18 changed the ledger line format; `collect()` drops the old lines | `scripts/benchmark.mjs` `collect` parses `entry.target` as JSON; regex-format lines `continue` |

## Ceiling

| What | Plugin can influence? |
|---|---|
| Thinking and output tokens | no |
| Cache re-send multiplier | no — Claude Code prompt caching, billed at cache-read rate |
| Tool-result size after execution | yes — PostToolUse `updatedToolOutput` (hooks.md); unused by this plugin, RTK's ground |
| Admitted bytes of `Read`, `Grep`, `Bash` reads | yes — PreToolUse `updatedInput`, or deny |
| Plugin's own footprint | yes |
| Delegation to a subagent | yes — deny with a remedy |
| Cowork | no — plugin hooks do not fire under `--setting-sources user` (`anthropics/claude-code#63047`, closed not planned) |
| OpenCode subagents | partial — `tool.execute.before` skips subagent calls (`sst/opencode#5894`) |

## Rows

| # | What | Where | Measured by | Test | LOC |
|---|---|---|---|---|---|
| 0 | Version 1.6.0 — done in this PR | `plugin.json`, `package.json`, `CHANGELOG.md` | `npm run doctor` registers 1.6.0 | — | 2 |
| 1 | `gated` counter for verify gate + citation contract — done in this PR | `ledger.mjs`, `verify.mjs` | Stop line `N gated` | one blocking case | 8 |
| 2 | `sessionLine(state)`: per-session receipt — done in the spend-guard PR — stops by class, admitted tok and share of ceiling, bytes trimmed, actors used, footprint; Stop prints it only when totals changed since last print; `lifetimeLine` stays for the benchmark | `ledger.mjs`, `verify.mjs` | receipt fields | one blocking case: silent Stop when nothing changed | 40 |
| 3 | Rewrite instead of refuse via PreToolUse `updatedInput` — done in the spend-guard PR: oversize `Read` → `{offset, limit}`; `cat\|bat\|less f` over cap → `head -c 24576 f`; content `Grep` without `head_limit` → `head_limit: 50`; book `trimmed = size − admitted` per event | `guard.mjs` | deterministic byte delta, no refusal round-trip | one case per rewrite shape | 60 |
| 4 | Book every read shape — done in the spend-guard PR: `sed -n a,bp`, `head -n/-c`, `tail`, first segment of a pipe, `Read offset/limit`, `cat a b` → estimated admitted bytes; interpreter and `git show` reads → `unjudged` counter, the denominator | `patterns.mjs`, `guard.mjs` | `read` and `unjudged` counters | one case: `sed -n` books admitted bytes | 50 |
| 5 | Enforced delegation — done in the spend-guard PR, counter `offloads`: after 8 whole files or 150 KB admitted, deny the next whole-file read and print a ready-to-paste `handoff-os:scout` dispatch naming the file | `guard.mjs` | `offloads` counter | one case: ninth whole file denied | 25 |
| 6 | Track B runner `npm run benchmark:ab` over `eval/tasks.jsonl`, paired arms with and without `--plugin-dir` — the proof | `scripts/benchmark.mjs`, `eval/tasks.jsonl` | `docs/BENCHMARK.md` Track B | outside the suite, like `benchmark:eval` | 200 |
| 7 | OTEL attribution recipe | `docs/BENCHMARK.md` | `claude_code.tool_decision` with `decision_source: hook`; `claude_code.token.usage` with `plugin.name` — third-party names need `OTEL_LOG_TOOL_DETAILS=1` | — | 0 |
| 8 | README honesty — done in the spend-guard PR: badge relabel (`68-case regression suite`, not `100% caught`); savings net of footprint and per session length; Cowork hooks inert with issue refs; OpenCode subagent bypass; bytes / 4 is an estimate | `README.md` | — | — | 0 |
| 9 | Go/no-go after row 6: if Δ billed ≤ footprint and `gated` + citation catches = 0 over N tasks, drop the optimisation positioning and ship as guard + verify gate only | `README.md`, `plugin.json` description | row 6 output | — | 0 |

## Proof format

| Field | Source |
|---|---|
| Tasks run, per arm | `eval/ab.json` |
| Pass rate, per arm | each task's `pass` command exit code |
| Billed tokens, per arm | `usage` blocks from `claude -p --output-format json`, deduplicated by `requestId` |
| Δ billed, net of footprint, 95% CI | bootstrap over per-task deltas |
| Verify-gate catches | `gated` blocks with a failing `pass` command at that Stop |
| Citation catches | `gated` blocks with a `file:line` missing on disk |
| Footprint | `npm run benchmark` context tax |
| Date, model, plugin version | run output, `plugin.json` |

## Expected magnitude

| Session type | Refusable mass | Note |
|---|---|---|
| Disciplined | ~3% of fresh tokens — 27k of 937k in the 2026-09-10 maintainer session (thread figure, not in the repo) | multiplied by cache re-send, priced at cache-read rate |
| Undisciplined | larger | unmeasured until row 6 |
