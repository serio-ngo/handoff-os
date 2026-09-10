# Claims audit — serio-ngo/handoff-os, PRs #1–#19

<!-- read-only audit, 2026-09-10; worktree /home/claude/handoff-audit; nothing pushed, nothing commented -->

## Scope

| Item | Value |
|---|---|
| Repo | `serio-ngo/handoff-os` |
| main HEAD | `c24cb864b0955c52ae03bb4ffee444e9c2c15c2c` — `Merge pull request #19 from serio-ngo/plan/1.6-proof`, parents `33c4b39` (main at #17) + `6ed466e` |
| `origin/context-tax-reduction` | `4b24122` — still the PR #18 head, ancestor of main |
| Reference merge for the question | PR #17 `33c4b395deb12e918ba792bfc348bae4d70f56a3`, v1.5.42 |
| Class key | (a) paired with/without · (b) open-loop estimate · (c) self-graded corpus · (d) property of Claude Code, not the plugin · (e) asserted, no code |

## PRs #1–#19

| PR | Title | Base | State | merged_at (UTC) | Merge commit on main | Version |
|---|---|---|---|---|---|---|
| 1 | Bump actions/checkout from 4 to 7 | main | merged | 2026-09-06 10:51:57 | `7669342` | — |
| 2 | Bump actions/setup-node from 4 to 7 | main | merged | 2026-09-06 10:50:50 | `072bfe5` | — |
| 3 | full refactor, code reduction | main | merged | 2026-09-06 12:30:00 | `0352c33` | 1.0.7 |
| 4 | Full refactor, final reduction v2 | main | merged | 2026-09-06 15:15:27 | `d03bd49` | 1.0.12 |
| 5 | Full refactor v3 | main | merged | 2026-09-06 16:58:35 | `f99e88f` | 1.0.15 |
| 6 | Full refactor v3 | main | merged | 2026-09-06 18:30:41 | `cf23f34` | 1.4.0 |
| 7 | Release alfa | main | merged | 2026-09-06 20:22:38 | `694c44e` | 1.5.1 |
| 8 | install and guard fix | main | merged | 2026-09-07 08:05:41 | `73dd20f` | 1.5.6 |
| 9 | hotfix | main | merged | 2026-09-07 09:38:48 | `44ae6d3` | 1.5.9 |
| 10 | Tests refactor | main | merged | 2026-09-07 19:55:07 | `0c319c7` | 1.5.12 |
| 11 | New agent runner | main | merged | 2026-09-08 09:00:57 | `7ed35c7` | 1.5.21 |
| 12 | Verification fix | main | merged | 2026-09-08 18:25:31 | `4193e68` | 1.5.26 |
| 13 | Benchmark fix | main | merged | 2026-09-09 07:28:42 | `cf52e5d` | 1.5.31 |
| 14 | release 1.5.32 | main | merged | 2026-09-09 08:26:25 | `fbf654d` | 1.5.32 |
| 15 | hotfix | main | merged | 2026-09-09 09:03:49 | `b4c8989` | 1.5.34 |
| 16 | Opencode added | main | merged | 2026-09-09 11:28:51 | `98450bd` | 1.5.41 |
| 17 | cowork fix | main | merged | 2026-09-10 06:44:56 | `33c4b39` | 1.5.42 |
| 18 | tax fix | main | **merged** (`merged: true`) | 2026-09-10 09:20:08 | none — head `4b24122` reached main through #19's ancestry | 1.5.42 |
| 19 | Follow-up to #18: 1.6.0, gated counter, plan and proof protocol | `context-tax-reduction` (GitHub field) | merged | 2026-09-10 09:20:09 | `c24cb86` (first parent = main at #17) | 1.6.0 |

## Claims

| Claim | First PR | Last PR | Source counter / script | Class | Netted footprint? | Reproduces? | Verdict |
|---|---|---|---|---|---|---|---|
| Stop line `~N tok saved` / `~12,400 tokens saved` / `~10.0k tok saved · 11 guard actions` | #5 (`f99e88f:README.md:275`) | #10 | `guard.mjs@694c44e:141-143` full size per refused re-read, `:149-151` `size − 24KB` per slice; `ledger.mjs@694c44e:48` bytes/4; `verify.mjs@694c44e:82` | (b) | no | not from git — README strings are illustrative, no generator until #11 | Incorrect as "saved": bytes the agent asked for, counted again on every retry (no once-only stamp until `a385180`, PR #13); never billing |
| `cache hits 51,000 tok` on the Stop line | #6 (`cf23f34:README.md:397,404`) | #6 | `verify.mjs@694c44e:72` sums transcript `cache_read_input_tokens` | (d) | no | n/a | Measured, but it is Claude Code prompt-cache traffic, not a plugin effect; dropped at #7 |
| `npm run benchmark`: main vs subagent tokens, "delegation ratio" | #6 | #10 | `benchmark.mjs@694c44e:15-55` transcript `usage` split by `/subagents/` path | (d) | no | needs `~/.claude/projects` — absent here | Measures where tokens were spent, not tokens saved; no baseline |
| "Kept out ~49.7k tok, 67% of read volume, over 39 turns" | #12 (`4193e68:README.md` stats block) | #12 | `benchmark.mjs@4193e68:218-228` — `now` regex plus legacy `old` and `older` (`~N tokens saved` from #7 format, credited wholesale to `deduped`) ; `:257-259` kept/readVolume | (b) | no | not reproducible (audit/ gitignored, absent) | Incorrect. #11 README said "Token figures start accumulating from the next turn" over 35 turns; #12 added legacy regexes and 4 turns later showed 49.7k dedup, 0 deferred despite "6 large files deferred" at #11 → legacy lines with retry-recredit semantics. Removed in `a385180` (PR #13, "legacy ledger lines purged"): kept fell to 0 |
| "Cache-read avoided, kept × ratio ~1.7M" | #12 (`4193e68:README.md`) | #12 | `benchmark.mjs@4193e68:261` `kept * resend` | (b)×(d) | no | no | Incorrect: extrapolation of an inflated estimate by a Claude Code cache ratio; removed at #13 |
| "every fresh token was re-read from cache more than 30 times" / context re-send ratio 35.0× → 34.9× → 34.3× → 20.9× → 33.8× | #12 | #19 (badge relabeled "cache re-send (Claude, not the plugin)" at #18) | `verify.mjs@33c4b39:42-59` `usage()`; `benchmark.mjs@33c4b39:373` `cacheRead / fresh`, fallback `:353-366` to all project transcripts | (d) | n/a | not reproducible (maintainer transcripts) | Measured but describes Claude Code caching on the maintainer's machine; says nothing about the plugin. Correctly relabeled at #18 |
| Live ledger: "Kept out ~43 tok (5–6%) over 3–4 turns", "Net kept out minus footprint ~−538" | #16 (`98450bd:README.md`), also #15 with 0 kept / −581 | #17 (`33c4b39:README.md:51-63`) | `guard.mjs@33c4b39:144-153` stamp+credit, `:155-158` dedup→`bytes`, `:160-168` cap/ceiling→`deferred`, `:170-176` main→`read`, other actor→`offload`; `ledger.mjs@33c4b39:49-55`; `verify.mjs@33c4b39:80-91`; `benchmark.mjs@33c4b39:368-372` | (b) | yes (from #15, `benchmark.mjs@33c4b39:372`) | ledger absent; footprint 581 reproduces (`npm run benchmark:eval`) | Honest and negative: on the maintainer's own ledger the plugin cost more context than it kept out. #18 emptied the block ("No ledger turns recorded yet") |
| "Re-sends removed, kept × turns that followed ~0" | #15 | #17 | `benchmark.mjs@33c4b39:379-387` | (b) | no | value 0 | Zero at every publication; harmless |
| Context tax / footprint 560 → 581 → 276 → 273 tok | #12 (`scores.json contextTokens`) | #19 | `benchmark.mjs@33c4b39:37-42` chars/4 of card + skill + agent descriptions | (b) | is the footprint | yes: 313+177+92 = 581 at `33c4b39` | Correct as an estimate; it is the only per-turn cost the plugin ever measured |
| Replay: "36 refused of 927 judged (4%) over 11 real sessions — 33 egress, 3 re-read dedup" → 39/1,078 over 13 at #18 | #13 (`cf52e5d:README.md`) | #19 | `benchmark.mjs@33c4b39:232-285` re-feeds `Read/Grep/Glob/Bash` tool_use to the guard, one temp ledger per session | (b) | no | not reproducible (no transcripts here) | Correct as a catch count; open-loop by the code's own comment (`:229-231`); 0 whole-file-cap hits, 3 dedup hits in 11 sessions — the token-saving rules almost never fire on real traffic |
| Guard caught 100%, wrongly blocked 0%, F1 1.00; comparators 0/23/46/100% | #12 (`4193e68:README.md` guard-scores) | #19 | `benchmark.mjs@33c4b39:58-91` `score()`; `eval/guard-corpus.jsonl` 68 cases (25 spec/block, 9 probe/block, 1 regression, 23 spec/allow, 6 probe/allow, 4 gap); `eval/baselines.mjs` | (c) | n/a | **yes** — `npm run benchmark:eval` at `33c4b39`: 35/35, 0/29; `--compare`: 23/7/0.36, 46/14/0.58, 100/100/0.71 | Reproduces, but corpus and comparators are author-written; 48/68 cases are rule-derived. #18/#19 add the caveat "a regression check, not a detection rate" |
| "Three agents per wave, the cheapest model that can do the job" | #3 (cap) / #16 (wording, `98450bd:README.md`) | #19 | `patterns.mjs@33c4b39:1-2` `MAX_PER_WAVE = 3`, `WAVE_MS = 90 s`; `guard.mjs@33c4b39:284-292`; `:252-267` denies only unnamed model or `opus,fable` (`patterns.mjs:8`) | (e) for "cheapest" | no | fan-out test passes | Cap is correct (3 per 90-second bucket). "Cheapest model" is not enforced: sonnet passes for any prompt, haiku is never required |
| Subagents / scout / runner save tokens ("moved to a subagent", "9.5k never entered this thread") | #5 | #19 | `offload` counter = bytes a non-`main` actor read (`guard.mjs@33c4b39:175`); `agents/scouts/runners` are counts only (`:316-319`); demo.svg hand-drawn (no generator; commits `f230ecd`, `c4173b8`) | (b)/(e) | never — scout context, scout output returned to main, dispatch prompt not counted | `offloadTokens: 0` in every published `scores.json` | Not demonstrated. The only measured value of offload is 0; demo figures (9.5k, 67%, 17 blocked, 19 actions) are illustrative |
| Verify gate / "done-claim needs a real verification run" catches | #3 | #19 | `verify.mjs@33c4b39:111-153`; no counter until `gated` in #19 (`a4f36c8`) | (e) until #19 | n/a | n/a | No catch count ever published; #19 adds the counter, no data yet |
| Cowork: install path (#3–#6) → silent (#7–#16) → "Cowork — supported with limits" (#17) | #3 (`0352c33:README.md:32-33`) | #19 | none; README text; #17 itself states plugin hooks never fire under `--setting-sources user` | (e) | n/a | n/a | "Supported" is incorrect for the guard: every measured feature is a hook, and #17 says hooks do not fire in Cowork. `docs/COMPARABLES.md@c24cb86:51` concedes "Cowork support \| no \| hooks inert". Upstream issue numbers cited (#27398, #51281, #51904, #63047) not verified here |
| "anti-context-rot" | absent from README / plugin.json / marketplace at every merge; `docs/BENCHMARK.md:113` (#15+) "the rot it keeps out" | #19 | none | (e) | n/a | n/a | No quality or rot metric exists in any commit; `docs/COMPARABLES.md@c24cb86:53`: "Anti-context-rot as an outcome \| no \| no quality eval" |
| "0 per turn" | not found in any merge (`git grep -i 'per turn'` on README/docs/plugins at `c24cb86`: none) | — | — | — | — | — | Could not locate the phrase; unverifiable |
| "so the bill never leaves the subscription fee" | #5 (`f99e88f:README.md:234-235`) | #6 | none (no API key by construction) | (e) | n/a | n/a | True by construction, not a savings claim |
| Track B ("does the bill actually fall") | #12 `docs/BENCHMARK.md` | #19 | `Status \| Not run` at #12, #13, #14, #15, #16, #17, #19; no `--plugin-dir` arm anywhere in `scripts/` history; `eval/tasks.jsonl`, `eval/ab.json` absent at `c24cb86` | — | — | — | Never run: no commit ever measured a session with the plugin off |

## The "X tokens kept out of context" number

| Input | Where | What it counts |
|---|---|---|
| `bytes` | `guard.mjs@33c4b39:155-158` | full `stat.size` of a byte-identical whole-file `Read` (or bare `cat`) already read this session by the same actor |
| `deferred` | `guard.mjs@33c4b39:160-168` | full `stat.size` of a whole-file `Read` over 24 KB or past the 500 KB ceiling, at refusal |
| `offload` | `guard.mjs@33c4b39:175` | `stat.size` of whole-file reads by a non-`main` actor (scout / runner) |
| `read` (denominator) | `guard.mjs@33c4b39:170-174` | `stat.size` of whole-file `Read` calls admitted to `main` |
| once-only stamp | `guard.mjs@33c4b39:144-153`, since `a385180` (PR #13) | a repeated refusal of the same path+mtime+size+rule credits no bytes |
| tokens | `ledger.mjs@33c4b39:49` | `bytes / 4` |
| share | `ledger.mjs@33c4b39:55`, `benchmark.mjs@33c4b39:370` | `kept / (kept + read)` — share of whole-file read volume, not of the context window |
| footprint | `benchmark.mjs@33c4b39:37-42` | `(card + skill + agent description chars) / 4`, subtracted at `:372` since PR #15 |
| billing | `verify.mjs@33c4b39:42-59` | transcript `usage` sums; `fresh` and `cache_read`; used only for the ratio, never joined to `kept` |

| Blind spot | Effect on the number |
|---|---|
| Unrefused reads with `offset`/`limit` | not in numerator or denominator (`guard.mjs@33c4b39:132,170`) |
| `Grep` / `Glob` / `Bash` output | counted (`queries`, `caps`) but zero tokens; shell pipelines and `$(…)` skipped |
| Follow-up read after a refusal | slice or scout read lands in `read`/`offload`; the refused file's full size stays credited as kept |
| Refusal message's own tokens | never counted; each refusal returns a stderr line and costs the model a retry turn |
| Scout / runner cost | dispatch prompt, subagent context and returned text never counted; `offload` credits their reads as savings |
| Plugin footprint | not netted before PR #15; netted from #15 — net was negative (−581, −538) at every publication |
| Retry recredit | before `a385180`, every refused re-read added the full file size again |
| Legacy line folding | `benchmark.mjs@4193e68:224-228` mapped `~N tokens saved` (PR #7 semantics) into `deduped` — source of the 49.7k / 67% at #12 |
| Cache weight | a byte refused later would mostly be re-sent at cache-read weight (0.1×), so bytes/4 overstates billed impact 10× on re-sends |
| Counterfactual | no commit ever ran a plugin-off arm; Track B "Not run" at #12–#19 |

- Answer: the proof was the ledger's `bytes + deferred + offload` counter divided by 4, printed by `npm run benchmark` and the Stop line. It is a count of bytes the agent asked for and was refused, not a measurement of tokens the model did not consume.
- The only published values after the legacy fold-in was removed: 0 tok (#13, #14, #15), 43 tok (#16, #17), 0 tok (#18, #19).

## Subagents — what was measured

| Question | Finding | Evidence |
|---|---|---|
| Tokens saved by the fan-out cap | never measured; blocked dispatches bump `blocked` only | `guard.mjs@33c4b39:290`, `test/guard.test.mjs@33c4b39:158-165` |
| Tokens saved by denying opus/fable dispatches | never measured; a deny bumps `blocked`, no model or token field | `guard.mjs@33c4b39:24-27,252-267` |
| Tokens saved by haiku scout/runner | never measured; `scouts`/`runners` are counts; `offload` bytes are the scout's own reads, credited as kept out | `guard.mjs@33c4b39:316-319,175`; `offloadTokens: 0` in `scores.json` at #12–#19 |
| Any plugin-off arm | none | Track B `Not run` at #12–#19; no `--plugin-dir` in `scripts/` history |
| What Track B would need | same task twice, with and without `--plugin-dir`, `usage` per `requestId`, weighted tokens with cache-read at 0.1×, footprint subtracted, pass rate beside tokens, N ≥ 10 | `docs/BENCHMARK.md@c24cb86` Track B table; `docs/PLAN-1.6.md@c24cb86` row 6 — planned, not built |

| Redirect saving formula | per dispatch: `(weight_main − weight_haiku) × subagent tokens` — requires the counterfactual model; default subagent model is the main model unless set (`code.claude.com/docs/en/sub-agents`, model order 1–4) | not computed anywhere in the repo |

## Price ratios

| Model | Input weight | Output weight | Cache read weight | vs Haiku input | vs Haiku output |
|---|---|---|---|---|---|
| Claude Haiku 4.5 | 1 | 5 | 0.1 | 1× | 1× |
| Claude Sonnet 5 | 2 | 10 | 0.2 | 2× | 2× |
| Claude Opus 5 | 5 | 25 | 0.5 | 5× | 5× |

| Ratio | Value |
|---|---|
| Opus 5 / Sonnet 5 | 2.5× (input and output) |
| Cache read / base input | 0.1× on all three |
| Source | platform pricing page, read 2026-09-10; identical to the `claude-api` skill price table (cached 2026-06-24) |

## Premise: "Claude can set 20 subagents in one go, all will fail due to the 5h limit"

| Statement | Verifiable? | Evidence |
|---|---|---|
| Claude Code allows 20 concurrent subagents by default | yes | `code.claude.com/docs/en/sub-agents` § Concurrent subagent limit: "By default, when 20 subagents are running in a session, spawning another with the Agent tool fails with `Concurrent subagent limit reached`"; override `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`; ultracode sessions exempt; v2.1.217+ |
| A 5-hour usage window exists on subscription plans | yes | `code.claude.com/docs/en/costs` § Claude for Teams and Enterprise: "per-seat allowance that resets on a rolling five-hour window and a weekly window"; `docs/en/errors` § You've hit your session limit: "Claude Code blocks further requests until the reset time shown" |
| A large fan-out can exhaust the allowance | yes, as a documented risk | `docs/en/errors` line 543: "A single burst of heavy activity, such as a large workflow fanout, can exhaust the weekly allowance before the session window resets" |
| Subagents hitting the limit fail | yes | `docs/en/sub-agents` line 907-909: a subagent cut off by "a usage limit" reports failure; tool-calls-only shape fails with `Agent terminated early due to an API error` |
| "All 20 will fail" | no | allowance size per seat tier is not published in the docs; whether 20 subagents exhaust it depends on plan, task size and model; no measurement in the repo or docs |
| Plugin behaviour on a 20-agent wave | yes, from code | `patterns.mjs@33c4b39:1-2`: 3 slots per 90-second bucket; agents 4–20 refused with `FAN-OUT CAP`, each bumping `blocked` (`guard.mjs@33c4b39:284-292`); a `Workflow` script with more than 3 `agent(` calls is refused whole (`:280-282,314-315`); refused dispatches can be re-issued in the next 90-second bucket — open-loop, no saving measured |
| Subagent default model | yes | `docs/en/sub-agents` model order: per-invocation `model` → frontmatter (`inherit` = main model) → `CLAUDE_CODE_SUBAGENT_MODEL` → main model; scout and runner declare `model: haiku` (`plugins/handoff-os/agents/*.md@7ed35c7:5`) |

## Reproduction log

| Command @ `33c4b39` | Result |
|---|---|
| `npm run benchmark:eval` | Recall 35/35, Precision 35/35, FP 0/29, F1 1.00, bypasses 0/4 — matches `docs/BENCHMARK.md` |
| `node scripts/benchmark.mjs --eval --compare` (no `--write`) | none 0/0/0.00 · policy 23/7/0.36 · keyword 46/14/0.58 · denyall 100/100/0.71 — matches README |
| footprint | card 313 + skills 177 + agents 92 = 581 tok — matches `scores.json` |
| inventory | `logicLines 1021`, `dependencies 0` — matches |
| `node scripts/benchmark.mjs` (ledger) | `audit/` absent (gitignored) — 0 turns; published 43 tok / 20.9× not reproducible |
| `npm run benchmark:replay` | no `~/.claude/projects/*handoff*` transcripts — not reproducible |

## Not verified

- Maintainer-machine inputs: `audit/*.jsonl`, `~/.claude/projects/<slug>/*.jsonl` — every ledger, replay and re-send figure.
- Upstream issue numbers cited for Cowork (`anthropics/claude-code#27398`, `#51281`, `#51904`, `#63047`) — GitHub access scoped to `serio-ngo/handoff-os`.
- The phrase "0 per turn" — not found in any merged file.
- `docs/PLAN-1.6.md@c24cb86` "27k of 937k in the 2026-09-10 maintainer session (thread figure, not in the repo)".
