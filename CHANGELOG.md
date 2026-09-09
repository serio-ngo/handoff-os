# Changelog

<!-- one row per version; `npm run release` updates -->

| Version | Date | Change |
|---|---|---|
| 1.5.36 | 2026-09-09 | README intro states what the plugin does and why it is unique, chips grouped, prose framed as quotes |
| 1.5.35 | 2026-09-09 | one markdown writer so upkeep is a no-op after release, upkeep:check gate shared with CI, README rewritten for humans |
| 1.5.34 | 2026-09-09 | cost reframed as context tax: footprint vs kept-out net per window, spawn ms demoted to footnote |
| 1.5.33 | 2026-09-09 | stats on by default (HANDOFF_STATS=0 to silence), verify gate prints lifetime totals, upkeep stops auto-bumping versions |
| 1.5.32 | 2026-09-09 | changelog generator emits a table row, matching the file it writes; README states which surfaces run hooks; CONNECTOR_ALLOW covered by two corpus allow-cases (68 cases, 29 negatives); covers 1.5.22-1.5.31, bumped without a release row |
| 1.5.21 | 2026-09-08 | dedup credits byte-identical re-reads only; cap and ceiling book `deferred`; cache telemetry and transcript reader removed; benchmark reads the audit ledger only; per-agent dedup key `<agent>\|<target>`; runner returns verdicts; manifest lists agents; unwrap single-dash `-Command` |
| 1.5.12 | 2026-09-07 | narrowed guard false positives; shell-call audit; one test file; subagent gate plus `HANDOFF_DENY_SUBAGENT_MODELS` (default `opus,fable`); main model stays free choice |
| 1.5.1 | 2026-09-06 | benchmark report on release; removed dependabot, funding, issue-template clutter; guard-actions savings line with `HANDOFF_STATS=1`; nested-shell unwrap; shell-delete, `gh api` mutation, interpreter-egress, destructive-SQL, protected-redirect blocks; egress lock; git open except merge and delete; read, query, dispatch budgets; fan-out cap; whole-file limit; session ceiling; verify gate; scout citation contract; audit ledger; three skills; one scout; zero-input setup |
