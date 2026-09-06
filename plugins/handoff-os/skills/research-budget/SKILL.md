---
name: research-budget
description: "Picks the cheapest sufficient actor before any fan-out, and states the scope gate and per-agent budget a dispatch must carry. Use before dispatching any subagent, before any research, analysis or verification whose answer is not already in the repo, and whenever choosing which model and effort a delegated task gets. The 3-per-wave cap and the model rule are enforced by PreToolUse on the Agent tool."
license: Apache-2.0
compatibility: No external dependencies. The cap is enforced by scripts/guard.mjs on the Agent tool.
---

## 1. Profile — one line, decided first

| Profile | When | Posture |
|---|---|---|
| **DIRECT** | owner in the conversation | strong model stays here. Delegate the *work*, never the *thinking* |
| **ROUTINE** | scheduled jobs, monitors, unattended runs | cheap by default. Expensive only if the task line says `QUALITY: <writing\|creative\|legal\|security>` |

No flag means cheap. A routine that silently escalates itself is a budget leak nobody sees.

## 2. Actor table — read the row, do not deliberate

| Task shape | Actor | model | effort |
|---|---|---|---|
| Deterministic — lint, shape, drift, syntax, audit, budget check | **script** | none | none |
| Find a file, symbol, route, config, test · quote a known value · extract to a fixed schema · read one live page | **scout agent** | `haiku` (pinned in `agents/scout.md` — just call scout) | `low` |
| Web research needing synthesis · code to a spec with a runnable check | subagent | `sonnet` | `medium` |
| Review an implementation, plan or root-cause claim · security, money, personal data, legal, irreversible | subagent | `sonnet` | `high` |
| Prose you publish — grant narrative, board report | subagent | `opus` | `high` |
| Architecture, sequencing, deciding what ships | **main session** | — | — |

**Never delegate the decision.** A subagent proposes; the main session decides.
**A deterministic task never gets a model.** If a script can answer it, a model answering it is pure cost
with worse accuracy.

## 3. The only published numbers — the fan-out decision dominates

Verified against `anthropic.com/engineering/multi-agent-research-system` and `code.claude.com/docs/en/costs`,
2026-09-04. These figures live **here only** — do not restate them elsewhere.

| Fact | Figure |
|---|---|
| Subagent run vs one chat | **~4×** tokens |
| Multi-agent run vs one chat | **~15×** tokens |
| Agent Teams vs a standard session | **~7×** tokens |
| Token usage alone explains, of performance variance | **80%** |
| Prompt cache read vs input price | **~10%**, cache write **+25%** |

Deciding *whether* to fan out is worth more than every model and effort choice combined.
**Pays:** independent, parallel, read-heavy sweeps. **Does not:** shared mid-flight state — subagents cannot
talk while running, so a dependent chain re-derives context at every hop. Per-agent `model`/`effort`,
context isolation and compaction are documented cost controls with **no published effect size**.

## 4. Scope gate — write it before dispatching anything

- **DELIVERABLE:** one sentence naming what ships.
- **OUT OF SCOPE:** adjacent topics you will not research unless ordered.
- **SUB-QUESTIONS:** the minimum list. **This sets the agent count. Nothing else does.**

Cannot state the deliverable in one sentence? Ask. Do not dispatch. A document mentioning a topic is not an
instruction to research it — the owner's ask sets scope, source material never does.

## 5. Per-agent budget — every line goes in the prompt

| Cap | Value |
|---|---|
| Web calls | **10** unless the owner raises it |
| Tool calls | **15**, or **25** for a code fix with tests |
| Output | a stated **line count**, tables only, no preamble, no reasoning narration |
| Shape | the exact section headings you want back |
| model + effort | from §2 — state them, never default them |

Waves are sequential: launch → read → decide if another wave earns its cost. Scopes are disjoint — name each
agent's sources and say what the others own. Add a verifier only when the recommendation changes if the claim
is wrong. After any wave, one line: agents, model split, tokens, usable results.

Levers, in order: delegate the *reading* and keep the *deciding* · demand a line count back · fewer
sub-questions · read slices (`sed -n`, `grep -n`) not whole files · delete skills that never fire.
Do not spend context measuring context.
