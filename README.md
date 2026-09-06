# Handoff OS

Your agent does the work. You keep every outward action.

A Claude Code plugin for people running an organisation *and* a codebase on one subscription. The agent
drafts, checks and prepares. Sending, paying, submitting, publishing and pushing stay yours. Every file
write leaves a receipt. Every "done" needs evidence. No API key is ever configured, so the cost stays the
flat subscription fee.

[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![license: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![dependencies: none](https://img.shields.io/badge/dependencies-none-brightgreen)](package.json)

## Install

Node.js 22 or newer. No dependencies.

```bash
git clone https://github.com/serio-ngo/handoff-os
cd handoff-os
npm run setup
```

`npm run setup` does everything: asks three skippable questions, writes your permission policy into
`~/.claude/settings.json`, installs the plugin where sessions actually load it, and prints a **yes/no** row
per check. Restart Claude Code and you are done. Re-run `npm run doctor` any time. To protect another
repository too: `npm run sync -- --scope project --target <repo>/.claude/settings.json`.

Nothing to find and replace: the marketplace names itself, and the install points at whichever remote you
cloned. If you prefer to answer nothing, `npm run setup -- --yes`.

**Cowork** loads plugins from a git URL only, never a local folder. Push your fork, run `npm run cowork`
for the exact string and a blocker list, then add it in Cowork → Customize → Add plugin, per account.

## What is enforced

One hook runs before guarded tool calls and can refuse them. Nothing here is advice.

| Guard | What it stops | What you see |
|---|---|---|
| Egress lock | Send, pay, submit, publish, push, delete, or configure an API key — in the shell and on every connector, matched by verb | `EGRESS LOCK: blocked…`, and the call never runs |
| Read budget | Re-reading a file unchanged since this session read it | `READ BUDGET: …unchanged and already in context` |
| Fan-out cap | A fourth subagent in one wave | `FAN-OUT CAP: subagent 4 of a wave capped at 3` |
| Verify gate | A "done" claim with no run behind it | `Verify gate: you claimed done with no evidence` |

`PostToolUse` also appends a six-field receipt per write to `audit/YYYY-MM.jsonl`, without blocking.
`SessionStart` prints a ≤20-line operating card — planes, tiers, never-list, source pointers — instead of
making every session read a document.

## Your org facts

`config/org.json` holds pointers, never data, and every key is optional. A name and nothing else is a
complete configuration.

```json
{ "name": "Acme", "addressAs": "Sam", "sources": ["https://acme.example/about", "Company handbook"] }
```

A source is any document you point at — a public page, a shared doc, a wiki, a pinned message. The agent
reads them live, every turn. Anything money-shaped or naming a person is never stored or fetched: the agent
asks you. Nothing in a source and nothing from you means the agent says `NOT IN CANON` rather than guessing.

## Five skills

| Skill | Answers |
|---|---|
| `/handoff-os:canon` | "What is true about my organisation?" — read live from your sources, never from memory |
| `/handoff-os:task-loop` | "Turn this into a tracked item, prepare the artefacts, name the approval clicks" |
| `/handoff-os:handoff-card` | The three-line stop: `DONE` / `FILE` / `YOU` |
| `/handoff-os:plan-session` | The document contract — one decided path per row, each external claim sourced |
| `/handoff-os:research-budget` | The cheapest sufficient actor, from a table, before any fan-out |

Every skill description sits in context in every session. Five is the ceiling, enforced by the suite.
Full load inventory: [docs/MANIFEST.md](docs/MANIFEST.md).

## Check it yourself

| Claim | How to verify, in under a minute |
|---|---|
| Nothing is hidden | `cat plugins/handoff-os/scripts/*.mjs` — four files, unminified, no build step |
| Nothing is installed | `package.json` declares no dependencies. Node standard library only |
| Refusals are exercised | `npm test` — most cases assert that an action is **blocked** |
| Upkeep is automatic | Edit a plugin file, end the turn: the version bumps and the installed copy is replaced |
| No data collection | No telemetry, no network calls, no accounts. CI runs the suite on all three OSes |

## Limits

This is a policy gate on tool calls, not a sandbox. It does not confine code the agent already wrote,
processes it spawned, or a connector's own network calls. Run it *with* OS permissions and Claude Code's
`deny` rules, not instead of them. The shell matcher reads the command position of each segment, so a
command assembled at runtime or passed to a non-shell interpreter is not matched. The audit log is
append-only by convention, not cryptography. All of it: [SECURITY.md](SECURITY.md).

Portability: the skills and rules are Markdown, readable by any agent. Enforcement depends on the Claude
Code hook contract and has no equivalent elsewhere — see [docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md) §7.

## Built by a nonprofit

Handoff OS is maintained by **Serio NGO** (Fundacja Serio, Poland, <https://serio.org.pl>), built for one
operator on one subscription who cannot absorb a wrongly sent message. No telemetry, no paid tier, no
accounts, ever. A star or the [funding pointer](.github/FUNDING.yml) keeps maintenance going.

| Document | Contents |
|---|---|
| [docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md) | Planes, tiers, routing, egress layers, portability |
| [docs/MANIFEST.md](docs/MANIFEST.md) | Generated inventory of everything the plugin loads |
| [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md) | Claude Code identifiers, each with its source URL |
| [settings/README.md](settings/README.md) | The permission policy and how it projects into three layers |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Membership test, budgets, test conventions |
| [SECURITY.md](SECURITY.md) | Threat model, known gaps, reporting |

Licensed under [Apache-2.0](LICENSE).
