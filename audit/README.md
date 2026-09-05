# audit/

One append-only JSONL file per month, written by the `PostToolUse` hook — never manually, never by
the agent directly.

```json
{"ts":"…","actor":"main","tier":"GREEN","action":"Write","target":"…","result":"ok"}
```

| Field | Contents |
|---|---|
| `ts` | ISO 8601 timestamp, UTC |
| `actor` | `main`, or the subagent type that issued the call |
| `tier` | `GREEN` for writes inside the repository, `YELLOW` for external or connector-mediated writes |
| `action` | Tool name |
| `target` | File path, or the first 120 characters of the command |
| `result` | `ok` — the hook executes after the tool, recording that the call completed |

The ledger is excluded from git: it records what the agent did on the operator's machine and is not part of
the software. Append-only status is conventional, not cryptographic — see [SECURITY.md](../SECURITY.md).
