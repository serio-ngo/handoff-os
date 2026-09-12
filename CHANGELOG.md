# Changelog

<!-- one row per version; `npm run release` updates -->

| Version | Date | Change |
|---|---|---|
| 1.10.2 | 2026-09-12 | scripts split into entry points and lib; A/B run 4 |
| 1.10.1 | 2026-09-12 | remove shell tricks parser |
| 1.10.0 | 2026-09-11 | Guard messages report what happened and stop. HANDOFF_GIT_WRITE gates branch, commit and push, 0 by default; a pull request and every read stay open. Stop receipt is one line in tokens, and all-time folds every session in the root. demo.svg is captured from a live guard run. A benchmark run that produced no turn no longer overwrites committed results. |
| 1.9.2 | 2026-09-11 | No rule bounds a long session: whole-file count rule and session read ceiling removed. Every guard message is one line. No dollar value anywhere. Stop receipt reports tokens kept out of context, session and all-time. Figures carry the headline only, demo shows a wave of 100 |
| 1.9.1 | 2026-09-10 | read bookings rolled back on a refused shell command, capped workflow frees its wave, verify gate scoped to sessions that wrote since the last proving run, runner root named, stand-down counter reset, compact resets query dedup, notebook and multi edits audited |
| 1.9.0 | 2026-09-10 | restored live-ledger and what-ships render targets |
| 1.8.0 | 2026-09-10 | three-line Stop receipt, readme hero and collapsibles, dead tests dropped |
| 1.7.0 | 2026-09-10 | rewrite instead of refuse, every read shape booked, enforced delegation, waves and redirects counted, per-session receipt, claims audit |
| 1.6.0 | 2026-09-10 | version bump so the installed hook updates; gated counter for verify gate and citation contract; 1.6 plan, comparables, Track B protocol |
| 1.5.42 | 2026-09-09 | cowork workspace bash payloads judged, readme states cowork/opencode support |
| 1.5.41 | 2026-09-09 | gitleaks out, dependabot watches actions, opencode install and update notes |
| 1.5.40 | 2026-09-09 | opencode reads and writes judged via arg aliases, denials land in audit, user-facing opencode notes |
| 1.5.39 | 2026-09-09 | legacy ledger lines purged, opencode dispatches model-agnostic, post-merge opencode install notes |
| 1.5.38 | 2026-09-09 | opencode bridge always on with install notes, params reviewed unchanged |
| 1.5.37 | 2026-09-09 | core judges exported for reuse, opencode bridge feeds session data, actionlint and gitleaks gates, multi-repo benchmark, tax in doctor |
| 1.5.36 | 2026-09-09 | README intro states what the plugin does and why it is unique, chips grouped, prose framed as quotes |
| 1.5.35 | 2026-09-09 | one markdown writer so upkeep is a no-op after release, upkeep:check gate shared with CI, README rewritten for humans |
| 1.5.34 | 2026-09-09 | cost reframed as context tax: footprint vs kept-out net per window, spawn ms demoted to footnote |
| 1.5.33 | 2026-09-09 | stats on by default (HANDOFF_STATS=0 to silence), verify gate prints lifetime totals, upkeep stops auto-bumping versions |
| 1.5.32 | 2026-09-09 | changelog generator emits a table row, matching the file it writes; README states which surfaces run hooks; CONNECTOR_ALLOW covered by two corpus allow-cases (68 cases, 29 negatives); covers 1.5.22-1.5.31, bumped without a release row |
| 1.5.21 | 2026-09-08 | dedup credits byte-identical re-reads only; cap and ceiling book `deferred`; cache telemetry and transcript reader removed; benchmark reads the audit ledger only; per-agent dedup key `<agent>\|<target>`; runner returns verdicts; manifest lists agents; unwrap single-dash `-Command` |
| 1.5.12 | 2026-09-07 | narrowed guard false positives; shell-call audit; one test file; subagent gate plus `HANDOFF_DENY_SUBAGENT_MODELS` (default `opus,fable`); main model stays free choice |
| 1.5.1 | 2026-09-06 | benchmark report on release; removed dependabot, funding, issue-template clutter; guard-actions savings line with `HANDOFF_STATS=1`; nested-shell unwrap; shell-delete, `gh api` mutation, interpreter-egress, destructive-SQL, protected-redirect blocks; egress lock; git open except merge and delete; read, query, dispatch budgets; fan-out cap; whole-file limit; session ceiling; verify gate; scout citation contract; audit ledger; three skills; one scout; zero-input setup |
