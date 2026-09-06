---
name: handoff-card
description: Emits the three-line handoff card you use whenever work stops at a human-only step. Use at the end of any task that prepared something a human must sign, send, submit, pay, or publish. The card is DONE / FILE / YOU on exactly three lines, nothing else. Mandatory for every RED-tier action (moves money, creates a legal obligation or public statement, is irreversible, or sends personal data outside the org).
license: Apache-2.0
compatibility: No external dependencies.
---

## 1. The card — exactly three lines

```
DONE   <what was prepared>
FILE   <path or link>
YOU    <one action> -> <where> -> <by when>
```

No line before, no paragraph after, no emoji. Not four lines, not two.

| Field | Rule |
|---|---|
| `DONE` | Past tense. What is finished and ready — never what is still missing |
| `FILE` | A real path or link openable right now — never "see above" |
| `YOU` | One verb, one destination, one deadline. An instruction, never a question |

## 2. Mandatory when the action

moves money · creates a legal obligation or public statement · is irreversible · sends personal data
outside the org. Any one is enough. Do not skip it because the task felt routine — routine is how a
RED-tier action gets missed. Do **not** use it for GREEN work: the card marks a stop, not an ending.

## 3. Example

```
DONE   Contractor invoice INV-2026-09 checked: amount, account number, due date
FILE   <doc store> / Finance / INV-2026-09_checked.pdf
YOU    Approve + pay -> bank -> by the due date on the invoice
```
