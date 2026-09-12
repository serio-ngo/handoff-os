# Security

| Review before install | Command |
|---|---|
| Hooks | `cat plugins/handoff-os/hooks/hooks.json` |
| Scripts | `cat plugins/handoff-os/scripts/*.mjs plugins/handoff-os/scripts/lib/*.mjs` |
| Suite | `npm test` |

| Report | Rule |
|---|---|
| Channel | GitHub private vulnerability reporting (Security, then Report a vulnerability) |
| Ban | no public issue; no live credentials |
| First response | within 7 days |

## Scope

| Boundary | Rule |
|---|---|
| Surface | Runs only where Claude Code executes plugin hooks (Claude Code CLI `SessionStart`, `PreToolUse`, `PostToolUse`, `SubagentStop`, `Stop`). No effect in chat or any surface that skips this hook path. |
| Shape | A policy gate on the agent's tool calls. It is not a sandbox. It does not confine code that was already written, processes the agent spawned, or network calls made by a connector itself. |
| Strength | Shell matching is pattern-based and does not hold against a determined adversary. Use it together with operating system permissions and Claude Code `permissions.deny` rules, not instead of them. |

| Check | Command |
|---|---|
| Reproduce | `npm run benchmark:eval` |
| Method, last run | [docs/BENCHMARK.md](docs/BENCHMARK.md) |
| After every Claude Code update | `npm test` — fires every hook against a representative payload; fails on changed event or field |
