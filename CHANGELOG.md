# Changelog

## 1.5.21 — 2026-09-08

- deduped tok now credits only a byte-identical re-read; cap and ceiling blocks book `deferred` instead; cache telemetry and the transcript reader removed; benchmark reads the audit ledger only; per-agent dedup keyed `<agent>|<target>`; runner agent returns command verdicts; manifest lists agents; unwrap single-dash `-Command`

## 1.5.12 — 2026-09-07

- narrow guard false positives, audit shell calls, one test file
- subagent gate over every spawn tool plus HANDOFF_DENY_SUBAGENT_MODELS (default opus,fable); main model stays free choice

## 1.5.1 — 2026-09-06

- benchmark report now prints with every release; dependabot, funding and issue-template clutter removed
- cumulative guard-actions savings line, pinned to every reply with HANDOFF_STATS=1; guard unwraps nested shells and blocks shell deletes, gh api mutations, interpreter egress, destructive SQL and protected-path redirects
- Egress lock on shell and connectors; git open except merge and delete, optional `--lock git` bans every git write
- Read, query and dispatch budgets, fan-out cap, whole-file limit and session ceiling — all release on compact
- Verify gate and scout citation contract; audit ledger and savings line
- Three skills, one scout, zero-input setup and sync; dead canon guard patterns removed
