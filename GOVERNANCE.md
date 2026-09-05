# Governance

## Who owns this

Handoff OS is owned and maintained by **Serio NGO**, a nonprofit foundation registered in
Poland as Fundacja Serio — <https://serio.org.pl>. The foundation holds the copyright and the repository, and licenses
the work under Apache-2.0. There is no company behind it, no investor, and nothing to acquire.

## Who decides

| Decision | Made by |
|---|---|
| Merging a pull request | a maintainer, after the suite is green on all three operating systems |
| Adding or removing a skill, hook or permission rule | a maintainer, against the membership test in [CONTRIBUTING.md](CONTRIBUTING.md) §1 |
| Cutting a release | a maintainer, via `npm run release` |
| Changing the licence | the foundation's board |
| Accepting funding that would change the roadmap | the foundation's board, disclosed in this file before the work starts |

Maintainers are the accounts with write access to this repository. At present that is a single maintainer.

## How a decision is recorded

In the repository, never in chat. A change to the operating rules arrives as a pull request against
`docs/ORCHESTRATOR.md` with the rationale in the description, and a corresponding test wherever the rule is
machine-checkable. `CHANGELOG.md` records one line per release.

## What will not change

| Commitment | Basis |
|---|---|
| No telemetry, analytics, or phone-home behaviour | There is no server component, and introducing one would fail the suite's network expectations and the trust statement in [README.md](README.md) |
| No paid tier, account, or licence key | Apache-2.0 is irrevocable for every published version |
| No runtime dependencies | A dependency is a supply chain; this software is installed specifically because it is fully auditable |
| Outward actions remain human | This is the product's defining property. A version executing sends on the operator's behalf would be a different product under a different name |

If maintenance ends, notice will appear at the top of `README.md` with a pointer to any successor fork.
A permissively licensed project with a passing suite is structured to outlive its maintainer.

## Reporting

| Kind | Route |
|---|---|
| Bug, proposal | a GitHub issue, using the form |
| Vulnerability | private reporting — [SECURITY.md](SECURITY.md) |
| Conduct | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
