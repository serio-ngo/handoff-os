# Settings templates

A plugin's own `settings.json` supports only `agent` and `subagentStatusLine`. **Permission rules cannot
ship inside a plugin.** They are defined here and merged by `npm run sync:settings`.

Templates contain policy only. Marketplace identity, plugin enablement, and the checkout path are derived
at merge time from `marketplace.json` and the git remote, so forks require no manual find-and-replace.

## Files

| File | Destination | Coverage | Verification |
|---|---|---|---|
| `user-settings.template.json` | `~/.claude/settings.json` and each `CLAUDE_CONFIG_DIR` in use | Subscription login, state-changing git, secret reads, named egress commands, brand-locked writes; `ask` on connector servers | `/permissions` lists the deny rules; a `git push --dry-run` request must be refused |
| `project-settings.template.json` | A consuming repository's `.claude/settings.json` | Identical rules, repository-scoped, so a fresh clone is protected before user settings are touched | `/permissions` within that repository |
| `managed-settings.template.json` | Managed settings path, applied as administrator | Adds `disableBypassPermissionsMode` so no flag bypasses the deny list | `claude --permission-mode bypassPermissions` must refuse entry |

## Order of authority, highest first

| # | Layer |
|---|---|
| 1 | managed settings |
| 2 | `claude --settings` |
| 3 | `.claude/settings.local.json` |
| 4 | `.claude/settings.json` |
| 5 | `~/.claude/settings.json` |

## Rules for editing templates

| Rule | Consequence of violation |
|---|---|
| JSON permits no comments or trailing commas | Settings fail to load silently |
| `deny` and `ask` evaluate before the workspace trust dialog; `allow` does not | Security rules belong in `deny`, never in `allow` |
| Evaluation order is `deny` → `ask` → `allow`; first match wins; specificity is irrelevant | A broad `deny` admits no `allow` exception. Never deny `Bash(git *)` — it blocks `git status` irreversibly |
| `:*` is recognised only at the **end** of a pattern | `Bash(git:* push)` never matches. Write `Bash(git push *)` |
| Parameterised forms of a tool's primary field are ignored, with a startup warning | Never `Bash(command:…)`, `Read(file_path:…)`, or `WebFetch(url:…)` |
| Windows paths normalise to POSIX | Absolute rules take the form `//c/Users/<you>/…/**`, never `C:\…` |
| A single leading `/` in a Read/Edit rule anchors at the settings file's directory | `Read(/secrets/**)` in `~/.claude/settings.json` means `~/.claude/secrets/**`. Use `//` for the filesystem root |
| `WebFetch(domain:*.example.com)` does not match `example.com` | Declare both forms |
| Any `mcp__` rule containing parentheses is skipped at load | Write `mcp__service`, never `mcp__service(action)` |

Details and source URLs: [../docs/CLAUDE_CODE_FACTS.md](../docs/CLAUDE_CODE_FACTS.md) §9–10.

## Connector selection

The `permissions.ask` list names connector servers, defaulting to monday, Google (Drive, Gmail,
Calendar), and Canva. Server names vary by installation. Run `/mcp`, record the actual names, and update accordingly.
All other entries are derived or merged.

To omit unused connectors, filter their prompts at merge time:

```bash
npm run sync:settings -- --target ~/.claude/settings.json --without canva,gmail
```

Only `ask` prompts are removed. `deny` entries are never filtered, and the hook guard continues to block
every outward and destructive verb on any server — omitting a tool reduces prompts, never protection.

## Coverage split

| Gap in static rules | Compensating control |
|---|---|
| `Write` tool paths — path rules are expressed as `Read(…)` / `Edit(…)` | `PreToolUse` → `egress-guard.mjs`, which inspects `Edit` and `Write` |
| `az` / `aws` / `gcloud` deploy and publish subcommands | The guard — denying the whole CLI would block read-only calls |
| `curl` / `wget` / `Invoke-WebRequest` with a body or non-GET method | The guard — read-only web access remains permitted |
| Connector tools that send, publish, pay, or delete | The guard's verb policy, plus `ask` on connector servers |
