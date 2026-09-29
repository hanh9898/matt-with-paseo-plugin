# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository setup: agent documents (`AGENTS.md`, `docs/agents/`), coding standards, evidence standards, ship rules, pull request and issue templates, and community files.
- Plugin skeleton: `paseo-plugin.json` declaring `requirements.paseo` as `>=0.10.1 <0.11.0`, the Paseo version the smoke test targets (`0.10.1`), a strict TypeScript package, one entry module, and a test folder with a smoke test.
- One narrow host port: `server/host.ts` is the interface hook handlers use to reach Paseo, `server/paseo-host.ts` is the only module that imports the Paseo SDK, and `test/support/fake-host.ts` is the fake adapter that lets handlers be tested without a daemon.
- Harness descriptors: `harness/claude.json` holds every agent-specific fact (config directory variable, skills directory and mode, MCP delivery), `shared/harness.ts` is the field table, `server/harness.ts` loads the folder, and two checks fail when a descriptor breaks the contract or source code names an agent id.
- Lifecycle relay: a ticket agent's turn end, pending permission, creation and archive reach its orchestrator as a message, held while the orchestrator's own turn runs, so supervision needs no heartbeat. The port gained `isRunning`; the texts live in `server/messages.ts`.
- Composer pill: each agent's composer gets a pill that counts what waits for the user (a ticket agent's open request counts toward its orchestrator, the stream agent's toward itself) and hides at zero. The port gained `onPermissionResolved` and `serveWaitingCount`; the pill's texts live in `client/pill-text.ts`. Checkpoints stay Paseo's native `AskUserQuestion`: no custom card.
- Git guard: a ticket agent's `git push`, `git checkout` and other branch-moving git are refused by a Node hook script (`guard/git-guard.mjs`, run from `hooks/hooks.json`), only where `MWP_ROLE=ticket` is set; a `beforeCreate` handler sets it for agents titled `[Wave N] <NN> ...`, so the orchestrator keeps its git. The harness descriptor gained the `guard` field (`hook` or `path-shim`), and the port hands `beforeCreate` the agent's title.
- One version token: the version lives in `package.json`, and a check fails, naming both files, when `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` or the contract version (`CONTRACT_VERSION` in `shared/contract.ts`) differs from it, or when `package.json` names the package differently from the Paseo id in `paseo-plugin.json`, or the marketplace entry differently from `plugin.json`. The two Claude Code manifests are new, so this repository loads as a Claude Code plugin, named `matt-with-paseo-plugin` (the Paseo id stays `matt-with-paseo`) so it can be enabled beside the skills repository's plugin, and `hooks/hooks.json` can take effect.
- Sandbox capability: the harness descriptor gained the `sandboxed` field (`true` or `false`), stated for every agent and required by the contract test; `harness/claude.json` says `true`. Nothing reads it yet, since no code routes work by harness and no screen shows one.
- Situational instruction on the event: every message the plugin sends an agent ends with a `Next:` line naming the moves open to its reader, the four relay messages (by outcome for a turn end, by kind for a request) and the git guard's refusal; `combine` keeps one `Next:` line at the end of a held message. A check fails when a message type lacks the line.
- Role identity: a role is read from the agent's labels (`wave` and `ticket` for a ticket agent, `stream` for the stream agent) through one helper, `shared/role-labels.ts`, which the relay and the waiting count now share, and from the env marker inside the agent; the plugin registers no provider per role, and a check fails when its code calls the SDK's provider API. A hand-started agent still needs a provider of its own.
