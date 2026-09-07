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
