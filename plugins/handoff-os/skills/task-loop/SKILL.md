---
name: task-loop
description: Turns one owner sentence into a tracked item, breaks a tracked item into concrete steps, prepares every artefact (doc in the doc store, draft email, checklist), and ends with a handoff card for the human-only clicks. Use whenever the owner says "add a task", "break it down", or names any company job (pay a contractor invoice, file a form, prepare a grant draft, organise an event).
license: Apache-2.0
compatibility: Needs the tracker and doc store named in setup. Email read and draft only — never sends.
---

The tracker, doc store and design tool are whatever `config/org.json` recorded. Never assume a vendor.

## 1. The loop — four steps, no deliberation

| Step | Action |
|---|---|
| 1. CAPTURE | Create the tracked item: title + one-line goal. YELLOW — do it, append one audit line. |
| 2. BREAK | Read the item plus live facts via `/handoff-os:canon`, only what the step needs. Split into ≤5 steps, each owned AI or human. |
| 3. PREPARE | Draft every AI-owned artefact: doc in the doc store, draft email (never sent), checklist on the item. |
| 4. HANDOFF | One `/handoff-os:handoff-card` per human click. Update the item status. Stop. |

## 2. Step ownership — decided, not discussed

| Step type | Owner |
|---|---|
| Draft, calculate, fill, check, summarise | AI |
| Sign, send, pay, submit, publish | Human — RED |
| File, register, confirm with a third party | Human — RED |

## 3. Never

| Never | Because |
|---|---|
| Send, submit, pay, publish | RED — human only, no exceptions |
| Skip the handoff card while a human click remains | The card is the whole output the owner scans |
| Add a step no artefact or click closes | A step without DONE is a wish |
| Research past the live sources and one source URL | Depth is out of scope — open a research task instead |

## 4. Tracker adapters — pick the one setup recorded, use it everywhere

| `tracker` value | CAPTURE and HANDOFF | When |
|---|---|---|
| a connector name | the connector's create-item and status-change calls | a tracker connector is attached |
| `github` | `gh project item-add` / `gh project item-edit` | code-first owner, no extra account |
| `markdown` | append to `TODO.md` (`- [ ]` / `- [x]`) | offline, zero dependencies |
