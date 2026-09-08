# Contributing

## Scope

Changes must apply to every repository the plugin runs in. Codebase-specific rules belong in that
codebase's own `CLAUDE.md`, not here. Check Claude Code built-ins and public plugins before adding
anything; promote a pattern to a skill only on its second occurrence.


## Code

- No runtime dependencies. Node standard library only.
- No explanatory comments in code.
- Deterministic work is done by scripts, not models.

## Tests

The suite is one file, `test/guard.test.mjs`, on Node's built-in runner (`npm test`). 

## Releases

```bash
npm run release patch "one-line note"
```

This runs the suite, bumps the version, regenerates the manifest and updates the changelog.

Do not commit organisation data, secrets or identifiers. Personalise with `npm run setup`.
Security reports go through [SECURITY.md](SECURITY.md).


Merge and delete stay denied in both git modes. The `--without` token matches `Bash`, `Read`
and `Edit` rules only. No connector rule ships, so a connector token matches nothing.
