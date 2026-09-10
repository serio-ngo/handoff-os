# Comparables

<!-- verified 2026-09-10 against github.com and code.claude.com/docs; stars and last push as of that day -->

| Name | URL | Mechanism | Shows the user | Proof published | Stars · last push |
|---|---|---|---|---|---|
| RTK | <https://github.com/rtk-ai/rtk> | PreToolUse rewrite to `rtk <cmd>`, Rust output filter | `rtk gain` | claims 60–90%, no methodology | 79,750 · 2026-09-10 |
| claude-mem | <https://github.com/thedotmack/claude-mem> | 5 hooks, SQLite FTS5 + Chroma memory | injected context | claims ~10×, no A/B | 93,597 · 2026-09-10 |
| headroom | <https://github.com/headroomlabs-ai/headroom> | proxy / MCP compressor | compressed outputs | per-scenario 21–57%, 31.7% ±4 CI; quality on GSM8K, TruthfulQA, SQuAD, BFCL | 71,177 · 2026-09-10 |
| context-mode | <https://github.com/mksglu/context-mode> | MCP sandbox tools + 6 hooks; ELv2 | sandboxed output | `BENCHMARK.md`, 21 scenarios, bytes kept out, not paired billing | 21,846 · 2026-09-09 |
| token-optimizer | <https://github.com/alexgreensh/token-optimizer> | PreToolUse delta diffs and skeletons; PolyForm NC | diff instead of file | metered vs counterfactual split, 87 fixtures | 2,222 · 2026-09-09 |
| claude-context-optimizer | <https://github.com/egorfedorov/claude-context-optimizer> | blocks unchanged re-reads | dashboard | no A/B | 110 · 2026-09-01 |
| claude-code-thrifty | <https://github.com/soonswan-study/claude-code-thrifty> | blocks re-reads and >1000-line reads, condenses test output | — | none; author's request `anthropics/claude-code#49048` closed not planned | 1 · n/a |
| claude-budget-guard | <https://github.com/karhuzin-lgtm/claude-budget-guard> | token / USD ceiling from the transcript, `requestId` dedup | block reason | tests | 1 · 2026-07-24 |
| grounded | <https://github.com/Pinperepette/grounded> | 11 hooks: read-before-edit, freshness, Stop confidence check via ripgrep | block reason | no metrics | 28 · 2026-04-25 |
| no-hallucination | <https://github.com/AlethiaQuizForge/no-hallucination> | ledger-gated Stop guards | block reason | none | 3 · 2026-03-31 |
| dod-guard | <https://github.com/atoslins/dod-guard> | Stop hook stub / TODO detectors | block reason | 94 assertions | 0 · 2026-05-19 |
| TDD Guard | <https://github.com/nizos/tdd-guard> | PreToolUse blocks implementation without a failing test | block reason | none | 2,334 · 2026-09-07 |
| destructive_command_guard | <https://github.com/Dicklesworthstone/destructive_command_guard> | Rust PreToolUse, 50+ rule packs, OpenCode native | block reason | tests, no recall / FP | 5,954 · 2026-09-09 |
| GouvernAI | <https://github.com/Myr-Aya/GouvernAI-claude-code-plugin> | deterministic PreToolUse + tiering | block reason, audit trail | tests | 23 · 2026-07-05 |
| claude-code-safety-hooks | <https://github.com/oloapozram/claude-code-safety-hooks> | stop-verify blocks Stop while the verifier fails | block reason | none | 0 · 2026-06-01 |
| ccusage | <https://github.com/ryoppippi/ccusage> | transcript meter, the de facto baseline | daily / session reports | — | 18.5k · n/a |
| dynamic-context-pruning (OpenCode) | <https://github.com/Tarquinen/opencode-dynamic-context-pruning> | dedup repeated tool calls; AGPL-3.0 | pruned context | none | 4.2k · n/a |

## Built-ins (code.claude.com docs)

| Capability | Built in? |
|---|---|
| Compaction + `PreCompact` / `PostCompact` hooks | yes |
| Tool-result clearing | yes; threshold unpublished |
| Unchanged-file re-read suppression | yes — `anthropics/claude-code#60684`; misses external edits, post-compaction gap |
| Bash output cap 30,000 chars | yes |
| `Read` partial view, `offset` / `limit` | yes |
| `Grep` `head_limit` | yes |
| MCP output cap 25,000 tok | yes |
| PostToolUse `updatedToolOutput` | yes |
| Byte ceilings per session | no |
| Test-output filtering | no |
| Done-claim verification | no |
| Citation check | no |
| Refusal ledger | no |

## Gap handoff-os can own

| Claim | Credible? | Condition |
|---|---|---|
| Deterministic guard with published recall / FP against mechanism baselines | yes | keep baselines labelled as mechanisms, never vendors |
| Evidence-gated done with catch counts | yes, first to measure | needs `docs/PLAN-1.6.md` row 6 |
| Citation contract | yes; only `grounded` is close | needs row 6 |
| "X% tokens saved" from bytes / 4 | no | only paired billed tokens net of footprint |
| Re-read dedup as novel | no | built in already |
| Cowork support | no | hooks inert |
| Anti-context-rot as an outcome | no | no quality eval |
