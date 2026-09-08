# Contributing

## Scope

Changes must apply to every repository the plugin runs in. Codebase-specific rules belong in that
codebase's own `CLAUDE.md`, not here. Check Claude Code built-ins and public plugins before adding
anything; promote a pattern to a skill only on its second occurrence.

## Budgets

At most 3 skills, 1 subagent, and 800 characters per skill description. `npm run upkeep` prints the
current figures into `docs/MANIFEST.md`.

## Code

- No runtime dependencies. Node standard library only.
- No explanatory comments in code.
- Deterministic work is done by scripts, not models.

## Tests

The suite is one file, `test/guard.test.mjs`, on Node's built-in runner (`npm test`). Do not add
another test file or a helper module. It asserts blocking and failure cases only. A change to a
guard rule adds one case to an existing list and must prove the rule blocks.

## Releases

```bash
npm run release patch "one-line note"
```

This runs the suite, bumps the version, regenerates the manifest and updates the changelog.

Do not commit organisation data, secrets or identifiers. Personalise with `npm run setup`.
Security reports go through [SECURITY.md](SECURITY.md).

## Commands

Clone the repository to get these. `sync` projects `settings/policy.json` into three layers:
`user` (`~/.claude/settings.json`, plus `ask` and subscription login), `project` (a repository's
`.claude/settings.json`) and `managed` (the administrator path, plus
`disableBypassPermissionsMode`).

| Command | Effect |
|---|---|
| `npm run setup` | Personalise `config/memory.md` and project the policy into all three layers. |
| `npm run sync` | Re-project the policy. Removes the git lock if it was set. |
| `npm run sync -- --lock git` | Add the `lock.git` deny bundle and set `HANDOFF_LOCK_GIT=1`. |
| `npm run sync -- --without <token>` | Drop every policy rule containing that token, for connectors you do not use. |
| `npm run install:plugin` | Install this checkout into the plugin cache at its declared version. |
| `npm run doctor` | Check that the installed copy is this checkout and that its guard still blocks. |
| `npm test` | Run the suite. |
| `npm run upkeep` | Regenerate `docs/MANIFEST.md`, the version and the content stamp. |
| `npm run release patch "note"` | Suite, version bump, manifest, changelog. |
| `npm run benchmark` | Token usage report. Append `-- --write` to refresh the README stats block, `-- --days N` for the window (default 7). |

Merge and delete stay denied in both git modes. The `--without` token matches `Bash`, `Read`
and `Edit` rules only. No connector rule ships, so a connector token matches nothing.
