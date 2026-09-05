# config/ — operator personalisation

Run `npm run setup`. It writes `org.json`, which is generated and excluded from git.
`org.example.json` documents the schema and is the only tracked file in this directory.

| Permitted here | Prohibited here |
|---|---|
| Display name, form of address, language | Secrets, tokens, passwords |
| Public facts URL, tracker, document store, design tools | Registry identifiers, account numbers, e-mail addresses, machine paths |
| | Private facts — bank, personnel, contracts. Collected in conversation, never stored. |

| Consumed by | Purpose |
|---|---|
| `plugins/handoff-os/scripts/session-card.mjs` | Planes and source lines on the session card; generic wording when unconfigured |
| `scripts/plugin-sync.mjs` | Embedded copy in the installed plugin, so the card functions outside this checkout |
| `test/repo-hygiene.test.mjs` | Verification that the canon skill reads this file rather than naming an organisation |
