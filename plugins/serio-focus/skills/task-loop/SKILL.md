---
name: task-loop
description: "Use for add-a-task, break-it-down, or any named company job in the tracker."
license: Apache-2.0
compatibility: Needs a tracker and doc store. Email read and draft only — never sends.
---

- Tracker, doc store, design tool: whatever `memory.md` records.
- Never assume a vendor.

## 1. The loop

| Step | Action |
|---|---|
| 1. CAPTURE | Create the tracked item: title + one-line goal. YELLOW — do it, append one audit line. |
| 2. BREAK | Read the item plus `config/memory.md`, only what the step needs. Split into ≤5 steps, each owned AI or human. |
| 3. PREPARE | Draft every AI-owned artefact: doc in the doc store, draft email (never sent), checklist on the item. |
| 4. HANDOFF | Draft every AI-owned step first, reconsider each denial once at a cheaper tier or smaller scope, then one handoff card at the final state — DONE / FILE / YOU, three lines. Shape every reply per the `focus` output style. Update the item status. Never stop mid-work to ask. |

## 2. Step ownership

| Step type | Owner |
|---|---|
| Draft, calculate, fill, check, summarise | AI |
| Sign, send, pay, submit, publish | Human — RED |
| File, register, confirm with a third party | Human — RED |

## 3. Never

| Never | Because |
|---|---|
| Send, submit, pay, publish | RED — human only, no exceptions |
| Leave a RED action out of the final card | List every outstanding RED action in the final card |
| Add a step no artefact or click closes | Nothing proves it done |
| Research past the live sources and one source URL | Depth is out of scope — open a research task instead |

## 4. Tracker adapters — use the one `memory.md` records

| `tracker` value | CAPTURE and HANDOFF | When |
|---|---|---|
| a connector name | the connector's create-item and status-change calls | a tracker connector is attached |
| `github` | `gh project item-add` / `gh project item-edit` | code-first owner, no extra account |
| `markdown` | append to `TODO.md` (`- [ ]` / `- [x]`) | offline, zero dependencies |

## 5. Reply shape — every turn, any env

Follow the `focus` output style: action first, Done bullets, one Next, Step N of M.
