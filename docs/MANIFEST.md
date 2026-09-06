# Manifest

Everything the plugin loads, at version 1.0.11. Generated — `npm run upkeep` rewrites it.

## Skills

| Skill | Description chars, always in context | Body lines, on use |
|---|---|---|
| `canon` | 597 | 45 |
| `handoff-card` | 408 | 37 |
| `plan-session` | 720 | 97 |
| `research-budget` | 620 | 76 |
| `task-loop` | 383 | 43 |

## Hooks

| Event | Matcher | Script |
|---|---|---|
| `PostToolUse` | `^(Edit\|Write\|mcp__(?!.*[_-](search\|list\|read\|get\|help\|resolve)(_\|-\|$)))` | `scripts/audit.mjs` |
| `PreToolUse` | `^(Read\|Bash\|PowerShell\|Edit\|Write\|Agent\|mcp__)` | `scripts/guard.mjs` |
| `SessionStart` | `startup\|resume\|clear\|compact\|fork` | `scripts/card.mjs` |
| `Stop` | `*` | `scripts/verify.mjs` |
| `UserPromptSubmit` | `*` | `scripts/card.mjs` |
