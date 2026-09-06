# Security

This plugin installs hooks that execute shell commands automatically, on your machine, in every session.
Review them before installing. They are deliberately short, dependency-free and unminified.

```bash
cat plugins/handoff-os/hooks/hooks.json
cat plugins/handoff-os/scripts/*.mjs
npm test
```

## Reporting a vulnerability

GitHub private vulnerability reporting: **Security → Report a vulnerability**. Never open a public issue,
and never include tokens, account names or live credentials in a report.

| Commitment | Timeframe |
|---|---|
| First response | within 7 days |
| Fix, or a documented decision not to fix, for any bypass of outward-action protection | within 30 days |
| Credit | in `CHANGELOG.md`, unless you ask otherwise |

## Scope

| Covered | Explicitly excluded |
|---|---|
| A policy gate on the agent's own tool calls: a `PreToolUse` hook exits 2 and the call never runs | A sandbox. No confinement of already-written code, spawned processes, or a connector's own network calls |
| Accident and drift — the model reaching for a send, push, payment or deletion | An adversary who controls the prompt. Pattern matching does not withstand obfuscation |
| A local append-only record of writes | A tamper-evident ledger. It is plain JSONL, editable in any text editor |
| Billing: with no API credential present, work bills against the subscription | A guarantee no credential can exist anywhere. The tooling refuses to write one and blocks the standard assignment paths; it cannot inspect shell profiles it never loads |

Run it alongside OS permissions and `permissions.deny`, never instead of them. Layer order, weakest last:
managed settings → `permissions.deny` → these hooks → skill rules.

## Known gaps

| Gap | Status |
|---|---|
| The shell matcher anchors at the **command position** of each quote-aware segment | Deliberate. Substring matching blocked ordinary work — writing a permission rule, quoting a command in another language's source — and a guard that fails on legitimate work teaches operators to disable it. A command assembled at runtime, or passed to a non-shell interpreter, is therefore not matched. `bash -c` and `sh -c` payloads *are* re-inspected, two levels deep |
| `powershell -EncodedCommand <base64>` payloads are not decoded | Open. A regression test asserts this gap so it cannot be overlooked |
| Scripts the agent writes and a human later runs are not inspected | By design. The gate covers tool calls, not the filesystem |
| Connector actions with no outward verb in the name are not classified | Open. A server naming `send` differently is not matched |
| A hook that throws exits 0 and fails open | Deliberate for unreadable payloads, so a malformed event cannot disable a session. Unparseable *shell* payloads fail closed |

The hazardous failure mode is silent: an event renamed or a payload field removed leaves the guard
permanently inactive. `npm test` fires every hook against a representative payload and asserts exit codes,
so a contract change surfaces as a red suite rather than an unguarded session. Re-run it after every
Claude Code update.

## Project standards

| Rule | Enforcement |
|---|---|
| No organisation data, secrets or personal identifiers in git | the suite scans every tracked file |
| No API credential written to settings | `scripts/handoff.mjs` refuses the write and exits without changes |
| No runtime dependencies, so there is no supply chain | `package.json` declares none |
| CI actions pinned to major tags, updated deliberately | `.github/dependabot.yml` |
