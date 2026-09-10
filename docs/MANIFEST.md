# Manifest

Everything the plugin loads, at version 1.5.42. Generated — `npm run upkeep` rewrites it.

## Skills

| Skill | Description chars, always in context | Body lines, on use |
|---|---|---|
| `plan-session` | 85 | 87 |
| `research-budget` | 101 | 70 |
| `task-loop` | 75 | 44 |

## Agents

| Agent | model | Tools |
|---|---|---|
| `runner` | haiku | Bash, Read, Grep, Glob |
| `scout` | haiku | Read, Grep, Glob, WebFetch |

## Hooks

| Event | Matcher | Script |
|---|---|---|
| `PostToolUse` | `^(Bash\|PowerShell\|Edit\|Write\|mcp__(?!.*[_-](search\|list\|read\|get\|help\|resolve)(_\|-\|$)))` | `scripts/audit.mjs` |
| `PreToolUse` | `^(Read\|Bash\|PowerShell\|Edit\|Write\|NotebookEdit\|MultiEdit\|Task\|Agent\|Workflow\|Grep\|Glob\|mcp__)` | `scripts/guard.mjs` |
| `SessionStart` | `startup\|resume\|clear\|compact\|fork` | `scripts/card.mjs` |
| `Stop` | `*` | `scripts/verify.mjs` |
| `SubagentStop` | `scout$` | `scripts/verify.mjs` |
