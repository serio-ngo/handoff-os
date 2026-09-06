# Manifest

Everything the plugin loads, at version 1.4.3. Generated — `npm run upkeep` rewrites it.

## Skills

| Skill | Description chars, always in context | Body lines, on use |
|---|---|---|
| `plan-session` | 244 | 97 |
| `research-budget` | 246 | 76 |
| `task-loop` | 216 | 43 |

## Hooks

| Event | Matcher | Script |
|---|---|---|
| `PostToolUse` | `^(Edit\|Write\|mcp__(?!.*[_-](search\|list\|read\|get\|help\|resolve)(_\|-\|$)))` | `scripts/audit.mjs` |
| `PreToolUse` | `^(Read\|Bash\|PowerShell\|Edit\|Write\|Agent\|Grep\|Glob\|mcp__)` | `scripts/guard.mjs` |
| `SessionStart` | `startup\|resume\|clear\|compact\|fork` | `scripts/card.mjs` |
| `Stop` | `*` | `scripts/verify.mjs` |
| `SubagentStop` | `scout$` | `scripts/verify.mjs` |
| `UserPromptSubmit` | `*` | `scripts/card.mjs` |
