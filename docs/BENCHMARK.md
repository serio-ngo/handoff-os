# Benchmark

Four things get measured here.

| Track | Question | Status |
|---|---|---|
| Ledger | what the guard refused in live sessions | runs on every Stop hook |
| Replay | what the guard would refuse on recorded real traffic | `npm run benchmark:replay` |
| Track A | does the guard block what it claims to | `npm run benchmark:eval`, gated in CI |
| Track B | does the bill actually fall | **not run** |

## Context savings — what `npm run benchmark` prints

`read volume` is every byte the session asked to put in the main thread. `kept out` is
the part the guard refused before it entered the thread, and the headline share is `kept / read volume`.

| Line | Counter | Credited |
|---|---|---|
| re-read dedup | `bytes` | full file size — it was already in context, byte-identical |
| whole-file cap | `deferred` | full file size at the moment of refusal |
| moved to a subagent | `offload` | bytes read under a non-`main` actor |
| admitted | `read` | bytes the guard let into the main thread |
| repeat query, runaway cap | `queries`, `caps` | counted only; the output size is unknown at `PreToolUse` |

Three rules keep the share honest.

| Rule | Why |
|---|---|
| `queries` and `caps` earn no tokens | the guard cannot know how large a `Grep` result would have been |
| a retried refusal is credited once | the ledger stamps `actor + path + mtime:size + rule` on the first refusal and skips the byte credit on any repeat, so a stuck retry loop cannot inflate the total |
| the follow-up read lands in the denominator | after a whole-file cap the agent reads a slice or dispatches scout, and that read is counted as `admitted` or `offload` |

Only the current ledger format is parsed. Lines written by a format that no longer exists are
skipped, not guessed at.

Byte counts are file bytes / 4. That is an estimate of tokens and is never a billing figure.

The denominator is honest about its own edge: `read` counts unsliced main-thread `Read` calls and
the whole-file reads the guard spots inside shell commands. Slices, Grep output, Bash output and a
subagent's return text are context too, and none of them are in it. Read `kept out` as a share of
whole-file read volume, not of everything that reaches the window.

## Billing — measured, not estimated

The Stop hook reads `transcript_path` and sums the `usage` blocks: `input_tokens`, `output_tokens`,
`cache_creation_input_tokens` as **fresh**, and `cache_read_input_tokens` as **cache-read**. These
are Claude Code's own counts, not an estimate. When no ledger line carries billing, the benchmark
falls back to every transcript for the project under `~/.claude/projects/<slug>/`.

`context re-send ratio` is `cache-read / fresh`: how many times an average fresh token was read back
from cache. It measures the mechanism the plugin exploits, not the plugin.

`re-sends removed` is the one figure that joins the two halves. Every ledger line carries the turn it
was written on, so a refusal at turn 5 of a session that reached turn 40 is credited
`kept bytes × 35`. Turn counts restart per session, and a drop in the count is what closes one
session and opens the next. Summed over every stamped line, this is measured arithmetic on measured
inputs. It is still not a bill: those re-sends would have been cache-read tokens, priced well below
input.

## Replay — the guard against recorded traffic

`npm run benchmark:replay` reads this project's Claude Code transcripts under
`~/.claude/projects/<slug>/` and re-feeds every `Read`, `Grep`, `Glob` and `Bash` call to the guard
in recorded order, one sandbox ledger per session.

| Property | Value |
|---|---|
| Input | real tool calls from real sessions, not fixtures |
| Isolation | one temp `HANDOFF_OS_DIR` per session, so dedup state matches that session |
| Loop | open — a refusal cannot change what the agent did next |
| Reads it misses | anything issued through a shell pipeline or `$(...)`, which the read budget cannot size |
| Bias | sessions already guarded produce fewer hits, so the count is a floor |

It answers "what does this guard catch on this stream". It does not answer Track B.

## Track A

| Item | Value |
|---|---|
| Corpus | `eval/guard-corpus.jsonl`, 66 labelled cases |
| Runner | `npm run benchmark:eval`, exits 1 on a miss, gated in CI |
| Verdict | exit 2 means blocked |
| `origin` field | `spec` = derived from the rule table, self-confirming · `probe` = found by adversarial probing · `regression` = reproduces a shipped bug |
| Scoring | recall never without false-positive rate; `known_gap` cases scored apart so no scoring choice hides them |

Run against any other guard that reads a `PreToolUse` payload on stdin:

```bash
HANDOFF_EVAL_GUARD="node ../other-guard/hook.mjs" npm run benchmark:eval
```

No third-party guard's code has been run against this corpus, and nobody has independently
reproduced these numbers. Treat them as a self-test with a published method.

## Comparison

`npm run benchmark:compare` replays the same corpus against four comparators in `eval/baselines.mjs`
and rewrites the table in the README.

| Comparator | What it models | Fair to it |
|---|---|---|
| `none` | no guard, permission prompts only | The floor. Shows the corpus is not satisfiable by doing nothing. |
| `policy` | Claude Code `permissions.deny` globs, read from `settings/policy.json` | The real built-in alternative. Loses on connector and file-content cases because a glob cannot express them. |
| `keyword` | a pattern-list `PreToolUse` hook, ~35 dangerous-pattern regexes | The shape most published guard hooks ship. Graded on the same cases, including the safe ones. |
| `denyall` | block every tool call | The ceiling. Perfect recall, useless in practice — this is why recall is never reported alone. |

These are mechanism baselines written here from published rule shapes, not vendor code, and no
product is named. A baseline can only be as good as the reimplementation, so read the table as
"this class of mechanism scores about this", not as a product ranking. The comparators are graded on
the identical case list with the identical scoring, and `eval/baselines.mjs` is committed so the run
can be repeated or the baselines argued with.

`eval/scores.json` is written by the same run and feeds the README badges, so a stale badge and a
stale table are impossible to ship separately.

`--latency` on the same command prints per-call hook latency, a full Node process spawn. It is
machine-specific and is not published in the README.

<!-- eval-results -->
Run 2026-09-08 · 66 cases · guard `plugins/handoff-os/scripts/guard.mjs` · exit 2 = blocked.

| Metric | Value |
|---|---|
| Recall | 35/35 (100%) |
| Precision | 35/35 (100%) |
| False-positive rate | 0/27 (0%) |
| F1 | 1.00 |
| Known bypasses caught | 0/4 (0%) |

Confusion: TP 35 · FN 0 · FP 0 · TN 27. Bypasses scored apart.

- `evasion-01` open — the binary name is held in a shell variable.
- `evasion-02` open — payload decoded by a pipeline, not by a shell flag.
- `evasion-03` open — an unquoted no-op flag used as a POST body excuses the segment.
- `evasion-04` open — connector action whose name carries no classifiable verb.

<!-- /eval-results -->

## Track B — protocol, not a result

| Item | Rule |
|---|---|
| Status | Not run |
| Design | Same N tasks twice, with and without the plugin, same prompts and model |
| Sample | N ≥ 10 per condition |
| Meter | Claude Code usage blocks — input, output, cache-read, cache-write — priced cache-aware |
| Quality gate | Pass rate beside tokens. A token drop with a pass drop is a loss |
| Overhead | Net out the session card and loaded skill descriptions |
| Ban | Never report bytes / 4 as billing |

Most input tokens in a long session are cached re-reads billed at a fraction of input price, so a
large cut in raw bytes can move the bill by nothing. Publish the per-run table or publish no number.
Until this runs, the savings figures above are what was refused, never a proven cut to the bill.
