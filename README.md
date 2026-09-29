# matt-with-paseo-plugin

A [Paseo](https://paseo.sh) plugin for [matt-with-paseo](https://github.com/hanh9898/matt-with-paseo).

## What it is for

matt-with-paseo-plugin is an optional Paseo plugin for people who run the `matt-with-paseo` skills, above all people who run streams unattended. It lets the orchestrator see what its agents do without polling, answers the checkpoints the owner has delegated, and wires each ticket agent when it is created. The skills stay the core and still run without the plugin.

The design case is the unattended stream; a single wave is helped too. The plugin supports Windows, macOS and Linux. Claude Code only; other agents prepared through descriptors, not promised.

What the plugin will never do is written in [ADR 0002](docs/adr/0002-what-the-plugin-will-never-do.md). Where it is going, release by release, is in the [roadmap](docs/roadmap.md).

## Development

The plugin is a Paseo plugin written in TypeScript. Node 22.18 or later runs the tests without a build step; the plugin was tested on Node 22, and `package.json` has no `engines` field, so npm does not refuse another version.

Install from a clone: `git clone https://github.com/hanh9898/matt-with-paseo-plugin`, `cd matt-with-paseo-plugin`, `npm ci`, then `paseo plugin install <path to the clone>` (the smoke test runs the same command with a plugin id, `--id`). The Claude Code half installs as `matt-with-paseo-plugin@matt-with-paseo-plugin` (see the Claude Code plugin paragraph below). Nothing is published to npm.

Supported Paseo host: `>=0.10.1 <0.11.0` (`requirements.paseo` in [`paseo-plugin.json`](paseo-plugin.json)), tested on Paseo `0.10.1`. The [smoke test](test/smoke/README.md) targets that version. When Paseo cuts a new minor, the [release checklist](docs/agents/release-checklist.md) widens the range after the smoke test passes on it.

| Path | Holds |
|---|---|
| `paseo-plugin.json` | The manifest: the plugin id and the supported Paseo range |
| `.claude-plugin/plugin.json` | The Claude Code plugin manifest: name and version, so this repository loads as a Claude Code plugin |
| `.claude-plugin/marketplace.json` | The Claude Code marketplace that lists this one plugin, for `claude plugin install` |
| `index.server.ts` | The server entry, run in the daemon subprocess |
| `index.client.ts` | The client entry, run in the app: it starts the composer pill |
| `client/` | App-side code the client entry imports |
| `client/waiting-pill.ts` | The composer pill: one per agent, hidden at zero |
| `client/pill-text.ts` | Every text the pill shows |
| `server/` | Daemon-side code the entry imports |
| `server/host.ts` | The host port: the events a handler receives, the actions it may take, where it registers |
| `server/paseo-host.ts` | The one adapter of the port that imports the Paseo SDK |
| `server/hooks/` | The hook handlers, one module per handler |
| `server/hooks/gate-cap.ts` | The gate cap handler: tells the orchestrator when ticket agents run past the cap |
| `server/hooks/lifecycle-relay.ts` | The handler that tells an orchestrator what its ticket agents do |
| `server/hooks/waiting-count.ts` | The handler that counts what waits for the user, per chat |
| `server/hooks/ticket-marker.ts` | The handler that sets the ticket marker in a ticket agent's environment |
| `server/hooks/stall-sensor.ts` | The handler that flags a ticket agent that may have stalled, and tells its orchestrator only then |
| `server/sensor.ts` | The sensor: loads the conditions and checks them one at a time against a turn end's facts |
| `sensor/` | The sensor's conditions, `conditions.json`: data, not code |
| `server/human-words.ts` | Finds the messages a person typed in a ticket agent's chat, told from the orchestrator's prompts |
| `server/messages.ts` | The texts the plugin sends to an orchestrator, one per message type |
| `shared/` | Code and contracts both runtimes import |
| `shared/harness.ts` | The harness descriptor's field table and its checks |
| `shared/waiting.ts` | The `waiting.count` RPC the pill reads |
| `shared/role-marker.ts` | The name and value of the ticket marker: the one place that names it |
| `shared/role-labels.ts` | The role labels: what marks an agent as a ticket agent or the stream agent |
| `shared/contract.ts` | The contract version between the skills and the plugin: `CONTRACT_VERSION` |
| `shared/state-location.ts` | Where the plugin keeps its state (a per-user directory, one setting) and the one marked block it may write in a repository |
| `server/state.ts` | The one module that writes a file: under the state directory, or into the marked block |
| `shared/gate-cap.ts` | The gate cap: the default share, the setting that adjusts it and the count it gives |
| `server/harness.ts` | The loader of the descriptors |
| `harness/` | One descriptor per agent, `<agent>.json`: data, not code |
| `shared/cost-levels.ts` | The cost levels: the roles, the two settings, and the reader that gives a role its agent and model |
| `server/cost-levels.ts` | The loader of the presets file |
| `presets/` | The cost level presets, `cost-levels.json`: data, not code |
| `guard/git-guard.mjs` | The git guard: a standalone Node script a `PreToolUse` hook runs |
| `hooks/hooks.json` | The hook file that runs the guard for an agent that loads the plugin |
| `test/` | The tests (`*.test.ts`) and the [smoke test](test/smoke/README.md) |
| `test/support/fake-host.ts` | The fake adapter of the port, for tests |
| `test/support/version-token.ts` | Reads every spelling of the version and the plugin id, and names the files that disagree |
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

A test builds a `FakeHost` from `test/support/fake-host.ts`, passes it as the hooks, emits the event Paseo would send, and reads what the handler did. No daemon and no SDK are involved. `await host.create({ env, title })` returns the environment after every `beforeCreate` handler, in the order they registered; a handler receives `{ env, title }`, the only marks of the agent before Paseo sets its labels. `host.setLabels(agentId, labels)` sets what `labelsOf` reports. A handler that throws is recorded in `failures` instead of reaching the test, as the real adapter keeps it out of Paseo.

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

Every text lives in `server/messages.ts`: its body on one line, then a last `Next:` line that names the moves open to the orchestrator, in the wave skill's tools and words (`get_agent_activity`, `list_pending_permissions`, `respond_to_permission`, checkpoint). A check fails when a message type or case has no `Next:` line. `combine` takes the held messages apart at their `Next:` lines and writes one at the end with each message's moves, a shared move once, so a held message ends with one `Next:` line; each move names its ticket for that reason. The git guard's refusal, the one other text that reaches an agent (a ticket agent, on stderr), ends with a `Next:` line too; the guard is a standalone script, so its wording lives in `guard/git-guard.mjs` and a check reads its last line. The heartbeat path in the skills stays the fallback while the plugin is off; that is a change in `hanh9898/matt-with-paseo`, not here.

### Human words

A person can steer a ticket agent the orchestrator believes it controls, by typing in the agent's own chat. `server/hooks/lifecycle-relay.ts` reads the `timeline` that Paseo hands `agent.turn_ended` and, when it holds a user message the relay has not told yet, puts a `Human words:` message (from `server/messages.ts`) ahead of the turn end in the same message to the orchestrator. It names the ticket, the agent and the ids of the user's messages, never their text (a message can hold a credential); its `Next:` line sends the orchestrator to `get_agent_activity` to read them, and to record in the ticket's report that the user spoke and whether it changed the plan. The owner lookup and the hold are the relay's: a ticket agent is recognised by its labels, its orchestrator is its `parentAgentId`, and a busy orchestrator gets the words with what else is held.

The orchestrator prompts its ticket agents too (the first prompt of `create_agent`, `send_agent_prompt`), and each prompt reaches the timeline as a `user_message` item. `server/human-words.ts` tells the two apart by `clientMessageId`: a client (the app, the CLI) sends one with what a person types, and the orchestrator's tools send none, so its prompts carry only Paseo's own `messageId`. That was read in the `0.10.1` daemon's source, not run; the smoke test "Human words" confirms it on a real host. An item with no `clientMessageId` counts as the orchestrator's, so a prompt is never passed on as a person's, and a client message sent without an id is missed. The timeline is the agent's whole history, so the relay keeps the ids it has told per agent and forgets them at `agent.archived`; after a restart of the plugin, the first turn end tells a ticket agent's earlier messages once. A steer typed mid-turn reaches the orchestrator when that turn ends, since the port has no per-item event.

"The report lists it" is the skills' part. The plugin's part is the message with a stable `Human words:` lead and the ids, so an orchestrator can list it; the orchestrator's summary is written by the wave and stream skills in `hanh9898/matt-with-paseo`, which is not touched here.

### The waiting pill

A checkpoint is Paseo's own `AskUserQuestion` prompt (ADR 0001), so the plugin draws no card for it. It adds one composer pill that counts what waits for the user in a chat, and shows the count on the pill; at zero the pill is hidden, so an agent with nothing pending looks as Paseo made it.

`server/hooks/waiting-count.ts` keeps the open requests from `agent.permission_requested` and drops one on `agent.permission_resolved`, on its agent's `agent.turn_ended` and on `agent.archived`. A request counts toward the chat where the user sees it:

| Agent, recognised by its labels | Its request counts toward |
|---|---|
| a ticket agent: `wave` and `ticket` | its orchestrator (`parentAgentId`); none when it has no parent |
| the stream agent: `stream` and no `wave` | itself |
| any other agent | nothing (T3) |

The count travels over the `waiting.count` RPC (`shared/waiting.ts`), served through the port's `serveWaitingCount`. `client/waiting-pill.ts` puts a pill on each agent that has a workspace, those listed when the plugin starts and those that appear later, and reads its count again when an agent updates or goes away, every 30 seconds, and when the pill is pressed; a failed read leaves the pill as it was. Every text the pill shows is in `client/pill-text.ts`, and a check fails when another client file writes one. The client imports no Paseo SDK beyond `index.client.ts`'s context type and the RPC contract, so `test/host-port.test.ts` names those two files beside the adapter.

### Plain words on screen

The skills' words blocks (`hanh9898/matt-with-paseo`: **Wave**, **Checkpoint**, **Brief**, **Stream**, **Hold** and the rest) are precise words for agents, and internal words confused people when they reached a screen. `client/pill-text.ts` holds `PLAIN_LABELS`, one plain label for each of those terms, and a text the pill shows takes its wording from there; the pill's own words today ("Waiting for you", the count) use no precise term. `test/plain-words.test.ts` fails when a text the pill shows, or a literal in any other client file, uses a precise term without its plain label beside it, when a term has no label, or when a label uses a precise term.

The precise terms stay where agents read them: the messages in `server/messages.ts` and this Development section keep them, and a check fails when a server or shared module imports the pill's words. The skills themselves are in `hanh9898/matt-with-paseo` and are not touched here; the plain wording of a checkpoint question is the skills' brief wording, since the question is the orchestrator's own `AskUserQuestion` text (ADR 0001).

The first release draws no custom checkpoint card, and no report card exists in this repository yet, so the pill is the one screen the check covers. A card file added to `client/` is covered by the same check as soon as it exists.

### The git guard

A ticket agent runs in a worktree with broad permissions, and the orchestrator ships its branch. The guard keeps the ticket agent's git to its own branch: with the ticket marker set, a shell tool call that runs `git push`, `git checkout`, `git switch`, `git rebase`, `git merge`, `git pull`, `git reset --hard`, `git clean -f`, `git branch -D` or `git restore .` is refused with a message that says the orchestrator runs it. `git commit`, `git add`, `git status`, `git diff`, `git log` and every other command pass. Where the marker is not set, nothing is refused, so the orchestrator pushes and cleans up as before.

| Part | Where | Does |
|---|---|---|
| The marker | `shared/role-marker.ts` (`ROLE_ENV`, `TICKET_ROLE`) | Names `MWP_ROLE=ticket`; the guard, the handler and ticket 14 all read it |
| The handler | `server/hooks/ticket-marker.ts` | In `beforeCreate`, adds the marker to the environment of an agent titled `[Wave N] <NN> <ticket name>`, as the wave skill titles every ticket agent |
| The guard | `guard/git-guard.mjs` | Reads the tool call on stdin, exits 2 with the message on stderr to refuse; fails open |
| The hook file | `hooks/hooks.json` | Runs `node "${CLAUDE_PLUGIN_ROOT}/guard/git-guard.mjs"` in a `PreToolUse` hook for `Bash` and `PowerShell`, for an agent that loads this repository as a plugin |
| The descriptor | `guard` in `harness/<agent>.json` | `hook` for an agent that runs hooks; `path-shim` for one that does not |

The handler recognises the agent by its title, not by its labels (T3 names labels): Paseo sets labels after the `agent.create` hook has run and gives the hook no agent id, so the title is all the hook sees. The guard is one Node file so that Windows, macOS and Linux run the same code, and nothing is written into any agent's settings: the hook file reaches an agent through the plugin.

What it does not cover:

- Only the `hook` value is built; no `path-shim` exists yet.
- The hook file takes effect once an agent loads this repository as a Claude Code plugin: `.claude-plugin/plugin.json` makes it loadable, and someone still has to enable it for the ticket agents.
- An agent Paseo resumes after a daemon restart is not re-marked: the environment set at creation is not kept, and only an `agent.session_open` hook could set it again, when labels are readable.
- It reads a command as a shell splits it and sees through `&&`, `;`, `|`, `$( )`, `bash -c`, `eval`, `env`, `sudo` and `git -C dir`; it does not follow a git alias or a program that runs git for the agent. It is a guardrail against a ticket agent's habits, not a sandbox.

The checks are `test/guard/git-guard.test.ts` (the script, run as the hook runner runs it), `test/guard-wiring.test.ts` and `test/hooks/ticket-marker.test.ts`; the proof on the three systems and on a real host is written in the [smoke test](test/smoke/README.md).

### Role identity

A role is what an agent is to the plugin: a ticket agent, the stream agent, or neither. The plugin gives a role no provider: it registers none with Paseo (no `registerProvider`) and writes none into the daemon's config (no `providers` or `agentProfiles` patch), so the picker holds only the providers Paseo and the user added, and a provider is needed only for a hand-started agent. The wave skill puts the role on the agent's labels, and the plugin reads it from wherever it can see the agent:

| Where the plugin sees the agent | How it tells the role | Read by |
|---|---|---|
| An event hook (`onCreated`, `onTurnEnded`, `onPermissionRequested`, ...) | The labels: a ticket agent carries `wave` and `ticket`, the stream agent `stream` and no `wave`; `shared/role-labels.ts` names them | `lifecycle-relay.ts`, `waiting-count.ts` |
| A hook that runs inside the agent | The env marker `MWP_ROLE=ticket`: `hasTicketMarker(env)` in `shared/role-marker.ts` reads it, and the standalone `guard/git-guard.mjs` repeats its two words | the git guard |
| `beforeCreate` | The title `[Wave N] <NN> <ticket name>`: Paseo `0.10.1` sets labels only after this hook, and gives it no agent id | `ticket-marker.ts`, which sets the marker |

The env marker exists because an event carries no environment, and a hook inside the agent cannot ask Paseo for labels. An agent without the marker is the orchestrator or one the plugin does not know, and keeps the environment Paseo made for it; an agent without the labels is left alone (T3). The title is the one place the plugin recognises an agent by something other than its labels (ticket 02's decision), and only where the labels do not exist yet.

`test/no-role-provider.test.ts` fails when the plugin's code touches the SDK's provider API or the entry reaches for anything but `on`, `before` and `handle`. `test/role-marker-guard.test.ts` runs the guard over environments and fails when it refuses anywhere `hasTicketMarker` says no, or lets a ticket agent through.

### Harness descriptors

An agent is data. `harness/<agent>.json` holds every fact the plugin needs of that agent, the file name is the agent's id, and no code names an agent (`test/agent-names.test.ts` fails when a module outside `test/` does). Only `claude.json` ships.

| Field | Takes |
|---|---|
| `configDirVar` | The environment variable that names the agent's config directory |
| `skillsDir` | The skills directory, relative to the config directory |
| `skills` | `native`: the agent loads the plugin's skills itself. `provisioned`: the plugin lays them down |
| `mcpDelivery` | `agent-config`: MCP servers ride the launch config edited before the agent is created. `config-file`: they go in a file in the config directory |
| `guard` | `hook`: the agent runs the plugin's `PreToolUse` hook, which is the git guard. `path-shim`: an agent without hooks gets a `git` shim first on its path |
| `sandboxed` | `true`: the agent has a sandbox that can confine its file writes, so the plugin can rely on it. `false`: it has none, and what it may write is only as safe as its permissions |

To add an agent, add `harness/<agent>.json` with every field; nothing else changes. `loadHarnesses` in `server/harness.ts` returns the descriptors keyed by id, and `test/harness-contract.test.ts` checks each file in the folder.

To add a field, add one row to `HARNESS_FIELDS` in `shared/harness.ts` (its check and what it expects) and its value to each `harness/<agent>.json`, after the last field. The descriptor's type, the loader's refusal of a file without the field and the contract test all read that table. To give an existing field new values, change its row. `sandboxed` is a capability the descriptor states, not a setting the plugin turns on: an agent that lacks a sandbox must say `false`, so it does not look like one that has it. Routing and the UI are meant to read it, but nothing reads it yet: no code routes work by harness and no screen shows one, so the field is data only until a ticket adds that reader.

Paseo loads only the entries and the `client/`, `server/` and `shared/` folders, so `harness/` is listed in `files` in `package.json`, and the loader reads it as files at run time from `new URL("../harness/", import.meta.url)`. It is not a code import, so the descriptors stay data. Whether that URL resolves to the plugin's root in the daemon's compiled bundle is not verified yet: no entry calls the loader until a later ticket does.

### The cheap sensor

Reading every ticket agent's transcript with a strong model is too costly, and reading none misses a stall. The sensor sits in front of the orchestrator's stall judgement (the wave skill's heartbeat judgement, in `hanh9898/matt-with-paseo`): at each ticket agent's turn end it checks the conditions of `sensor/conditions.json`, one at a time, against facts the turn end already carries, and sends the orchestrator a `Stall suspected:` message, ending with its `Next:` line, only when one is flagged. A turn that flags nothing sends nothing.

| Field of a condition | Takes |
|---|---|
| `id`, `says` | The name, and the one line the message quotes |
| `check` | `code`: a fact and a comparison. `model`: a question for a small model |
| `fact` | `outcome`, `newItems` (timeline items added since the last turn end), `newToolCalls`, `tailRepeats` (the last timeline item is the one of the last turn end) |
| `is`, `atMost`, `atLeast` | Exactly one: the word the fact equals, or the number it stays at most or at least |
| `times` | The turns in a row it must hold before it flags; it flags again at each further multiple |

To add a condition, add an entry to `sensor/conditions.json`; a file that breaks the shape fails to load, and `test/sensor.test.ts` names why. To add a fact, add it to `Facts` and `factsOf` in `server/sensor.ts`. The message text is `MESSAGES.stallSuspected` in `server/messages.ts`; it carries the conditions' `says` lines and never a timeline item or an error message (T6).

What it does not do:

- No model is wired. `off-task` is a named slot (`check: "model"`, `model: null`): the data holds its question, and the sensor lists it and never flags it, until a later ticket gives it a caller.
- It sees turn ends only. The port has no clock, so an agent whose turn never ends is not seen; the orchestrator's own heartbeat rounds still cover that, as before the sensor.
- It does not judge: the flagged case goes to the orchestrator's stall judgement, which decides. The skill's part of the change is in `hanh9898/matt-with-paseo`.
- The `tool_call` item type and the `text` and `name` fields it reads are those of Paseo `0.10.1`'s timeline as read, not run; the smoke test ("Cheap sensor") confirms them.
- No eval case is written: `claude plugin eval` runs a Claude Code plugin's prompts, and this repository's Claude Code plugin holds one `PreToolUse` hook and no skill, so no eval prompt can reach the sensor, which lives in the Paseo plugin. The proof that a stalled agent is still caught is `test/hooks/stall-sensor.test.ts`, on the fake host, and the smoke test on a real one.

The checks are `test/sensor.test.ts`, `test/hooks/stall-sensor.test.ts` and `test/sensor-docs.test.ts`. `sensor/` is listed in `files` in `package.json`, and `loadConditions` reads it at run time from `new URL("../sensor/conditions.json", import.meta.url)`; whether that resolves in the daemon's compiled bundle is not verified yet (the same open point as `harness/`).

### The gate cap

Many worktrees running tests at once can starve one machine. The cap is a share of the machine's processors: how many gates (test runs and setup commands) may run at once. The default is half of them (`0.5`), rounded down and at least one, so eight processors give a cap of four. The setting is the environment variable `MWP_GATE_SHARE`, read from the daemon's environment when the plugin starts: a number above 0 and at most 1 (`0.25` on eight processors gives two). Any other value falls back to the default, so a typo never stops a wave. The default and the setting's name live in `shared/gate-cap.ts`, and `gateCap` there gives the count.

A ticket agent runs its own gates, so the ticket agents that run at once bound the gates that run at once. When a ticket agent is created and, with it, more ticket agents of one orchestrator run than the cap allows, the plugin sends that orchestrator a `Gate cap passed:` message (`MESSAGES.gateCapPassed`), ending with its `Next:` line: queue the ready tickets past the cap and spawn the next only when a ticket agent's turn end or archive shows fewer running. A message for an orchestrator that is mid-turn is held and goes out when its turn ends. Agents are counted by their labels (`wave` and `ticket`), and a host that cannot say who runs counts that agent as not running.

Which part is whose:

| Part | Where |
|---|---|
| The cap, its default, its setting, and the message that carries it to the orchestrator | This repository: `shared/gate-cap.ts`, `server/hooks/gate-cap.ts`, `MESSAGES.gateCapPassed` |
| Holding the ready tickets past the cap in a queue instead of spawning them (the wave skill's quota does this for its own limit) | The skills' part, in `hanh9898/matt-with-paseo`: the wave skill reads the message, or the cap, and spawns the next ticket only under it |

What it does not do:

- It does not stop a spawn, and it does not stop a ticket agent's shell command. The message reaches the orchestrator after the agent is created, and the plugin's only path to a shell command is the git guard's hook, which refuses git and holds no count across processes. A hook that gates test and setup commands needs a slot count shared between the agents' processes, with an expiry for a slot a crashed command never freed; that is a separate change.
- It counts ticket agents, not the commands they run: an agent idle in a turn counts as running, and one running two gates counts once.
- The setting is read once, at start: a change takes effect when the daemon restarts the plugin. The plugin adds no settings screen: the variable is the setting.

The checks are `test/gate-cap.test.ts`, `test/hooks/gate-cap.test.ts` and `test/gate-cap-docs.test.ts`; the smoke test ("Gate cap") runs it on Paseo `0.10.1`.

### Cost levels

A new user cannot choose every role's agent and model at once, so the plugin ships three presets that choose them together. `presets/cost-levels.json` holds them, and it is the only place they are written:

| Level | What it sets |
|---|---|
| Cheap (`cheap`) | A small model in every role |
| Balanced (`balanced`, the default) | A strong model for the stream and wave roles, a mid model for the ticket role |
| Max (`max`) | The strongest model for the stream and wave roles, a strong one for the ticket role |

A level sets three roles, `stream`, `wave` and `ticket`, each to an `agent` (an id from `harness/`) and a `model`. The presets sit on top of Paseo's own profiles (`list_profiles`, which read `provider`, `model`, `modeId` and `thinkingOptionId`): a level names an agent and a model and nothing else, so the mode and the thinking level stay the profile's. The plugin only reads: it never creates, edits or deletes a profile, and `overlay` in `shared/cost-levels.ts` returns a copy of a profile with the choice on top.

Two settings, read from the daemon's environment; a value that does not parse falls back, so a typo never stops a wave.

| Setting | Takes | Falls back to |
|---|---|---|
| `MWP_COST_LEVEL` | A level's id, in any case: `cheap`, `balanced` or `max` | The file's `default` |
| `MWP_COST_STREAM`, `MWP_COST_WAVE`, `MWP_COST_TICKET` | `agent/model` (for example `claude/claude-opus-5-5`), for that one role | The level's choice for that role |

The override is per role: `MWP_COST_LEVEL=cheap` with `MWP_COST_TICKET=claude/claude-sonnet-5-5` runs every role on the cheap level except the ticket role. To change a level or add one, edit `presets/cost-levels.json`; `loadCostLevels` in `server/cost-levels.ts` refuses a file that breaks the shape, naming it. Model ids belong in that file and agent ids in `harness/`: no code names either.

Which part is whose. The "setup offers the presets" criterion means the skills' own setup, where the orchestrator chooses how agents launch. The plugin's part is the presets, the two settings and the reader. The skills' part is in `hanh9898/matt-with-paseo`: setup lists the levels from `presets/cost-levels.json` (or reads them through `choiceFor`), lets the user pick one and override a role, and copies the chosen agent and model, with the profile's `modeId` and `thinkingOptionId`, into `create_agent`. Nothing in this repository launches an agent, so the plugin calls no reader itself; whether the installed plugin's `presets/` is found by the skills is unverified until the smoke test ("Cost levels") runs on Paseo `0.10.1`.

The checks are `test/cost-levels.test.ts` and `test/cost-levels-docs.test.ts`.

### State outside the repository

A public plugin should not litter the repositories it works in. The plugin keeps whatever must outlive a process in a per-user directory, and writes into a target repository at most one marked block. Both are named in one module, `shared/state-location.ts`: the directory is `matt-with-paseo` (`STATE_DIR_NAME`) under the platform's per-user data folder (`$XDG_DATA_HOME` or `~/.local/share` on Linux, `~/Library/Application Support` on macOS, `%LOCALAPPDATA%` on Windows), and the environment variable `MWP_STATE_DIR` set to an absolute path moves it. The one block is the text between `<!-- matt-with-paseo:begin -->` and `<!-- matt-with-paseo:end -->` in the repository's `AGENTS.md` (`MARKED_BLOCK`); `withMarkedBlock` replaces it in place, and refuses a file whose markers do not make exactly one block.

`server/state.ts` is the one module that writes a file: `writeStateFile` and `readStateFile` take a name inside the state directory and refuse one that leaves it, and `writeMarkedBlock` sets the block. Nothing calls them yet, because nothing the plugin holds needs to persist:

| Holder | What it keeps | Where |
|---|---|---|
| `server/hooks/gate-cap.ts` | Which ticket agents run, per orchestrator, and the messages held for a busy one | In memory |
| `server/hooks/lifecycle-relay.ts` | The agents seen, the messages held for a busy orchestrator, what each was told | In memory |
| `server/hooks/stall-sensor.ts` | Each agent's last turn, its streaks per condition, the messages held | In memory |
| `server/hooks/waiting-count.ts` | The requests open in each agent's chat | In memory |
| `client/waiting-pill.ts` | The pill registered for each agent | In memory |
| `server/harness.ts`, `server/sensor.ts` | Nothing: they read the plugin's own `harness/` and `sensor/` files | Read only |

A restart of the plugin forgets what those hold and starts from the next event, as it did before; the holders that would need to survive one (a gate queue across a daemon restart, say) add their row here and write through `server/state.ts`.

`test/state-outside-repo.test.ts` fails when any module of the plugin other than `server/state.ts` imports a file-writing API of `node:fs` (only reads pass) or `node:child_process`, however the import is spelled, and when another module names where the state lives. It reads the imports, so it does not see a write made by a program the plugin starts through some other route; `node:child_process` is refused for that reason. The check runs at the milestone run; the smoke test ("State outside the repository") reads a real host's state directory and a repository's diff on Paseo `0.10.1`.

The state rule covers the plugin's own writes. The wave skill's `wave<N>-common-rules.md` stays in the integration branch's checkout, as the skill writes it, by the user's decision on #12; the plugin writes none of them.

### One version token

The plugin's version, id and Claude Code name are spelled in several files, and a spelling that lags fails silently: Claude Code takes `plugin.json`'s version over the marketplace entry's without saying so. The version lives in one place, `version` in `package.json`; every other spelling is checked against it. The Paseo id is checked against `paseo-plugin.json`, and the Claude Code name is the one exception to it.

| Identifier | Spelled in | Checked against |
|---|---|---|
| Version | `.claude-plugin/plugin.json` `version`, `.claude-plugin/marketplace.json` `plugins[0].version`, `shared/contract.ts` `CONTRACT_VERSION` | `package.json` `version` |
| Paseo id (`matt-with-paseo`) | `package.json` `name` | `paseo-plugin.json` `id` |
| Claude Code name (`matt-with-paseo-plugin`) | `.claude-plugin/marketplace.json` `plugins[0].name` | `.claude-plugin/plugin.json` `name` |

`paseo-plugin.json` carries no version: Paseo's manifest schema takes `id`, `description`, `requirements` and `build` and no other key (read in `@getpaseo/server` `0.10.1`), so the file takes part through its id. The contract version between the skills and the plugin is the version token itself, read by the skills from the plugin's version.

`test/version-token.test.ts` runs the check (`test/support/version-token.ts`) and fails with one line per spelling that differs, naming that file and the one that holds the token. To release, change `version` in `package.json`, then in the three other places; `npm test` names any that lags.

The Claude Code plugin and its marketplace are both named `matt-with-paseo-plugin`, not `matt-with-paseo`: the skills repository's plugin and marketplace have that name, ticket agents enable both plugins, and a user registers one marketplace per name. The plugin installs as `matt-with-paseo-plugin@matt-with-paseo-plugin`. The Paseo id stays `matt-with-paseo`.

### CI on three systems

`.github/workflows/ci.yml` runs `npm ci`, `npm run typecheck` and `npm test` on `ubuntu-latest`, `macos-latest` and `windows-latest`. It starts only on a push to a `release/v*` branch and on a pull request from one into `main`, so it runs at the milestone run and on no stream's ship pull request, as the [evidence standards](docs/agents/evidence-standards.md) require. There is no pre-commit hook: a hook that runs typecheck and tests on every commit would break that rule. Whether to add one waits for a decision after milestone `v0.5.0`. `test/ci-workflow.test.ts` reads the workflow and fails when a system, a command or a trigger differs.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Every contributor follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report a vulnerability as [SECURITY.md](SECURITY.md) says. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

For agents and for reviewers: [`AGENTS.md`](AGENTS.md) points to the [coding standards](CODING_STANDARDS.md), the [evidence standards](docs/agents/evidence-standards.md) and the [ship rules](docs/agents/ship-rules.md).

## Licence

MIT, see [LICENSE](LICENSE). [NOTICE](NOTICE) credits sting9k/seatworks at `6d316b0` as the source of the lessons and the adapted designs.
