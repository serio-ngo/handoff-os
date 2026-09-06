# Governance

Handoff OS is owned and maintained by **Serio NGO** (Fundacja Serio, Poland — <https://serio.org.pl>),
which holds the copyright and licenses the work under Apache-2.0. No company, no investor, nothing to
acquire.

## Who decides

| Decision | Made by |
|---|---|
| Merging a pull request | a maintainer, after the suite is green on all three operating systems |
| Adding or removing a skill, hook or permission rule | a maintainer, against the membership test in [CONTRIBUTING.md](CONTRIBUTING.md) §1 |
| Cutting a release | a maintainer, via `npm run release` |
| Changing the licence | the foundation's board |
| Accepting funding that would change the roadmap | the foundation's board, disclosed here before the work starts |

Maintainers are the accounts with write access. At present, one.

## How a decision is recorded

In the repository, never in chat. A change to the operating rules arrives as a pull request against
[docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md), with the rationale in the description and a test wherever the
rule is machine-checkable. `CHANGELOG.md` records one line per release.

Two properties are structural rather than promised: outward actions stay human, and there are no runtime
dependencies. A version that sends on your behalf, or that pulls a supply chain, would be a different
product. Apache-2.0 is irrevocable for every published version.

Bugs and proposals go to a GitHub issue; vulnerabilities to [SECURITY.md](SECURITY.md); conduct to
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
