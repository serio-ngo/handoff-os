# handoff-os

[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![license: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

## Why

Claude Code does what you asked, and then sometimes one thing more. It force-pushes to tidy the
branch it just fixed. It sends the draft it was told to prepare. It reports the work done without
running the test. Permission prompts catch this only while you are still reading them, and after the
fortieth prompt of the day you are not.

Instructions in a system prompt or a CLAUDE.md do not hold either. The model can misread them, lose
them to a compaction, or be argued out of them by its own reasoning about what you probably wanted.

handoff-os puts a deterministic gate on the tool call instead. Sends, payments, publishes, merges,
deletes and credential writes exit 2 before they run, whatever the model believed at the time. It is
pattern matching in Node, not a classifier — nothing to talk around, nothing to forget, no model
call, no API key, no network, no telemetry, no daemon.

I wrote it because I work alone. No teammate reads my diff before it ships, so the rules worth
having are the ones that hold while I am not watching.

Requires Node.js 22 or later.

## What it blocks

| Rule | Blocked |
|---|---|
| Egress | Shell commands and connector calls that send, publish, pay, deploy or trigger remote work. |
| Delete | Git merges, deletions and history rewrites. Shell `rm` and `Remove-Item`. |
| Secrets | API keys, OAuth tokens and account numbers written to tracked files, including via shell redirect. |
| Read budget | Re-reads of unchanged files, whole-file reads over 24 KB, reads past a 500 KB session ceiling. |
| Query budget | A Grep or Glob already answered this session. |
| Fan-out | A fourth subagent in one wave. |
| Dispatch | A subagent dispatch that names no model tier. |
| Verify | A claim that work is done when no verification command ran this turn. |

A blocked call exits 2 and prints the reason on stderr, which Claude reads and can act on. Nothing
else is intercepted.

## Does it hold

| Measure | Result |
|---|---|
| Dangerous calls blocked | 35/35 |
| Benign calls wrongly blocked | 0/27 |
| Known bypasses still open | 4 |

66 labelled cases in `eval/guard-corpus.jsonl`. Reproduce on a clean checkout with `npm run
benchmark:eval`; CI fails the build on a regression. Recall never appears without the false-positive
rate, because a guard that blocks everything scores 100% on the first and is worthless.

The four open bypasses are named in [SECURITY.md](SECURITY.md) and re-run on every eval, scored
apart so no scoring choice can bury them. The corpus is portable: point `HANDOFF_EVAL_GUARD` at a
rival hook and score it on the same cases.

No token-savings figure is published here. Measuring one honestly takes paired Claude Code runs with
real usage blocks and cache-aware pricing; the protocol is written and marked not run in
[docs/BENCHMARK.md](docs/BENCHMARK.md).

## Install

```text
/plugin marketplace add serio-ngo/handoff-os
/plugin install handoff-os@serio-ngo
```

Restart Claude Code. The hooks load on the next session.

## Configuration

Optional environment variables, set in `~/.claude/settings.json` under `env` or in the shell:

| Variable | Effect |
|---|---|
| `HANDOFF_STATS=1` | Print the summary line after every reply. |
| `HANDOFF_LOCK_GIT=1` | Block all state-changing git commands, including commits. |
| `HANDOFF_MCP_ALLOW=action,action` | Allow named connector actions that the egress lock would block. |
| `HANDOFF_DENY_SUBAGENT_MODELS=model,model` | Deny these model tiers for subagents. Default: `opus,fable`. |
| `HANDOFF_OS_DIR=/path` | Store session state and audit files outside the project directory. |

The plugin also ships three skills (`task-loop`, `research-budget`, `plan-session`) and two subagents
(`scout`, `runner`). User facts live in `config/memory.md`, which is gitignored.

Local setup, policy sync and release tooling: [CONTRIBUTING.md](CONTRIBUTING.md#commands).
Permission rules cannot ship inside a plugin, so `settings/policy.json` holds one `deny` list.
Security rules go in `deny`, never `allow`, because `allow` does not apply before the workspace trust
dialog.

## Limits

| Limit | Rule |
|---|---|
| Surface | Acts only where Claude Code runs plugin hooks (Claude Code CLI). No effect in chat, Cowork, or any surface that skips this hook path. |
| Shape | One deny gate. No sandbox, no daemon, no model call, no dashboard, no team policy. |
| Matching | Pattern-based shell matching can be evaded. Use it alongside operating system permissions and Claude Code `permissions.deny` rules, not instead of them. |

Scope and known gaps: [SECURITY.md](SECURITY.md). Method and last eval: [docs/BENCHMARK.md](docs/BENCHMARK.md).

## License

[Apache-2.0](LICENSE). Maintained by serio-ngo. Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
