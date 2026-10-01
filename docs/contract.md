# Contract v1

Contract version: 1

What the plugin sends, reads and promises to the skills, and what the skills declare in return. The contract lives in this repository ([ADR 0003](adr/0003-the-contract-between-the-plugin-and-the-skills.md)); the skills repository points here and declares the version it requires. Until `v0.1.0` is tagged, v1 is a draft that any `v0.1.0` ticket changing a message, a mark or a card field edits in the same change. `test/contract.test.ts` compares it with the messages module and the report card shape, both ways.

Words are the skills' own: **Wave**, **Checkpoint**, **Stream**, **Hold**, and the rest of the words blocks named in [`docs/agents/domain.md`](agents/domain.md).

## Plugin detection

A skill tells the plugin is present when `paseo plugin ls` lists the Paseo id `matt-with-paseo` with the status `running`. Any other outcome (no such line, another status, or the command failing) means the plugin is absent, and the skills take the heartbeat path with prose questions, exactly as they ran before the plugin existed ([ADR 0002](adr/0002-what-the-plugin-will-never-do.md), non-goal 2). A plugin failure never breaks a stream.

## Message types

Every text the plugin sends to an orchestrator is built in `server/messages.ts`. A text is one body line, then one last line starting `Next: ` that names the moves open to its reader, separated by `; ` and closed by a full stop. The moves are the plugin's suggestion: the judgement stays with the skills. A text carries ids and kinds, never a request's input or an error's message. When an orchestrator's own turn runs, the messages held for it arrive as one, the bodies in order, then one `Next:` line with each message's moves, a move two messages share written once.

Placeholders below are the values a message names: `<ticket>` and `<wave>` from the agent's `ticket` and `wave` labels, `<bundle>` and `<tickets>` from a bundle agent's `bundle` and `tickets` labels (its first ticket, and every ticket of the bundle in order), `<stream>` from a stream agent's `stream` label, `<agent>` its id, `<request>` and `<name>` a pending request's id and tool name, `<code>` the error code of a failed turn (a failed turn without a code reads `outcome failed`), `<reason>` a cancel's reason, `<n>` the count of the user's messages and `<ids>` their ids (up to five, then `and N more`; one reads `1 message`), `<says>` the sensor's flagged conditions joined by `; `, `<cap>` the concurrent gates allowed, `<running>` the ticket agents running, `<count>` the questions that reached the user today and `<budget>` the day's question budget. A permission request of a kind other than `question` or `tool` (`plan`, `mode`, `other`) names that kind in its body and takes the `tool` moves.

The relay covers the `wave`/`ticket` agents, the bundle agents and, from v1, the stream agent too ([Decision on #34](https://github.com/hanh9898/matt-with-paseo-plugin/issues/34#issuecomment-5895097885)). The stream agent's turn end, pending permission and archive are the same types with `stream <stream>` in place of the `ticket <ticket> of wave <wave>` clause, each as a `stream` case below; an agent carrying the ticket labels is relayed as a ticket agent even when it carries `stream` too. A bundle agent, which works a bundle of tickets one turn per ticket and carries `wave`, `bundle` and `tickets` and no `ticket` (#45), is relayed as a ticket agent with the clause `bundle <bundle> (tickets <tickets>) of wave <wave>` in place of `ticket <ticket> of wave <wave>`, each as a `bundle` case below: every move names the bundle, never one ticket, since the plugin cannot tell which ticket of a bundle a turn end reports; it is relayed as a bundle agent when it carries `stream` too. Agent created, human words and gate cap passed stay ticket-agent and bundle-agent only. A ticket agent's stall suspected comes from its turn end or, while it runs, from a tick of the plugin's 5-minute clock, because an agent stuck in a call has no turn end (#49); a bundle agent's does the same. A stream agent's stall suspected comes from the tick alone (#48). The tick's cases are the `ticket running`, `bundle running` and `stream running` rows of stall suspected below. Two types come with the delegation tickets, which add their rows: appetite passed (#40) and question budget spent (#39, below). The question budget message speaks of the machine's day, not of one ticket, so its body names no ticket or wave.

### Turn ended

Type: `turnEnded`
Lead: `Turn ended`
Fields: `ticket`, `wave`, `agent`, `code`, `reason`, `stream`, `bundle`, `tickets`

| Case | Body | Next line |
|---|---|---|
| completed | `Turn ended: ticket <ticket> of wave <wave>, agent <agent>, outcome completed.` | `Next: check ticket <ticket>'s report with get_agent_activity and its artifacts (commits on its branch, ticket status); prompt agent <agent> when the report is incomplete.` |
| failed | `Turn ended: ticket <ticket> of wave <wave>, agent <agent>, outcome failed (<code>).` | `Next: read agent <agent>'s last activity with get_agent_activity; prompt agent <agent> to resume, or record ticket <ticket> as failed with the reason.` |
| canceled | `Turn ended: ticket <ticket> of wave <wave>, agent <agent>, outcome canceled (<reason>).` | `Next: read agent <agent>'s last activity with get_agent_activity; prompt agent <agent> to resume, or leave ticket <ticket> stopped when the cancel was deliberate.` |
| bundle completed | `Turn ended: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>, outcome completed.` | `Next: check bundle <bundle>'s report with get_agent_activity and its artifacts (commits on its branch, ticket status); prompt agent <agent> when the report is incomplete.` |
| bundle failed | `Turn ended: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>, outcome failed (<code>).` | `Next: read agent <agent>'s last activity with get_agent_activity; prompt agent <agent> to resume, or record bundle <bundle> as failed with the reason.` |
| bundle canceled | `Turn ended: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>, outcome canceled (<reason>).` | `Next: read agent <agent>'s last activity with get_agent_activity; prompt agent <agent> to resume, or leave bundle <bundle> stopped when the cancel was deliberate.` |
| stream completed | `Turn ended: stream <stream>, agent <agent>, outcome completed.` | `Next: check stream <stream>'s report with get_agent_activity and its artifacts (commits on its branch, its pull request); prompt agent <agent> when the report is incomplete.` |
| stream failed | `Turn ended: stream <stream>, agent <agent>, outcome failed (<code>).` | `Next: read agent <agent>'s last activity with get_agent_activity; prompt agent <agent> to resume, or record stream <stream> as failed with the reason.` |
| stream canceled | `Turn ended: stream <stream>, agent <agent>, outcome canceled (<reason>).` | `Next: read agent <agent>'s last activity with get_agent_activity; prompt agent <agent> to resume, or leave stream <stream> stopped when the cancel was deliberate.` |

### Permission pending

Type: `permissionRequested`
Lead: `Permission pending`
Fields: `ticket`, `wave`, `agent`, `request`, `name`, `stream`, `bundle`, `tickets`

| Case | Body | Next line |
|---|---|---|
| question | `Permission pending: ticket <ticket> of wave <wave>, agent <agent>, request <request>, <name> (question).` | `Next: read ticket <ticket>'s request <request> with list_pending_permissions, and treat it as settled when it is no longer listed; leave the checkpoint to the user, who answers it in agent <agent>'s chat, or answer it with respond_to_permission when the delegation table lets you decide.` |
| tool | `Permission pending: ticket <ticket> of wave <wave>, agent <agent>, request <request>, <name> (tool).` | `Next: read ticket <ticket>'s request <request> with list_pending_permissions, and treat it as settled when it is no longer listed; answer ticket <ticket>'s request <request> with respond_to_permission, or leave it to the user when the decision is theirs.` |
| bundle question | `Permission pending: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>, request <request>, <name> (question).` | `Next: read bundle <bundle>'s request <request> with list_pending_permissions, and treat it as settled when it is no longer listed; leave the checkpoint to the user, who answers it in agent <agent>'s chat, or answer it with respond_to_permission when the delegation table lets you decide.` |
| bundle tool | `Permission pending: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>, request <request>, <name> (tool).` | `Next: read bundle <bundle>'s request <request> with list_pending_permissions, and treat it as settled when it is no longer listed; answer bundle <bundle>'s request <request> with respond_to_permission, or leave it to the user when the decision is theirs.` |
| stream question | `Permission pending: stream <stream>, agent <agent>, request <request>, <name> (question).` | `Next: read stream <stream>'s request <request> with list_pending_permissions, and treat it as settled when it is no longer listed; leave the checkpoint to the user, who answers it in agent <agent>'s chat, or answer it with respond_to_permission when the delegation table lets you decide.` |
| stream tool | `Permission pending: stream <stream>, agent <agent>, request <request>, <name> (tool).` | `Next: read stream <stream>'s request <request> with list_pending_permissions, and treat it as settled when it is no longer listed; answer stream <stream>'s request <request> with respond_to_permission, or leave it to the user when the decision is theirs.` |

### Agent created

Type: `created`
Lead: `Agent created`
Fields: `ticket`, `wave`, `agent`, `bundle`, `tickets`

| Case | Body | Next line |
|---|---|---|
| created | `Agent created: ticket <ticket> of wave <wave>, agent <agent>.` | `Next: carry on with the wave while ticket <ticket>'s turn end and any pending permission reach you as messages.` |
| bundle | `Agent created: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>.` | `Next: carry on with the wave while bundle <bundle>'s turn end and any pending permission reach you as messages.` |

### Agent archived

Type: `archived`
Lead: `Agent archived`
Fields: `ticket`, `wave`, `agent`, `stream`, `bundle`, `tickets`

| Case | Body | Next line |
|---|---|---|
| archived | `Agent archived: ticket <ticket> of wave <wave>, agent <agent>.` | `Next: finish step 8's clean-up of ticket <ticket> when you archived agent <agent>; check ticket <ticket>'s status before counting its work done when someone else archived agent <agent>.` |
| bundle archived | `Agent archived: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>.` | `Next: finish step 8's clean-up of bundle <bundle> when you archived agent <agent>; check bundle <bundle>'s status before counting its work done when someone else archived agent <agent>.` |
| stream archived | `Agent archived: stream <stream>, agent <agent>.` | `Next: finish the clean-up of stream <stream> when you archived agent <agent>; check stream <stream>'s status before counting its work done when someone else archived agent <agent>.` |

### Human words

Type: `humanWords`
Lead: `Human words`
Fields: `ticket`, `wave`, `agent`, `n`, `ids`, `bundle`, `tickets`

| Case | Body | Next line |
|---|---|---|
| humanWords | `Human words: ticket <ticket> of wave <wave>, agent <agent>, <n> messages typed in its chat (message <ids>).` | `Next: read what the user typed to agent <agent> with get_agent_activity; record in ticket <ticket>'s report that the user spoke to it, and whether it changed the plan.` |
| bundle | `Human words: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>, <n> messages typed in its chat (message <ids>).` | `Next: read what the user typed to agent <agent> with get_agent_activity; record in bundle <bundle>'s report that the user spoke to it, and whether it changed the plan.` |

### Stall suspected

Type: `stallSuspected`
Lead: `Stall suspected`
Fields: `ticket`, `wave`, `agent`, `says`, `bundle`, `tickets`, `stream`

| Case | Body | Next line |
|---|---|---|
| stallSuspected | `Stall suspected: ticket <ticket> of wave <wave>, agent <agent>, the sensor flagged: <says>.` | `Next: judge whether ticket <ticket> is stalled: read agent <agent>'s recent activity with get_agent_activity; decide by the wave skill's hung-agent table, which says whether agent <agent> is replaced within the wave skill's restart budget or prompted to resume, or record ticket <ticket> as stalled with the reason; leave ticket <ticket> alone when its agent is working.` |
| bundle | `Stall suspected: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>, the sensor flagged: <says>.` | `Next: judge whether bundle <bundle> is stalled: read agent <agent>'s recent activity with get_agent_activity; decide by the wave skill's hung-agent table, which says whether agent <agent> is replaced within the wave skill's restart budget or prompted to resume, or record bundle <bundle> as stalled with the reason; leave bundle <bundle> alone when its agent is working.` |
| ticket running | `Stall suspected: ticket <ticket> of wave <wave>, agent <agent>, the sensor flagged: <says>.` | `Next: judge whether ticket <ticket> is stalled: read agent <agent>'s recent activity with get_agent_activity; when agent <agent> is hung on a shell command or on no tool call, replace it within the wave skill's restart budget under its hung-agent table, and never prompt it, since a prompt queues behind the stuck call; leave ticket <ticket> alone when agent <agent> runs a subagent or another long tool.` |
| bundle running | `Stall suspected: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>, the sensor flagged: <says>.` | `Next: judge whether bundle <bundle> is stalled: read agent <agent>'s recent activity with get_agent_activity; when agent <agent> is hung on a shell command or on no tool call, replace it within the wave skill's restart budget under its hung-agent table, and never prompt it, since a prompt queues behind the stuck call; leave bundle <bundle> alone when agent <agent> runs a subagent or another long tool.` |
| stream running | `Stall suspected: stream <stream>, agent <agent>, the sensor flagged: <says>.` | `Next: judge whether stream <stream> is stalled: read agent <agent>'s recent activity with get_agent_activity; when agent <agent> is hung on a shell command or on no tool call, replace it within the stream skill's restart budget, and never prompt it, since a prompt queues behind the stuck call; leave stream <stream> alone when agent <agent> runs a subagent or another long tool.` |

The ticket and bundle rows come from the sensor's turn-end check. The `ticket running`, `bundle running` and `stream running` rows come from the tick: every 5 minutes the plugin flags a stream, ticket or bundle agent that has a parent, that Paseo reports running, and whose `lastActivityAt` is 30 minutes old (the `quiet-running` condition), once per idle stretch (#48, #49). The plugin names the skills' hung-agent table and never offers to prompt an agent that may still be inside a call: the plugin cannot tell a hung agent from a stopped one, and the skills decide (ADR 0002).

### Gate cap passed

Type: `gateCapPassed`
Lead: `Gate cap passed`
Fields: `ticket`, `wave`, `agent`, `cap`, `running`, `bundle`, `tickets`

| Case | Body | Next line |
|---|---|---|
| gateCapPassed | `Gate cap passed: ticket <ticket> of wave <wave>, agent <agent>, <running> ticket agents run against a cap of <cap> concurrent gates.` | `Next: hold every ready ticket after ticket <ticket> in a queue, and spawn the next one only when a ticket agent's turn end or archive shows fewer than <cap> running; leave ticket <ticket> running: agent <agent> is already created.` |
| bundle | `Gate cap passed: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>, <running> ticket agents run against a cap of <cap> concurrent gates.` | `Next: hold every ready ticket after bundle <bundle> in a queue, and spawn the next one only when a ticket agent's turn end or archive shows fewer than <cap> running; leave bundle <bundle> running: agent <agent> is already created.` |

### Appetite passed

Type: `appetitePassed`
Lead: `Appetite passed`
Fields: `stream`, `spent`, `appetite`

`<stream>` is the `stream` label, `<spent>` the stream's total and `<appetite>` its appetite, both in USD with two decimals. The message goes to the orchestrator once per stream, and it names no ticket: it speaks of the stream.

| Case | Body | Next line |
|---|---|---|
| passed | `Appetite passed: stream <stream>, spent <spent> USD against an appetite of <appetite> USD.` | `Next: leave every question of stream <stream> to the user, who answers it in the asking agent's chat, since the plugin no longer answers them for this stream; decide any Hold under the skills' rules, since the plugin cancels nothing and stops no agent.` |
| partial | `Appetite passed: stream <stream>, spent <spent> USD against an appetite of <appetite> USD (a partial total: some turns reported no cost).` | `Next: leave every question of stream <stream> to the user, who answers it in the asking agent's chat, since the plugin no longer answers them for this stream; decide any Hold under the skills' rules, since the plugin cancels nothing and stops no agent.` |
### Question budget spent

Type: `questionBudgetSpent`
Lead: `Question budget spent`
Fields: `count`, `budget`

| Case | Body | Next line |
|---|---|---|
| questionBudgetSpent | `Question budget spent: <count> questions reached the user today against a budget of <budget>.` | `Next: keep asking the questions only the user can answer: the plugin still leaves each one to them; decide nothing extra on the budget's account: the delegation table alone says what you may decide.` |

The budget is read from `MWP_QUESTION_BUDGET` (see "What the plugin reads from the delegation table"). The plugin counts each question it leaves to the user per day in local time, per daemon, and sends one message a day, this one, to the orchestrator that owns the chat where the question that spent the budget waits (a ticket agent's orchestrator, or the stream agent itself); a message for an orchestrator mid-turn is held until its turn ends. It informs and never widens delegation: questions keep reaching the user, and none is answered because the budget is spent. A count of one reads `1 question`. With no setting, or a value that is not a whole number above 0, there is no budget and no message.

## Labels the plugin reads

The plugin knows an agent by the labels Paseo holds for it, and leaves every other agent as Paseo made it.

| Label | Reads |
|---|---|
| `wave` | The wave a ticket agent belongs to; a ticket agent carries it with `ticket`, a bundle agent with `bundle` and `tickets` |
| `ticket` | The ticket number of a ticket agent |
| `bundle` | The first ticket number of a bundle agent, which the wave skill starts for a bundle of tickets; it carries it with `wave` and no `ticket` |
| `tickets` | Every ticket number of a bundle agent's bundle, in order, separated by commas |
| `stream` | The stream an agent belongs to; the stream agent carries it and no `wave` |

## The ticket-agent title

Labels are set only after `before('agent.create')` has run, so the title stands in for them at creation (the Decision on #2).

Title: `[Wave N] <NN> <ticket name>`

Bundle title: `[Wave N] [<NN>+<NN>] <first ticket name>`

`N` and `NN` are whole numbers: the wave and the ticket. The plugin sets its ticket marker for an agent created with such a title. A bundle agent ([#45](https://github.com/hanh9898/matt-with-paseo-plugin/issues/45)) is titled with the bundle title, `<NN>+<NN>` being its tickets in order and the name its first ticket's; a bundle of one takes the plain title. The plugin sets its ticket marker for an agent created with either form and, when its session opens, for an agent labelled `wave` and `bundle` too.

## Checkpoint marks

A checkpoint is Paseo's own `AskUserQuestion` (ADR 0001). Its marks are written in the question, aligned with hanh9898/matt-with-paseo#78.

| Mark | How the question carries it |
|---|---|
| Recommendation | The first option, its label ending ` (Recommended)`. A question with no such option has no recommendation, and the plugin never answers it. |
| Default while silent | A line `Default while silent: <what goes ahead>` in the question text |
| Door class | A line `Door: two-way`, `Door: costly` or `Door: one-way` in the question text |
| One of the user's five | A line `Yours: <item>` in the question text, the item one of `concept`, `tickets`, `spend`, `irreversible`, `merge`. The plugin never answers it below level 3 ([ADR 0004](adr/0004-three-autonomy-levels.md)); at level 3 it answers one that has a recommendation. |

## Answers keyed by header

An answer to an `AskUserQuestion` is `updatedInput.answers`, keyed by the question's `header`, as Paseo's own prompt keys it (ADR 0001).

## What the plugin reads from the delegation table

The repository's `## Delegation` table is written by the skills, and its prose format stays a skills-side dependency. The plugin reads three things from it.

| Reads | What it decides |
|---|---|
| Level | How much the plugin answers: nothing (level 1), all but the user's five (level 2), all the table lets it (level 3), as [ADR 0004](adr/0004-three-autonomy-levels.md) sets out |
| Questions the orchestrator may decide | Whether the plugin answers a question with its recommendation |
| Appetite | The spend past which a stream sends its questions to the user |

The table sits under a `## Delegation` heading in the `AGENTS.md` at the root of the asking agent's folder, as rows of two cells, a rule and its value. The plugin reads four rules by name, ignoring case, and the first row of a name wins:

- `Level`: `1`, `2` or `3`, trimmed. Any other value is level 1, and it does not fall back to `Switch`.
- `Switch`: `on` or `off`, the contract v1 row, kept as a mapping when there is no `Level` row: `on` (ignoring case) is level 2, any other value is level 1. A `Level` row wins over `Switch`.
- `Questions the orchestrator may decide`: the door classes the orchestrator may decide, separated by `,` or `;`. At levels 1 and 2 only `two-way` and `costly` count; at level 3 `one-way` counts too when the row lists it. Any other word is dropped. See "Doors per level".
- `Appetite`: the spend as the table writes it, read as a dollar amount (`20 USD`, `$20`, `USD 20` or `20`). Any other value is no appetite, and a stream with none is never past it.

The level resolves in this order:

| The table holds | Level | `levelFrom` |
|---|---|---|
| A `Level` row whose value is `1`, `2` or `3` | that value | `Level` |
| A `Level` row with any other value | 1 | `Level` |
| No `Level` row, a `Switch` row reading `on` | 2 | `Switch` |
| No `Level` row, a `Switch` row with any other value | 1 | `Switch` |
| Neither row | 1 | `default` |
| No `## Delegation` table | 1 (the handler reads a missing table as level 1) | none |

This changes contract v1's "a table with no `Switch` row is on" to level 1: `v0.1.0` is untagged, so v1 is amended in place ([ADR 0003](adr/0003-the-contract-between-the-plugin-and-the-skills.md)), and the contract version stays `1`.

**Doors per level.** The `Questions the orchestrator may decide` row says which door classes the orchestrator may decide, at every level. A level-3 table that wants irreversible questions answered writes `two-way, costly, one-way`; a level-3 table without `one-way` leaves `Door: one-way` questions to the user. Two example tables:

```markdown
## Delegation

| Rule | Value |
|---|---|
| Level | 2 |
| Questions the orchestrator may decide | two-way, costly |
| Appetite | 20 USD |
```

```markdown
## Delegation

| Rule | Value |
|---|---|
| Level | 3 |
| Questions the orchestrator may decide | two-way, costly, one-way |
| Appetite | 20 USD |
```

At level 1 the plugin answers nothing and every question is left, with `level 1: nothing is delegated`. From level 2 the plugin answers an `AskUserQuestion` from a ticket agent or the stream agent only when every question in it carries a `Door:` line the table lets the orchestrator decide, a first option marked ` (Recommended)` and, below level 3, no `Yours:` line (a `Yours:` line is left with `one of the user's five (level 2)`); the answer is that option's label, keyed by the question's `header`. A question with no recommended first option is left with `no recommendation on the first option` at every level: choosing among options with no recommendation is judgement, and the plugin decides mechanics only. A `Door:` line the table does not let the orchestrator decide, no `Door:` line, a multi-select question, a question with no header and two questions sharing a header are left at every level. A stream past its appetite is left at every level, level 3 included (`the stream is past its appetite`). The daily question budget only informs and never widens delegation. At level 3 a `Yours: merge` question with a recommendation is answered with the host's permission answer and nothing else: the orchestrator carries out the merge, and the plugin runs no git at any level. One question that fails leaves the whole request to the user. A table the plugin cannot read leaves the question to the user, and a request already resolved is settled and not answered. Each delegated answer is kept outside the repository, one line per question with the stream, agent, header, answer and time, in `delegated-answers.jsonl` under the plugin's state directory, and once per request in the decision log (see "The decision log").

The plugin sums the spend at each turn end: the agent's `lastUsage.totalCostUsd` is added to the total of its `stream` label, for a ticket agent and the stream agent alike, and the totals are kept in `stream-spend.json` under the plugin's state directory. A turn with no cost adds nothing and marks the total partial, which the report card reads. When a total passes the appetite, the orchestrator gets one "Appetite passed" message (see Message types) and the plugin answers no question of that stream any more, so every one reaches the user. The plugin cancels nothing and stops no agent: any Hold is the skills' decision.

The daily question budget is not in the table: it is a per-machine setting, read from the environment variable `MWP_QUESTION_BUDGET` (a whole number of questions a day) like the plugin's other machine settings ([Decision on #34](https://github.com/hanh9898/matt-with-paseo-plugin/issues/34#issuecomment-5895102916), [Decision on #39](https://github.com/hanh9898/matt-with-paseo-plugin/issues/39#issuecomment-5902707853)). What the plugin does with it is the "Question budget spent" message.

## The decision log

The plugin writes one Markdown file the owner reads, in the shape of the control folder's `decisions.md`. Its place and shape are part of contract v1; the skills read it, and it never lives in a target repository.

| File under the state directory | What it is |
|---|---|
| `decision-log.jsonl` | The record: one JSON line per entry, `{ n, at, stream, kind, gate, asked, answer, grounds, agent, requestId, withoutEvidence, what }`. The next `n` is the highest `n` in it plus one; a torn or foreign line is skipped and never counts |
| `decision-log.md` | The file the owner reads, rendered whole from the record after each entry, oldest first |

The rendered file has `# Decisions`, then `## Decided without evidence`, then `## Log`. There is no `## Pending for the user` section: nothing waits on the owner.

```
<a id="d<n>"></a>
### D<n> — <YYYY-MM-DD HH:MM> [<stream>] <gate>
Asked: <each question: header, its text with newlines folded to " / ", options offered by label>
Answer: <exactly what was sent>
Grounds: <the rule that decided it>
```

The time is the daemon's local time. `<stream>` is the agent's `stream` label. A field of several lines puts one question per line, the later lines indented. The log is the one place the plugin writes question text: only a question's `header`, its text and its option labels, never an error message, an environment value or a tool input other than an `AskUserQuestion`.

`## Decided without evidence` is a reading list, one line per entry whose record has `withoutEvidence`, oldest first: `D<n>: <what> (smaller option taken)`, linking to `#d<n>`. That entry's `Grounds:` reads `no evidence; smaller option taken`. With no such entry the section reads `None.`. No kind below sets it: the plugin answers only under a table rule with a recommendation. The list blocks and queues nothing.

| Kind (the `gate`) | `Answer:` | `Grounds:` |
|---|---|---|
| `delegated answer` | each `<header>: <label>` as sent in `updatedInput.answers` | the level and where it was read, then the `## Delegation` table in `<cwd>/AGENTS.md` lets the orchestrator decide each question's `Door:`, then each `Yours: <item>` answered at level 3, then the first option was marked `(Recommended)`, joined by `; `: `level 3 (the Level row); the ## Delegation table in <cwd>/AGENTS.md lets the orchestrator decide one-way; Yours: merge answered at level 3; the first option was marked (Recommended)` |
| `left to the user` | `none: left to the user, who answers it in agent <id>'s chat` | the level and where it was read, then the reason the question stays the user's (`level 1: nothing is delegated`, `one of the user's five (level 2)`, `no Door line`, `no recommendation on the first option`, `the stream is past its appetite`, `no delegation table`, …), or `the delegation table could not be read` when the handler failed open: `level 2 (the Level row); one of the user's five (level 2)` |
| `appetite passed` | the `Appetite passed:` message exactly as sent or held, its `Next:` line included | `the Appetite row of the ## Delegation table in <cwd>/AGENTS.md reads <value>; spend <total> USD`, with `(partial)` after a partial total |
| `question budget spent` | the `Question budget spent:` message exactly as sent or held | `MWP_QUESTION_BUDGET=<n>` |

The level opens `Grounds:` of both of the first two kinds, as `level <n> (the Level row)`, `level <n> (from Switch: on)` (or `not on` for level 1), `level 1 (default: no Level or Switch row)` or `level 1 (no delegation table)`. When the handler failed before it read the table, it reads `level unknown (the delegation table was not read)`. No entry sets `withoutEvidence`: a question with no recommendation is left, never answered with a smaller option. At level 1 every question is still logged, as `left to the user`.

The last two kinds record that the plugin stopped answering, never that a stream or an agent stopped: the plugin cancels nothing. Each is written once, after its message is sent or held: `appetite passed` at the turn end that passes the appetite (`Asked:` reads `none: the stream's spend passed its appetite at a turn end of agent <id>`, `<stream>` is that agent's), `question budget spent` once a day (`Asked:` reads `none: the day's question count reached the budget with a question from agent <id>`, `<stream>` is that question's), and a send that failed and is retried writes it when it succeeds. They carry no `requestId`. The questions the appetite leaves to the user are logged one by one as `left to the user`.

One entry per request, numbered across restarts: one `AskUserQuestion` with several questions is one `D<n>`, and a request already in the record (the same `agent` and `requestId`) is not written again. A log that cannot be written changes nothing the handler answers or leaves; it logs one line with the agent's id and the kind, never the question (T4, T6).

## The report card

The plugin appends one timeline row to the orchestrator's chat to show what was decided on the user's behalf: a ticket agent's change shows in its orchestrator's chat, the stream agent's in its own. Its shape is `REPORT_CARD` in `shared/contract.ts`.

Kind: `report-card`
Version: 1
Row id: `report-card`
Fields: `decided`, `decidedCount`, `log`, `spend`, `questions`
Decided entry: `header`, `answer`, `at`
Decided cap: 20
Text cap: 200
Spend: `totalUsd`, `appetiteUsd`, `partial`
Questions: `count`, `budget`
Buttons: none

The plugin appends the row again under its one row id each time a delegated answer is recorded, a question is left to the user, or a ticket agent or the stream agent ends a turn, so the chat holds one card, kept current.

- `decided` lists the latest decisions made on the user's behalf for the stream, oldest of those first, at most the decided cap (20): each entry is the question's `header`, the `answer` given (each cut to the text cap of 200 characters, ending `…` when cut) and the time `at` (ISO 8601), read from the delegated answers' record. A question left to the user is not an entry.
- `decidedCount` is the total number of decisions for the stream, so the card's heading counts all of them and says how many earlier ones are only in the log.
- `log` is the absolute path of `decision-log.md` under the state directory (see "The decision log"), shown as a line of text: nothing on the card can be pressed. The card never reads the log, so a log that cannot be written never blanks the card.
- The list is capped because a plugin row's `data` is limited to 64 KiB serialised, and Paseo refuses an append above it: the record only grows, so an uncapped list would freeze the card. Every decision stays in the log.
- `spend` is the stream's summed turn cost in `totalUsd` against its `appetiteUsd`, which is `null` when the table has no appetite. `partial` is true when a turn had no cost, so the total may be short of the real spend.
- `questions` is the day's `count` of questions left to the user against the `budget`, which is `null` when no budget is set.

The plugin's client registers the renderer that draws this kind and version; a Paseo client without it shows the row as an unavailable placeholder. The card has no buttons: the button round trip is unproven (ADR 0001).

## What the skills declare

The skills declare the contract version they require as a whole number, in a line `Requires plugin contract: <n>` of their words block. The skills use the plugin only when `<n>` equals the plugin's contract version; otherwise they take the heartbeat path. A plugin release carries the contract version in its `CHANGELOG.md` entry, so a skill reads the version of the release `paseo plugin ls` shows.

| Plugin release | Contract version |
|---|---|
| 0.1.0 | 1 |

## Versioning

- Until `v0.1.0` is tagged, the contract is v1 in draft, and any `v0.1.0` ticket that adds or changes a message, a mark or a card field edits it in the same change.
- From the tag on, removing or changing a message, label, mark or field raises the version; adding a message type or an optional field does not.
- What v1 leaves out: buttons on the card, a custom checkpoint card, and a stream variant of agent created, human words and gate cap passed.
