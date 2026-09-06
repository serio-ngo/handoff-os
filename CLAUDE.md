# handoff-os — repo law

This repository is **Handoff OS**: agent operating rules for small teams. Instructions and scripts only —
never organisation data. It ships one plugin installed by every repository and every Claude account.

The decision procedure arrives as a **session card**, printed by the `SessionStart` hook — planes, tiers,
the never-list, source pointers. Consult [docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md) **only** when the
card does not resolve a routing question.

## Standing orders

1. Address the owner as `addressAs` in `config/org.json`, if it is set. Reply in the configured `language`.
2. **One home per fact. Crossing a plane is a sync, never a copy.** TRUTH=the owner's sources · STATE=tracker · BUILD=git · BRAND=design tool · HUMAN=the owner.
3. **Never** send, pay, submit, publish or run state-changing git. Those are human acts. RED stops and emits `/handoff-os:handoff-card`.
4. **Never** set `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` or `apiKeyHelper`. Subscription auth only.
5. **No organisation data in git — ever.** No identifiers, no secrets, no mirrors. Read live via `/handoff-os:canon`. Identity lives in gitignored `config/org.json`, written by `npm run setup`. A fact stored here is a fact that rots here.
6. Before researching Claude Code or any connected system, read [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md). An identifier reaches a deliverable with its doc URL, or tagged **UNVERIFIED**.
7. **Fan-out law:** scope gate first — DELIVERABLE / OUT OF SCOPE / SUB-QUESTIONS — then max 3 subagents per wave, sequential waves, read between waves. Enforced by `PreToolUse` on the `Agent` tool; procedure in `/handoff-os:research-budget`.
8. **Cheapest sufficient actor, from a table.** `script > haiku > sonnet > opus`. Deterministic work never gets a model. Every dispatch states model, effort, and caps on web calls, tool calls and output lines.
9. Tables and short imperative lines. No essays, no thinking dumps, no options surveys.
10. Partial completion is valid. Silent failure is not.
11. **No explanatory comments and no change narration inside code.** A line needing a sentence of justification needs a better name. Changelog entries belong in `CHANGELOG.md`, written by `npm run release`.

## Layout

| Path | Holds | Changed |
|---|---|---|
| `plugins/handoff-os/` | 5 skills, 1 scout agent, 5 hooks, 4 scripts — the product | on owner order |
| `settings/policy.json` | the one deny/ask list; rules cannot ship inside a plugin | on owner order |
| `scripts/` | `handoff.mjs` (the only CLI) and `generate.mjs` (pure generators) | on owner order |
| `test/` | behaviour specs on Node's built-in runner | with every change |
| `docs/` | the law, verified identifiers, the generated manifest | `MANIFEST.md` is generated |
| `config/` | `org.example.json` shape only; `org.json` is generated and gitignored | by setup |
| `audit/` | `YYYY-MM.jsonl`, append-only | **hook only** |

## Working here

```bash
npm test                                # full behaviour suite
npm run upkeep -- --install             # format, regenerate, bump, reinstall (the Stop hook does this)
claude --plugin-dir plugins/handoff-os  # load this checkout for one session, no install
npm run release patch "one-line note"   # suite, version bump, manifest, changelog, stamp
```

Upkeep runs itself at the end of every turn: formatting, `docs/MANIFEST.md`, the project settings
projection, the plugin version and the content stamp are never hand-maintained. Editing a plugin file
bumps the version and replaces the installed copy, so the code you edit is the code that loads —
without a commit, a push or a cache dance. Contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md).
