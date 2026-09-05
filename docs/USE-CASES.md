# Use cases

Three reference workflows, shown as executed: the request, the agent's permitted scope, and the
approval that remains human. Every workflow concludes with a handoff card or a verified stop —
the agent never executes an outward action.

## 1. Pay a contractor invoice

Skill: `/handoff-os:task-loop`. Tracker: monday (alternatives: GitHub Projects, local `TODO.md`).

| Step | Owner | Output |
|---|---|---|
| State "add a task: pay INV-2026-09" | Founder, one sentence | Tracked item with due date |
| Verify invoice: amount, account number, due date, contract reference | Agent | `Drive / Finance / INV-2026-09_checked.pdf` |
| Draft e-mail to the accountant | Agent | Mail draft; transmission disabled |
| Approve and pay | Founder | Handoff card: `DONE / FILE / YOU` |

The agent cannot pay, send the draft, or advance the tracked item past approval — payment, send, and
submission are RED-tier actions, refused by the egress lock before execution.

## 2. Draft a grant application

Skills: `/handoff-os:canon` for source facts, `/handoff-os:task-loop` for execution.

| Step | Owner | Output |
|---|---|---|
| State "draft the FundX application" | Founder, one sentence | Tracked item |
| Read mission, objectives, and registry identifiers live from the public source | Agent | Values quoted with source URLs |
| Draft narrative and budget | Agent | Draft in the document store |
| Flag missing or unpublished material | Agent | `NOT IN CANON` with the publishing owner identified — no inferred values |
| Review and submit | Founder | Handoff card with portal address and deadline |

An incorrect registry identifier constitutes a filing error. The skill requires an explicit gap
statement in place of any estimate.

## 3. Ship code in a repository

Skills: `/handoff-os:plan-session` for planning; the verify gate for completion.

| Step | Owner | Output |
|---|---|---|
| State the release objective in one sentence | Founder | Defined goal |
| Plan with one decided path per row | Agent | WHAT / WHERE / WHY / WHEN / DONE per task |
| Implement code and tests | Agent | Diff in the repository |
| Declare completion | Agent | Rejected until `npm run verify` has executed — the gate blocks unverified claims |
| Commit, push, merge | Founder | State-changing git operations remain human actions in all cases |

## Demo transcript

Reproduce the following on a local installation. It also serves as the recording script.

```
you:    send the invoice to our accountant
agent:  [blocked before anything runs]
EGRESS LOCK: blocked connector tool mcp__9f31…__send_message on pattern send - matched outward verb "send" - this is an outward action (leaves the org), the human performs it, not the agent.
DONE   Invoice INV-2026-09 checked: amount, IBAN, due date
FILE   Drive / Finance / INV-2026-09_checked.pdf
YOU    Approve + pay -> bank -> by the due date on the invoice
```

## Record it as a GIF

1. Open a terminal at 80x24 with a large font. Reproduce the transcript above.
2. Capture with a screen recorder (ScreenToGif on Windows, Peek on Linux, native capture on macOS).
3. Trim to the blocked line and the resulting card. Export at a maximum of 1280 px width and 2 MB; save as `docs/demo.gif`.
4. Embed at the top of this page: `![Forty-second demo: a blocked send becomes a handoff card](demo.gif)`.
5. Retain the text transcript alongside the recording — GIFs are inaccessible to screen readers and unsearchable; text preserves both.

## Operating with fewer tools, or none

- Omit unused connectors at merge time: `npm run sync:settings -- --target <settings.json> --without canva,gmail`.
- Only `ask` prompts are removed. `deny` entries are never filtered, and the hook guard continues to block
  every outward and destructive verb on any server — omitting a tool reduces prompts, never protection.
- Minimal coding configuration: `--without` all connectors, tracker `markdown`. The egress lock, audit
  trail, verification gate, and spend caps remain active — no additional account, connector, or prompt to dismiss.
