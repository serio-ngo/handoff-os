# Contributing

Every skill description sits in context permanently, in every session, in every repository. Every hook
runs shell code on another operator's machine. Placement and verification outrank novelty.

## 1. Does it belong here?

> **Does it bind every repository?**

| Answer | Location |
|---|---|
| Yes — it governs all work, everywhere | this repository |
| No — it governs one codebase | that codebase's own `CLAUDE.md` |
| No — it governs one craft | a separate plugin, or `~/.claude/skills/` |
| No — it is a fact, not a rule | its home system, never a file here |

Before adding, check the built-ins (`Explore`, `Plan`, bundled skills) and public plugins cover it. Promote
a pattern to a skill on its **second** occurrence, never its first.

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
| No explanatory comments, no change narration | a line needing a sentence of justification needs a better name |
| Deterministic work never gets a model | anything a script can decide, a script decides |
| Fail open on parse errors, closed on ambiguity | a malformed event must not disable a session; an unparseable shell payload must block |
| One home per fact | marketplace name, git remote, owner identity, permission rules — no second copy |
| Match on command position, not substring | an egress word inside a quoted string is data; blocking it teaches operators to disable the guard |

## 4. Tests describe behaviour

`test/*.test.mjs`, Node's built-in runner, no other harness. One `it` per behaviour group, cases looped
inside with the case in the assert message — never one `it` per file or per string. No tests for internal
tooling: markdown style is enforced by markdownlint, generated-artefact drift by the `upkeep` CI job.

| Change | Test it must arrive with |
|---|---|
| A new guard branch | one case that blocks and one that allows |
| A new egress pattern | the string it must catch, **and a near-miss it must not** |
| A new permission rule | a projection case in `test/cli.test.mjs` |
| A new skill | it passes the context budget, and it deletes another skill |
| Anything at all | `npm test` green |

A test name states a behaviour: `blocks a re-read of the same unchanged bytes`, never `test read budget 2`.

## 5. Releasing

```bash
npm run release patch "one-line note that becomes the changelog entry"
```

Suite, version bump, manifest, content stamp, `CHANGELOG.md`. CI fails on drift rather than asking you to
run a command.

## 6. Identity

No organisation data in git — no identifiers, no secrets, no vendor names inside the product. Personalise
with `npm run setup`, never by editing a tracked file. Security reports: [SECURITY.md](SECURITY.md).
