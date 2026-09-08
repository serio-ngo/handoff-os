# Reference — Claude Code identifiers

An invented identifier silently never executes. Verified against `code.claude.com/docs` on
**2026-09-04**. Source for each section linked inline.

## Hooks

Plugin hooks: `<plugin-root>/hooks/hooks.json` — same object shape as the settings `hooks` key:

```json
{ "hooks": { "PreToolUse": [ { "matcher": "Bash|Edit|Write",
  "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/x.mjs\"" } ] } ] } }
```

- Tools with `matcher`: PreToolUse, PostToolUse, PermissionRequest, PermissionDenied (tool name);
  SessionStart (reason); SubagentStart/Stop (agent type). Everything else: no `matcher`.
- `"*"`/omitted = all. Letters, digits, `_`, `-`, space, comma, pipe = exact/pipe-list; **any other
  character makes it an unanchored JS RegExp** (`Edit.*` matches `NotebookEdit`).
- Plain-text stdout reaches context on `UserPromptSubmit`, `SessionStart` and `PostModelSwitch` only.
- Stdin: every event carries `session_id` `transcript_path` `cwd` `hook_event_name`; tool events add
  `tool_name` `tool_input`, plus `agent_type` inside a subagent (absent on the main thread).
  A subagent reuses the parent `session_id`, so per-agent state keys on `agent_type` (observed, not
  documented upstream). UserPromptSubmit: `user_prompt` (**not** `prompt`). Stop/SubagentStop:
  `last_assistant_message`, **may be absent** — fall back to the transcript JSONL. Never use
  `tool_response` or `stop_hook_active`.
- Exit `2` **blocks** on PreToolUse, UserPromptSubmit, Stop and SubagentStop; no retry cap is
  documented, so a block reason must name a remedy. PostToolUse cannot block. `stderr` is
  shown only as the exit-2 block reason. Exit `0`: stdout parsed as JSON when it starts `{`, ends `}`.
- Env: `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`. Kill switch: `"disableAllHooks": true`.

Source: <https://code.claude.com/docs/en/hooks.md>

## Permissions

Order: **`deny` → `ask` → `allow`. First match wins; specificity does not matter.** A broad `deny`
cannot carry an `allow` exception.

| Rule | Correct form |
|---|---|
| Bash | `Bash(git push *)` — `:*` only at the end |
| Read / Edit | `Read(//c/Users/<you>/repo/.env)` |
| WebFetch | `WebFetch(domain:example.com)` |
| MCP | `mcp__gmail` · `mcp__gmail__send_email` · `mcp__gmail__*` — never with `(` |

**Windows:** paths normalise to POSIX (`C:\Users\<you>` → `/c/Users/<you>`); one leading `/` anchors
at the settings file's own directory — use `//` for absolute. `deny` and `ask` apply before the
workspace trust dialog; `allow` does not. Hook decisions never bypass permission rules.

Source: <https://code.claude.com/docs/en/permissions.md>

## Plugins, skills, subagents

- Everything lives at the plugin root — `skills/`, `agents/`, `commands/`, `hooks/hooks.json`. Only
  `plugin.json` goes inside `.claude-plugin/`; `marketplace.json` at `<repo>/.claude-plugin/`.
- A session runs the plugin from `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, keyed
  by the `version` in `plugin.json` — **ship content without bumping `version` and the update is a
  no-op.**
- Skill `<plugin-root>/skills/<name>/SKILL.md` → `/<plugin>:<skill>`. Portable frontmatter: `name`
  `description` `license` `compatibility` `metadata` `allowed-tools` — **nothing else** is a hard
  upload error. The description is always in context; the body loads on invocation only.
- Subagent `<plugin-root>/agents/<name>.md` → `<plugin>:<agent>`. For plugin subagents `hooks`,
  `mcpServers` and `permissionMode` are **IGNORED** — block one with `deny: ["Agent(name)"]`.

## Auth

Precedence, highest first: `CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY` · `ANTHROPIC_AUTH_TOKEN` ·
`ANTHROPIC_API_KEY` · `apiKeyHelper` · `CLAUDE_CODE_OAUTH_TOKEN` · `/login` subscription OAuth,
**last** — any of the above wins and bills as metered credits. Configure
`"forceLoginMethod": "claudeai"` and check `/status`.

Source: <https://code.claude.com/docs/en/authentication.md>
