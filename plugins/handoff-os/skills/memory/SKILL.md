---
name: memory
description: "The owner's durable notes — facts, preferences, instructions to reuse across sessions. Use when owner context is needed; update it when the owner states something durable. Empty or missing is valid — then ask the owner."
license: Apache-2.0
compatibility: No external dependencies. Plain text, no schema, agent-writable.
---

`$HANDOFF_OS_DIR/config/memory.md` (installed copy: `memory.md` next to this skill) is plain free text.
No schema, no required keys, no approval flow.

1. Owner context needed → read it. Empty or missing → ask the owner directly.
2. Owner states something durable — a fact, a preference, an instruction → write it there yourself.
3. Never copy it into a tracked file. It is gitignored for a reason.
