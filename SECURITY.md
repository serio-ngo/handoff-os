# Security

This plugin runs shell commands automatically, on your machine, in every session. Review them before
installing — short, dependency-free, unminified:

```bash
cat plugins/handoff-os/hooks/hooks.json
cat plugins/handoff-os/scripts/*.mjs
npm test
```

Report vulnerabilities via GitHub private vulnerability reporting (**Security → Report a vulnerability**),
never a public issue, never with live credentials. First response within 7 days; outward-action bypasses
fixed or documented within 30 days.

## Scope

| Covered | Explicitly excluded |
|---|---|
| A policy gate on the agent's own tool calls: a `PreToolUse` hook exits 2 and the call never runs | A sandbox. No confinement of already-written code, spawned processes, or a connector's own network calls |
| Accident and drift — the model reaching for a send, push, payment or deletion | An adversary who controls the prompt. Pattern matching does not withstand obfuscation |
| A local append-only record of writes | A tamper-evident ledger. It is plain JSONL |
| Billing: with no API credential present, work bills against the subscription | A guarantee no credential can exist anywhere — shell profiles it never loads are out of reach |

Run it alongside OS permissions and `permissions.deny`, never instead of them.

## Known gaps

| Gap | Status |
|---|---|
| The shell matcher anchors at the **command position** of each quote-aware segment — a command assembled at runtime or passed to a non-shell interpreter is not matched | Deliberate. Substring matching blocked legitimate work and taught operators to disable the guard. `bash -c` payloads are re-inspected, two levels deep |
| `powershell -EncodedCommand <base64>` payloads are not decoded | Open. A test pins this gap so it cannot be overlooked |
| Scripts the agent writes and a human later runs are not inspected | By design. The gate covers tool calls, not the filesystem |
| Connector actions with no outward verb in the name are not classified | Open |

An event rename or payload-field removal leaves the guard silently inactive. `npm test` fires every hook
against a representative payload and asserts exit codes — re-run it after every Claude Code update.

No organisation data, secrets or identifiers in git (the suite scans for them). No runtime dependencies,
so no supply chain. CI actions pinned to major tags.
