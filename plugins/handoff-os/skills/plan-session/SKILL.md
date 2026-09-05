---
name: plan-session
description: "The document contract for repo work — implementation plans and specification documents (PRD, ADR, architecture, content model). Use when writing or updating either one inside a repo. A plan row carries WHAT / WHERE / WHY / WHEN / DONE. A spec row carries ID / RULE / VALUE / SOURCE / CHECK. One decided path per row, never an options menu, never a deferred decision. Every fact about the world outside this repo carries a primary-source URL and a retrieval date, or the tag UNVERIFIED — a document inside the repo is a source only for facts about that repo. Before planning custom code, search for an existing library and record what was found. For org ops tracked in the tracker use task-loop instead, never this skill."
license: Apache-2.0
compatibility: No external dependencies. Repo plans and repo specs only — not org ops, not tracker work.
---

## 1. A repo-local contract always wins — check first

| Target | Use |
|---|---|
| Org ops — tasks, filings, deadlines, anything in the tracker | `/handoff-os:task-loop`, never this skill |
| Any repo with its own `AGENTS.md`/`CLAUDE.md` planning section | that file — a repo-local contract always wins |
| Repo plan or repo spec with no local contract | this skill |

Never import another repo's format into this plan.

## 2. Pick the shape before the first line

| Document answers | Shape | Row |
|---|---|---|
| "what do we do, in what order" | **plan** | §3 |
| "what is true, what is binding" | **spec** — PRD, ADR, content model, architecture | §4 |

A file may hold both. It may not blur them: a spec section states law, a plan section states work.

## 3. The plan task row — the only shape

| Column | Rule |
|---|---|
| WHAT | one imperative line naming the actual edit. No "improve", no adjectives |
| WHERE | real path, this repo, line range if known. Never a placeholder |
| WHY | one clause on why it matters now. Not a restatement of WHAT |
| WHEN | a day, a week or a trigger. Never "soon" or "TBD" |
| DONE | the exact check that proves it — runnable or greppable. Never "looks good" |

State net LOC intent per section — "+40/-10 net +30" — so size can be vetoed before writing.

## 4. The spec row — the only shape

| Column | Rule |
|---|---|
| ID | stable, `PREFIX-NN`. Other files cite the ID, never a section number |
| RULE | one declarative line. Present tense. No narrative, no first person |
| VALUE | the binding number, string, enum or path. Never a range unless the range is the rule |
| SOURCE | where it comes from — a repo path for internal law, a **URL + retrieval date** for anything external, or `UNVERIFIED` |
| CHECK | how a reader proves the product still obeys it — greppable, runnable, or a named manual test |

A spec table that states an external fact and has no SOURCE column is malformed. Delete it or source it.

Every technical choice additionally carries: **what was picked · what was rejected · custom LOC · client kB · SOURCE**. A choice with no rejected alternative was not a choice.

## 5. Evidence law — where facts may come from

| Claim is about | Only acceptable source |
|---|---|
| This repo's code, design or content | the file path, with a line range |
| Your organisation as an organisation | `/handoff-os:canon` — live, never cached, never from memory |
| The outside world — law, prices, APIs, library behaviour, market data | a **primary source URL plus the date it was read** |
| Anything you could not confirm | the literal tag `UNVERIFIED`, kept in the deliverable |

**A document inside a repo is a source only for facts about that repo.** A report, brief, research note or postmortem committed here — however confident, however recent, whoever wrote it — is *input*, not evidence. Re-verify its external claims against their own sources, or carry them forward tagged `UNVERIFIED`.

Laundering is the failure this rule exists to stop: a claim enters as research, gets copied into a plan, and leaves as law, dropping its uncertainty at every hop. If a legal citation, a version number, a price or a statistic reaches a deliverable without a URL beside it, the document is wrong even when the number happens to be right.

## 6. Decide — do not defer

A spec exists to end questions. Parking one moves the work back to the owner and calls it progress.

| Situation | What the document must contain |
|---|---|
| You have enough to decide | the decision, plus the condition that would reverse it |
| Genuinely the owner's call | one row: the question · who decides · what it blocks · **the default that ships if nobody answers** |
| Blocked on a fact you cannot get | the row above, plus what you tried |

Banned: a section of open questions with no defaults · "to be decided later" · "when it stops being hypothetical" · any deferral of something the brief asked you to settle.

## 7. Prior art before custom code

Before any row proposes writing a script, a helper or an abstraction, search for an existing tool.

| The row must state | Example |
|---|---|
| the package or built-in that does this, with its docs URL | `lychee` — link checking in CI |
| or why none fits, in one clause | "no package models the seven-question record" |

Custom code the owner maintains forever is the most expensive thing a plan can propose. Reaching for it because writing it is immediately available, while finding the library costs one search, is the cheap action displacing the correct one.

## 8. Register — how both shapes are written

| Rule | Meaning |
|---|---|
| Improve in place | edit the existing file — never a parallel `_v2` or `_new` |
| No speculative abstraction | no config layer or interface the document does not need today |
| Scope | name which stated goal each row serves. Inferred-but-unasked work goes in an out-of-scope note, not the table |
| Length | a paragraph over two lines is a table that has not been written yet |
| Banned | first person · options surveys · a thinking-process section · a closing summary · self-assessment ("honest take", "the hard truth") · hedge words ("consider", "might want to", "probably") · rhetorical questions · emoji |

Length is not evidence of effort. A spec is measured by how fast a reader finds the binding value.

## 9. Closing ledger — mandatory, one line per task, last thing in the document

```
1 -> grep -rn "TODO" src/ returns 0 matches
2 -> npm run verify exits 0
```
