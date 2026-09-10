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

<img src="docs/demo.svg" width="720" alt="handoff-os on a 20-subagent request: 3 start, the FAN-OUT CAP holds 17 for the next wave, the Stop receipt prints the count">

<sub>[Install](#install) · [Also stops](#also-stops) · [Method](docs/BENCHMARK.md) · [Contributing](CONTRIBUTING.md)</sub>

</div>

Claude Code can launch 20 subagents in one turn. A 5-hour window goes in seconds.

The hook caps each wave at 3 and queues the rest.

<!-- handoff-flood -->
<img src="docs/flood.svg" width="720" alt="20 subagents requested, model claude-sonnet-5. One uncapped wave: 20 started, about 490k raw tokens measured (20 × 24,480 per subagent); in a real repo 1M+ tokens, about $5 at Opus list price, an estimate. With the guard: 3 started, 17 held for the next wave, measured.">

**Measured** on `claude-sonnet-5`, one prompt: 20 subagents started and ≈490k raw tokens without the guard, 3 started and 17 held with it; 1M+ tokens a wave in a real repo is an **estimate**.
<!-- /handoff-flood -->

## Install

```text
/plugin marketplace add serio-ngo/handoff-os
/plugin install handoff-os@serio-ngo
```

Restart Claude Code. Hooks load at session start.

## Also stops

<img src="docs/tiles-stops.svg" width="720" alt="Stops: 3 subagents per wave; 24 KB whole-file read cap; destructive git and rm calls; Done with no verification run">

<img src="docs/tiles-counts.svg" width="720" alt="Counts: subagents held back; read volume kept out; receipt printed at Stop">

<img src="docs/tiles-never.svg" width="720" alt="Does not: 0 model calls, 0 network calls, 0 dependencies">

<details>
<summary>Cost and limits</summary>

<img src="docs/tiles-cost.svg" width="720" alt="Cost and limits: more tokens on ordinary tasks; Cowork hooks do not fire; OpenCode subagents bypass the guard">

Method: [docs/BENCHMARK.md](docs/BENCHMARK.md).

</details>

<div align="center">
<sub>

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [docs/BENCHMARK.md](docs/BENCHMARK.md) · [docs/MANIFEST.md](docs/MANIFEST.md) · [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md) · [Apache-2.0](LICENSE)

</sub>
</div>
