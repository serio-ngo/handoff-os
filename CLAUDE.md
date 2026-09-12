# CLAUDE.md

| Scope | Rule |
|---|---|
| Code | hooks and scripts only |
| Data | never organisation data |

## Layout

Two trees: `plugins/handoff-os/` ships, `tooling/` never does.

| Path | Contents |
|---|---|
| `plugins/handoff-os/` | The plugin, the only shipped tree: 3 skills, 2 agents, 5 hooks, 7 scripts, `scripts/lib/` helpers. |
| `tooling/cli/` | `handoff.mjs`, the maintainer CLI. Generators `generate.mjs`, `figures.mjs`. |
| `tooling/benchmark/` | `benchmark.mjs`, the harness. `baselines.mjs`, the four comparators. `fixture/`, the throwaway repo the A/B and flood runs copy. |
| `tooling/corpus/` | `guard-corpus.jsonl`, the labelled corpus. `tasks.jsonl`, the A/B tasks. |
| `tooling/results/` | Generated. `scores.json` feeds the README badges, `flood-results.json` the README figure, `ab-results*.json` the cost range. |
| `tooling/test/` | One file, `guard.test.mjs`. Node built-in runner. |
| `tooling/settings/` | `policy.json`, permission rules, one `deny` list. Rules cannot ship inside a plugin. |
| `docs/` | Generated manifest and SVG figures, Claude Code reference, benchmark method. |
| `audit/` | `YYYY-MM.jsonl`, one object per line, fields in `plugins/handoff-os/scripts/audit.mjs` as `FIELDS`. Gitignored, append-only. |

## Commands

| Command | Effect |
|---|---|
| `npm test` | run the test suite |
| `claude --plugin-dir plugins/handoff-os` | run this checkout as the plugin for one session |
| `npm run upkeep` | regenerate `docs/MANIFEST.md`, README inventory |
| `npm run upkeep:check` | upkeep, then fail when the tree differs — the CI gate, same command locally |
| `npm run release` | upkeep plus benchmark rerun, README scores, `tooling/results/scores.json` |

| Fact | Value |
|---|---|
| Session load | once, at start; restart to pick up edits |
| Generated blocks | between `<!-- name -->` markers; never hand-edit |

## Rules

1. Each fact has one home. Do not duplicate facts between files.
2. Never send, publish, pay or submit.
3. Do not commit organisation data, secrets or identifiers. User memory lives in `config/memory.md`,
   which is gitignored.
4. Use the cheapest sufficient actor: script, then haiku, sonnet, opus.
5. Write in tables and short imperative sentences. Partial completion is acceptable; silent failure
   is not.
6. No explanatory comments in code. No runtime dependencies.
7. Max 300 lines per file in `plugins/`. Runtime helpers that must ship live in
   `plugins/handoff-os/scripts/lib/`. Analysis-only code lives in `tooling/`.
8. The suite is one file, `tooling/test/guard.test.mjs`. Do not add a test file. Do not add a test helper.
   Assertions are blocking and failure cases only — no happy path, no CLI, no repo hygiene, no
   budget or hygiene assertions that prove nothing. A new guard rule adds one case to an existing
   list, not a new `describe`.
9. Before working with Claude Code identifiers (hooks, permissions, plugin layout), read
   [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md).
10. Docs carry data, not prose. `README.md` is the only exception.

> Every other `*.md`: tables, lists, commands, data-comment lines only.
> No paragraphs. No history. No decision narratives. No elaboration.
> Keep names self-explanatory; one short comment per section max.
> Never hand-edit generated blocks.

Contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md).
