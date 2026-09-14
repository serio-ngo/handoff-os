# Manifest

<sub><b>Answers</b> · everything the plugin loads at version 1.12.2 · generated, `npm run upkeep` rewrites it · <a href="../README.md">README</a></sub>

## Skills

| Skill | Description chars, always in context | Body lines, on use |
|---|---|---|
| `plan-session` | 85 | 87 |
| `research-budget` | 101 | 70 |
| `task-loop` | 75 | 48 |

## Agents

| Agent | model | Tools |
|---|---|---|
| `runner` | haiku | Bash, Read, Grep, Glob |
| `scout` | haiku | Read, Grep, Glob, WebFetch |

## Hooks

| Event | Matcher | Script |
|---|---|---|
| `PostToolUse` | `^(Bash\|PowerShell\|Edit\|Write\|NotebookEdit\|MultiEdit\|mcp__(?!.*[_-](search\|list\|read\|get\|help\|resolve)(_\|-\|$)))` | `scripts/audit.mjs` |
| `PreToolUse` | `^(Read\|Bash\|PowerShell\|Edit\|Write\|NotebookEdit\|MultiEdit\|Task\|Agent\|Workflow\|Grep\|Glob\|mcp__)` | `scripts/guard.mjs` |
| `SessionStart` | `startup\|resume\|clear\|compact\|fork` | `scripts/card.mjs` |
| `Stop` | `*` | `scripts/verify.mjs` |

## Inventory

| What ships | Count |
|---|---|
| Guard logic, agent-affecting only | **830** lines across 11 flow files |
| Stats, receipts, adapters (`audit`, `card`, `bridge`, `ledger`, `transcript`) | excluded from the count |
| Pattern rules | **35** |
| Hooks | **4** handlers on 4 events |
| Skills | **3** |
| Subagents | **2** |
| Third-party packages | **0** |
| Network calls, API keys, model calls | **0** |
