# matt-with-paseo-plugin

A [Paseo](https://paseo.sh) plugin for [matt-with-paseo](https://github.com/hanh9898/matt-with-paseo). The skills stay the core. The plugin adds:

- lifecycle hooks in place of heartbeats;
- answers to delegated checkpoints;
- the wiring for the agents the skills start.

> **Pre-release.** Nothing is built yet. The decisions so far are in [`docs/adr/`](docs/adr/). The work is tracked in issues labelled `plugin` on [matt-with-paseo](https://github.com/hanh9898/matt-with-paseo/issues?q=label%3Aplugin), and the lessons behind it are in that repository's `docs/lessons/sting9k-seatworks.md`.

## Development

The plugin is a Paseo plugin written in TypeScript. Node 22.18 or later runs the tests without a build step.

Supported Paseo host: `>=0.10.1 <0.11.0` (`requirements.paseo` in [`paseo-plugin.json`](paseo-plugin.json)), tested on Paseo `0.10.1`. The [smoke test](test/smoke/README.md) targets that version.

| Path | Holds |
|---|---|
| `paseo-plugin.json` | The manifest: the plugin id and the supported Paseo range |
| `index.server.ts` | The one entry module, run in the daemon subprocess |
| `server/` | Daemon-side code the entry imports |
| `shared/` | Code and contracts both runtimes import |
| `test/` | The tests (`*.test.ts`) and the [smoke test](test/smoke/README.md) |

Paseo loads only the entries and the `client/`, `server/` and `shared/` folders; keep any other code module out of the repository root.

```bash
npm install
npm run typecheck
npm test
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Every contributor follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report a vulnerability as [SECURITY.md](SECURITY.md) says. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

For agents and for reviewers: [`AGENTS.md`](AGENTS.md) points to the [coding standards](CODING_STANDARDS.md), the [evidence standards](docs/agents/evidence-standards.md) and the [ship rules](docs/agents/ship-rules.md).

## Licence

MIT, see [LICENSE](LICENSE).
