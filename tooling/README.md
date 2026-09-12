# tooling

<sub><b>Not the plugin.</b> Nothing in this tree ships or loads in a Claude Code session. The plugin is <a href="../plugins/handoff-os">plugins/handoff-os</a>.</sub>

| Folder | Contents | Entry point |
|---|---|---|
| `cli/` | Maintainer CLI and the generators behind every generated block | `npm run setup` · `upkeep` · `doctor` · `release` |
| `benchmark/` | Scoring harness, the four comparator baselines, the throwaway fixture repo | `npm run benchmark:eval` · `benchmark:ab` · `benchmark:flood` |
| `corpus/` | `guard-corpus.jsonl` labelled cases · `tasks.jsonl` A/B tasks | hand-edited; one line per case |
| `results/` | Generated scores and run records | written by `benchmark:*`, read by the README badges and figures |
| `test/` | `guard.test.mjs`, the only suite | `npm test` |
| `settings/` | `policy.json`, the permission `deny` list a plugin cannot ship | `npm run sync` |

| Rule | Value |
|---|---|
| Imports | `tooling/` may import from `plugins/handoff-os/`; never the reverse |
| Dependencies | none; Node standard library only |
| `results/` | generated — never hand-edit |
