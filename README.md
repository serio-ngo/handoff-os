<div align="center">

# handoff-os

**Stops Claude Code from burning your limit on a subagent flood.**

[![version](https://img.shields.io/github/package-json/v/serio-ngo/handoff-os?label=version&color=1f6feb)](plugins/handoff-os/.claude-plugin/plugin.json)
[![verify](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml/badge.svg)](https://github.com/serio-ngo/handoff-os/actions/workflows/verify.yml)
[![license](https://img.shields.io/github/license/serio-ngo/handoff-os?color=1f6feb)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-1f6feb)](#install)

[![guard caught](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.recall&suffix=%25&label=guard%20caught&color=2da44e)](docs/BENCHMARK.md)
[![wrongly blocked](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.fpRate&suffix=%25&label=wrongly%20blocked&color=2da44e)](docs/BENCHMARK.md)
[![plugin logic](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.logicLines&suffix=%20lines&label=plugin%20logic&color=57606a)](plugins/handoff-os/scripts)
[![dependencies](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fserio-ngo%2Fhandoff-os%2Fmain%2Feval%2Fscores.json&query=%24.dependencies&label=dependencies&color=2da44e)](package.json)

<img src="docs/demo.svg" width="720" alt="handoff-os refusing a 38KB read, capping a subagent wave and blocking a send, then printing session totals">

<sub>[Install](#install) · [Also stops](#also-stops) · [Method](docs/BENCHMARK.md) · [Contributing](CONTRIBUTING.md)</sub>

</div>

Claude Code can launch 20 subagents in one turn. A 5-hour window goes in seconds.

The hook caps each wave at 3 and queues the rest.

<!-- handoff-flood -->
<picture>
<source media="(prefers-color-scheme: dark)" srcset="docs/flood-dark.svg">
<img src="docs/flood.svg" width="720" alt="20 subagents requested, model claude-sonnet-5. Without handoff-os: 20 started at once, 174,757 tokens billed. With handoff-os: 3 started at once, 104,751 tokens billed, 3 of 20 done, 17 held for the next wave.">
</picture>

20 subagents requested, model `claude-sonnet-5`. Started at once: **20** without, **3** with. Tokens billed this turn: **174.8k** without, **104.8k** with — 3 of 20 done, 17 held for the next wave.
<!-- /handoff-flood -->

## Install

```text
/plugin marketplace add serio-ngo/handoff-os
/plugin install handoff-os@serio-ngo
```

Restart Claude Code. Hooks load at session start.

## Also stops

<table>
<tr>
<th align="left" width="40%">Stops</th>
<th align="left" width="30%">Counts</th>
<th align="left" width="30%">Does not</th>
</tr>
<tr valign="top">
<td>
Whole-file dumps over 24 KB<br>
Destructive <code>git</code> and <code>rm</code><br>
"Done" with no verification run
</td>
<td>
Subagents held back<br>
Tokens kept out<br>
Receipt at <code>Stop</code>
</td>
<td>
Call a model<br>
Touch the network<br>
Depend on anything
</td>
</tr>
</table>

<details>
<summary>Cost and limits</summary>

| Where | Effect |
|---|---|
| Ordinary tasks | +11–33% tokens; refusals add turns |
| Cowork | hooks do not fire |
| OpenCode | subagent calls bypass the guard |

Method: [docs/BENCHMARK.md](docs/BENCHMARK.md).

</details>

<div align="center">
<sub>

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [docs/BENCHMARK.md](docs/BENCHMARK.md) · [docs/MANIFEST.md](docs/MANIFEST.md) · [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md) · [Apache-2.0](LICENSE)

</sub>
</div>
