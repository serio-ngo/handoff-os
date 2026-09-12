# Contributing

## First PR

| Step | Command or file |
|---|---|
| 1. Fork and clone | `git clone <your fork>` |
| 2. Green first | `npm test` |
| 3. Add one case | a line in `tooling/corpus/guard-corpus.jsonl`: `id`, `category`, `tool`, `input`, `want`, `origin`, `note` |
| 4. Add the same call to the suite | the matching list in `tooling/test/guard.test.mjs`, one entry, never a new `describe` |
| 5. Score it | `npm run benchmark:eval` — exits 1 on a miss |
| 6. Open the PR | the checklist in `.github/PULL_REQUEST_TEMPLATE.md` |

| Corpus field | Value |
|---|---|
| `want` | `block` or `allow` |
| `origin` | `spec` derived from a rule · `probe` found by probing · `regression` reproduces a shipped bug |

## Labels

| Label | Use |
|---|---|
| `good first issue` | one corpus line, one doc fact, or one pattern with a named example |
| `help wanted` | scoped, no owner |
| `false-block` | the guard stopped a safe call |
| `missed-block` | the guard let an outward or destructive call through |
| `docs` | a fact is wrong, stale, or has two homes |

## Rules

| Rule | Value |
|---|---|
| Scope | every repository the plugin runs in; repo-local rules live in that repo's own `CLAUDE.md` |
| Code and tests | [CLAUDE.md](CLAUDE.md) |
| Release | `npm run release patch\|minor "one-line note"` on a clean tree; `patch` for a guard bug, `minor` for any behaviour or default change |
| Reports | [SECURITY.md](SECURITY.md) |
