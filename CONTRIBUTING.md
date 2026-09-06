# Contributing

Every skill description sits in context permanently, in every session, in every repository. Every hook
runs shell code on another operator's machine. Placement and verification outrank novelty.

## Does it belong here?

> **Does it bind every repository?**

| Answer | Location |
|---|---|
| Yes — it governs all work, everywhere | this repository |
| No — it governs one codebase | that codebase's own `CLAUDE.md` |
| No — it governs one craft | a separate plugin, or `~/.claude/skills/` |
| No — it is a fact, not a rule | its home system, never a file here |

Check the built-ins (`Explore`, `Plan`, bundled skills) and public plugins first. Promote a pattern to a
skill on its **second** occurrence, never its first.

## Budgets, enforced by `npm test`

| Budget | Limit |
|---|---|
| Skills | 5 — adding one means deleting one |
| Subagents | 1 |
| Skill description | 800 chars each, 4,000 total |
| Skill body | 160 lines |
| Session card | 20 lines |

## Code

- No runtime dependencies. Node standard library only.
- No explanatory comments, no change narration.
- Anything a script can decide, a script decides — deterministic work never gets a model.
- Fail open on parse errors, closed on ambiguity.
- Match on command position, not substring.

## Tests

`test/*.test.mjs` on Node's built-in runner. One `it` per behaviour group, cases looped inside with the
case in the assert message. A test name states a behaviour: `blocks a re-read of the same unchanged
bytes`, never `test read budget 2`.

| Change | Test it must arrive with |
|---|---|
| A new guard branch | one case that blocks and one that allows |
| A new egress pattern | the string it must catch, **and a near-miss it must not** |
| A new permission rule | a projection case in `test/cli.test.mjs` |
| A new skill | it passes the context budget, and it deletes another skill |

## Releasing

```bash
npm run release patch "one-line note that becomes the changelog entry"
```

Suite, version bump, manifest, content stamp, `CHANGELOG.md`. CI fails on drift.

No organisation data in git — no identifiers, no secrets, no vendor names inside the product. Personalise
with `npm run setup`, never by editing a tracked file. Security reports: [SECURITY.md](SECURITY.md).
