# matt-with-paseo-plugin

A [Paseo](https://paseo.sh) plugin for [matt-with-paseo](https://github.com/hanh9898/matt-with-paseo).

## What it is for

matt-with-paseo-plugin is an optional Paseo plugin for people who run the `matt-with-paseo` skills, above all people who run streams unattended. It lets the orchestrator see what its agents do without polling, answers the checkpoints the owner has delegated, and wires each ticket agent when it is created. The skills stay the core and still run without the plugin.

The design case is the unattended stream; a single wave is helped too. The plugin supports Windows, macOS and Linux. Claude Code only; other agents prepared through descriptors, not promised.

What the plugin will never do is written in [ADR 0002](docs/adr/0002-what-the-plugin-will-never-do.md). Where it is going, release by release, is in the [roadmap](docs/roadmap.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Every contributor follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report a vulnerability as [SECURITY.md](SECURITY.md) says. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

For agents and for reviewers: [`AGENTS.md`](AGENTS.md) points to the [coding standards](CODING_STANDARDS.md), the [evidence standards](docs/agents/evidence-standards.md) and the [ship rules](docs/agents/ship-rules.md).

## Licence

MIT, see [LICENSE](LICENSE).
