# Permission policy

Permission rules cannot ship inside a plugin. They live in `policy.json` here, and `npm run setup`
projects them into three layers.

| Scope | Written to | Adds |
|---|---|---|
| `user` | `~/.claude/settings.json` | `deny` + `ask` + subscription login |
| `project` | a repository's `.claude/settings.json` | `deny` |
| `managed` | the managed settings path, applied as administrator | `deny` + `disableBypassPermissionsMode` |

One list, three projections — `npm test` asserts they stay identical.

## Locking git

```bash
npm run sync -- --lock git
```

Adds the `lock.git` bundle from `policy.json` to `deny` and sets `HANDOFF_LOCK_GIT=1`, which the hook
reads too. A plain `npm run sync` removes the bundle again and drops the variable. The merge and delete
rules live in `deny` proper, so they apply in both modes. A separate `--without <token>` mechanism
drops any rule containing that token, for connectors you do not use.

## Editing `policy.json`

Security rules go in `deny`, never `allow` — `allow` does not apply before the workspace trust dialog.
Never deny a whole binary you also need to read with: `deny: Bash(git *)` blocks `git status` with no
possible exception. `:*` matches only at the end; no `mcp__` rule may contain parentheses; Windows paths
normalise to POSIX. Details: [../docs/CLAUDE_CODE_FACTS.md](../docs/CLAUDE_CODE_FACTS.md).
