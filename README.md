# Handoff OS

Your agent does the work. You keep every outward action.

Built for the solo founder or micro-startup running on one flat subscription. Deterministic
hooks cut token waste, cap subagent spend, verify every done-claim, and refuse outward actions —
so the bill never leaves the subscription fee and nothing ships unproven.

[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![license: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

## Install

Node.js 22 or newer. No dependencies.

```bash
git clone https://github.com/serio-ngo/handoff-os
cd handoff-os
npm run setup
```

Restart Claude Code when done. `npm run doctor` re-checks any time.

## What it enforces

One hook runs before guarded tool calls and can refuse them. Nothing here is advice.

| Guard | What it stops | What you see |
|---|---|---|
| Egress lock | Send, pay, submit, publish, push, delete, or configure an API key — in the shell and on every connector, matched by verb | `EGRESS LOCK: blocked…`, and the call never runs |
| Read budget | Re-reading a file unchanged since this session read it | `READ BUDGET: …unchanged and already in context` |
| Whole-file limit | Reading a file over 24KB without `offset`/`limit` | `READ BUDGET: …over the 24KB whole-file limit` |
| Fan-out cap | A fourth subagent in one wave, including ten launched at once | `FAN-OUT CAP: subagent 4 of a wave capped at 3` |
| Dispatch budget | A subagent with no model named, or opus without a `QUALITY:` flag | `EGRESS LOCK: blocked an opus subagent (law 8)` |
| Scout contract | A subagent return with no `file:line`, URL or `UNVERIFIED` tag | `SCOUT CONTRACT: …nothing in it can be checked` |
| Verify gate | A "done" claim with no run behind it | `Verify gate: you claimed done with no evidence` |

`PostToolUse` appends a receipt per write to `audit/YYYY-MM.jsonl`. `SessionStart` prints a ≤20-line
operating card, so no session has to read a document first.

## What it saved you

When a response ends having kept anything out of context, the terminal gets one line — and nothing at
all when every figure is zero:

```text
HANDOFF OS · agents 4 · blocked 2 · cache hits 51,000 tok · re-reads 3 · sliced 2 · ~10,000 tok saved
```

| Figure | Means |
|---|---|
| `agents` | subagents dispatched, each one reading in its own context instead of yours |
| `blocked` | outward actions and over-budget dispatches the guard refused |
| `cache hits` | prompt-cache tokens read back, straight from the transcript's own `usage` |
| `re-reads` | reads of a file unchanged since this session read it — via `Read` **or** a bare `cat` |
| `sliced` | whole-file reads over 24KB sent back for an `offset`/`limit` slice |
| `tok saved` | bytes those re-reads would have put back into context, over four |

The running history lands in `audit/YYYY-MM.jsonl` as a `read-budget` row. For the full picture across
a week, including how much work went to subagents instead of your context:

```bash
npm run benchmark
```

Per-session state lives in one gitignored `.claude/.session-<id>.json`.

## Tiers

| Tier | Action | Agent behaviour |
|---|---|---|
| GREEN | reversible, inside the repo | act |
| YELLOW | writes outside the repo, reversible | act, append one audit line |
| RED | sends, pays, submits, publishes, or is irreversible | stop, emit a handoff card |

Anything built on untrusted input — a fetched page, an email body, a connector payload — escalates one
tier.

## Modes

| Mode | Git | Command |
|---|---|---|
| Dev (default) | commit and push are blocked | `npm run sync` |
| Cowork | the agent may commit and push | `npm run sync -- --without git` |

Cowork installs from a git URL only: push your fork, run `npm run cowork`, then add it under
Cowork → Customize → Add plugin.

A connector tool the verb lock trips on? `HANDOFF_MCP_ALLOW=action_name` (comma-separated) admits
the named actions and nothing else.

## Your org facts

`config/memory.md` is plain free text the agent reads and writes itself. No schema, no setup questions.
Empty or missing is valid — then the agent asks you. Gitignored, so it never reaches a remote.

## Skills

| Skill | Answers |
|---|---|
| `/handoff-os:task-loop` | "Turn this into a tracked item, prepare the artefacts, name the approval clicks" |
| `/handoff-os:plan-session` | The document contract — one decided path per row, each external claim sourced |
| `/handoff-os:research-budget` | The cheapest sufficient actor, from a table, before any fan-out |

Three is the ceiling, enforced by the suite. The durable-notes rule and the three-line handoff card
moved into the session card, where they cost nothing extra. Full load inventory: [docs/MANIFEST.md](docs/MANIFEST.md).

## Limits

A policy gate on tool calls, not a sandbox. It does not confine already-written code, spawned processes,
or a connector's own network calls. Run it *with* OS permissions and `deny` rules, not instead of them —
[SECURITY.md](SECURITY.md).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). Maintained by Serio NGO, Poland. No telemetry, no paid tier, no
accounts. Licensed under [Apache-2.0](LICENSE).
