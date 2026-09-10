# Contributing

## First PR in 20 minutes

A labelled corpus line is the cheapest real contribution: it is what turns a refusal, or a missed
refusal, into a permanent check.

| Step | Command or file |
|---|---|
| 1. Fork and clone | `git clone <your fork>` |
| 2. Prove the suite is green first | `npm test` |
| 3. Add one case | a line in `eval/guard-corpus.jsonl`: `id`, `category`, `tool`, `input`, `want`, `origin`, `note` |
| 4. Add the same call to the suite | the matching list in `test/guard.test.mjs`, one entry, never a new `describe` |
| 5. Score it | `npm run benchmark:eval` — exits 1 on a miss |
| 6. Open the PR | the checklist in `.github/PULL_REQUEST_TEMPLATE.md` |

| Corpus field | Value |
|---|---|
| `want` | `block` or `allow` — what the guard must do |
| `origin` | `spec` derived from a rule · `probe` found by probing · `regression` reproduces a shipped bug |
| `known_gap` | `true` only for a documented evasion; those score apart |

## Labels

| Label | Use |
|---|---|
| `good first issue` | one corpus line, one doc fact, or one pattern with a named example |
| `help wanted` | scoped, no owner |
| `false-block` | the guard stopped a safe call |
| `missed-block` | the guard let an outward or destructive call through |
| `docs` | a fact is wrong, stale, or has two homes |

## Credits

| Handle | First PR | What |
|---|---|---|
| — | — | — |

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
| Tree | must be clean — `release` exits 1 on any uncommitted change |
| Suite | runs |
| Version | bumps |
| Manifest | regenerates |
| Changelog | updates |

| Bump | Earns it |
|---|---|
| `patch` | a guard bug only — a false block or a missed block |
| `minor` | any behaviour or default change: new hook, new matcher, new bridge |

| Cadence | Rule |
|---|---|
| Frequency | one release per week at most, batched from `main` |
| Every release | CHANGELOG row · `git tag v<version>` · GitHub Release carrying that row as its body |

| Rule | Value |
|---|---|
| Data | never commit organisation data, secrets, identifiers |
| Setup | personalise with `npm run setup` |
| Reports | [SECURITY.md](SECURITY.md) |
| Git | merge and delete stay denied in both modes |
| `--without` token | matches `Bash`, `Read`, `Edit` rules only |
| Connectors | no connector rule ships; a connector token matches nothing |
