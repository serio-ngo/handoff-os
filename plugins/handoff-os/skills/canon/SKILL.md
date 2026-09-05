---
name: canon
description: "Answer org-fact questions from the public page set in setup plus the site footer — mission, goals, registry IDs, contact. Private facts (bank, people, contracts) are never stored anywhere readable: ask the owner. Use whenever anyone asks what the org is, what it stands for, or for registry IDs, address, bank or board. Public tier needs no connector, so it works on every account. Never answer an org fact from memory, training or a repo file. Not in either source, say NOT IN CANON and name who must publish it."
license: Apache-2.0
compatibility: Web read only. No connector and no account-specific store, so it behaves identically on every account and surface.
---

## 1. One readable home, one human

| Tier | Home | Holds | Reach |
|---|---|---|---|
| **1 PUBLIC** | the public URL from `config/org.json` + site footer | mission · goals · registry IDs · contact | `WebFetch`, **no connector** — every account, every surface, scheduled jobs |
| **2 PRIVATE** | **the owner, in the conversation** | bank · people · contracts · anything not fit to publish | ask — costs one question, needs nothing installed |

Run `node scripts/setup.mjs` to set the public URL. Read tier 1 first. Go to tier 2 **only**
when the question is money or named people — and tier 2 means *ask the owner*, not read a file.
Never source an org fact from this repo, a code repo, memory or training data.

## 2. Answer shape

1. Read the live source. Every time — no caching across turns.
2. Quote the value **and** the URL it came from.
3. Missing → §3. Never fill the gap from anywhere else.

## 3. NOT IN CANON — hard, no exceptions

| If | Say exactly |
|---|---|
| Tier 1 does not carry it | `NOT IN CANON. The owner must publish it on the public page.` |
| Money or people fact | `NOT IN CANON — private tier. I need <fact> from you; I do not read it from anywhere.` |
| Two published places disagree | `NOT IN CANON. Conflict: <A> says X, <B> says Y — the owner decides, then the source gets fixed.` |
| Source unreachable | `NOT IN CANON. <source> unreachable — retry, never answer from memory.` |

A wrong registry ID is a filing-error risk, not a convenience. Silence beats a guess.
