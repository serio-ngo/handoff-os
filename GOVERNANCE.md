# Governance

Handoff OS is owned by **Serio NGO** (Fundacja Serio, Poland — <https://serio.org.pl>), licensed
Apache-2.0. No company, no investor, nothing to acquire.

| Decision | Made by |
|---|---|
| Merging a pull request | a maintainer, after the suite is green on all three OSes |
| Adding or removing a skill, hook or permission rule | a maintainer, against the membership test in [CONTRIBUTING.md](CONTRIBUTING.md) §1 |
| Cutting a release | a maintainer, via `npm run release` |

Rule changes arrive as a pull request against [docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md) with a test
wherever the rule is machine-checkable. Outward actions stay human and there are no runtime dependencies —
a version that sends on your behalf, or pulls a supply chain, would be a different product.
