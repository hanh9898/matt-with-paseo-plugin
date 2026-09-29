# Checkpoints use Paseo's native questions, answered by the plugin under delegation

Status: accepted, 2026-09-29

## Context

`matt-with-paseo` (the skills) will gain this plugin to replace heartbeat supervision and to let the user delegate checkpoints (hanh9898/matt-with-paseo#67). Before writing the plugin, a throwaway prototype had to prove three things on Paseo daemon 0.10.1, plugin SDK 0.10.1, on Windows:

1. whether `before('agent.create')` can add env and config to a Claude agent without failing its creation;
2. whether a checkpoint can reach the user as a card and return an answer;
3. whether a composer pill can count what waits for the user.

The prototype marked only agents whose title starts with `[mwp-proto]` and left every other agent untouched. A Claude Haiku probe agent, created as a subagent of an orchestrator session, ran a shell command and asked two `AskUserQuestion` questions.

## Findings

| Probe | Result |
|---|---|
| `before('agent.create')` adds `env` | Proven. The probe read `MWP_ROLE=ticket`; creation did not fail. |
| `agent.permission_requested` for a question | Fires with `kind: "question"`, `name: "AskUserQuestion"`, the full `input.questions`, and the agent's `parentAgentId`. |
| The plugin answers a question for the user | Proven. `respondToPermission` with `behavior: "allow"` and `updatedInput.answers` answered it 28 ms after the request; the agent carried on with that answer. |
| A plugin card in the parent's chat | `timeline.append` was accepted, and the user confirmed the card and the pill appeared. The user answered through Paseo's own question prompt in the asking agent's chat instead, so the card's button round trip (`checkpoint.answer` RPC to `respondToPermission`) was not exercised. |
| Answer keys | Paseo's own prompt keys `updatedInput.answers` by the question's `header` (`{"Colour": "Red"}`). An answer keyed by the question text was also accepted. |
| Cost | `lastUsage.totalCostUsd` appears on the agent after its turn ends (0.0817 USD here), not while it runs. |
| Notifications | Paseo still notified the parent of the question the plugin had already answered. |

## Decision

- A checkpoint is an `AskUserQuestion` from the orchestrator, carrying its recommendation first. Paseo already renders it natively in the chat and pushes it to the user's phone.
- The plugin listens to `agent.permission_requested`. When the repository's `## Delegation` table lets the orchestrator decide, the plugin answers with `respondToPermission`, taking the recommendation. Otherwise it leaves the question for the user.
- Answers are keyed by the question's `header`, as Paseo's own prompt does. The contract between the skills and the plugin fixes this.
- The first release draws no custom checkpoint card. Plugin timeline rows are kept for what Paseo has no native form for: the report card of what was decided on the user's behalf.
- The composer pill stays in the first release, to count what waits for the user.
- The appetite is summed from `totalCostUsd` at each `agent.turn_ended`, since the value is only present after a turn.

## Consequences

- The skills keep asking checkpoints the way they already do; the plugin adds delegation without new UI.
- A delegated answer still triggers Paseo's notification to the parent. The orchestrator must treat a question it finds already resolved as settled.
- The card round trip remains unproven. If the report card needs buttons, prove the RPC path first.
