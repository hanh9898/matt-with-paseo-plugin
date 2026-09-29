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
| `server/host.ts` | The host port: the events a handler receives, the actions it may take, where it registers |
| `server/paseo-host.ts` | The one adapter of the port that imports the Paseo SDK |
| `server/hooks/` | The hook handlers, one module per handler |
| `shared/` | Code and contracts both runtimes import |
| `test/` | The tests (`*.test.ts`) and the [smoke test](test/smoke/README.md) |
| `test/support/fake-host.ts` | The fake adapter of the port, for tests |
| `test/hooks/` | One test per hook handler, named after it |

Paseo loads only the entries and the `client/`, `server/` and `shared/` folders; keep any other code module out of the repository root.

```bash
npm install
npm run typecheck
npm test
```

### The host port

Only `server/paseo-host.ts` imports `@getpaseo/plugin`; a handler imports `server/host.ts` and nothing from the SDK.

A handler is a module in `server/hooks/` that exports a function taking `HostHooks`. It registers with `hooks.onTurnEnded`, `hooks.onPermissionRequested`, `hooks.onCreated`, `hooks.onArchived` or `hooks.beforeCreate`, and each callback receives `(event, host)`. `host` is the only way to reach Paseo: `labelsOf`, `send`, `respondToPermission`, `appendTimelineRow`. The entry module calls `connectPaseo(server)` and hands the returned `HostHooks` to each handler.

```ts
// server/hooks/relay.ts
import type { HostHooks } from "../host.ts";

export function registerRelay(hooks: HostHooks): void {
  hooks.onTurnEnded(async ({ agent, outcome }, host) => {
    if (agent.parentAgentId === null) return;
    await host.send(agent.parentAgentId, `${agent.id} ended: ${outcome.kind}`);
  });
}
```

A test builds a `FakeHost` from `test/support/fake-host.ts`, passes it as the hooks, emits the event Paseo would send, and reads what the handler did. No daemon and no SDK are involved. `await host.create({ env })` returns the environment after every `beforeCreate` handler, in the order they registered. `host.setLabels(agentId, labels)` sets what `labelsOf` reports. A handler that throws is recorded in `failures` instead of reaching the test, as the real adapter keeps it out of Paseo.

```ts
// test/hooks/relay.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { registerRelay } from "../../server/hooks/relay.ts";
import type { HostAgent } from "../../server/host.ts";
import { FakeHost } from "../support/fake-host.ts";

const worker: HostAgent = {
  id: "worker",
  workspaceId: null,
  parentAgentId: "orchestrator",
  provider: "claude",
  cwd: "/repo",
  title: null,
};

test("a worker's turn end reaches its orchestrator", async () => {
  const host = new FakeHost();
  registerRelay(host);
  await host.emitTurnEnded({ agent: worker, outcome: { kind: "completed" }, timeline: [] });
  assert.deepEqual(host.sent, [{ agentId: "orchestrator", text: "worker ended: completed" }]);
});
```

Each handler in `server/hooks/` needs a `test/hooks/<name>.test.ts` that uses `FakeHost`; a check fails when one is missing. A hook the port does not yet expose is added to `server/host.ts`, `server/paseo-host.ts` and `FakeHost` together.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Every contributor follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report a vulnerability as [SECURITY.md](SECURITY.md) says. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

For agents and for reviewers: [`AGENTS.md`](AGENTS.md) points to the [coding standards](CODING_STANDARDS.md), the [evidence standards](docs/agents/evidence-standards.md) and the [ship rules](docs/agents/ship-rules.md).

## Licence

MIT, see [LICENSE](LICENSE).
