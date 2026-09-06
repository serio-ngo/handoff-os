# Reference — Claude Code identifiers

An invented identifier raises no error — it silently never executes. Verified against
`code.claude.com/docs` on **2026-09-04**. `UNVERIFIED` rows are not normative; never base enforcement on
them.

## Hook file shape

Plugin: `<plugin-root>/hooks/hooks.json`. Settings: the `hooks` key. **Same object shape.**

```json
{ "hooks": { "PreToolUse": [ { "matcher": "Bash|Edit|Write",
  "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/x.mjs\"",
              "timeout": 15, "statusMessage": "checking egress" } ] } ] } }
```

| Handler field | Values |
|---|---|
| `type` | `command` · `http` · `mcp_tool` · `prompt` · `agent` |
| `command` | shell string, or exec-form array |
| `shell` | `bash` · `powershell` |
| `if` | permission-rule syntax pre-filter, e.g. `Bash(git *)` |
| `args` `timeout` `statusMessage` `once` `async` `asyncRewake` | — |

## Matchers

| Supports `matcher` | What it matches |
|---|---|
| PreToolUse · PostToolUse · PostToolUseFailure · PermissionRequest · PermissionDenied | tool name |
| SessionStart · SessionEnd · Setup · Notification | reason / type |
| SubagentStart · SubagentStop | agent type |
| PreCompact · PostCompact | `manual` \| `auto` |
| UserPromptSubmit · PostToolBatch · Stop · TaskCreated · TaskCompleted and the rest | no `matcher` — only a `hooks` array |

`"*"` / `""` / omitted = all. Only letters, digits, `_`, `-`, space, comma, pipe = exact match or
pipe-separated list. **Any other character makes it an unanchored JS RegExp** — `Edit.*` also matches
`NotebookEdit`; `^Edit$` matches only `Edit`.

Plain-text stdout is added to context on `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart` and
`PostModelSwitch` only. Everywhere else stdout goes to the debug log.
Source: <https://code.claude.com/docs/en/hooks.md>

## Hook stdin

| Scope | Fields |
|---|---|
| Every event | `session_id` `prompt_id` `transcript_path` `cwd` `permission_mode` `effort` `hook_event_name` |
| Tool events | `tool_name` `tool_input` `tool_use_id` — `tool_input.command` (Bash), `tool_input.file_path` (Edit/Write) |
| UserPromptSubmit | `user_prompt` — **not** `prompt` |
| Stop · SubagentStop | `last_assistant_message` — **may be absent**; fall back to the last `assistant` text block in the transcript JSONL |

**Do not use:** `tool_response`, `stop_hook_active`, bare `prompt`.

## Exit codes

| Code | Effect |
|---|---|
| `0` | Success. stdout parsed as JSON when it starts `{` and ends `}`. |
| `2` | **Blocks** on PreToolUse · UserPromptSubmit · Stop and most gating events. Overrides JSON, including `permissionDecision: allow`. Ignored on PermissionRequest · PostToolUse · PostToolUseFailure. |

`stderr` is never shown to Claude **except** as the exit-2 block reason. **PostToolUse cannot block.**

## Hook JSON output

| Field | Where |
|---|---|
| `systemMessage` `terminalSequence` | top level, any event |
| `hookSpecificOutput.hookEventName` | required inside the block |
| `permissionDecision` (`allow`\|`deny`) + `permissionDecisionReason` + `additionalContext` | PreToolUse |
| `decision` (`approve`\|`deny`) | PermissionRequest |
| `decision` (`continue`\|`stop`\|`abort`) + `updatedInput.user_prompt` | UserPromptSubmit |
| `decision` (`continue`\|`stop`) | Stop · SubagentStop · ConfigChange · TaskCreated · TaskCompleted |
| `retry` (boolean) | PermissionDenied |

**Do not use** `stopReason` or `suppressOutput` — undocumented placement.

Environment: `CLAUDE_PROJECT_DIR` · `CLAUDE_PLUGIN_ROOT` (plugin hooks only) · `CLAUDE_PLUGIN_DATA` ·
`CLAUDE_EFFORT` · `CLAUDE_CODE_REMOTE`. Kill switch: `"disableAllHooks": true`.

## Permissions

Order: **`deny` → `ask` → `allow`. First match wins. Specificity does not matter.** A broad `deny` cannot
carry an `allow` exception.

| Rule | Correct form | Broken form |
|---|---|---|
| Bash | `Bash(git push *)` · `Bash(ls:*)` (`:*` only at the **end**) | `Bash(git:* push)` |
| Read / Edit | `Read(//c/Users/<you>/repo/.env)` · `Read(.env)` | `Read(file_path:...)` · `Read(C:\Users\...)` |
| WebFetch | `WebFetch(domain:example.com)` | `WebFetch(url:...)` |
| MCP | `mcp__gmail` · `mcp__gmail__send_email` · `mcp__gmail__*` | any `mcp__` rule containing `(` — **skipped at load** |

`deny` and `ask` apply before the workspace trust dialog; `allow` and `additionalDirectories` do not.

**Windows:** paths normalise to POSIX first (`C:\Users\<you>` → `/c/Users/<you>`). A rule with a
backslash or bare drive letter never matches. A single leading `/` anchors at the settings file's own
directory — use `//` for absolute. Redirection targets (`>`, `>>`, `2>`) are checked as file writes.

**Hooks vs permissions (verbatim):** *"Hook decisions don't bypass permission rules… a matching deny
rule blocks the call, and a matching ask rule still prompts even when the hook returned allow."*
Source: <https://code.claude.com/docs/en/permissions.md>

## Settings

Precedence, highest first: managed (`%ProgramFiles%\ClaudeCode\managed-settings.json`) · CLI
(`claude --settings`) · project local (`.claude/settings.local.json`) · project shared
(`.claude/settings.json`) · user (`~/.claude/settings.json`).

`scripts/handoff.mjs` writes the object-keyed marketplace form, which is what a live install uses:

```json
{ "extraKnownMarketplaces": { "serio-ngo": { "source": { "source": "github", "repo": "serio-ngo/handoff-os" } } },
  "enabledPlugins": { "handoff-os@serio-ngo": true } }
```

## Skills, subagents and plugins

Skill path: `<plugin-root>/skills/<name>/SKILL.md` → `/<plugin>:<skill>`. **Portable frontmatter fields:
`name` `description` `license` `compatibility` `metadata` `allowed-tools` — and nothing else.** Any other
field is a hard upload error. The `description`, truncated at 1,536 chars, is **always** in context; the
body loads on invocation only.

Subagent path: `<plugin-root>/agents/<name>.md`, invoked as `<plugin>:<agent>`. Required frontmatter:
`name`, `description`. For **plugin** subagents `hooks`, `mcpServers` and `permissionMode` are
**IGNORED** — block one with `deny: ["Agent(name)"]`.

Everything lives **at the plugin root** — `skills/`, `agents/`, `commands/`, `hooks/hooks.json`,
`.mcp.json`. Only `plugin.json` goes inside `.claude-plugin/`; `marketplace.json` goes at
`<repo>/.claude-plugin/marketplace.json`. A session runs the plugin from
`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, keyed by the `version` in `plugin.json` —
**ship content without bumping `version` and the update is a no-op.**

## Auth

Precedence, **highest first:** `CLAUDE_CODE_USE_BEDROCK / VERTEX / FOUNDRY` · `ANTHROPIC_AUTH_TOKEN` ·
`ANTHROPIC_API_KEY` · `apiKeyHelper` · `CLAUDE_CODE_OAUTH_TOKEN` · profile / federation ·
`/login` subscription OAuth, **last**. With any of those present it wins over the subscription and work
bills as metered credits. Configure `"forceLoginMethod": "claudeai"` and check `/status`.
Source: <https://code.claude.com/docs/en/authentication.md>

## UNVERIFIED — do not build on these

`PostToolUse` receives `tool_response` · `stopReason` / `suppressOutput` placement ·
`extraKnownMarketplaces` array form · HKLM/HKCU registry route for managed settings on Windows.
