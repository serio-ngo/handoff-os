# Handoff OS

**Your agent does the work. You approve the outcome.**

A Claude Code plugin for founders and micro-teams running operations *and* code on a single
subscription. The agent drafts, checks, and prepares. You retain every outward action: send,
pay, submit, publish, and push. Every file write leaves a receipt. Every completion claim
requires evidence. No API key is configured at any point, so cost remains the flat
subscription fee.

[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![license: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![dependencies: none](https://img.shields.io/badge/dependencies-none-brightgreen)](package.json)

## Install

Requires Node.js 22 or newer (`node --version`). No dependencies — `package.json` lists none.
Tested on Linux, macOS and Windows.

```bash
git clone https://github.com/serio-ngo/handoff-os
cd handoff-os
npm run setup
npm test
npm run sync:settings -- --target ~/.claude/settings.json --dry-run
npm run sync:settings -- --target ~/.claude/settings.json
```

Restart Claude Code, then `npm run verify:install` — it reports **yes** or **no** for every row, and
fires all four enforcement hooks against a real payload. Full walkthrough: [docs/INSTALL.md](docs/INSTALL.md).

Fork-safe: the marketplace names itself and resolves to whichever remote you cloned from.
No hard-coded names require manual replacement.

## Uninstall

1. In `~/.claude/settings.json`, remove the marketplace entry, the plugin entry, and the rules
   the merge added — re-run step 3 of Install to see exactly which lines came from the templates.
2. Delete the marketplace clone and the plugin cache under `~/.claude/plugins/`.
3. Restart Claude Code.

## What is enforced

Four enforcement hooks run before or after the agent's tool calls. Three can refuse execution.

| Hook | What it blocks | What you see |
|---|---|---|
| Egress lock — `PreToolUse` | Send, payment, form submission, publication, push, deletion, or API key configuration — in the shell and on every connector, matched by verb. | `EGRESS LOCK: blocked…`; the call never executes |
| Read budget — `PreToolUse` | Re-reads of files unchanged since this session already read them. | `READ BUDGET: …already in this session's context` |
| Fan-out cap — `PreToolUse` | A fourth subagent in a single wave. Review the first three, then launch the next wave. | `FAN-OUT CAP: subagent 4 of a wave capped at 3` |
| Verify gate — `Stop` | A completion claim made without running the verification command. | `Verify gate: you claimed done with no evidence` |

In addition: `PostToolUse` appends a six-field receipt per file write to `audit/YYYY-MM.jsonl`
without blocking. `SessionStart` prints a 20-line operating card — planes, tiers, source
pointers — for approximately 300 tokens, replacing a full document read in every session.

## Spend and context caps

The subscription fee is fixed. Context consumption is not. These caps keep sessions efficient.

| Cap | Measured effect |
|---|---|
| Session card | Operating card delivered as ~20 lines (~285 tokens) instead of a full document read (~5,300) — measured 2026-09-05 |
| Read budget | Re-reads of unchanged files are refused; targeted slices with `offset`/`limit` remain permitted |
| Fan-out cap | Maximum 3 subagents per wave — a single subagent run costs ~4x a chat turn; a multi-agent run ~15x (Anthropic engineering and costs documentation, 2026-09-04) |
| Untrusted input | Content from fetched pages, e-mail bodies, or connector payloads escalates one autonomy tier; research sessions attach no write connectors, so injected instructions have no write surface to reach |

The first three are hook-enforced. The fourth is a stated rule — see
[docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md) §§3–4. Full figures: `/handoff-os:research-budget`.

## Demo: 40 seconds

Ask the agent to send anything. This transcript is the complete demonstration:

```
you:    send the invoice to our accountant
agent:  [blocked before anything runs]
EGRESS LOCK: blocked connector tool mcp__9f31…__send_message on pattern send - matched outward verb "send" - this is an outward action (leaves the org), the human performs it, not the agent.
DONE   Invoice INV-2026-09 checked: amount, IBAN, due date
FILE   Drive / Finance / INV-2026-09_checked.pdf
YOU    Approve + pay -> bank -> by the due date on the invoice
```

Worked end-to-end. Recording instructions: [docs/USE-CASES.md](docs/USE-CASES.md).

## Five skills

| Skill | Answers |
|---|---|
| `/handoff-os:canon` | "What is true about my organisation?" — read live from the configured public source, never from memory or a repository file |
| `/handoff-os:task-loop` | "Convert this request into a tracked item, prepare the artefacts, and specify the approval clicks" |
| `/handoff-os:handoff-card` | The three-line approval stop: `DONE` / `FILE` / `YOU` |
| `/handoff-os:plan-session` | The document contract — one decided path per row, each external claim with a source URL or the tag `UNVERIFIED` |
| `/handoff-os:research-budget` | The cheapest sufficient actor, selected from a table before any fan-out |

A skill description resides in context in every session whether or not the skill executes. Five is the
maximum, enforced by the test suite. See [docs/MANIFEST.md](docs/MANIFEST.md) for the full load inventory.

## Verifiable by design

Do not accept these claims on assertion. Verify each in under a minute:

| Claim | Verification |
|---|---|
| Nothing is hidden | `cat plugins/handoff-os/scripts/*.mjs` — approximately 460 lines total, unminified, no build step |
| Nothing is installed | `package.json` declares no `dependencies` and no `devDependencies`. Node standard library only |
| Refusals are exercised | `npm test` — full behaviour suite, the majority of cases asserting that an action is **blocked** |
| Cross-platform | CI executes the same suite on Linux, macOS, and Windows on every push |
| Limits are documented | [SECURITY.md](SECURITY.md) states the known gaps, including one the suite asserts intentionally |
| No data collection | No telemetry, no network calls, no accounts. The audit log is a local file under your control |

## Limitations

This is a policy gate on the agent's tool calls, not a sandbox. It does not confine code the agent
has already written, processes it has spawned, or a connector's independent network calls. Operate it
*with* operating-system permissions and Claude Code's `deny` rules, not instead of them. The audit log
is append-only by convention, not by cryptography. All limitations are stated in [SECURITY.md](SECURITY.md).

## Who it is for

Founders operating on a constrained budget, teams of one to five, single-operator nonprofits, and
freelance operators — running an organisation and a codebase on one subscription.
It assumes a work tracker, a document store, and a design tool; monday, Google,
and Canva are preconfigured, and `npm run setup` records your equivalents.

Connectors are optional. Omitting one removes its `ask` prompts without reducing protection:
the hook guard blocks every outward and destructive verb on any server, connected or not.
Filter at merge time with `npm run sync:settings -- --target <settings.json> --without canva,gmail`.

| Workflow | You say | The agent prepares | Your approval |
|---|---|---|---|
| Pay a contractor invoice | "add a task: pay INV-2026-09" | Tracked item, verified totals, draft e-mail | Approve and pay in the bank |
| Draft a grant application | "draft the FundX application" | Narrative and budget from live source facts | Review and submit in the portal |
| Triage the inbox | "triage today's inbox" | Summaries and draft replies; nothing sent | Send from your mail client |
| Ship code in a repository | Work as usual | Code, tests, and a completed `npm run verify` | Commit, push, merge |

Each workflow is covered end-to-end in [docs/USE-CASES.md](docs/USE-CASES.md).

Portability: the skills and operating rules are Markdown and transferable to any agent that reads
Markdown, including via `AGENTS.md`. Enforcement depends on the Claude Code hook contract and has
no equivalent elsewhere. No cross-platform parity is claimed — see
[docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md) §9.

## Built by a nonprofit

Handoff OS is developed and maintained by **Serio NGO** (a nonprofit foundation registered in Poland
as Fundacja Serio, <https://serio.org.pl>). It was built for operational use: one operator, one subscription, and
a foundation that cannot absorb an unexpected invoice or an erroneously sent message.

There will be no telemetry, no paid tier, and no accounts. A star and a
[funding pointer](https://github.com/serio-ngo/handoff-os/blob/main/.github/FUNDING.yml) support
continued maintenance.

## Documentation

| Document | Contents |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Step-by-step installation, each step self-verifying |
| [docs/USE-CASES.md](docs/USE-CASES.md) | Three reference workflows, the demo transcript, and recording instructions |
| [docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md) | Operating rules: planes, tiers, routing, egress layers |
| [docs/MANIFEST.md](docs/MANIFEST.md) | Generated inventory of everything the plugin loads |
| [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md) | Claude Code identifiers, each with its source documentation URL |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Membership test, budgets, and test conventions |
| [SECURITY.md](SECURITY.md) | Threat model, known gaps, reporting procedure |
| [SUPPORT.md](SUPPORT.md) | Support channels by request type |

Licensed under [Apache-2.0](LICENSE).
