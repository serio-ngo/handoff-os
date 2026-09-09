# Reference — Claude Code identifiers

<!-- verified against `code.claude.com/docs` on 2026-09-04; source per section -->

## Hooks

| Fact | Value |
|---|---|
| File | `<plugin-root>/hooks/hooks.json`, same object shape as the settings `hooks` key |
| `matcher` tools | PreToolUse, PostToolUse, PermissionRequest, PermissionDenied (tool name); SessionStart (reason); SubagentStart/Stop (agent type) |
| No `matcher` | everything else |
| `"*"` / omitted | all |
| Exact / pipe-list chars | letters, digits, `_`, `-`, space, comma, pipe |
| Any other char | unanchored JS RegExp (`Edit.*` matches `NotebookEdit`) |
| Stdout reaches context | `UserPromptSubmit`, `SessionStart`, `PostModelSwitch` only |
| Stdin, every event | `session_id` `transcript_path` `cwd` `hook_event_name` |
| Stdin, tool events add | `tool_name` `tool_input`; `agent_type` inside a subagent, absent on main |
| Subagent session | reuses parent `session_id`; state keys on `agent_type` (observed, not documented upstream) |
| UserPromptSubmit | `user_prompt` (**not** `prompt`) |
| Stop / SubagentStop | `last_assistant_message`, **may be absent** — fall back to transcript JSONL |
| Never use | `tool_response`, `stop_hook_active` |
| Exit `2` blocks | PreToolUse, UserPromptSubmit, Stop, SubagentStop; no retry cap documented, so a block reason names a remedy |
| PostToolUse | cannot block |
| `stderr` | exit-2 block reason only |
| Exit `0` | stdout parsed as JSON when it starts `{`, ends `}` |
| Env | `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT` |
| Kill switch | `"disableAllHooks": true` |

```json
{ "hooks": { "PreToolUse": [ { "matcher": "Bash|Edit|Write",
  "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/x.mjs\"" } ] } ] } }
```

- Source: <https://code.claude.com/docs/en/hooks.md>

## Permissions

| Order | Rule |
|---|---|
| Match | **`deny` → `ask` → `allow`; first match wins, specificity irrelevant** |
| Exception | a broad `deny` carries no `allow` exception |

| Rule | Correct form |
|---|---|
| Bash | `Bash(git push *)` — `:*` only at the end |
| Read / Edit | `Read(//c/Users/<you>/repo/.env)` |
| WebFetch | `WebFetch(domain:example.com)` |
| MCP | `mcp__gmail` · `mcp__gmail__send_email` · `mcp__gmail__*` — never with `(` |

| Windows / scope | Rule |
|---|---|
| Paths | POSIX (`C:\Users\<you>` → `/c/Users/<you>`); one leading `/` anchors at the settings file's directory — `//` for absolute |
| Trust dialog | `deny` and `ask` apply before it; `allow` does not |
| Hooks | hook decisions never bypass permission rules |

- Source: <https://code.claude.com/docs/en/permissions.md>

## Plugins, skills, subagents

| Fact | Value |
|---|---|
| Layout | plugin root holds `skills/`, `agents/`, `commands/`, `hooks/hooks.json` |
| `plugin.json` | inside `.claude-plugin/` only; `marketplace.json` at `<repo>/.claude-plugin/` |
| Install path | `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, keyed by `plugin.json` `version` — **content without a `version` bump is a no-op** |
| Skill | `<plugin-root>/skills/<name>/SKILL.md` → `/<plugin>:<skill>` |
| Skill frontmatter | `name` `description` `license` `compatibility` `metadata` `allowed-tools` — **nothing else**, hard upload error |
| Skill context | description always in; body on invocation only |
| Subagent | `<plugin-root>/agents/<name>.md` → `<plugin>:<agent>` |
| Plugin subagents ignore | `hooks`, `mcpServers`, `permissionMode` — block with `deny: ["Agent(name)"]` |

## Auth

| Precedence, highest first | Bill |
|---|---|
| `CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY` · `ANTHROPIC_AUTH_TOKEN` · `ANTHROPIC_API_KEY` · `apiKeyHelper` · `CLAUDE_CODE_OAUTH_TOKEN` · `/login` subscription OAuth, **last** | any of the above wins, metered credits |

| Check | Value |
|---|---|
| Config | `"forceLoginMethod": "claudeai"` |
| Status | `/status` |

- Source: <https://code.claude.com/docs/en/authentication.md>
