# Contributing

Every skill description remains in the reader's context permanently — in every session, in every repository.
Every hook executes shell code on another operator's machine. Contribution standards reflect both costs:
placement and verification, above novelty.

## 1. Does it belong here?

One question precedes any implementation.

> **Does it bind every repository?**

| Answer | Location |
|---|---|
| Yes — it governs all work, everywhere | This repository |
| No — it governs one codebase | That codebase's own `CLAUDE.md` |
| No — it governs one craft | A separate plugin, or `~/.claude/skills/` |
| No — it is a fact, not a rule | Its home system, never a file here |
| No — it is operational work, not law | The work tracker |

Two further checks, both of which have closed proposals previously:

| Question | Rule |
|---|---|
| Does a built-in capability already cover this? | `Explore`, `Plan`, `/code-review`, `/security-review`, bundled skills. Contribute only the difference. |
| Does a public plugin already cover this? | Search the marketplace first. A wording difference alone is not a difference. |

Promote a pattern to a skill on its **second** occurrence, never its first.

## 2. Budgets, enforced by `npm test`

| Budget | Limit | Why |
|---|---|---|
| Skills | 5 | Adding one means deleting or justifying one |
| Subagents | 1 | The built-ins cover explore, review and security |
| Skill description | 800 characters each, 4,000 total | It is loaded in every session whether or not it fires |
| Skill body | 160 lines | A body over that is a document pretending to be a skill |
| Session card | 20 lines, 400 tokens | It replaces a document read; past that it is the document |

## 3. Code

| Rule | Application |
|---|---|
| No runtime dependencies | `package.json` declares no `dependencies` and no `devDependencies`. Node standard library only. |
| No explanatory comments | A line requiring a sentence of justification needs a better name or a smaller function. Comments decay; names are verified on every read. |
| Deterministic work is never assigned to a model | Anything a script can decide, a script decides. |
| Fail open on parse errors, closed on ambiguity | An unreadable hook payload must not disable a session. A shell payload that *may* be a command and cannot be parsed must block. |
| One home per fact | The marketplace name derives from `marketplace.json`. The repository derives from the git remote. Owner identity derives from `config/org.json`. No fourth copy. |

## 4. Tests describe behaviour

Tests reside in `test/*.test.mjs` and execute on the Node built-in runner. No additional harness is required.

```js
describe('egress guard', () => {
  it('blocks git push origin main', () => assert.equal(verdict(bash('git push origin main')), BLOCKED));
});
```

| Change | Test it must arrive with |
|---|---|
| A new hook script | One case that blocks and one that allows |
| A new pattern in the egress guard | The string it must catch, and a near-miss it must not |
| A new permission rule | A merge case in `test/settings-sync.test.mjs` |
| A new skill | It passes the context budget, and it deletes another skill |
| Anything at all | `npm test` green, pasted into the pull request |

A test name states a behaviour: `blocks a re-read of the same unchanged bytes`, never `test read budget 2`.

## 5. Releasing

The plugin cache is keyed by `version` in `plugins/handoff-os/.claude-plugin/plugin.json`. Content shipped
without a version increment is silently ignored on update — old skills, old hooks, no error.

```bash
npm run release patch "one-line note that becomes the changelog entry"
```

It runs the suite, increments the version, stamps a content hash, and writes `CHANGELOG.md`. `npm test`
fails whenever shipped content and stamp disagree, so an unreleased change cannot reach operators.

Releases are cut manually rather than via `release-please` or `changesets`: nothing here is published
to npm, and neither tool writes the content stamp this project depends on.

## 6. Documentation

| File | Written by |
|---|---|
| `docs/MANIFEST.md` | `npm run docs` — generated, never hand-edited |
| `CHANGELOG.md` | `npm run release` |
| everything else | you, in tables and short imperative lines |

Every external fact carries a primary-source URL and the date it was read, or the literal tag
`UNVERIFIED`. A document inside this repository is a source only for facts about this repository.

## 7. Identity

This repository carries no organisation data — no registry identifiers, no account names, no
personal paths, no secrets. `npm test` scans for them and fails.

Personalise by running `npm run setup`, never by editing a tracked file. `config/org.json` is
generated and ignored by git; `config/org.example.json` shows the shape.

## 8. Forking

Fork, clone, then:

```bash
npm run setup
npm test
npm run sync:settings -- --target ~/.claude/settings.json --dry-run
```

There is nothing to find and replace. The marketplace names itself from `marketplace.json`, and it
points at whichever remote you cloned from.

## 9. Reporting a security issue

Do not open a public issue. See [SECURITY.md](SECURITY.md).
