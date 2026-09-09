---
name: research-budget
description: "Picks the cheapest sufficient actor — script, haiku scout, sonnet or opus — and sets the scope gate and per-agent budget before any fan-out. Use before dispatching any subagent or research. The 3-per-wave cap and model rule are enforced by hooks."
license: Apache-2.0
compatibility: No external dependencies. The cap is enforced by scripts/guard.mjs on the Agent tool.
---

## 1. Profile — one line, decided first

| Profile | When | Posture |
|---|---|---|
| **DIRECT** | owner in the conversation | strong model stays here. Delegate the *work*, never the *thinking* |
| **ROUTINE** | scheduled jobs, monitors, unattended runs | cheap by default. Expensive only if the task line says `QUALITY: <writing\|creative\|legal\|security>` |

- No flag means cheap.

## 2. Actor table

| Task shape | Actor | model | effort |
|---|---|---|---|
| Deterministic — lint, shape, drift, syntax, audit, budget check | **script** | none | none |
| Find a file, symbol, route, config, test · quote a known value · extract to a fixed schema · read one live page | **scout agent** | `haiku` (pinned in `agents/scout.md` — just call scout) | `low` |
| Web research needing synthesis · code to a spec with a runnable check | subagent | `sonnet` | `medium` |
| Review an implementation, plan or root-cause claim · security, money, personal data, legal, irreversible | subagent | `sonnet` | `high` |
| Prose you publish — grant narrative, board report | subagent | `opus` | `high` |
| Architecture, sequencing, deciding what ships | **main session** | — | — |

- Never delegate the decision: subagents propose, the main session decides.
- Deterministic tasks never get a model: a script answer costs less and is more accurate.

## 3. The only published numbers

- Source: `anthropic.com/engineering/multi-agent-research-system`, `code.claude.com/docs/en/costs`, 2026-09-04. Figures live here only.

| Fact | Figure |
|---|---|
| Subagent run vs one chat | **~4×** tokens |
| Multi-agent run vs one chat | **~15×** tokens |
| Agent Teams vs a standard session | **~7×** tokens |
| Token usage alone explains, of performance variance | **80%** |
| Prompt cache read vs input price | **~10%**, cache write **+25%** |

- Fan-out choice outweighs every model and effort choice combined.
- Pays: independent, parallel, read-heavy sweeps. Never: shared mid-flight state (subagents cannot talk while running; dependent chains re-derive context per hop).
- Per-agent `model`/`effort`, isolation, compaction: documented controls, no published effect size.

## 4. Scope gate — write it before dispatching anything

- **DELIVERABLE:** one sentence naming what ships.
- **OUT OF SCOPE:** adjacent topics you will not research unless ordered.
- **SUB-QUESTIONS:** the minimum list. **This sets the agent count. Nothing else does.**

- No one-sentence deliverable: ask, never dispatch. Owner ask sets scope; source material never does.

## 5. Per-agent budget — every line goes in the prompt

| Cap | Value |
|---|---|
| Web calls | **10** unless the owner raises it |
| Tool calls | **15**, or **25** for a code fix with tests |
| Output | a stated **line count**, tables only, no preamble, no reasoning narration |
| Shape | the exact section headings you want back |
| model + effort | from §2 — state them, never default them |

- Waves are sequential: launch → read → decide if another wave earns its cost. Scopes are disjoint: name each agent's sources and what the others own.
- Verifier only when the recommendation changes if the claim is wrong.
- Every dispatch receipts to the audit ledger; denied models (`HANDOFF_DENY_SUBAGENT_MODELS`, default `opus,fable`) never review, review is sonnet.
- Levers, in order: delegate reading, keep deciding · demand a line count back · fewer sub-questions · slices (`sed -n`, `grep -n`), never whole files · delete skills that never fire.
