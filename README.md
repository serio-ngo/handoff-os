# handoff-os

A Claude Code plugin that blocks tool calls. Hooks run before and after each call and can stop it.
No model calls, no API keys, no telemetry, no runtime dependencies. Requires Node.js 22 or later.

[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![license: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

## What it blocks

| Rule | Blocked |
|---|---|
| Egress | Shell commands and connector calls that send, publish, pay or deploy. |
| Delete | Git merges, deletions and history rewrites. Shell `rm` and `Remove-Item`. |
| Secrets | API keys, OAuth tokens and account numbers written to tracked files, including via shell redirect. |
| Read budget | Re-reads of unchanged files, whole-file reads over 24 KB, reads past a 500 KB session ceiling. |
| Query budget | A Grep or Glob already answered this session. |
| Fan-out | A fourth subagent in one wave. |
| Dispatch | A subagent dispatch that names no model tier. |
| Verify | A claim that work is done when no verification command ran this turn. |

A blocked call exits 2 and prints the reason on stderr, which Claude reads and can act on. Nothing
else is intercepted. At the end of a turn the session prints one line, for example
`HANDOFF OS · ~10.0k tok saved · 11 guard actions`.

## Install

```text
/plugin marketplace add serio-ngo/handoff-os
/plugin install handoff-os@serio-ngo
```

Restart Claude Code. The hooks load on the next session.

## Configuration

Optional environment variables, set in `~/.claude/settings.json` under `env` or in the shell:

| Variable | Effect |
|---|---|
| `HANDOFF_STATS=1` | Print the summary line after every reply. |
| `HANDOFF_LOCK_GIT=1` | Block all state-changing git commands, including commits. |
| `HANDOFF_MCP_ALLOW=action,action` | Allow named connector actions that the egress lock would block. |
| `HANDOFF_DENY_SUBAGENT_MODELS=model,model` | Deny these model tiers for subagents. Default: `opus,fable`. |
| `HANDOFF_OS_DIR=/path` | Store session state and audit files outside the project directory. |

The plugin also ships three skills (`task-loop`, `research-budget`, `plan-session`) and one read-only
subagent (`scout`). User facts are stored in `config/memory.md`, which is gitignored.

## Commands

Clone the repository to get these. Permission rules cannot ship inside a plugin, so `settings/policy.json`
holds one `deny` list and `sync` projects it into three layers: `user` (`~/.claude/settings.json`, plus
`ask` and subscription login), `project` (a repository's `.claude/settings.json`) and `managed` (the
administrator path, plus `disableBypassPermissionsMode`).

| Command | Effect |
|---|---|
| `npm run setup` | Personalise `config/memory.md` and project the policy into all three layers. |
| `npm run sync` | Re-project the policy. Removes the git lock if it was set. |
| `npm run sync -- --lock git` | Add the `lock.git` deny bundle and set `HANDOFF_LOCK_GIT=1`. |
| `npm run sync -- --without <token>` | Drop every policy rule containing that token, for connectors you do not use. |
| `npm run install:plugin` | Install this checkout into the plugin cache at its declared version. |
| `npm run doctor` | Check that the installed copy is this checkout and that its guard still blocks. |
| `npm test` | Run the suite. |
| `npm run upkeep` | Regenerate `docs/MANIFEST.md`, the version and the content stamp. |
| `npm run release patch "note"` | Suite, version bump, manifest, changelog. |
| `npm run benchmark` | Token usage report across this project's transcripts. |

Merge and delete stay denied in both git modes. Security rules go in `deny`, never `allow`, because
`allow` does not apply before the workspace trust dialog.

## Limits

This is a policy gate on tool calls, not a sandbox. Shell matching is pattern-based and can be
evaded. Use it alongside operating system permissions and Claude Code `permissions.deny` rules, not
instead of them. Scope and known gaps: [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE). Maintained by Serio NGO, Poland. Contributions:
[CONTRIBUTING.md](CONTRIBUTING.md).
