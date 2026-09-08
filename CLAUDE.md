# CLAUDE.md

Instructions for agents working in this repository. handoff-os is a Claude Code plugin: hooks and
scripts only, never organisation data.

## Layout

| Path | Contents |
|---|---|
| `plugins/handoff-os/` | The plugin: 3 skills, 2 agents, 6 hooks, 6 scripts. |
| `scripts/` | CLI (`handoff.mjs`), generators (`generate.mjs`), benchmark report. |
| `settings/policy.json` | Permission rules, one `deny` list. Rules cannot ship inside a plugin. |
| `test/` | One file, `guard.test.mjs`. Node built-in runner. |
| `docs/` | Generated manifest, Claude Code reference. |
| `audit/` | `YYYY-MM.jsonl`, one object per line, fields in `scripts/audit.mjs` as `FIELDS`. Gitignored, append-only. |

## Commands

```bash
npm test                                # run the test suite
claude --plugin-dir plugins/handoff-os  # run this checkout as the plugin for one session
```

Every other command is in [CONTRIBUTING.md](CONTRIBUTING.md#commands).

A session loads the plugin once, at start. Edits to this checkout reach a running session only after
it is restarted.

`npm run upkeep` runs at the end of every turn and regenerates `docs/MANIFEST.md`, the version and
the content stamp. Do not edit those by hand.

## Contracts

Breaks silently when these drift apart. Change both sides together.

| Contract | Sides |
|---|---|
| Result string `~<n> tokens saved` | `verify.mjs` writes it, `benchmark.mjs` parses it |
| Token math | headline is bytes/4 only; `cache` is billed telemetry, never savings; every blocked whole-file Read credits its bytes |
| Counters | `blocked` counts every deny, `agents` counts allowed dispatches, only `bytes` feeds tokens |
| Nested shells | `SHELL_INNER` must cover every `SHELLS` form that takes a command string |
| Query dedup | every write path (`Edit`, `Write`, shell redirect) calls `invalidateQueries` |
| Dedup scope | read and query keys are `<agent>|<target>`; one agent never blocks another, and a key carrying no `|` is pre-1.5.19 and dropped on load |
| Audit tiers | shell and connector calls are YELLOW, inside-repo file ops are GREEN |
| README stats block | `benchmark.mjs --write` owns everything between the markers; release runs it with `--days 30` |

## Rules

1. Each fact has one home. Do not duplicate facts between files.
2. Never send, publish, pay or submit. Never run `git merge` or any git delete command. The human
   does these.
3. Do not commit organisation data, secrets or identifiers. User memory lives in `config/memory.md`,
   which is gitignored.
4. Use the cheapest sufficient actor: script, then haiku, sonnet, opus. Deterministic work is done by
   scripts, not models.
5. Write in tables and short imperative sentences. Partial completion is acceptable; silent failure
   is not.
6. No explanatory comments in code. No runtime dependencies.
7. The suite is one file, `test/guard.test.mjs`. Do not add a test file. Do not add a test helper.
   Assertions are blocking and failure cases only — no happy path, no CLI, no repo hygiene, no
   budget or hygiene assertions that prove nothing. A new guard rule adds one case to an existing
   list, not a new `describe`.
8. Before working with Claude Code identifiers (hooks, permissions, plugin layout), read
   [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md).

Contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md).
