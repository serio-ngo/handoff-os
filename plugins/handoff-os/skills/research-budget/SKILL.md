---
name: research-budget
description: "Use before dispatching a subagent — picks the cheapest sufficient actor inside the enforced caps."
license: Apache-2.0
---

| Task shape | Actor | model |
|---|---|---|
| Deterministic — lint, shape, drift, syntax | script | none |
| Find a file, symbol or value · read one page | `scout` agent | haiku |
| Run a repo command for its verdict | `runner` agent | haiku |
| Research needing synthesis · code to a spec with a check | subagent | sonnet |
| Architecture, sequencing, deciding what ships | main session | — |

| Enforced by `scripts/guard.mjs` | Value |
|---|---|
| Subagents per wave | 3, `HANDOFF_MAX_PER_WAVE`; the next one waits for the next wave |
| Denied subagent models | `HANDOFF_DENY_SUBAGENT_MODELS`, default `opus,fable` |
