# Security

The plugin runs shell commands automatically on your machine in every session. Review the code before
installing:

```bash
cat plugins/handoff-os/hooks/hooks.json
cat plugins/handoff-os/scripts/*.mjs
npm test
```

Report vulnerabilities through GitHub private vulnerability reporting (Security, then Report a
vulnerability). Do not open a public issue and do not include live credentials. First response within
7 days.

## Scope

The plugin is a policy gate on the agent's tool calls. It is not a sandbox. It does not confine code
that was already written, processes the agent spawned, or network calls made by a connector itself.
Shell matching is pattern-based and does not hold against a determined adversary. Use it together
with operating system permissions and Claude Code `permissions.deny` rules, not instead of them.

## Known gaps

- `powershell -EncodedCommand` payloads are not decoded.
- Shell `-c` / `-Command` and `cmd /c` payloads without quotes are not unwrapped.
- Connector actions whose names contain no outward verb are not classified.

Re-run `npm test` after every Claude Code update. It fires every hook against a representative
payload and fails if an event or payload field changed.
