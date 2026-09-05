# handoff-os — repo law

This repository is **Handoff OS**: agent operating rules for founders and micro-teams. Instructions and scripts
only — never organisation data. It ships one plugin installed by every repository and every Claude account.

The decision procedure arrives as a **session card**, printed by the `SessionStart` hook — planes,
tiers, the never-list, source pointers. Consult [docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md) **only** when
the card does not resolve a routing question.

## Standing orders

1. Address the owner as configured in `config/org.json` (`addressAs`). Reply in the configured `language`.
2. **One home per fact. Crossing a plane is a sync, never a copy.** TRUTH=site + doc store · STATE=tracker · BUILD=git · BRAND=design tools · HUMAN=the owner.
3. **Never** send, pay, submit, publish or run state-changing git. Those are human acts. RED stops and emits `/handoff-os:handoff-card`.
4. **Never** set `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` or `apiKeyHelper`. Subscription auth only.
5. **No organisation data in git — ever.** No registry identifiers, no secrets, no mirrors. Read live via `/handoff-os:canon`. Identity comes from `npm run setup`. A fact stored here is a fact that rots here.
6. Before researching Claude Code or any connected system, read [docs/CLAUDE_CODE_FACTS.md](docs/CLAUDE_CODE_FACTS.md). An identifier reaches a deliverable with its doc URL, or tagged **UNVERIFIED**.
7. **Fan-out law:** scope gate first — DELIVERABLE / OUT OF SCOPE / SUB-QUESTIONS — then max 3 subagents per wave, sequential waves, read between waves. Enforced by `PreToolUse` on the `Agent` tool; procedure in `/handoff-os:research-budget`.
8. **Cheapest sufficient actor, from a table.** `script > haiku > sonnet > opus`. Deterministic work never gets a model. Every dispatch states model, effort, and caps on web calls, tool calls and output lines.
9. Tables and short imperative lines. No essays, no thinking dumps, no options surveys.
10. Partial completion is valid. Silent failure is not.

## Layout

| Path | Holds | Changed |
|---|---|---|
| `plugins/handoff-os/` | 5 skills, 4 hooks, hook scripts — the product | on owner order |
| `settings/` | permission templates; rules cannot ship inside a plugin | on owner order |
| `scripts/` | deterministic jobs, no model in the loop | on owner order |
| `test/` | behaviour specs on Node's built-in runner | with every change |
| `docs/` | the law, the install, verified identifiers, the generated manifest | `MANIFEST.md` is generated |
| `config/` | `org.example.json` shape only; `org.json` is generated and gitignored | by setup |
| `audit/` | `YYYY-MM.jsonl`, append-only | **hook only** |

## Working here

```bash
npm test                              # full behaviour suite
claude --plugin-dir plugins/handoff-os  # load this checkout directly
npm run release patch "one-line note" # suite, version bump, manifest, changelog, stamp
```

`npm test` fails when the manifest or the release stamp drifts from the content. That is the guard
against shipping a change the plugin cache will silently ignore. Rules for contributions, including
the budgets the suite enforces: [CONTRIBUTING.md](CONTRIBUTING.md).
