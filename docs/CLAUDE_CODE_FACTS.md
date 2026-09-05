# Reference — Claude Code identifiers (VERIFIED)

Verified against `code.claude.com/docs` on **2026-09-04**. Every row below was read from a documentation page.

**Why this file exists:** an invented identifier does not raise an error — it silently never executes. On
2026-09-03 an agent proposed hooks named `PostWrite` and `PreGitOperation`. Neither exists.
Consult this file instead of re-running research. One prior re-research pass cost approximately 2.0M tokens.

**How to use:** `UNVERIFIED` rows are not normative. Do not base enforcement on them.

---

## 1. Hook events — all 33, exact spelling

```
SessionStart  Setup  UserPromptSubmit  UserPromptExpansion  PreToolUse  PermissionRequest
PermissionDenied  PostToolUse  PostToolUseFailure  PostToolBatch  Notification  MessageDisplay
SubagentStart  SubagentStop  TaskCreated  TaskCompleted  Stop  StopFailure  TeammateIdle
InstructionsLoaded  ConfigChange  CwdChanged  DirectoryAdded  FileChanged  WorktreeCreate
WorktreeRemove  PreCompact  PostCompact  PreModelSwitch  PostModelSwitch  Elicitation
ElicitationResult  SessionEnd
```
Source: <https://code.claude.com/docs/en/hooks.md>

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
| PreModelSwitch · PostModelSwitch | model name |
| ConfigChange · DirectoryAdded · StopFailure · InstructionsLoaded · UserPromptExpansion · Elicitation · ElicitationResult | source / type / name |
| FileChanged | literal filenames, **exact match only** |

| No `matcher` — register with only a `hooks` array |
|---|
| UserPromptSubmit · PostToolBatch · Stop · TeammateIdle · TaskCreated · TaskCompleted · WorktreeCreate · WorktreeRemove · MessageDisplay · CwdChanged |

**Pattern semantics.** `"*"` / `""` / omitted = all. Only letters, digits, `_`, `-`, space, comma,
pipe = exact match or pipe-separated list. **Any other character makes it an unanchored JS RegExp** —
`Edit.*` also matches `NotebookEdit`; `^Edit$` matches only `Edit`.

## 3a. Which events can put text into context

| Fact | Source |
|---|---|
| For most events stdout goes to the debug log only. The exceptions — where **plain-text stdout is added as context Claude can see** — are `UserPromptSubmit`, `UserPromptExpansion`, **`SessionStart`** and `PostModelSwitch` | <https://code.claude.com/docs/en/hooks.md> |
| `hookSpecificOutput.additionalContext` is documented as available on "most events" | same |
| Use this for a session card: a hook that prints ~15 lines replaces a "read this file first" instruction that costs the whole file, every session | measured 2026-09-05: 285 vs 5,315 tokens |

## 3b. Plugin load path and the update trap

| Fact | Verified live 2026-09-04 |
|---|---|
| A session runs the plugin from `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` | the firing hook's own path proved it |
| `~/.claude/plugins/marketplaces/<name>/` is a git clone of the marketplace repo — the source, not what loads | clone was at an older commit than `origin/main` |
| The cache dir is keyed by the `version` in `plugin.json` | only `0.1.0` existed after many content changes |
| **Trap:** ship new content without bumping `version` and the cache key is unchanged, so update is a no-op — old skills, old hook scripts, silently | `/plugin update core` left stale content in place |
| Fix | bump `version` in `plugins/<p>/.claude-plugin/plugin.json` on **every** content change |
| Manual unstick | fast-forward the marketplace clone, then copy the plugin dir over the cache dir; hook scripts are re-read from disk per call, so guards take effect at once — skills need `/reload-plugins` |

## 4. Hook stdin

| Scope | Fields |
|---|---|
| Every event | `session_id` `prompt_id` `transcript_path` `cwd` `permission_mode` `effort` `hook_event_name` `agent_id` `agent_type` |
| Tool events | `tool_name` `tool_input` `tool_use_id` — `tool_input.command` (Bash), `tool_input.file_path` (Edit/Write) |
| UserPromptSubmit | `user_prompt` — **not** `prompt` |
| Stop · SubagentStop | `last_assistant_message` — **may be absent.** Live probe 2026-09-04: a real Stop payload carried `transcript_path` and no `last_assistant_message`, so a hook reading only that field never fires. Read the last `assistant` text block out of the transcript JSONL as the fallback (see `verify-gate.mjs`). |

**Do not use:** `tool_response`, `stop_hook_active`, bare `prompt`. Absent from the current tables.

## 5. Exit codes

| Code | Effect |
|---|---|
| `0` | Success. stdout parsed as JSON when it starts `{` and ends `}`. |
| `2` | **Blocks** on PreToolUse · UserPromptSubmit · UserPromptExpansion · Stop · SubagentStop · TeammateIdle · TaskCreated · TaskCompleted · ConfigChange · PostToolBatch · PreModelSwitch. Overrides JSON, including `permissionDecision: allow`. |
| `2` (ignored) | PermissionRequest · PostToolUse · PostToolUseFailure · StopFailure |
| any nonzero | WorktreeCreate · WorktreeRemove fail the operation; output never parsed |

`stderr` is never shown to Claude **except** as the exit-2 block reason. Otherwise it is debug-log only.
**PostToolUse cannot block — the tool already ran.**

## 6. Hook JSON output

| Field | Where |
|---|---|
| `systemMessage` `terminalSequence` | top level, any event |
| `hookSpecificOutput.hookEventName` | required inside the block |
| `permissionDecision` (`allow`\|`deny`) + `permissionDecisionReason` + `additionalContext` | PreToolUse |
| `decision` (`approve`\|`deny`) | PermissionRequest |
| `decision` (`continue`\|`stop`\|`abort`) + `updatedInput.user_prompt` | UserPromptSubmit |
| `decision` (`continue`\|`stop`) | Stop · SubagentStop · ConfigChange · PostToolBatch · TaskCreated · TaskCompleted |
| `retry` (boolean) | PermissionDenied |

**Do not use** `stopReason` or `suppressOutput` — undocumented placement.

## 7. Hook environment variables

`CLAUDE_PROJECT_DIR` · `CLAUDE_PLUGIN_ROOT` (plugin hooks only) · `CLAUDE_PLUGIN_DATA` ·
`CLAUDE_EFFORT` · `CLAUDE_CODE_REMOTE` · `CLAUDE_CODE_BRIDGE_SESSION_ID`. Parent env is inherited.

## 8. Where hooks may be declared

`~/.claude/settings.json` · `.claude/settings.json` · `.claude/settings.local.json` · managed settings ·
plugin `hooks/hooks.json` · skill frontmatter `hooks:` (session-scoped) · subagent frontmatter `hooks:`
(**ignored for plugin subagents**). Kill switch: `"disableAllHooks": true`.

---

## 9. Permissions

Order: **`deny` → `ask` → `allow`. First match wins. Specificity does not matter.**
A broad `deny` cannot carry an `allow` exception: `deny: Bash(aws *)` beats `allow: Bash(aws s3 ls)`.

| Rule | Correct form | Broken form |
|---|---|---|
| Bash | `Bash(git push *)` · `Bash(ls:*)` (`:*` only at the **end**) | `Bash(git:* push)` · `Bash(command:rm *)` |
| Read / Edit | `Read(//c/Users/<you>/Repos/handoff-os/.env)` · `Read(~/x)` · `Read(.env)` | `Read(file_path:...)` · `Read(C:\Users\...)` |
| WebFetch | `WebFetch(domain:example.com)` | `WebFetch(url:...)` |
| MCP | `mcp__gmail` · `mcp__gmail__send_email` · `mcp__gmail__*` | any `mcp__` rule containing `(` — **skipped at load** |
| Subagent | `Agent(general-purpose)` | — |
| `/cd` target | `Cd(~/code/**)` | — |

**Windows:** Read/Edit paths are normalised to POSIX first. `C:\Users\<you>` becomes
`/c/Users/<you>`. A rule with a backslash or a bare drive letter silently never matches.
Absolute form: `//c/Users/<you>/Repos/handoff-os/**`. All drives: `//**/.env`.

**Anchor trap:** in Read/Edit rules a **single** leading `/` anchors at the settings file's own
directory. `Read(/secrets/**)` in `~/.claude/settings.json` means `~/.claude/secrets/**`, not the
filesystem root. Use `//` for absolute.

| Rule | Applies before workspace trust? |
|---|---|
| `deny` · `ask` | **Yes** — always |
| `allow` · `additionalDirectories` | No — only after the trust dialog is accepted |

→ **Security rules go in `deny`, never in `allow`.**

Bash redirection targets (`>`, `>>`, `2>`) are checked as file writes against Edit rules.
`permissions.additionalDirectories` grants file access only; it loads no skills, commands or agents.

**Hooks vs permissions (verbatim):** *"Hook decisions don't bypass permission rules… a matching deny
rule blocks the call, and a matching ask rule still prompts even when the hook returned allow."*
Source: <https://code.claude.com/docs/en/permissions.md>

---

## 10. Settings

Precedence, highest first:

| # | Layer | Path |
|---|---|---|
| 1 | Managed | Windows `%ProgramFiles%\ClaudeCode\managed-settings.json` (legacy `%ProgramData%\...` is **not** read) |
| 2 | CLI | `claude --settings` |
| 3 | Project local | `.claude/settings.local.json` |
| 4 | Project shared | `.claude/settings.json` |
| 5 | User | `~/.claude/settings.json` |

Real keys: `permissions{allow,deny,ask,defaultMode,additionalDirectories,blockReadsOutsideWorkingDirectories,disableBypassPermissionsMode}`
· `enabledPlugins` · `extraKnownMarketplaces` · `outputStyle` · `disableBundledSkills` ·
`skillOverrides` · `skillListingBudgetFraction` · `skillListingMaxDescChars` · `model` ·
`effortLevel` · `agent` · `env` · `hooks` · `statusLine` · `cleanupPeriodDays` · `forceLoginMethod` ·
`forceLoginOrgUUID` · `apiKeyHelper` · `enableAllProjectMcpServers` · `disableAllHooks` · `sandbox` ·
`autoMode` · `claudeMd` · `claudeMdExcludes` · `autoMemoryEnabled` · `autoMemoryDirectory` ·
`strictPluginOnlyCustomization` · `attribution`.
**Deprecated:** `includeCoAuthoredBy` → use `attribution`.

`extraKnownMarketplaces` is an **object keyed by marketplace name**, never an array:

```json
{ "extraKnownMarketplaces": { "serio-ngo": { "source": { "source": "github", "repo": "serio-ngo/handoff-os" } } },
  "enabledPlugins": { "handoff-os@serio-ngo": true } }
```

---

## 11. Skills

| Fact | Detail |
|---|---|
| Plugin path | `<plugin-root>/skills/<name>/SKILL.md` → invoked `/<plugin>:<skill>` |
| Personal / project | `~/.claude/skills/<n>/SKILL.md` · `.claude/skills/<n>/SKILL.md` |
| `name` semantics | Personal/project: **the directory name** sets the command; `name` is only a label. Plugin: `name` sets the last command segment. |
| Full Claude Code fields | `name` `description` `when_to_use` `argument-hint` `arguments` `disable-model-invocation` `user-invocable` `allowed-tools` `disallowed-tools` `model` `effort` `context` `agent` `background` `hooks` `paths` `shell` `metadata` `license` `compatibility` |
| **Portable fields (claude.ai / Cowork / Skills API)** | **`name` `description` `license` `compatibility` `metadata` `allowed-tools` — and nothing else.** Any other field is a hard upload error. |
| Context cost | `description` (+`when_to_use`), truncated at 1,536 chars, is **always** in context. Body loads on invocation only. Keep under 500 lines. |
| `disable-model-invocation: true` | Removes the description from context entirely; Claude will never suggest the skill. |
| Substitutions | `${CLAUDE_SKILL_DIR}` `$ARGUMENTS` `$N` `${CLAUDE_SESSION_ID}` `${CLAUDE_EFFORT}` `${CLAUDE_PROJECT_DIR}` and, in plugin skills, `${CLAUDE_PLUGIN_ROOT}` `${CLAUDE_PLUGIN_DATA}` |

> **REPO RULE:** every `handoff-os` skill uses only the six portable fields. One file, three surfaces,
> zero dialect bugs. See `ORCHESTRATOR.md` §4.

---

## 12. Subagents

Files: `<plugin-root>/agents/<name>.md` · `.claude/agents/` · `~/.claude/agents/` (both scanned
recursively). Plugin agents are named `<plugin>:<agent>`; a subpath becomes `plugin:dir:agent`.

Required: `name` (lowercase-and-hyphens, no `:`), `description`.
Optional: `tools` `disallowedTools` `model` (`sonnet`\|`opus`\|`haiku`\|`fable`\|`inherit`)
`permissionMode` `maxTurns` `skills` `mcpServers` `hooks` `memory` `background`
`effort` (`low`\|`medium`\|`high`\|`xhigh`\|`max`) `isolation` (`worktree`) `color` `initialPrompt`.

| Trap | Truth |
|---|---|
| Plugin subagents | `hooks`, `mcpServers`, `permissionMode` are **IGNORED** |
| `tools: Agent(a, b)` | The parenthesised list is **ignored** inside a subagent definition. To block a subagent use `deny: ["Agent(name)"]` |
| Always removed from subagents | AskUserQuestion · EndConversation · EnterPlanMode · ScheduleWakeup · TaskOutput · WaitForMcpServers · Workflow |

---

## 13. Plugins and marketplace

Layout **at the plugin root** — only `plugin.json` goes inside `.claude-plugin/`:

```
.claude-plugin/plugin.json     skills/<name>/SKILL.md   commands/*.md   agents/*.md
hooks/hooks.json               .mcp.json                .lsp.json       bin/
monitors/monitors.json         output-styles/           themes/*.json   settings.json
```

| Trap | Truth |
|---|---|
| `commands/` `agents/` `skills/` `hooks/` inside `.claude-plugin/` | The documented common mistake. They belong at the root. |
| **A plugin's own `settings.json`** | Supports **only** `agent` and `subagentStatusLine`. **Permission rules cannot ship in a plugin.** They go in `~/.claude/settings.json`, `.claude/settings.json`, or managed settings. |
| Component path fields | `commands` `agents` `workflows` `outputStyles` **replace** the default directory. `skills` **adds** to the always-scanned `skills/`. |
| MCP in a plugin | Yes — `.mcp.json` at the plugin root, or the `mcpServers` field in `plugin.json`. `~/.claude/.mcp.json` is **not** read. |

`marketplace.json` at `<repo>/.claude-plugin/marketplace.json`. Required: `name` (kebab-case),
`owner.name`. Each `plugins[]` entry requires `name` + `source`.
`source` = `"./plugins/handoff-os"` or `{source:"github",repo,ref,sha}` / `url` / `git-subdir` /
`npm` / `archive` / `command`.

CLI: `claude plugin marketplace add <owner/repo|url|path>` · `claude plugin install <p>@<m>` ·
`claude plugin enable <p>@<m>` · `claude plugin validate <path> [--strict]` ·
`claude --plugin-dir ./plugins/handoff-os` (local dev) · `/reload-plugins`.

---

## 14. CLAUDE.md

| Fact | Detail |
|---|---|
| Load order | managed (`%ProgramFiles%\ClaudeCode\CLAUDE.md`) → `~/.claude/CLAUDE.md` → `./CLAUDE.md` or `./.claude/CLAUDE.md` → `./CLAUDE.local.md`. **Concatenated, never overridden.** |
| `AGENTS.md` | *"Claude Code reads `CLAUDE.md`, not `AGENTS.md`."* Bridge with `@AGENTS.md` at the top of CLAUDE.md — the recommended route on Windows, where symlinks need Administrator or Developer Mode. |
| Imports | `@path/to/file`, relative to the importing file, **max 4 hops**. Expanded at launch → **imports do not save context.** |
| Deferred loading | `.claude/rules/*.md` with `paths:` frontmatter load only when Claude touches matching files. Skills load only on invocation. |
| Enforcement | **CLAUDE.md is context, not enforcement.** The docs say so. A hard block is `permissions.deny` + a `PreToolUse` hook. |

---

## 15. Auth — how to guarantee zero API credits

Precedence, **highest first**:

```
1 CLAUDE_CODE_USE_BEDROCK / VERTEX / FOUNDRY
2 ANTHROPIC_AUTH_TOKEN
3 ANTHROPIC_API_KEY
4 apiKeyHelper
5 CLAUDE_CODE_OAUTH_TOKEN
6 Anthropic profile / federation (ANTHROPIC_PROFILE)
7 /login subscription OAuth   <-- LAST. Everything above wins.
```

| Action | Why |
|---|---|
| Never set `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` anywhere — shell profile, `.env`, CI | With a subscription **and** a key present, *"the API key takes precedence once approved"*. In `claude -p` it is used with **no prompt at all**. |
| Never set `apiKeyHelper` or `CLAUDE_CODE_OAUTH_TOKEN` | Both outrank the subscription |
| Set `"forceLoginMethod": "claudeai"` | Restricts login to claude.ai |
| Check `/status` | `Login method` row = subscription. An `API key` row appearing = credits are being spent. A `Profile` row = a leftover Anthropic profile is selected, which also disables claude.ai connectors and `/schedule`. |
| Credentials file | Windows `%USERPROFILE%\.claude\.credentials.json`, or under `CLAUDE_CONFIG_DIR` |

Source: <https://code.claude.com/docs/en/authentication.md>

---

## 16. Two accounts on one machine

| Surface | Mechanism | Verified |
|---|---|---|
| Claude Code CLI / desktop terminal | `CLAUDE_CONFIG_DIR` → two directories, each with its own settings, session and auth | VERIFIED — <https://code.claude.com/docs/en/claude-directory> |
| Cowork · Claude Design | **No local switch exists.** They follow the claude.ai account signed into the app. Two accounts = log out / in, or two OS or browser profiles | VERIFIED |

---

## 17. UNVERIFIED — do not build on these

| Claim | Needs |
|---|---|
| `PostToolUse` receives `tool_response` | `claude --debug` on a live hook |
| `stopReason` / `suppressOutput` placement | a per-event doc table |
| A subagent `tools:` allowlist re-granting a `deny`-blocked tool | doc statement |
| HKLM/HKCU registry route for managed settings on Windows | key names and value format |
| `forceLoginMethod: "claudeai"` in **user** settings failing closed on a stray API key | doc statement — only documented together with `forceLoginOrgUUID` |
| `claude plugin eval` | early access, per organisation. Not enabled here. Use `claude plugin validate` |
