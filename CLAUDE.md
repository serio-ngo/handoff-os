# CLAUDE.md

| Scope | Rule |
|---|---|
| Code | hooks and scripts only |
| Data | never organisation data |

## Layout

Two trees: `plugins/handoff-os/` ships, `tooling/` never does.

| Path | Contents |
|---|---|
| `plugins/handoff-os/` | The plugin, the only shipped tree: 3 hooks, 4 entry scripts, 7 `scripts/lib/` helpers, 1 skill, 2 agents. |
| `tooling/cli/` | `handoff.mjs`, the maintainer CLI; generators `generate.mjs`, `figures.mjs`. |
| `tooling/benchmark/` | `benchmark.mjs`, the harness; `baselines.mjs`, the four comparators; `fixture/`, the throwaway repo the A/B and flood runs copy. |
| `tooling/corpus/` | `guard-corpus.jsonl`, the labelled corpus; `tasks.jsonl`, the A/B tasks. |
| `tooling/results/` | Generated, overwritten each run: `scores.json` feeds the README badges, `flood-results.json` the README figure, `ab-results.json` the cost range. |
| `tooling/test/` | One file, `guard.test.mjs`, Node built-in runner. |
| `tooling/settings/` | `policy.json`, permission `deny` rules a plugin cannot ship; `unlock.git` holds the git-write rules `npm run sync` applies. |
| `docs/` | Generated manifest and SVG figures, Claude Code reference, benchmark method. |

## Commands

| Command | Effect |
|---|---|
| `npm test` | run the suite |
| `claude --plugin-dir plugins/handoff-os` | run this checkout as the plugin for one session; restart to pick up edits |
| `npm run benchmark:eval` | score the corpus, exit 1 on a miss |
| `npm run upkeep` | regenerate `docs/MANIFEST.md` and the figures |
| `npm run upkeep:check` | upkeep, then fail when the tree differs — the CI gate |
| `npm run release <bump> "<note>"` | suite, version bump, changelog row, manifest, eval and comparison |

## Rules

| Rule | Value |
|---|---|
| One home per fact | never duplicate a fact between files |
| Never | send, publish, pay or submit |
| Data | no organisation data, secrets or identifiers in tracked files |
| Actor | the cheapest sufficient one: script, then haiku, sonnet, opus |
| Code | no explanatory comments; no runtime dependencies; max 300 lines per file in `plugins/`; must-ship helpers in `plugins/handoff-os/scripts/lib/`, analysis-only code in `tooling/` |
| Tests | one file, `tooling/test/guard.test.mjs`; blocking and failure cases only; a new rule adds a case to an existing list, never a new `describe` |
| Identifiers | read [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md) before touching hooks, permissions or plugin layout |
| Generated blocks | between `<!-- name -->` markers; regenerate, never hand-edit |
| Docs | tables, lists, commands and one-line notes; paragraphs in `README.md` only |
| Style | short imperative sentences; partial completion is acceptable, silent failure is not |

Contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md).
