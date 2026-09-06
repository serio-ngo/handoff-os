# Handoff OS

Your agent does the work. You keep every outward action.

A Claude Code plugin for people paying one flat subscription and feeling it. Deterministic hooks —
no model, no API key, no telemetry, no dependencies — that cut token waste and stop the agent one
step before anything irreversible.

[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![license: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

## Why

Long agent sessions fail in three boring ways, over and over.

- **They re-read.** The same file, unchanged, four times in one session — each time at full price.
- **They over-hire.** Ten subagents at once, each on the expensive model, each reading the same tree.
- **They over-reach.** "Done" with nothing run behind it, or a draft that turns into a sent email.

None of that needs judgement to catch. It needs a rule that runs before the tool call. That is the
whole product.

## Use cases

| You have hit this | What now happens |
|---|---|
| A 40KB file read whole, six times, one line needed | Second read refused — take an `offset`/`limit` slice |
| Ten subagents launched in one breath | Wave capped at 3, you read the returns before the next wave |
| A one-line lookup dispatched to the most expensive model | Dispatch refused unless the prompt earns it |
| "All done!" — and the suite was red | The turn will not end until a real run passes |
| A drafted email that quietly got sent | Send blocked; you get a three-line card naming the click |
| A merge run on the wrong branch at 1am | Merges and deletes never leave your hands |
| A scraped page landing whole in context | Routed to a cheap scout that returns cited lines |

## Install

Node.js 22+. In Claude Code:

```text
/plugin marketplace add serio-ngo/handoff-os
/plugin install handoff-os@serio-ngo
```

Restart. That is the whole setup — the hooks ship inside the plugin and start working on the next
session. Nothing to configure, no file to edit, no key to paste. Per-session state lands in your
project's `.claude/`, receipts in `audit/YYYY-MM.jsonl`.

To try it for one session without installing, from a clone:

```bash
claude --plugin-dir plugins/handoff-os
```

## What it enforces

One hook runs before guarded tool calls and can refuse them. Nothing here is advice.

| Guard | What it stops |
|---|---|
| Egress lock | Send, pay, submit, publish, deploy — in the shell, in an interpreter one-liner, and on every connector |
| Delete lock | Merges, deletions and history rewrites, in git and in the shell |
| Secret lock | Writing a metered credential or a bank account number, or touching env files, keys and brand assets — via `Write` **or** a shell redirect |
| Read budget | Re-reading a file unchanged since this session read it, via `Read` or a bare `cat` |
| Whole-file limit | A file over 24KB read without `offset`/`limit`; 500KB total per session |
| Query budget | An identical Grep/Glob already answered, or a content Grep with no `head_limit` |
| Fan-out cap | A fourth subagent in one wave |
| Dispatch budget | A subagent naming no model, or opus without a `QUALITY:` flag |
| Scout contract | A subagent return with no `file:line`, URL or `UNVERIFIED` tag |
| Verify gate | A "done" claim with no run behind it |

`SessionStart` prints a ≤20-line operating card, so no session has to read a document first.

## What you get back

When a turn ends having kept anything out of context, you get one line — and nothing at all when
there is nothing to report:

```text
HANDOFF OS · ~10.0k tok saved · 11 guard actions
```

| Figure | Means |
|---|---|
| `tok saved` | bytes the refused re-reads and forced slices would have put back into context, over four |
| `guard actions` | every intervention this session, cumulative: blocks, refused re-reads, forced slices, subagents sent to read elsewhere |

`npm run benchmark` prints the week from your transcripts: main context vs subagents, the delegation
ratio, and what the guard kept out.

## Options

All optional. Set them in `~/.claude/settings.json` under `env`, or in your shell.

| Set | To get |
|---|---|
| `HANDOFF_STATS=1` | the running total pinned to the end of every reply, not just the terminal |
| `HANDOFF_LOCK_GIT=1` | no git write at all — reads still work |
| `HANDOFF_MCP_ALLOW=action,action` | admit named connector actions the verb lock trips on, and nothing else |
| `HANDOFF_OS_DIR=/path` | keep the ledger, receipts and `config/memory.md` somewhere other than the project |

**Merges and deletes are never delegated, in any mode.** They destroy work nobody can get back, so
they stay with you. Near-misses stay open: listing merges, listing branches, a soft reset and a dry-run
clean all still work.

## Tiers

| Tier | Action | Agent behaviour |
|---|---|---|
| GREEN | reversible, inside the repo | act |
| YELLOW | writes outside the repo, reversible | act, append one audit line |
| RED | sends, pays, submits, publishes, or is irreversible | stop, emit a handoff card |

Anything built on untrusted input — a fetched page, an email body, a connector payload — escalates
one tier.

## Skills

| Skill | Answers |
|---|---|
| `/handoff-os:task-loop` | "Turn this into a tracked item, prepare the artefacts, name the approval clicks" |
| `/handoff-os:research-budget` | The cheapest sufficient actor, from a table, before any fan-out |
| `/handoff-os:plan-session` | The document contract — one decided path per row, each external claim sourced |

Your own facts live in `config/memory.md` — plain free text the agent reads and writes itself, no
schema, gitignored, empty is valid. Full load inventory: [docs/MANIFEST.md](docs/MANIFEST.md).

## Limits

A policy gate on tool calls, not a sandbox. It does not confine already-written code, spawned
processes, or a connector's own network calls. Shell matching is pattern-based, and patterns lose to
a determined shell. Run it *with* OS permissions and `deny` rules, not instead of them —
[SECURITY.md](SECURITY.md).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). Maintained by Serio NGO, Poland. No telemetry, no paid tier, no
accounts. Licensed under [Apache-2.0](LICENSE).
