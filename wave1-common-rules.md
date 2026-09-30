# Common rules for wave 1 (tickets 45, 48, 49)

## Graph
`45 → 48 → 49` (the owner's order; declared edges: 49 blocked by 45 and 48; no 45 → 48 edge)

| Ticket | Status | Blocked by | Wave |
|---|---|---|---|
| 45 | ready-for-agent | - | 1, spawned first |
| 48 | ready-for-agent | - (declared) | 1, waits on the quota (1) and on 45's merge, by the owner's order |
| 49 | ready-for-agent | 45, 48 | 1, by rolling start once 48 is merged |

How this wave runs, and why:
- Stream `plugin-bundle-relay`, quota 1. The invocation fixed the order, the quota and the bundling; it stands as step 2's approval.
- "One bundle is fine" is carried out as three single-ticket agents in sequence. The installed wave skill spawns one ticket agent per ticket, and the plugin that relays this run's messages does not yet know the `bundle`/`tickets` labels (that is #45). So every ticket agent carries `wave` + `ticket` and a `[Wave 1] <NN> …` title.
- Each ticket is spawned only after the previous one is **merged**, from the integration branch's new head (named in its prompt and its row). The three tickets share `server/messages.ts`, `server/hooks/stall-sensor.ts` and the contract's Stall suspected table, and each builds on the previous one's shape of them.

## Context
- Your worktree branches off `stream/plugin-bundle-relay` at the base commit your prompt names (#45: `93fab6aac3db5937545e2bb76077f8d52e99f50a`). That branch already contains every ticket before yours in the graph above. Run `git branch --show-current` before every commit.
- Read before you start: `AGENTS.md`, `GLOSSARY.md`, `docs/contract.md`, ADR 0002 and ADR 0003 in `docs/adr/`, `CODING_STANDARDS.md`, `docs/agents/comment-template.md`, your ticket (`gh issue view <n> --comments`, and `gh issue view <n> --json body --jq .body` for the body), and the comments of the tickets before yours.
- You are the only ticket agent running. Work only on your own ticket.
- Do not end your turn while work you started is still running in the background: wait for it inside the same turn. Paseo sends no finish notification for a turn you start on your own afterwards.
- Start any command that may take more than two minutes in the background from the start, and read its output when it finishes.
- No AskUserQuestion. A question for the owner goes into your final report and into a ticket comment, with your recommendation; carry on with everything it does not block.

## Plugin design points (from the stream agent's `/paseo-plugin` reading; ticket agents do not load that skill)
- **Never touch the live plugin or the daemon.** No `paseo plugin install/reload/enable/disable/remove`, no `paseo reload`, no daemon restart. The installed plugin relays this very orchestration's messages; restarting the daemon can kill the agents.
- **SDK boundary (T2).** Only `server/paseo-host.ts` imports `@getpaseo/plugin`. Hook handlers speak the port's words (`server/host.ts`); tests use `test/support/fake-host.ts`, which gets every port member you add.
- **Fail open (T4).** A handler never throws into Paseo; the adapter's `report` logs the hook and the agent id, never a payload (T6). Messages carry ids and kinds, never a request's input or an error's message.
- **Messages.** Every text is built in `server/messages.ts`: one body line, then one `Next:` line of moves joined by `; `. Every move names its agent and its ticket, bundle or stream, since `combine` joins several messages' moves. A message for an orchestrator mid-turn is held and flushed at its turn end.
- **Timers (#48).** A server entry must return a cleanup that clears every timer it made: `connectPaseo` returns a `stop`, and `index.server.ts` returns it in place of `() => {}`; otherwise the timer survives a plugin reload. `PluginServerContext` has no `paseo`; a hook's `context.paseo` is the subprocess's IPC session, which the SDK docs say "lives exactly as long as the subprocess". Keep the ticket's design (the adapter keeps the latest hook's `context.paseo`) and its smoke step, which confirms it on Paseo `0.10.1`. The agent snapshot carries both `lastActivityAt` and `updatedAt` (ISO strings) and `status`.
- **Contract v1 stays v1.** Every change to a message, a mark or a label is a v1 amendment: `docs/contract.md` keeps `Contract version: 1`, and ADR 0003's "What v1 holds" gains one line citing the ticket. The skills pair by `Requires plugin contract: 1` (skills `v0.7.0`); raising the version would drop them to the heartbeat path.

## Existing interfaces to reuse
- `shared/role-labels.ts`: `ticketOf`, `isTicketAgent`, `isStreamAgent`: the one place that names the role labels.
- `server/messages.ts`: `Subject`, `StreamSubject`, `Relayed`, `message(lead, subject, detail, moves)`, `MESSAGES`, `combine`. The `stream` cases (#43) show how a new subject kind was added: follow that pattern for `bundle`.
- `server/hooks/lifecycle-relay.ts` `subjectOf`, and the `held`/`isBusy`/flush pattern in it and in `server/hooks/stall-sensor.ts`.
- `server/sensor.ts`: `loadConditions`, `problemsOf` (the loader's validation), `factsOf`, `flagged`.
- `test/support/contract-doc.ts` and `test/contract.test.ts`: how the contract's message tables are checked against `server/messages.ts`.
- Before writing anything new, find the existing pattern of the same kind and cite it as `file:line` in your ticket's comments, or write "no pattern found" with where you looked.

## File zones
- Ticket 45: `shared/role-labels.ts`, `server/hooks/ticket-marker.ts`, `server/messages.ts` (the `bundle` subject and cases), the role-label readers the ticket lists, `docs/contract.md`, ADR 0003, and their tests.
- Ticket 48: `server/host.ts`, `server/paseo-host.ts`, `index.server.ts`, `test/support/fake-host.ts`, `server/sensor.ts`, `sensor/conditions.json`, `server/hooks/stall-sensor.ts`, `server/messages.ts` (`stallSuspected`), `docs/contract.md`, ADR 0003, README § The cheap sensor, `test/smoke/README.md`, `CHANGELOG.md`, and their tests.
- Ticket 49: `server/hooks/stall-sensor.ts`, `server/messages.ts` (`stallSuspected` running cases), `docs/contract.md`, ADR 0003, README, `test/smoke/README.md`, `CHANGELOG.md`, and their tests.
- Out of every zone: `docs/roadmap.md` (the stream that ships `v0.1.0` edits it), `paseo-plugin.json`, `package.json`, the skills repository.
- Shared files: add only your own lines, and keep the order of the existing lines.

## Seams between the three tickets
- #45 adds a `bundle` subject kind (`wave`, `bundle`, `tickets`) beside ticket and stream, and a `bundle` case of every ticket-agent message, `stallSuspected` included. Its bundle `stallSuspected` may use today's wording; #48 rewords it.
- #48 rewords the turn-end `stallSuspected` `Next:` line for **both** the ticket subject and #45's bundle subject (its criterion "no `Stall suspected` line tells the orchestrator to prompt an agent that may still be in a call" covers the bundle case), and widens `stallSuspected` to every `Relayed` kind. It keeps `quiet-running`'s `says` role-neutral.
- #49 adds the running cases for ticket and bundle subjects only, reusing #48's tick, `lastActivityAt`, `on: "running"`, `quietMinutes` and once-per-stretch rule. It adds no second clock and no condition.

## Traps already hit
- Doc wording pinned by tests: `test/*-docs.test.ts`, `test/contract.test.ts`, `test/support/contract-doc.ts`, `test/next-line-docs.test.ts`, `test/sensor-docs.test.ts` and others match strings in README, the contract and the `Next:` lines. You cannot run them, so read them: before rewording a text, `grep -rn "<old words>" test/` and update each hit in your checks-first commit. "It sees turn ends only" is pinned in README and likely in a docs test.
- `node_modules` is not installed in the worktrees. Do not install it to run anything; nothing is run before the milestone.

## Failing on base
- Not run: deferred to milestone `v0.1.0` (`docs/agents/evidence-standards.md`). No verification command runs in this wave.

## Acceptance criteria are the contract
- A trap above, or an instruction an earlier ticket left in its comments, is guidance; your ticket's acceptance criteria are the contract.
- On conflict, follow the criteria and write the discrepancy and its reason in your ticket's comments; do not stop to ask.
- If the criteria themselves look wrong, stop that part, write the evidence in your ticket's comments, and move the ticket to `ready-for-human`. Never rewrite the criteria.

## Resources
- Your private resources are listed in your prompt (a temp directory only; no `paseo.json`, so no port). Create it when you first need it and leave it in place when you finish.
- Shared resources, read-only: the Paseo daemon and the installed `matt-with-paseo` plugin (see the design points), the main checkout `D:/matt-with-paseo-streams/matt-with-paseo-plugin`, the skills repository.
- No machine-wide locks.

## Repo and user rules
- Language: code, commits, comments on tickets and docs in English.
- Commit format (`CODING_STANDARDS.md` part 4):
  - C1 **Conventional Commits.** `type(scope): subject`, `type` one of `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`; the subject in the imperative, lowercase, at most 72 characters, no final full stop.
  - C2 **One change per commit.** A commit does one thing its subject names; a ticket's commits reference its issue (`#45`) in the body.
  - End each commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Credentials: never read, print or pass on a token or credential (no `gh auth token`, no `gh auth status`, no reading a CLI's hosts or config file or a token's environment variable, no token in a URL or a command). Use only `gh issue` commands. A `gh` failure goes into your report with the command and its error as printed; never work around it.
- Evidence standards: read `docs/agents/evidence-standards.md`; it is not copied here. It replaces the wave skill's per-ticket test runs and review.

## Flow (every ticket of this wave)
1. Write the checks your acceptance criteria need (tests under `test/`, or a `grep`/parse check for a doc criterion), each written to fail before the change. Commit them **first**, unrun.
2. Write the code and the docs. Commit, one change per commit.
3. Run no test, typecheck, drift check, eval or `mattpocock-skills:code-review`: all run once at the milestone `v0.1.0` run.

## Done when:
- Commit to your branch. The orchestrator merges it. Keep no pull-request text in your worktree; put what the ship needs in your report.
- Post the `Resolved:` comment of `docs/agents/comment-template.md` (with `Tests: deferred to the milestone` and `Code review: deferred to the milestone`), with `gh issue comment <n> --body-file <file>`. Leave the issue open.
- `git status --porcelain` in your worktree is empty.
- Report back: a design summary, files touched, the checks written (committed before the code, unrun), work not done or still in doubt, every change outside your file zone or outside git, each private resource you created, and decisions the owner must make, with your recommendation.

## Wave agents

| Ticket | Agent id | Workspace id | Branch | Base commit | Private resources | Cleaned |
|---|---|---|---|---|---|---|
| 45 | f1f41229-e382-4b12-a4ba-3aba04b341cd | wks_e118c085c73f11c8 | `plugin-bundle-relay/wave1/45-bundle-relay` | `93fab6a` | `%TEMP%\plugin-bundle-relay-45` | [x] |
| 48 | 05bb0a17-98c2-45f3-a1ed-2bcdf9a2cbbe | wks_0efdb76ac3e78bf8 | `plugin-bundle-relay/wave1/48-stream-stall` | `9bf789a` | `%TEMP%\plugin-bundle-relay-48` | [x] |
| 49 | e591b4fc-d377-4f3b-b6f4-f0454f0916b8 | wks_b149c62a8d64bf91 | `plugin-bundle-relay/wave1/49-ticket-stall-tick` | `0a4d3a8` | `%TEMP%\plugin-bundle-relay-49` | [x] |

## Review

Deferred to milestone `v0.1.0` (evidence standards, `docs/agents/evidence-standards.md`): no seam review in this wave. Fixed point for the milestone review: the repository's first commit (`v0.1.0` is untagged). Findings: none raised; the points below are carried to the milestone run, each already recorded in its ticket's closing comment.

- #45: README lines 143, 184, 208 still describe a ticket agent as `wave` + `ticket` with the plain title. Outcome: put off to the `v0.1.0` fix pass (#45 closing comment).
- #48: `Host.parentOf` added beyond the ticket; the retained `context.paseo` and `parentAgentId` on `refresh()` are smoke steps. The contract names the case `stream running`. Outcome: put off to the `v0.1.0` smoke run (#48 closing comment).
- #49: the ticket and stream running `Next:` lines word the restart budget differently; the contract names the cases `ticket running` and `bundle running`. Outcome: put off to the `v0.1.0` review (#49 closing comment).
- `docs/roadmap.md`: #45, #48 and #49 are not yet listed under `v0.1.0`'s "New tickets". Outcome: the stream that ships `v0.1.0` adds them (as each ticket says).

Traps proven in this wave (for the next wave's rules):
- Checks written unrun can fail to parse: #45 left raw line breaks in four string literals of `test/messages.test.ts`, and #48 an unescaped `**` in a regex in `test/contract.test.ts`; #49 fixed both (`80ead51`, `6355da5`). How to check without running the suite: none mechanical yet short of `tsc`; a ticket agent re-reads each literal and regex it wrote before committing.
