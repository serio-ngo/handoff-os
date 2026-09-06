# Permission policy

A plugin's own `settings.json` supports only `agent` and `subagentStatusLine`. **Permission rules cannot ship
inside a plugin.** They live in `policy.json` here, and `npm run setup` projects them into three layers.

| Scope | Written to | Adds |
|---|---|---|
| `user` | `~/.claude/settings.json`, or each `CLAUDE_CONFIG_DIR` in use | `deny` + `ask` + subscription login |
| `project` | a repository's `.claude/settings.json` | `deny`, so a fresh clone is covered before user settings exist |
| `managed` | the managed settings path, applied as administrator | `deny` + `disableBypassPermissionsMode` |

One list, three projections — `npm test` asserts they stay identical.

## Cowork mode

```bash
npm run sync -- --without git
```

Strips every rule containing `git` from `deny` and sets `HANDOFF_ALLOW_GIT=1`, which the hook reads too —
the agent may then commit and push. Re-sync without the flag to lock again. The same `--without`
mechanism drops any other token (e.g. a connector name from `ask`).

## Editing `policy.json`

Security rules go in `deny`, never `allow` (`allow` does not apply before the workspace trust dialog).
Never deny a whole binary you also need to read with — `deny: Bash(git *)` blocks `git status` with no
possible `allow` exception. `:*` matches only at the end; no `mcp__` rule may contain parentheses; Windows
paths normalise to POSIX. Sources: [../docs/CLAUDE_CODE_FACTS.md](../docs/CLAUDE_CODE_FACTS.md) §§9–10.

## What static rules cannot reach

`Write` paths, cloud-CLI deploy subcommands, `curl`/`wget` carrying a body, and connector tools that send
or delete. The `PreToolUse` guard covers all four — denying the whole binary would block the read-only
calls you need.
