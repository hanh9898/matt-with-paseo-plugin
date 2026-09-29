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
| `index.server.ts` | The server entry, run in the daemon subprocess |
| `index.client.ts` | The client entry, run in the app: it starts the composer pill |
| `client/` | App-side code the client entry imports |
| `client/waiting-pill.ts` | The composer pill: one per agent, hidden at zero |
| `client/pill-text.ts` | Every text the pill shows |
| `server/` | Daemon-side code the entry imports |
| `server/host.ts` | The host port: the events a handler receives, the actions it may take, where it registers |
| `server/paseo-host.ts` | The one adapter of the port that imports the Paseo SDK |
| `server/hooks/` | The hook handlers, one module per handler |
| `server/hooks/lifecycle-relay.ts` | The handler that tells an orchestrator what its ticket agents do |
| `server/hooks/waiting-count.ts` | The handler that counts what waits for the user, per chat |
| `server/messages.ts` | The texts the plugin sends to an orchestrator, one per message type |
| `shared/` | Code and contracts both runtimes import |
| `shared/harness.ts` | The harness descriptor's field table and its checks |
| `shared/waiting.ts` | The `waiting.count` RPC the pill reads |
| `server/harness.ts` | The loader of the descriptors |
| `harness/` | One descriptor per agent, `<agent>.json`: data, not code |
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

A handler is a module in `server/hooks/` that exports a function taking `HostHooks`. It registers with `hooks.onTurnEnded`, `hooks.onPermissionRequested`, `hooks.onPermissionResolved`, `hooks.onCreated`, `hooks.onArchived` or `hooks.beforeCreate`, and each callback receives `(event, host)`. `hooks.serveWaitingCount` answers the composer pill's question. `host` is the only way to reach Paseo: `labelsOf`, `isRunning`, `send`, `respondToPermission`, `appendTimelineRow`. The entry module calls `connectPaseo(server)` and hands the returned `HostHooks` to each handler.

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

### The lifecycle relay

`server/hooks/lifecycle-relay.ts` replaces the heartbeat: what a ticket agent does reaches the orchestrator that owns it as a message.

| Event | Message (from `server/messages.ts`) |
|---|---|
| `agent.turn_ended` | `Turn ended:` with the ticket, the wave, the agent and the outcome |
| `agent.permission_requested` | `Permission pending:` with the request's id, tool name and kind; never its input |
| `agent.created` | `Agent created:` |
| `agent.archived` | `Agent archived:` |

A ticket agent is the one that carries the labels `wave` and `ticket`, as the wave skill starts every ticket agent; any other agent is left alone. Its orchestrator is its `parentAgentId`; an agent with none has nobody to tell. When `isRunning` reports the orchestrator mid-turn, the message is held and all held messages go out as one when that orchestrator's `agent.turn_ended` fires; an orchestrator that is archived loses what was held. A host that cannot say whether the orchestrator runs is treated as idle, and the message goes out at once.

Every text lives in `server/messages.ts`, one line per message and `combine` for the held ones, so a line every message ends with is one edit there. The heartbeat path in the skills stays the fallback while the plugin is off; that is a change in `hanh9898/matt-with-paseo`, not here.

### The waiting pill

A checkpoint is Paseo's own `AskUserQuestion` prompt (ADR 0001), so the plugin draws no card for it. It adds one composer pill that counts what waits for the user in a chat, and shows the count on the pill; at zero the pill is hidden, so an agent with nothing pending looks as Paseo made it.

`server/hooks/waiting-count.ts` keeps the open requests from `agent.permission_requested` and drops one on `agent.permission_resolved`, on its agent's `agent.turn_ended` and on `agent.archived`. A request counts toward the chat where the user sees it:

| Agent, recognised by its labels | Its request counts toward |
|---|---|
| a ticket agent: `wave` and `ticket` | its orchestrator (`parentAgentId`); none when it has no parent |
| the stream agent: `stream` and no `wave` | itself |
| any other agent | nothing (T3) |

The count travels over the `waiting.count` RPC (`shared/waiting.ts`), served through the port's `serveWaitingCount`. `client/waiting-pill.ts` puts a pill on each agent that has a workspace, those listed when the plugin starts and those that appear later, and reads its count again when an agent updates or goes away, every 30 seconds, and when the pill is pressed; a failed read leaves the pill as it was. Every text the pill shows is in `client/pill-text.ts`, and a check fails when another client file writes one. The client imports no Paseo SDK beyond `index.client.ts`'s context type and the RPC contract, so `test/host-port.test.ts` names those two files beside the adapter.

### Harness descriptors

An agent is data. `harness/<agent>.json` holds every fact the plugin needs of that agent, the file name is the agent's id, and no code names an agent (`test/agent-names.test.ts` fails when a module outside `test/` does). Only `claude.json` ships.

| Field | Takes |
|---|---|
| `configDirVar` | The environment variable that names the agent's config directory |
| `skillsDir` | The skills directory, relative to the config directory |
| `skills` | `native`: the agent loads the plugin's skills itself. `provisioned`: the plugin lays them down |
| `mcpDelivery` | `agent-config`: MCP servers ride the launch config edited before the agent is created. `config-file`: they go in a file in the config directory |

To add an agent, add `harness/<agent>.json` with every field; nothing else changes. `loadHarnesses` in `server/harness.ts` returns the descriptors keyed by id, and `test/harness-contract.test.ts` checks each file in the folder.

To add a field, add one row to `HARNESS_FIELDS` in `shared/harness.ts` (its check and what it expects) and its value to each `harness/<agent>.json`, after the last field. The descriptor's type, the loader's refusal of a file without the field and the contract test all read that table. To give an existing field new values, change its row. Fields still to come: `guard` (ticket 02) and `sandboxed` (ticket 19).

Paseo loads only the entries and the `client/`, `server/` and `shared/` folders, so `harness/` is listed in `files` in `package.json`, and the loader reads it as files at run time from `new URL("../harness/", import.meta.url)`. It is not a code import, so the descriptors stay data. Whether that URL resolves to the plugin's root in the daemon's compiled bundle is not verified yet: no entry calls the loader until a later ticket does.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Every contributor follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report a vulnerability as [SECURITY.md](SECURITY.md) says. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

For agents and for reviewers: [`AGENTS.md`](AGENTS.md) points to the [coding standards](CODING_STANDARDS.md), the [evidence standards](docs/agents/evidence-standards.md) and the [ship rules](docs/agents/ship-rules.md).

## Licence

MIT, see [LICENSE](LICENSE).
