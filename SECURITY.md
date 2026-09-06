# Security

This plugin runs shell commands automatically, on your machine, in every session. Review them before
installing — short, dependency-free, unminified:

```bash
cat plugins/handoff-os/hooks/hooks.json
cat plugins/handoff-os/scripts/*.mjs
npm test
```

Report vulnerabilities via GitHub private vulnerability reporting (**Security → Report a vulnerability**),
never a public issue, never with live credentials. First response within 7 days.

## Scope

| Covered | Excluded |
|---|---|
| A policy gate on the agent's own tool calls: a `PreToolUse` hook exits 2 and the call never runs | A sandbox. No confinement of already-written code, spawned processes, or a connector's own network calls |
| Accident and drift — the model reaching for a send, push, payment or deletion | An adversary who controls the prompt. Pattern matching does not withstand obfuscation |
| A local append-only record of writes | A tamper-evident ledger. It is plain JSONL |

Run it alongside OS permissions and `permissions.deny`, never instead of them.

## Known gaps

| Gap | Status |
|---|---|
| The shell matcher anchors at the **command position** of each quote-aware segment — a command assembled at runtime or passed to a non-shell interpreter is not matched | By design. `bash -c` payloads are re-inspected, two levels deep |
| `powershell -EncodedCommand <base64>` payloads are not decoded | Open, pinned by a test |
| Scripts the agent writes and a human later runs are not inspected | By design. The gate covers tool calls, not the filesystem |
| Connector actions with no outward verb in the name are not classified | Open |

An event rename or payload-field removal leaves the guard silently inactive. `npm test` fires every hook
against a representative payload and asserts exit codes — re-run it after every Claude Code update.
