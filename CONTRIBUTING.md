# Contributing

Every skill description sits in the reader's context permanently, in every session, in every repository.
Every hook executes shell code on another operator's machine. Placement and verification outrank novelty.

## 1. Does it belong here?

> **Does it bind every repository?**

| Answer | Location |
|---|---|
| Yes — it governs all work, everywhere | this repository |
| No — it governs one codebase | that codebase's own `CLAUDE.md` |
| No — it governs one craft | a separate plugin, or `~/.claude/skills/` |
| No — it is a fact, not a rule | its home system, never a file here |
| No — it is work, not law | the tracker |

Two checks that have closed proposals before: does a **built-in** already cover it (`Explore`, `Plan`,
`/code-review`, `/security-review`, bundled skills), and does a **public plugin**? Contribute only the
difference. A wording difference is not a difference. Promote a pattern to a skill on its **second**
occurrence, never its first.

## 2. Budgets, enforced by `npm test`

| Budget | Limit | Why |
|---|---|---|
| Skills | 5 | adding one means deleting or justifying one |
| Subagents | 1 | the built-ins cover explore, review and security |
| Skill description | 800 chars each, 4,000 total | loaded in every session whether or not it fires |
| Skill body | 160 lines | past that it is a document pretending to be a skill |
| Session card | 20 lines, 400 tokens | it replaces a document read; past that it *is* the document |

## 3. Code

| Rule | Application |
|---|---|
| No runtime dependencies | `package.json` declares none. Node standard library only |
| No explanatory comments, no change narration | a line needing a sentence of justification needs a better name. Comments decay; names are verified on every read |
| Deterministic work never gets a model | anything a script can decide, a script decides |
| Fail open on parse errors, closed on ambiguity | an unreadable hook payload must not disable a session; a shell payload that *may* be a command and cannot be parsed must block |
| One home per fact | the marketplace name comes from `marketplace.json`, the repository from the git remote, owner identity from `config/org.json`, permission rules from `settings/policy.json`. No second copy |
| Match on command position, not substring | an egress word inside a quoted string is data. Blocking it makes ordinary work fail, which teaches operators to disable the guard |

## 4. Tests describe behaviour

`test/*.test.mjs`, Node's built-in runner, no other harness.

```js
describe('egress guard', () => {
  it('blocks a push to a remote', () => assert.equal(verdict(bash(outward)), BLOCKED));
});
```

| Change | Test it must arrive with |
|---|---|
| A new guard branch | one case that blocks and one that allows |
| A new egress pattern | the string it must catch, **and a near-miss it must not** |
| A new permission rule | a projection case in `test/cli.test.mjs` |
| A new skill | it passes the context budget, and it deletes another skill |
| A value the product already knows | import it (`FIELDS`, `policyFor`, hook matchers) — never restate it |
| Anything at all | `npm test` green, pasted into the pull request |

A test name states a behaviour: `blocks a re-read of the same unchanged bytes`, never `test read budget 2`.

## 5. Releasing

The plugin cache is keyed by `version` in `plugins/handoff-os/.claude-plugin/plugin.json`. Content shipped
without a version increment is silently ignored on update. `npm run upkeep` bumps it automatically whenever
shipped content changes, and the `Stop` hook runs upkeep at the end of every turn, so this trap cannot bite
during development.

```bash
npm run release patch "one-line note that becomes the changelog entry"
```

That runs the suite, bumps, regenerates the manifest, stamps the content hash and writes `CHANGELOG.md`.
CI regenerates and runs `git diff --exit-code`, so drift is reported as drift rather than as a command you
should have run.

## 6. Identity

This repository carries no organisation data — no identifiers, no account names, no personal paths, no
secrets, and no vendor names inside the product. `npm test` scans for all of it and fails.

Personalise with `npm run setup`, never by editing a tracked file. `config/org.json` is generated and
ignored by git; `config/org.example.json` shows the shape, and every key in it is optional.

## 7. Reporting a security issue

Do not open a public issue. See [SECURITY.md](SECURITY.md).
