# Reference — Claude Code identifiers (VERIFIED)

An invented identifier raises no error — it silently never executes. `UNVERIFIED` rows are not normative;
never base enforcement on them. Verified against `code.claude.com/docs` on **2026-09-04**.

## 0. The events this plugin uses

`SessionStart` · `UserPromptSubmit` · `PreToolUse` · `PostToolUse` · `Stop`. There are 33 in total.

## 2. Hook file shape

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

## 3. Matcher

| Supports `matcher` | What it matches |
|---|---|
| PreToolUse · PostToolUse · PostToolUseFailure · PermissionRequest · PermissionDenied | tool name |
| SessionStart · SessionEnd · Setup · Notification | reason / type |
| SubagentStart · SubagentStop | agent type |
| PreCompact · PostCompact | `manual` \| `auto` |
| ConfigChange · StopFailure · InstructionsLoaded · UserPromptExpansion · Elicitation · FileChanged and the rest | source / type / name — see the hooks page |
| No `matcher` — only a `hooks` array | UserPromptSubmit · PostToolBatch · Stop · TaskCreated · TaskCompleted · MessageDisplay · CwdChanged and the rest |

**Pattern semantics.** `"*"` / `""` / omitted = all. Only letters, digits, `_`, `-`, space, comma,
pipe = exact match or pipe-separated list. **Any other character makes it an unanchored JS RegExp** —
`Edit.*` also matches `NotebookEdit`; `^Edit$` matches only `Edit`.

## 3a. Which events can put text into context

For most events stdout goes to the debug log only. The exceptions — plain-text stdout added as context —
are `UserPromptSubmit`, `UserPromptExpansion`, **`SessionStart`** and `PostModelSwitch`.
Source: <https://code.claude.com/docs/en/hooks.md>. A ~15-line session card replaces a "read this file
first" instruction that costs the whole file, every session.

## 3b. Plugin load path and the update trap

A session runs the plugin from `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, keyed by the
`version` in `plugin.json` (verified live 2026-09-04). **Ship content without bumping `version` and the
update is a no-op — old code loads silently.** `npm run upkeep` bumps it on every content change.

## 4. Hook stdin

| Scope | Fields |
|---|---|
| Every event | `session_id` `prompt_id` `transcript_path` `cwd` `permission_mode` `effort` `hook_event_name` |
| Tool events | `tool_name` `tool_input` `tool_use_id` — `tool_input.command` (Bash), `tool_input.file_path` (Edit/Write) |
| UserPromptSubmit | `user_prompt` — **not** `prompt` |
| Stop · SubagentStop | `last_assistant_message` — **may be absent.** A real Stop payload carried `transcript_path` and no message, so read the last `assistant` text block out of the transcript JSONL as fallback (see `scripts/verify.mjs`). |

**Do not use:** `tool_response`, `stop_hook_active`, bare `prompt`. Absent from the current tables.

## 5. Exit codes

| Code | Effect |
|---|---|
| `0` | Success. stdout parsed as JSON when it starts `{` and ends `}`. |
| `2` | **Blocks** on PreToolUse · UserPromptSubmit · Stop and most gating events. Overrides JSON, including `permissionDecision: allow`. Ignored on PermissionRequest · PostToolUse · PostToolUseFailure. |
| any nonzero | WorktreeCreate · WorktreeRemove fail the operation; output never parsed |

`stderr` is never shown to Claude **except** as the exit-2 block reason. **PostToolUse cannot block — the
tool already ran.**

## 6. Hook JSON output

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

## 7. Hook environment variables

`CLAUDE_PROJECT_DIR` · `CLAUDE_PLUGIN_ROOT` (plugin hooks only) · `CLAUDE_PLUGIN_DATA` ·
`CLAUDE_EFFORT` · `CLAUDE_CODE_REMOTE`. Parent env is inherited.

## 8. Where hooks may be declared

`~/.claude/settings.json` · `.claude/settings.json` · `.claude/settings.local.json` · managed settings ·
plugin `hooks/hooks.json` · skill frontmatter `hooks:` (session-scoped). Kill switch:
`"disableAllHooks": true`.

## 9. Permissions

Order: **`deny` → `ask` → `allow`. First match wins. Specificity does not matter.**
A broad `deny` cannot carry an `allow` exception.

| Rule | Correct form | Broken form |
|---|---|---|
| Bash | `Bash(git push *)` · `Bash(ls:*)` (`:*` only at the **end**) | `Bash(git:* push)` |
| Read / Edit | `Read(//c/Users/<you>/Repos/handoff-os/.env)` · `Read(.env)` | `Read(file_path:...)` · `Read(C:\Users\...)` |
| WebFetch | `WebFetch(domain:example.com)` | `WebFetch(url:...)` |
| MCP | `mcp__gmail` · `mcp__gmail__send_email` · `mcp__gmail__*` | any `mcp__` rule containing `(` — **skipped at load** |

**Windows:** paths normalise to POSIX first (`C:\Users\<you>` → `/c/Users/<you>`). A rule with a
backslash or bare drive letter never matches. A single leading `/` anchors at the settings file's own
directory — use `//` for absolute. Redirection targets (`>`, `>>`, `2>`) are checked as file writes
against Edit rules.

| Rule | Applies before workspace trust? |
|---|---|
| `deny` · `ask` | **Yes** — always |
| `allow` · `additionalDirectories` | No — only after the trust dialog |

**Hooks vs permissions (verbatim):** *"Hook decisions don't bypass permission rules… a matching deny
rule blocks the call, and a matching ask rule still prompts even when the hook returned allow."*
Source: <https://code.claude.com/docs/en/permissions.md>

## 10. Settings

Precedence, highest first: managed (`%ProgramFiles%\ClaudeCode\managed-settings.json`) · CLI
(`claude --settings`) · project local (`.claude/settings.local.json`) · project shared
(`.claude/settings.json`) · user (`~/.claude/settings.json`).

Real keys include `permissions{allow,deny,ask,defaultMode,additionalDirectories,disableBypassPermissionsMode}`
· `enabledPlugins` · `extraKnownMarketplaces` · `env` · `hooks` · `forceLoginMethod` · `apiKeyHelper` ·
`disableAllHooks` · `model` · `effortLevel`. Full list on the settings page.

**Conflict, unresolved — 2026-09-06.** The plugins-reference page documents `extraKnownMarketplaces` as an
**array** of `{name, source}`; the live install on this machine uses the object-keyed form below, which is
what `scripts/handoff.mjs` writes. Do not flip without testing a real session.

```json
{ "extraKnownMarketplaces": { "serio-ngo": { "source": { "source": "github", "repo": "serio-ngo/handoff-os" } } },
  "enabledPlugins": { "handoff-os@serio-ngo": true } }
```

## 11. Skills

Plugin path: `<plugin-root>/skills/<name>/SKILL.md` → `/<plugin>:<skill>`. **Portable fields
(claude.ai / Cowork / Skills API): `name` `description` `license` `compatibility` `metadata`
`allowed-tools` — and nothing else.** Any other field is a hard upload error. The `description`,
truncated at 1,536 chars, is **always** in context; the body loads on invocation only.

## 12. Subagents

`<plugin-root>/agents/<name>.md`, invoked as `<plugin>:<agent>`. Required frontmatter: `name`,
`description`. For **plugin** subagents `hooks`, `mcpServers` and `permissionMode` are **IGNORED** — block
one with `deny: ["Agent(name)"]`.

## 13. Plugins and marketplace

Everything lives **at the plugin root** — `skills/`, `agents/`, `commands/`, `hooks/hooks.json`. Only
`plugin.json` goes inside `.claude-plugin/`. **Permission rules cannot ship in a plugin** — they go in
`~/.claude/settings.json`, `.claude/settings.json`, or managed settings. MCP: `.mcp.json` at the plugin
root. `marketplace.json` at `<repo>/.claude-plugin/marketplace.json`. **Cowork** adds marketplaces by git
URL only. CLI: `claude plugin install <p>@<m>` · `claude --plugin-dir ./plugins/handoff-os` (local dev).

## 15. Auth — how to guarantee zero API credits

Precedence, **highest first:** `CLAUDE_CODE_USE_BEDROCK / VERTEX / FOUNDRY` · `ANTHROPIC_AUTH_TOKEN` ·
`ANTHROPIC_API_KEY` · `apiKeyHelper` · `CLAUDE_CODE_OAUTH_TOKEN` · profile / federation ·
`/login` subscription OAuth, **last**. Never set any of the above — with a key present it wins over the
subscription, in `claude -p` with no prompt. Set `"forceLoginMethod": "claudeai"` and check `/status`.
Source: <https://code.claude.com/docs/en/authentication.md>

## 17. UNVERIFIED — do not build on these

`PostToolUse` receives `tool_response` · `stopReason` / `suppressOutput` placement ·
`extraKnownMarketplaces` array form · HKLM/HKCU registry route for managed settings on Windows.
Each needs a live probe before use.
