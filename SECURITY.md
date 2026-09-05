# Security

This plugin installs hooks that execute shell commands automatically, on the operator's machine, in every session.
Review them before installation. They are intentionally short, dependency-free, and unminified to permit audit.

```bash
cat plugins/handoff-os/hooks/hooks.json
cat plugins/handoff-os/scripts/*.mjs
npm test
```

## Reporting a vulnerability

Use GitHub private vulnerability reporting: **Security → Report a vulnerability**.
Do not open a public issue, and never include tokens, account names, or live credentials in a report.

| Commitment | Timeframe |
|---|---|
| First response | Within 7 days |
| Fix or documented decision not to fix | Within 30 days for any bypass of outward-action protection |
| Credit | In `CHANGELOG.md`, unless anonymity is requested |

## Scope

| Covered | Explicitly excluded |
|---|---|
| A policy gate on the agent's own tool calls. A `PreToolUse` hook exits 2 and the call does not execute. | A sandbox. No confinement of previously written code, spawned processes, or a connector's independent network calls. |
| Protection against accident and drift — the model reaching for a send, push, payment, or deletion. | Protection against an adversary controlling the prompt. Pattern matching does not withstand obfuscation, and shell syntax admits more encodings than any expression list enumerates. |
| A local append-only record of writes. | A tamper-evident ledger. The file is plain JSONL and editable with any text editor. |
| A billing guarantee for the configured account: with no API credential present, work bills against the subscription. | A guarantee that no credential can exist anywhere. The tooling refuses to write credentials and blocks the standard assignment paths; it cannot inspect shell profiles it never loads. |

Operate alongside operating-system permissions and Claude Code `permissions.deny` rules, not instead of them.
Layer order, weakest last: managed settings → `permissions.deny` → these hooks → skill rules.

## Known gaps

| Gap | Status |
|---|---|
| `powershell -EncodedCommand <base64>` payloads are not decoded | Open. A regression test asserts this gap so it cannot be overlooked. |
| Scripts written by the agent and executed later by a human are not inspected | By design. The gate covers the agent's tool calls, not the filesystem. |
| Connector actions without an outward verb in the name are not classified | Open. The guard matches verbs; a server naming `send` differently is not matched. |
| A hook that throws exits 0 and fails open | Deliberate for unreadable payloads, so a malformed event cannot disable a session. Unparseable *shell* payloads fail closed. |

## Hook contract changes

The hazardous failure mode is silent: an event renamed or a payload field removed, leaving the guard
permanently inactive. `npm test` exercises every hook against a representative payload and asserts exit
codes, so a contract change surfaces as a failing suite rather than an unguarded session. Re-run the suite
after every Claude Code update.

## Project standards

| Rule | Enforcement |
|---|---|
| No organisation data, secrets, or personal identifiers in git | Test suite scans every tracked file |
| No API credential written to settings | `scripts/sync-settings.mjs` refuses the write and exits without changes |
| No runtime dependencies, eliminating supply-chain exposure | `package.json` declares no `dependencies` and no `devDependencies` |
| CI actions pinned to major tags and updated deliberately | `.github/dependabot.yml` |
