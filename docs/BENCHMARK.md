# Benchmark

Three things get measured here. Context savings, below, is what the plugin is for. Track A is
whether the guard blocks what it claims to. Track B is the paired-session counterfactual, and it is
**not run**.

## Context savings — what `npm run benchmark` prints

`read volume` is every byte the session asked to put in the main thread. `kept out of context` is
the part the guard refused, and the headline share is `kept / read volume`.

| Line | Counter | Credited |
|---|---|---|
| re-read dedup | `bytes` | full file size — it was already in context, byte-identical |
| whole-file cap | `deferred` | full file size at the moment of refusal |
| moved to a subagent | `offload` | bytes read under a non-`main` actor |
| admitted | `read` | bytes the guard let into the main thread |
| repeat query, runaway cap | `queries`, `caps` | counted only; the output size is unknown at `PreToolUse` |

Two things that keep the share honest. `queries` and `caps` are deliberately *not* credited any
tokens, because the guard cannot know how large a Grep result would have been — an earlier version
folded them into `rereads` and `slices`, which is why action counts looked busy while the token
totals sat at zero. And after a whole-file cap the agent reads a slice or dispatches scout instead;
that follow-up read is counted as `admitted` or `offload`, so it lands in the denominator.

Byte counts are file bytes / 4. That is an estimate of tokens and is never a billing figure.

## Billing — measured, not estimated

The Stop hook reads `transcript_path` and sums the `usage` blocks: `input_tokens`, `output_tokens`,
`cache_creation_input_tokens` as **fresh**, and `cache_read_input_tokens` as **cache-read**. These
are Claude Code's own counts, not an estimate. When the ledger has no billing recorded — lines
written by an older version — the benchmark falls back to every transcript for the project under
`~/.claude/projects/<slug>/`.

`context re-send ratio` is `cache-read / fresh`: how many times an average fresh token was re-read
from cache. `cache-read avoided` multiplies the kept tokens by that ratio. That last figure is an
extrapolation, not a measurement — it assumes a refused read would have been admitted at a typical
point in the session. The honest counterfactual is Track B below, which is still not run.

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
