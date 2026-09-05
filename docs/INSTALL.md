# Install

Installation takes approximately 20 minutes. Each step includes its own verification criterion.

| # | Command | Success criterion |
|---|---|---|
| 1 | `npm run setup` | `config/org.json` exists and is ignored by git — contains your name, tracker, document store, and design tools |
| 2 | `npm test` | Full test suite passes: egress blocks, verification gate holds, context budgets enforced |
| 3 | `npm run sync:settings -- --target ~/.claude/settings.json --dry-run` | Prints the proposed diff without writing |
| 4 | The same command without `--dry-run` | `~/.claude/settings.json` contains the deny list, `forceLoginMethod: claudeai`, and the marketplace and plugin entries |
| 5 | Repeat steps 3–4 for each `CLAUDE_CONFIG_DIR` in use | Each account's settings file contains the same entries |
| 6 | Restart Claude Code, then run `/plugin` | Plugin is listed and enabled; Claude has cloned the marketplace |
| 7 | `npm run verify:install` | Every row reports **yes** — settings, cache, and all four enforcement hooks verified against a live payload |
| 8 | In Cowork: open Customize and enable the plugin for each account | Skills are listed. Cowork does not read `~/.claude` |
| 9 | Connect per account: tracker · document store · design tools · calendar · mail | Each connector reports connected status. Mail is read-and-draft only — sending remains a human action |
| 10 | Run `/status` | Login method is the subscription. No `API key` row is present |
| 11 | Send *"add a task: <one sentence>"* | An item appears in the tracker, with a handoff card specifying the approval actions |

Never set `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` or `apiKeyHelper`.
The merge script refuses to write any of them, and the guard blocks the shell that would set one.

## Expected behaviour

| Hook | Behaviour |
|---|---|
| `SessionStart` card | Presents planes, tiers, the never-list, and source pointers in approximately 300 tokens, replacing a full document read each session |
| Egress lock | Blocks send, payment, deletion, and push operations **before** execution. The message `EGRESS LOCK: blocked…` confirms nothing left the organisation |
| Read budget | Blocks re-reads of files unchanged since this session read them. Eliminates duplicate context cost for identical content |
| Fan-out cap | Blocks a fourth subagent in a single wave. Review completed results before launching the next wave |
| Audit | Appends one receipt line per file write to `audit/YYYY-MM.jsonl`. A complete record with no operator attention required |
| Verify gate | Rejects completion claims until the verification command has executed |

## Developing the plugin

```bash
claude --plugin-dir plugins/handoff-os
```

That loads this checkout directly, without marketplace or cache indirection. After editing a skill or hook,
run `/reload-plugins`.

To propagate this checkout to an installed copy:

```bash
npm run release patch "what changed"
git push
npm run sync:plugin
```

The plugin cache is keyed by `version` in `plugins/handoff-os/.claude-plugin/plugin.json`. Content shipped
without a version increment is silently ignored on update.

## Troubleshooting

| Symptom | Resolution |
|---|---|
| Slash command unknown | Verify enablement in `/plugin`, run `/reload-plugins`, then repeat steps 4 and 6 |
| Skill or hook edit has no effect | The cache is version-keyed. Run `npm run release patch "…"`, push, then `npm run sync:plugin` |
| `READ BUDGET` blocked a read | The file is unchanged since this session read it. Request a slice with `offset`/`limit`, which is always permitted |
| `FAN-OUT CAP` blocked a subagent | Limit is three per wave. Review completed results, then launch the next wave |
| `EGRESS LOCK` blocked an intended action | The action is outward-facing and reserved for human execution. Retain the blocked line as context for the manual step |
| Verification gate requests already-completed verification | Only the runner writes the marker: `node plugins/handoff-os/scripts/verify-run.mjs <session-id>` |
| Settings appear incorrect | Repeat step 3 to review the diff, then step 4. Do not edit around the merge manually |
| `npm run verify:install` reports the marketplace as unregistered | Step 4 wrote the entry but Claude has not restarted. Restart and re-run verification |
