# Contract v1

Contract version: 1

What the plugin sends, reads and promises to the skills, and what the skills declare in return. The contract lives in this repository ([ADR 0003](adr/0003-the-contract-between-the-plugin-and-the-skills.md)); the skills repository points here and declares the version it requires. Until `v0.1.0` is tagged, v1 is a draft that any `v0.1.0` ticket changing a message, a mark or a card field edits in the same change. `test/contract.test.ts` compares it with the messages module and the report card shape, both ways.

Words are the skills' own: **Wave**, **Checkpoint**, **Stream**, **Hold**, and the rest of the words blocks named in [`docs/agents/domain.md`](agents/domain.md).

## Plugin detection

A skill tells the plugin is present when `paseo plugin ls` lists the Paseo id `matt-with-paseo` with the status `running`. Any other outcome (no such line, another status, or the command failing) means the plugin is absent, and the skills take the heartbeat path with prose questions, exactly as they ran before the plugin existed ([ADR 0002](adr/0002-what-the-plugin-will-never-do.md), non-goal 2). A plugin failure never breaks a stream.

## Message types

Every text the plugin sends to an orchestrator is built in `server/messages.ts`. A text is one body line, then one last line starting `Next: ` that names the moves open to its reader, separated by `; ` and closed by a full stop. The moves are the plugin's suggestion: the judgement stays with the skills. A text carries ids and kinds, never a request's input or an error's message. When an orchestrator's own turn runs, the messages held for it arrive as one, the bodies in order, then one `Next:` line with each message's moves, a move two messages share written once.

Placeholders below are the values a message names: `<ticket>` and `<wave>` from the agent's `ticket` and `wave` labels, `<agent>` its id, `<request>` and `<name>` a pending request's id and tool name, `<code>` the error code of a failed turn (a failed turn without a code reads `outcome failed`), `<reason>` a cancel's reason, `<n>` the count of the user's messages and `<ids>` their ids (up to five, then `and N more`; one reads `1 message`), `<says>` the sensor's flagged conditions joined by `; `, `<cap>` the concurrent gates allowed and `<running>` the ticket agents running. A permission request of a kind other than `question` or `tool` (`plan`, `mode`, `other`) names that kind in its body and takes the `tool` moves.

The relay covers the `wave`/`ticket` agents and, from v1, the stream agent too ([Decision on #34](https://github.com/hanh9898/matt-with-paseo-plugin/issues/34#issuecomment-5895102916)). The stream agent's messages are the same types with `stream <stream>` in place of the `ticket <ticket> of wave <wave>` clause; the module builds none yet, and the ticket that extends the relay adds their rows here with it. Two types come with the delegation tickets, which add their rows: appetite passed (#40) and question budget spent (#39).

### Turn ended

Type: `turnEnded`
Lead: `Turn ended`
Fields: `ticket`, `wave`, `agent`, `code`, `reason`

| Case | Body | Next line |
|---|---|---|
| completed | `Turn ended: ticket <ticket> of wave <wave>, agent <agent>, outcome completed.` | `Next: check ticket <ticket>'s report with get_agent_activity and its artifacts (commits on its branch, ticket status); prompt agent <agent> when the report is incomplete.` |
| failed | `Turn ended: ticket <ticket> of wave <wave>, agent <agent>, outcome failed (<code>).` | `Next: read agent <agent>'s last activity with get_agent_activity; prompt agent <agent> to resume, or record ticket <ticket> as failed with the reason.` |
| canceled | `Turn ended: ticket <ticket> of wave <wave>, agent <agent>, outcome canceled (<reason>).` | `Next: read agent <agent>'s last activity with get_agent_activity; prompt agent <agent> to resume, or leave ticket <ticket> stopped when the cancel was deliberate.` |

### Permission pending

Type: `permissionRequested`
Lead: `Permission pending`
Fields: `ticket`, `wave`, `agent`, `request`, `name`

| Case | Body | Next line |
|---|---|---|
| question | `Permission pending: ticket <ticket> of wave <wave>, agent <agent>, request <request>, <name> (question).` | `Next: read ticket <ticket>'s request <request> with list_pending_permissions, and treat it as settled when it is no longer listed; leave the checkpoint to the user, who answers it in agent <agent>'s chat, or answer it with respond_to_permission when the delegation table lets you decide.` |
| tool | `Permission pending: ticket <ticket> of wave <wave>, agent <agent>, request <request>, <name> (tool).` | `Next: read ticket <ticket>'s request <request> with list_pending_permissions, and treat it as settled when it is no longer listed; answer request <request> with respond_to_permission, or leave it to the user when the decision is theirs.` |

### Agent created

Type: `created`
Lead: `Agent created`
Fields: `ticket`, `wave`, `agent`

| Case | Body | Next line |
|---|---|---|
| created | `Agent created: ticket <ticket> of wave <wave>, agent <agent>.` | `Next: carry on with the wave while ticket <ticket>'s turn end and any pending permission reach you as messages.` |

### Agent archived

Type: `archived`
Lead: `Agent archived`
Fields: `ticket`, `wave`, `agent`

| Case | Body | Next line |
|---|---|---|
| archived | `Agent archived: ticket <ticket> of wave <wave>, agent <agent>.` | `Next: finish step 8's clean-up of ticket <ticket> when you archived agent <agent>; check ticket <ticket>'s status before counting its work done when someone else archived agent <agent>.` |

### Human words

Type: `humanWords`
Lead: `Human words`
Fields: `ticket`, `wave`, `agent`, `n`, `ids`

| Case | Body | Next line |
|---|---|---|
| humanWords | `Human words: ticket <ticket> of wave <wave>, agent <agent>, <n> messages typed in its chat (message <ids>).` | `Next: read what the user typed to agent <agent> with get_agent_activity; record in ticket <ticket>'s report that the user spoke to it, and whether it changed the plan.` |

### Stall suspected

Type: `stallSuspected`
Lead: `Stall suspected`
Fields: `ticket`, `wave`, `agent`, `says`

| Case | Body | Next line |
|---|---|---|
| stallSuspected | `Stall suspected: ticket <ticket> of wave <wave>, agent <agent>, the sensor flagged: <says>.` | `Next: judge whether ticket <ticket> is stalled: read agent <agent>'s recent activity with get_agent_activity; prompt agent <agent> to resume, or record ticket <ticket> as stalled with the reason, when it is stalled; leave ticket <ticket> alone when its agent is working.` |

### Gate cap passed

Type: `gateCapPassed`
Lead: `Gate cap passed`
Fields: `ticket`, `wave`, `agent`, `cap`, `running`

| Case | Body | Next line |
|---|---|---|
| gateCapPassed | `Gate cap passed: ticket <ticket> of wave <wave>, agent <agent>, <running> ticket agents run against a cap of <cap> concurrent gates.` | `Next: hold every ready ticket after ticket <ticket> in a queue, and spawn the next one only when a ticket agent's turn end or archive shows fewer than <cap> running; leave ticket <ticket> running: agent <agent> is already created.` |

## Labels the plugin reads

The plugin knows an agent by the labels Paseo holds for it, and leaves every other agent as Paseo made it.

| Label | Reads |
|---|---|
| `wave` | The wave a ticket agent belongs to; a ticket agent carries it with `ticket` |
| `ticket` | The ticket number of a ticket agent |
| `stream` | The stream an agent belongs to; the stream agent carries it and no `wave` |

## The ticket-agent title

Labels are set only after `before('agent.create')` has run, so the title stands in for them at creation (the Decision on #2).

Title: `[Wave N] <NN> <ticket name>`

`N` and `NN` are whole numbers: the wave and the ticket. The plugin sets its ticket marker for an agent created with such a title.

## Checkpoint marks

A checkpoint is Paseo's own `AskUserQuestion` (ADR 0001). Its marks are written in the question, aligned with hanh9898/matt-with-paseo#78.

| Mark | How the question carries it |
|---|---|
| Recommendation | The first option, its label ending ` (Recommended)`. A question with no such option has no recommendation, and the plugin never answers it. |
| Default while silent | A line `Default while silent: <what goes ahead>` in the question text |
| Door class | A line `Door: two-way`, `Door: costly` or `Door: one-way` in the question text |
| One of the user's five | A line `Yours: <item>` in the question text, the item one of `concept`, `tickets`, `spend`, `irreversible`, `merge`. The plugin never answers it, delegation or not. |

## Answers keyed by header

An answer to an `AskUserQuestion` is `updatedInput.answers`, keyed by the question's `header`, as Paseo's own prompt keys it (ADR 0001).

## What the plugin reads from the delegation table

The repository's `## Delegation` table is written by the skills, and its prose format stays a skills-side dependency. The plugin reads two things from it.

| Reads | What it decides |
|---|---|
| Questions the orchestrator may decide | Whether the plugin answers a question with its recommendation |
| Appetite | The spend past which a stream sends its questions to the user |

The daily question budget is not in the table: it is a per-machine setting, read from the environment variable `MWP_QUESTION_BUDGET` (a whole number of questions a day) like the plugin's other machine settings ([Decision on #34](https://github.com/hanh9898/matt-with-paseo-plugin/issues/34#issuecomment-5895102916)).

## The report card

The plugin appends one timeline row to the orchestrator's chat to show what was decided on the user's behalf. Its shape is `REPORT_CARD` in `shared/contract.ts`.

Kind: `report-card`
Version: 1
Fields: `decided`, `spend`, `questions`
Buttons: none

`decided` lists the decisions made on the user's behalf, `spend` the spend against the appetite, and `questions` the questions against the budget. The card has no buttons: the button round trip is unproven (ADR 0001).

## What the skills declare

The skills declare the contract version they require as a whole number, in a line `Requires plugin contract: <n>` of their words block. The skills use the plugin only when `<n>` equals the plugin's contract version; otherwise they take the heartbeat path. A plugin release carries the contract version in its `CHANGELOG.md` entry, so a skill reads the version of the release `paseo plugin ls` shows.

| Plugin release | Contract version |
|---|---|
| 0.1.0 | 1 |

## Versioning

- Until `v0.1.0` is tagged, the contract is v1 in draft, and any `v0.1.0` ticket that adds or changes a message, a mark or a card field edits it in the same change.
- From the tag on, removing or changing a message, label, mark or field raises the version; adding a message type or an optional field does not.
- What v1 leaves out: buttons on the card, a custom checkpoint card, and the stream agent's message rows (see Message types).
