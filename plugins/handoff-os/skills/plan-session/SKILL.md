---
name: plan-session
description: "Contract for repo plans and specs — WHAT/WHERE/WHY/WHEN/DONE plan rows and ID/RULE/VALUE/SOURCE/CHECK spec rows, one decided path per row, every external claim sourced or tagged UNVERIFIED. Use when writing or updating a plan or spec in a repo."
license: Apache-2.0
compatibility: No external dependencies. Repo plans and repo specs only — not org ops, not tracker work.
---

## 1. A repo-local contract always wins — check first

| Target | Use |
|---|---|
| Org ops — tasks, filings, deadlines, anything in the tracker | `/handoff-os:task-loop`, never this skill |
| Any repo with its own `AGENTS.md`/`CLAUDE.md` planning section | that file — a repo-local contract always wins |
| Repo plan or repo spec with no local contract | this skill |

- Never import another repo's format into this plan.

## 2. Pick the shape before the first line

| Document answers | Shape | Row |
|---|---|---|
| "what do we do, in what order" | **plan** | §3 |
| "what is true, what is binding" | **spec** — PRD, ADR, content model, architecture | §4 |

- A file may hold both, never blurred: spec sections state law, plan sections state work.

## 3. The plan task row

| Column | Rule |
|---|---|
| WHAT | one imperative line naming the actual edit. No "improve", no adjectives |
| WHERE | real path, this repo, line range if known. Never a placeholder |
| WHY | one clause on why it matters now. Not a restatement of WHAT |
| WHEN | a day, a week or a trigger. Never "soon" or "TBD" |
| DONE | the exact check that proves it — runnable or greppable. Never "looks good" |

- State net LOC intent per section (`+40/-10 net +30`); size veto before writing.

## 4. The spec row

| Column | Rule |
|---|---|
| ID | stable, `PREFIX-NN`. Other files cite the ID, never a section number |
| RULE | one declarative line. Present tense. No narrative, no first person |
| VALUE | the binding number, string, enum or path. Never a range unless the range is the rule |
| SOURCE | a repo path for internal law, a **URL + retrieval date** for anything external, or `UNVERIFIED` |
| CHECK | how a reader proves the product still obeys it — greppable, runnable, or a named manual test |

- A spec table stating an external fact with no SOURCE column is malformed: delete or source it.

- Every technical choice carries: picked · rejected · custom LOC · client kB · SOURCE.

## 5. Where facts may come from

| Claim is about | Only acceptable source |
|---|---|
| This repo's code, design or content | the file path, with a line range |
| Your organisation | `config/memory.md`, never from training |
| The outside world — law, prices, APIs, library behaviour, market data | a **primary source URL plus the date it was read** |
| Anything you could not confirm | the literal tag `UNVERIFIED`, kept in the deliverable |

- A repo document sources facts about that repo only. Committed reports are input, not evidence: re-verify external claims or tag `UNVERIFIED`.

## 6. Decide — do not defer

| Situation | What the document must contain |
|---|---|
| You have enough to decide | the decision, plus the condition that would reverse it |
| Genuinely the owner's call | one row: the question · who decides · what it blocks · **the default that ships if nobody answers** |
| Blocked on a fact you cannot get | the row above, plus what you tried |

- Banned: open questions with no defaults · `TBD`/`later` · deferring what the brief asked to settle.

## 7. Prior art before custom code

- Before any row proposes a script, helper or abstraction, search for an existing tool; the row states the package or built-in with its docs URL, or why none fits, in one clause.

## 8. Register — how both shapes are written

| Rule | Meaning |
|---|---|
| Improve in place | edit the existing file — never a parallel `_v2` or `_new` |
| No speculative abstraction | no config layer the document does not need today |
| Scope | name which stated goal each row serves. Inferred-but-unasked work goes in an out-of-scope note |
| Length | more than two lines of prose becomes a table |
| Banned | first person · options surveys · thinking-process sections · closing summaries · hedge words · rhetorical questions · emoji |
