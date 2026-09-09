# Contributing

## Scope

| Rule | Value |
|---|---|
| Applies | every repository the plugin runs in |
| Local rules | that codebase's own `CLAUDE.md`, never here |
| Reuse | check Claude Code built-ins and public plugins first |
| New skill | on second occurrence of the pattern only |

## Code

| Rule | Value |
|---|---|
| Dependencies | none; Node standard library only |
| Comments | none explanatory in code |
| Models | scripts do deterministic work, never models |

## Tests

| Suite | Runner |
|---|---|
| One file, `test/guard.test.mjs` | `npm test`, Node built-in runner |

## Releases

```bash
npm run release patch "one-line note"
```

| Release step | Effect |
|---|---|
| Suite | runs |
| Version | bumps |
| Manifest | regenerates |
| Changelog | updates |

| Rule | Value |
|---|---|
| Data | never commit organisation data, secrets, identifiers |
| Setup | personalise with `npm run setup` |
| Reports | [SECURITY.md](SECURITY.md) |
| Git | merge and delete stay denied in both modes |
| `--without` token | matches `Bash`, `Read`, `Edit` rules only |
| Connectors | no connector rule ships; a connector token matches nothing |
