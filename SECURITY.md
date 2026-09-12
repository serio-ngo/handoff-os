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

| Scope | Rule |
|---|---|
| Surface | Claude Code plugin hooks only: `SessionStart`, `PreToolUse`, `Stop`; no effect in chat or on a surface that skips hooks |
| Shape | a pattern gate on tool calls, not a sandbox: code already written, processes already spawned and a connector's own network calls run unguarded |
| Strength | pattern matching, no defence against a deliberate route around it; pair it with OS permissions and Claude Code `permissions.deny` rules |
| Reproduce | `npm run benchmark:eval`; method in [docs/BENCHMARK.md](docs/BENCHMARK.md) |
