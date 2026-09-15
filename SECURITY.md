# Security

| Review before install | Command |
|---|---|
| Hooks | `cat plugins/serio-focus/hooks/hooks.json` |
| Scripts | `cat plugins/serio-focus/scripts/*.mjs plugins/serio-focus/scripts/lib/*.mjs` |
| Suite | `npm test` |

| Report | Rule |
|---|---|
| Channel | GitHub private vulnerability reporting (Security, then Report a vulnerability) |
| Ban | no public issue; no live credentials |
| First response | within 7 days |

## Scope

| Boundary | Rule |
|---|---|
| Surface | Runs only where Claude Code executes plugin hooks (Claude Code CLI `SessionStart`, `PreToolUse`, `Stop`). No effect in chat or any surface that skips this hook path. |
| Shape | A policy gate on the agent's tool calls. It is not a sandbox. It does not confine code that was already written, processes the agent spawned, or network calls made by a connector itself. |
| Strength | Shell matching is pattern-based and does not hold against a determined adversary. Use it together with operating system permissions and Claude Code `permissions.deny` rules, not instead of them. |

## Known gaps

<!-- measured 2026-09-14 against `plugins/serio-focus/scripts/guard.mjs`; each row is reproducible with the command below -->

| Gap | Probe | Verdict |
|---|---|---|
| No connector coverage. `judge()` has no `mcp__` branch, so every MCP call passes. | `mcp__gmail__send_message` | Allowed. |
| A binary name held in a shell variable is not resolved. | `X=rm; $X -rf docs` | Allowed. |
| A payload decoded inside a pipeline is not followed. | `echo … \| base64 -d \| bash` | Allowed. |
| An unquoted no-op flag used as a value suppresses the whole segment. | `curl -X POST -d --help` | Allowed. |

| Gap | Rule behind it |
|---|---|
| Connector calls | `guard.mjs` judges Read, Grep, Glob, spawn, shell and write tools only. Connector egress is left to Claude Code `permissions.deny` rules; `tooling/settings/policy.json` ships none for `mcp__`. |
| No-op flag | cost of `NO_OP_FLAG` in `plugins/serio-focus/scripts/lib/shell-danger.mjs` (`rm --help`, `npm publish --dry-run` stay unblocked); a quoted flag is still inspected |

| Check | Command |
|---|---|
| Reproduce a gap | pipe the probe as a `PreToolUse` payload into `plugins/serio-focus/scripts/guard.mjs`; empty stdout means allowed |
| Score the corpus | `npm run benchmark:eval` |
| Method, last run | [docs/BENCHMARK.md](docs/BENCHMARK.md) |
| After every Claude Code update | `npm test` — fires every hook against a representative payload; fails on changed event or field |
