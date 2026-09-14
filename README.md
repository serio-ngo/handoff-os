<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
  <img src="docs/logo.svg" width="240" alt="Serio">
</picture>

# serio-focus

**An ADHD quality-of-life tool for Claude Code: less noise, more done.**

Every reply starts with the action and ends with one next step. Subagent floods are capped,
big reads trimmed, destructive commands held for a human.

[![version](https://img.shields.io/github/package-json/v/serio-ngo/serio-focus?label=version&color=1f6feb)](plugins/serio-focus/.claude-plugin/plugin.json)
[![verify](https://github.com/serio-ngo/serio-focus/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/serio-focus/actions/workflows/verify.yml)
[![license](https://img.shields.io/github/license/serio-ngo/serio-focus?color=1f6feb)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-1f6feb)](#start-here)

[![guard caught](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fserio-focus%2Fmain%2Ftooling%2Fresults%2Fscores.json&query=%24.recall&suffix=%25&label=guard%20caught&color=2da44e)](docs/BENCHMARK.md)
[![wrongly blocked](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fserio-focus%2Fmain%2Ftooling%2Fresults%2Fscores.json&query=%24.fpRate&suffix=%25&label=wrongly%20blocked&color=2da44e)](docs/BENCHMARK.md)
[![plugin logic](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fserio-focus%2Fmain%2Ftooling%2Fresults%2Fscores.json&query=%24.logicLines&suffix=%20lines&label=plugin%20logic&color=57606a)](plugins/serio-focus/scripts)
[![dependencies](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fserio-focus%2Fmain%2Ftooling%2Fresults%2Fscores.json&query=%24.dependencies&label=dependencies&color=2da44e)](package.json)

<!-- handoff-demo -->
<img src="docs/demo.svg" width="720" alt="serio-focus session: Read src/big.js · 35 KB → READ CAP: big.js 35KB. Kept first 384 lines · Workflow · 100 agents → FAN-OUT CAP: 100 asked, 3 run. Next: wait one wave · Bash · `git commit -m &quot;wip&quot;` → GIT WRITE: &quot;git commit -m &quot;wip&quot;&quot; needs a human — commit and push stay manual · Bash · `git push origin main` → GIT WRITE: &quot;git push origin main&quot; needs a human — commit and push stay manual · Bash · `rm -rf docs` → DELETE LOCK: &quot;rm -rf docs&quot; needs a human — recursive delete stays manual · Answer · focus style → Action first · Done ≤5 · one Next + command · Step N of M · SERIO FOCUS · 104 held · ~2,816 of ~8,960 tok kept out (31%)">
<!-- /handoff-demo -->

<sub>[Start here](#start-here) · [What it does](#what-it-does) · [Proof](#proof) · [Method](docs/BENCHMARK.md) · [Contributing](CONTRIBUTING.md)</sub>

</div>

## Example

Claude Code can launch 20 subagents in one turn. A 5-hour window goes in seconds.

The hook caps each wave at 3 and queues the rest.

<!-- handoff-flood -->
<img src="docs/flood.svg" width="720" alt="20 subagents requested. Without the guard 20 start at once; with it 3 start and the rest wait for the next wave.">
<!-- /handoff-flood -->

## Start here

1. `git clone https://github.com/serio-ngo/serio-focus.git && cd serio-focus`
   You should see `Cloning into 'serio-focus'`.
2. `npm run setup`
   You should see `Ready. Restart Claude Code so the session card loads.`
3. Restart Claude Code, then `npm run doctor`
   You should see every check answer `yes`.

Without a checkout: `/plugin marketplace add serio-ngo/serio-focus`, then `/plugin install serio-focus@serio-ngo` and restart.

## What it does

<img src="docs/tiles-stops.svg" width="720" alt="Stops: 3 subagents per wave; 24 KB whole-file read cap; commit · push git writes need a human; one line session receipt">

| Guard | Notes |
|---|---|
| Fan-out cap | `HANDOFF_MAX_PER_WAVE=3`, `HANDOFF_WAVE_MS=60000` — excess waits for the next wave. |
| Read budget | Files over 24 KB arrive trimmed; an unchanged file is never re-sent; a repeated Grep or Glob is held. |
| Dispatch budget | Every subagent names a tier; `HANDOFF_DENY_SUBAGENT_MODELS=opus,fable` never reviews. |
| Git lock | `git commit` and `git push` need a human; recursive deletes and `clean -fdx` / `reset --hard` too. Reads, branches, stashes and merges run. `HANDOFF_GIT_WRITE=1` reopens commit and push. |
| Focus style | `output-styles/focus.md` ships forced for the plugin: action first, Done ≤5, one next step. |
| Session receipt | One line at Stop, always on. |

Every guard blocks first and suggests second. No block is a refusal — each names the override above
or the command to run yourself, and the owner decides.

<img src="docs/tiles-wins.svg" width="720" alt="Wins: subagents held back; read volume kept out; billed on subagent fan-out">

## Proof

Every case is labelled in `tooling/corpus/guard-corpus.jsonl` and re-scored on each run against four
comparators. Cost, limits and full method: [docs/BENCHMARK.md](docs/BENCHMARK.md).

<div align="center">
<sub>

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [docs/BENCHMARK.md](docs/BENCHMARK.md) · [docs/MANIFEST.md](docs/MANIFEST.md) · [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md) · [Apache-2.0](LICENSE)

</sub>
</div>
