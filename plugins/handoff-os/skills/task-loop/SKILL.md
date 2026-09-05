---
name: task-loop
description: Turns one owner sentence into a tracked item, breaks a tracked item into concrete steps, prepares every artefact (doc in the doc store, draft email, checklist), and ends with a handoff card for the human-only clicks. Use whenever the owner says "add a task", "break it down", or names any company job (pay a contractor invoice, file a form, prepare a grant draft, organise an event).
license: Apache-2.0
compatibility: Needs a STATE tracker (monday by default — alternatives in §5) + a doc store. Email read/draft only — never sends.
---

## 1. The loop — four steps, no deliberation

| Step | Action |
|---|---|
| 1. CAPTURE | Create the tracked item (title + one-line goal). YELLOW — do it, append one audit line. |
| 2. BREAK | Read the item + live facts via `/handoff-os:canon` (only what the step needs). Split into ≤5 concrete steps, each with owner AI/human. |
| 3. PREPARE | Draft every AI-owned artefact: doc in the doc store, draft email (never send), checklist in the tracked item. |
| 4. HANDOFF | One `handoff-card` per human click. Update the item status. Stop. |

## 2. Step ownership — decided, not discussed

| Step type | Owner | Example (vendor invoice) |
|---|---|---|
| Draft, calculate, fill, summarise | AI | invoice check, totals, due-date table |
| Sign, send, pay, submit, publish | Human (RED) | approval, payment before the due date |
| File, register, confirm | Human (RED) | records entry, accountant handoff |

## 3. Worked example — vendor invoice

| Step | Owner | Output |
|---|---|---|
| tracked item `Invoice: vendor INV-2026-09` | AI | item + due date |
| Invoice check (amount, IBAN, due date, contract ref) | AI | doc store / Finance / INV-2026-09_checked.pdf |
| Totals + late-fee check | AI | same doc, §2 |
| Draft email to accountant | AI | email draft, never sent |
| Approve + pay → bank → by the due date | Human | handoff card |

## 4. Never

| Never | Because |
|---|---|
| Send, submit, pay, publish | RED — human-only, no exceptions |
| Skip the handoff card when a human click remains | The card is the whole output the owner scans |
| Add a step no artefact or click closes | A step without DONE is a wish |
| Research beyond live sources + one source URL | Depth is out of scope — open a research task instead |

## 5. STATE adapters — pick one, use it everywhere

| Adapter | CAPTURE / HANDOFF how | When |
|---|---|---|
| monday | MCP `create_item` / status change | default when the connector is attached |
| GitHub Projects | `gh project item-add` / `gh project item-edit` | code-first founder, no extra account |
| Local markdown | append to `TODO.md` (`- [ ]` / `- [x]`) | offline, zero dependencies |
