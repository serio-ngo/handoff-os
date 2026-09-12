# Manifest

<sub><b>Answers</b> · everything the plugin loads at version 1.11.0 · generated, `npm run upkeep` rewrites it · <a href="../README.md">README</a></sub>

## Skills

| Skill | Description chars, always in context | Body lines, on use |
|---|---|---|
| `research-budget` | 97 | 19 |

## Agents

| Agent | model | Tools |
|---|---|---|
| `runner` | haiku | Bash, Read, Grep, Glob |
| `scout` | haiku | Read, Grep, Glob, WebFetch |

## Hooks

| Event | Matcher | Script |
|---|---|---|
| `PreToolUse` | `^(Read\|Bash\|PowerShell\|Edit\|Write\|NotebookEdit\|MultiEdit\|Task\|Agent\|Workflow\|Grep\|Glob\|mcp__)` | `scripts/guard.mjs` |
| `SessionStart` | `startup\|resume\|clear\|compact\|fork` | `scripts/session.mjs` |
| `Stop` | `*` | `scripts/receipt.mjs` |

## Inventory

| What ships | Count |
|---|---|
| Script lines | **662** across 11 files |
| Hooks | **3** handlers on 3 events |
| Skills | **1** |
| Subagents | **2** |
| Third-party packages | **0** |
| Network calls, API keys, model calls | **0** |
