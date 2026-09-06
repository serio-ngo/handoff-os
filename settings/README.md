# Permission policy

Permission rules cannot ship inside a plugin. They live in `policy.json` here, and `npm run setup`
projects them into three layers.

| Scope | Written to | Adds |
|---|---|---|
| `user` | `~/.claude/settings.json` | `deny` + `ask` + subscription login |
| `project` | a repository's `.claude/settings.json` | `deny` |
| `managed` | the managed settings path, applied as administrator | `deny` + `disableBypassPermissionsMode` |

One list, three projections — `npm test` asserts they stay identical.

## Cowork mode

```bash
npm run sync -- --without git
```

Strips every rule containing `git` from `deny` and sets `HANDOFF_ALLOW_GIT=1`, which the hook reads too.
Re-sync without the flag to lock again. The same `--without` mechanism drops any other token.

## Editing `policy.json`

Security rules go in `deny`, never `allow` — `allow` does not apply before the workspace trust dialog.
Never deny a whole binary you also need to read with: `deny: Bash(git *)` blocks `git status` with no
possible exception. `:*` matches only at the end; no `mcp__` rule may contain parentheses; Windows paths
normalise to POSIX. Details: [../docs/CLAUDE_CODE_FACTS.md](../docs/CLAUDE_CODE_FACTS.md).
