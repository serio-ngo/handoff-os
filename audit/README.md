# audit

One JSON object per line, appended by the `PostToolUse` hook, in `YYYY-MM.jsonl`. Gitignored.

Fields, in order: `ts` `actor` `tier` `action` `target` `result` — the list lives in
`plugins/handoff-os/scripts/audit.mjs` as `FIELDS`, and the suite asserts the line matches it.

Never hand-edit. Append-only by convention, not by cryptography — see [../SECURITY.md](../SECURITY.md).
