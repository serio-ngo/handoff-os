# Permission policy

A plugin's own `settings.json` supports only `agent` and `subagentStatusLine`. **Permission rules cannot ship
inside a plugin.** They live in `policy.json` here, and `npm run setup` projects them into the three layers.

| Scope | Written to | Adds |
|---|---|---|
| `user` | `~/.claude/settings.json`, or each `CLAUDE_CONFIG_DIR` in use | `deny` + `ask` + subscription login |
| `project` | a repository's `.claude/settings.json` | `deny`, so a fresh clone is covered before user settings exist |
| `managed` | the managed settings path, applied as administrator | `deny` + `disableBypassPermissionsMode` |

```bash
npm run sync -- --scope managed --target /path/to/managed-settings.json
```

One list, three projections — a rule added to `policy.json` reaches every layer, and the layers cannot drift
apart. `npm test` asserts the projections stay identical.

## Editing `policy.json`

| Rule | Consequence of violation |
|---|---|
| Security rules go in `deny`, never `allow` | `deny` and `ask` apply before the workspace trust dialog; `allow` does not |
| Never deny a whole binary you also need to read with | `deny: Bash(git *)` blocks `git status` and admits no `allow` exception |
| `:*` is recognised only at the end of a pattern | `Bash(git:* push)` never matches |
| No `mcp__` rule may contain parentheses | The rule is skipped at load, silently |
| Windows paths normalise to POSIX | `//c/Users/<you>/…/**`, never `C:\…` |

Full traps, each with its source URL: [../docs/CLAUDE_CODE_FACTS.md](../docs/CLAUDE_CODE_FACTS.md) §§9–10.

## The `ask` list

`ask` names the connector servers that should prompt before a write. It ships with a short generic set;
server names vary per installation, so run `/mcp`, then edit the list to match what you actually have.

Removing an entry removes a prompt, never protection — the `PreToolUse` guard blocks every outward and
destructive verb on **any** server, listed or not. To drop prompts without editing the file:

```bash
npm run sync -- --without <token>,<token>
```

## What static rules cannot reach

`Write` paths (rules only express `Read`/`Edit`), cloud-CLI deploy subcommands, `curl`/`wget` carrying a
body, and connector tools that send or delete. All four are covered by the `PreToolUse` guard instead —
denying the whole binary would block the read-only calls you need. Layers and gaps:
[../docs/ORCHESTRATOR.md](../docs/ORCHESTRATOR.md) §5 and [../SECURITY.md](../SECURITY.md).
