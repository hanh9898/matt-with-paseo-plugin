# Common rules for wave 2 (tickets 34, 35, 36, 37, 38, 43, 39, 40, 41)

## Graph
`33✓ → 34 → 38 → {39, 40} → 41; 35, 36, 37 (stream matt-with-paseo-plugin shipped ✓, #15 ✓)`

| Ticket | Status | Blocked by | Wave |
|---|---|---|---|
| 33 | closed, merged at `db699ff` | - | 1 |
| 34 | open, ready-for-agent | 33 ✓; stream `matt-with-paseo-plugin` shipped ✓ | 2 |
| 35 | open, ready-for-agent | #2 (merged to `main` in #42, stays open until the `v0.1.0` smoke; native edge dropped); stream shipped ✓ | 2 |
| 36 | open, ready-for-agent | stream shipped ✓ | 2 |
| 37 | open, ready-for-agent | #15 ✓; stream shipped ✓ | 2 |
| 38 | open, ready-for-agent | 34 | 2 (rolling start, base `98f7a64`) |
| 39 | open, ready-for-agent | 34, 38 | 2 (rolling start, base `f4c0d66`) |
| 40 | open, ready-for-agent | 34, 38 | 2 (rolling start, base `f4c0d66`) |
| 43 | open, ready-for-agent | 34 | 2 (rolling start, base `98f7a64`) |
| 41 | open, ready-for-agent | 38, 39, 40 | 2 (rolling start, base `1bb2873`) |

## Context
- Your worktree branches off `stream/plugin-vision-milestones` at `dda65709a1b58bde7416d1ceb442c3577bf3335f`, unless your prompt names another base commit (a ticket started mid-wave). That branch holds `main` at `b081bf8` (stream `matt-with-paseo-plugin`, tickets #1–#19, shipped in #42) and ticket 33 (the docs set: README "What it is for", ADR 0002, `docs/roadmap.md`, `GLOSSARY.md`).
  Run `git branch --show-current` before every commit.
- Read before you start: spec #32 (`gh issue view 32 --comments`), your ticket and its comments (decisions already made are there), `AGENTS.md`, `GLOSSARY.md` ("the skills" vs "the plugin"), `CODING_STANDARDS.md`, `docs/agents/domain.md`, `docs/agents/comment-template.md`, ADR 0001 and ADR 0002 in `docs/adr/`, `docs/roadmap.md` (`v0.1.0`), and the README's development section (the layout, the host port, the fake host, the checks).
- The Paseo host is daemon and CLI `0.10.1`; `paseo --version` prints it. Load the `paseo-plugin` skill for the SDK and hook shapes.
- 3 other agents work the other tickets of this wave in parallel, on other branches (quota 4). Work only on your own ticket.
- Do not end your turn while work you started is still running in the background: wait for it inside the same turn. Paseo sends no finish notification for a turn you start on your own afterwards, so your "finished" report must mean the work is done.
- Start any command that may take more than two minutes (an install) in the background from the start, and read its output when it finishes.
- Never use AskUserQuestion: a question asked mid-turn sends the orchestrator no notification. When you need a decision, end your turn with the question written in your final message: the options, and your recommendation first.

## Existing interfaces to reuse
- The host port `server/host.ts`, its only SDK adapter `server/paseo-host.ts`, and the fake host the checks drive (`test/support/fake-host.ts`, checked by `test/fake-host.test.ts`): a new hook member goes into the port, the adapter and the fake host together, as `before('agent.create')` did.
- The messages module `server/messages.ts`: every text the plugin sends to an orchestrator is built there, with its `Next:` line.
- The ticket marker `server/hooks/ticket-marker.ts` and `shared/role-marker.ts` (`ROLE_ENV`, `TICKET_ROLE`, `hasTicketMarker`), and the title pattern of ticket agents `[Wave N] <NN> <ticket name>` (`test/agent-names.test.ts`).
- The version-token check: `test/support/version-token.ts` and `test/version-token.test.ts` (#16), which reads every identifier's version.
- Docs checks as prior art: `test/*-docs.test.ts` read a document and assert its lines; `test/release-checklist.test.ts` checks #15's checklist.
- `npm test` runs `node --test "test/**/*.test.ts"`, so it does not pick up ticket 33's `test/docs/docs-set.test.mjs`.

## File zones
- Ticket 34 writes: the new contract document (under `docs/`, its name its own choice), `docs/adr/0003-*.md` (the next free number), its agreement check under `test/`, and the lines #16's version-token check needs to read `Contract version: 1`. It reads `server/messages.ts` and does not change what it builds.
- Ticket 35 writes: `server/host.ts`, `server/paseo-host.ts`, the fake host, `server/hooks/ticket-marker.ts`, the checks for them, `test/smoke/README.md` "Git guard" part C step 4, and the README's "The git guard" known-gap line.
- Ticket 36 writes: the `scripts` of `package.json`, the README's development section line on the one command, `docs/agents/evidence-standards.md` milestone run step 1, and its check. `npm run check` must also run ticket 33's `test/docs/docs-set.test.mjs`, which the `test` script's `test/**/*.test.ts` glob misses (the user's instruction at the wave 2 approval); its check asserts that too.
- Ticket 37 writes: `docs/agents/release-checklist.md` (extends #15's item, never replaces it), `NOTICE`, the README's install-from-a-clone and "tested on Node 22" lines, and its checks. It reads `package.json` (no `engines` field) and does not write it.
- Shared files (`README.md`, `package.json`, `CHANGELOG.md`, `test/smoke/README.md`): add only your own lines, in your own section, and keep the order of the existing lines (J3). Each ticket may add its own line under `CHANGELOG.md` `[Unreleased]`, as CONTRIBUTING asks.

## Traps already hit
- Tests do not run in a ticket (evidence standards): write each check to fail before the change, commit it, and run none, not even `npm run typecheck`. Check: your report and comments show no test, typecheck, drift check, eval or code-review run.
- A smoke test on the real Paseo daemon is a test too: write its steps in `test/smoke/README.md`, run none. Installing or enabling the plugin in the running daemon touches every session on this machine: leave the daemon's plugin set as it is. Check: `paseo --version` is the only daemon command in your report.
- A line break inside a TypeScript string literal is written as the escape `\n`; after each edit that puts one in a string, read the changed lines back (`git diff`) to see the escape, not a broken line (stream `matt-with-paseo-plugin` hit this in `server/messages.ts`).
- Ticket 35: on Paseo `0.10.1` a ticket agent is recognised at `before('agent.create')` by its title, since labels are set only afterwards (the user's decision "1 A" on #2); a resumed ticket agent loses `MWP_ROLE=ticket`, so the git guard stops refusing: this is the pass-on from stream `matt-with-paseo-plugin` (the user's decision "2 A" on #2), and #2's last Progress comment holds what is known. Check: the handler tries the title and the labels, and fails open with one logged line.

## Failing on base
- On `dda65709a1b58bde7416d1ceb442c3577bf3335f`, before the first spawn: no command was run (the user's standing instruction: tests, typecheck and checks run only at the milestone run). Known from stream `matt-with-paseo-plugin`'s log, left for the `v0.1.0` fix pass:
  - `test/entry-wiring.test.ts:53` matches `/registerTicketMarker(hooks)/` with unescaped parentheses and will fail;
  - `test/smoke/README.md` "Git guard" part A step 1 lost its path separators (`<plugin>guardgit-guard.mjs`);
  - `CODING_STANDARDS.md` T2 and T3 still need rewording to the user's decisions on #4, #9 and #2.
- A failure listed here is not yours: leave it as it is unless your ticket's acceptance criteria name it, and name it in your report as failing on base. A failure not listed here is yours to explain.

## Acceptance criteria are the contract
- A trap above, or an instruction an earlier ticket left in its comments, is guidance; your ticket's acceptance criteria are the contract.
- On conflict, follow the criteria and write the discrepancy and its reason in your ticket's comments; do not stop to ask.
- If the criteria themselves look wrong, stop that part, write the evidence in your ticket's comments, and move the ticket to `ready-for-human`. Never rewrite the criteria.

## Resources
- Your private resources are listed in your prompt (a temp directory). Use exactly that set. Create it when you first need it, and leave it in place when you finish: a review finding may come back to you. The orchestrator removes it once your ticket is merged.
- Shared resources, read-only: the running Paseo daemon (read its version only), the GitHub issues of `hanh9898/matt-with-paseo-plugin` and `hanh9898/matt-with-paseo` (read with `gh issue view`), sting9k/seatworks at `6d316b0`.
- Shared resources you may write to: your own ticket's comments and labels. Nothing else.

## Repo and user rules
- Commits, code, comments and documents in English. Ticket comments take a shape from `docs/agents/comment-template.md`, posted with `gh issue comment <n> --body-file <file>`.
- Commit format: Conventional Commits, `type(scope): subject`, `type` one of `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`; the subject in the imperative, lowercase, at most 72 characters, no final full stop (C1). One change per commit, its subject naming it; every commit of a ticket references its issue (`#34`) in the body (C2). End each commit message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Credentials: never read, print or pass on a token or credential (no `gh auth token`, no `gh auth status`, no reading a CLI's hosts or config file or a token's environment variable, no token in a URL or a command). Use `gh issue` commands only. A `gh` failure goes into your report with the command and its error as printed; never work around it with another tool, the forge's API or another account.
- Git: commit on your own branch only. No push, no branch switch, no rebase, no merge: the orchestrator merges.
- Evidence standards: read `docs/agents/evidence-standards.md`; it is not copied here. It overrides the wave skill here: your flow runs no test, no typecheck, no drift check, no eval and no `mattpocock-skills:code-review`.

## Done when:
- Commit to your branch. The orchestrator merges it. Pull-request descriptions and discussion are written by whoever ships, outside this wave: keep none in your worktree, and put what they need in your report.
- No `mattpocock-skills:code-review` and no test run (evidence standards): your `Resolved:` comment carries the lines `Tests: deferred to the milestone (docs/agents/evidence-standards.md)` and `Code review: deferred to the milestone (docs/agents/evidence-standards.md)`.
- Post the `Resolved:` comment of `docs/agents/comment-template.md` when fully done, leaving the issue open; move the ticket to `ready-for-human` for the part a human must do, saying which part. Write in the comments what you verified, with evidence, and what remains open.
- Report back: a design summary, files touched, how you verified with evidence, work not done or still in doubt, every change outside your file zone or outside git with where it is, each private resource you created, and decisions the user must make (written out, each with options and your recommendation).

## Wave agents

| Ticket | Agent id | Workspace id | Branch | Base commit | Private resources | Cleaned |
|---|---|---|---|---|---|---|
| 34 | 640fc3b5-641d-4fca-b7f9-840bcf9db724 | wks_6d96c5e1eb1a4d78 | plugin-vision-milestones/wave2/34-contract-v1 | dda65709a1b58bde7416d1ceb442c3577bf3335f | temp dir `%TEMP%\plugin-vision-milestones-34` | [x] |
| 35 | 4dbf5482-17ac-4726-9f03-5d82d3c3111a | wks_3495525c332b23d4 | plugin-vision-milestones/wave2/35-session-open-marker | dda65709a1b58bde7416d1ceb442c3577bf3335f | temp dir `%TEMP%\plugin-vision-milestones-35` | [x] |
| 36 | 6eb54e3c-e3af-44ca-8c34-ba38714240e0 | wks_839f8d50839c4116 | plugin-vision-milestones/wave2/36-check-command | dda65709a1b58bde7416d1ceb442c3577bf3335f | temp dir `%TEMP%\plugin-vision-milestones-36` | [x] |
| 37 | 65f4ac5d-20d5-4028-834e-7ef68a6a8680 | wks_aba1917e2185dea3 | plugin-vision-milestones/wave2/37-release-checklist-notice | dda65709a1b58bde7416d1ceb442c3577bf3335f | temp dir `%TEMP%\plugin-vision-milestones-37` | [x] |
| 38 | 3562f5a7-4595-4f2a-8643-6f273075f51b | wks_5282dc867dd58c5c | plugin-vision-milestones/wave2/38-delegated-answers | 98f7a6446ee54a3e40d7c3e3705d1ddd7462ad0b | temp dir `%TEMP%\plugin-vision-milestones-38` | [x] |

## Hold

- Hold since after ticket 38 spawned (prompt `hold`): nothing new starts, rolling start included, until `release`. Ticket 38 keeps running; merges and checks carry on.
- Released (prompt `release`). User's answers the same turn: "1 A" (the orchestrator files "Relay stream agents" under #32, blocked by #34, through a to-tickets intake; this run does not write it), "2 A" (`MWP_QUESTION_BUDGET`), "3 A" (checkpoint marks, `Requires plugin contract: <n>` and the card's fields stay the v1 draft for skills #78 and #91). Sent to ticket 38's agent with its resume prompt; still to be recorded as Decision comments on #39 (2 A) and #38/#41 (3 A) once `gh` works.
- `gh` fails on this machine since the release: `gh issue view 38 --json comments` prints `Post "https://api.github.com/graphql": tls: failed to verify certificate: x509: certificate signed by unknown authority` (twice). Every step that needs `gh` waits.
- `gh` steps left for the user (P23): the orchestrator confirmed TLS inspection machine-wide (`api.github.com` presents a FortiGate certificate, `FG200FT923927699`). Code, checks, commits and merges carry on with local git. The comment backlog (Decisions on #38, #39, #41; #38's `Resolved:` and its close) and snapshots of #39, #40 and #41 sit in `%TEMP%\plugin-vision-milestones-gh-backlog` (`README.txt` gives the order); posted once the orchestrator says `gh` works. Rolling start goes on once a ticket merges locally, its issue not yet closed.
- `gh` works again (the orchestrator checked: Sectigo certificate). Posted from the backlog: Decision on #39 (5902707853), on #38 (5902708406), on #41 (5902709744). Ticket 38 posts its own `Resolved:`; the orchestrator closes #38 once merged.
| 43 | b403f661-5496-4cdd-a247-5be8c3e3ed4d | wks_6181adb84f41d795 | plugin-vision-milestones/wave2/43-relay-stream-agents | 98f7a6446ee54a3e40d7c3e3705d1ddd7462ad0b | temp dir `%TEMP%\plugin-vision-milestones-43` | [x] |
| 39 | b7ea7cfa-2db7-4d02-9fc5-4e1f3f356ab5 | wks_7f2f9e88470e59fc | plugin-vision-milestones/wave2/39-question-budget | f4c0d664d3b62b08c6fc4819e1c552b786663999 | temp dir `%TEMP%\plugin-vision-milestones-39` | [x] |
| 40 | fd32807f-a69f-4f43-9f3f-878024315757 | wks_3db490325629f51c | plugin-vision-milestones/wave2/40-appetite | f4c0d664d3b62b08c6fc4819e1c552b786663999 | temp dir `%TEMP%\plugin-vision-milestones-40` | [x] |
- Ticket 43 merged at `aae0ec4`. Left for the `v0.1.0` fix pass: the README's "The lifecycle relay" section still says only `wave`/`ticket` agents are relayed (outside ticket 43's zone).
- Ticket 40 merged (conflicts with 43 in `server/messages.ts` and `CHANGELOG.md`, both sides kept). Left for the `v0.1.0` run: whether `lastUsage.totalCostUsd` is the last turn's cost or a running total (the sum assumes the former; smoke "Appetite" steps 1 and 3), and a duplicated `[/zz-stream/g, "<stream>"]` placeholder in `test/support/contract-doc.ts` (43 and 40 each added it; harmless).
| 41 | 50197c8e-5a4b-4598-ab00-f0ba35635a8d | wks_0cbda46bb5ec6160 | plugin-vision-milestones/wave2/41-report-card | 1bb2873b99c0bcc5dfc4d56399c685345ae0aede | temp dir `%TEMP%\plugin-vision-milestones-41` | [x] |
- Ticket 39 merged at `280612f` (conflicts with 40 and 43 in seven files, both sides kept; `registerDelegatedAnswers` takes both `pastAppetite` and `left`; `docs/contract.md` keeps 43's relay paragraph with 39's budget sentence). Seam finding (orchestrator, while merging): ticket 40 never listed `appetitePassed` in `test/messages.test.ts` `SAMPLES`, so that check and its `Record<keyof typeof MESSAGES>` type would fail; sent back to 40's agent after a fast-forward, fixed in `7318974` (only the `passed` case: `partial` shares its `Next:` line, which the "no two cases share" check forbids; both stay covered in `test/support/contract-doc.ts`), merged at `1bb2873`.
- Left for the `v0.1.0` fix pass, from ticket 39's report: the README's "State outside the repository" and smoke "State outside" step 3 still say nothing persists; `test/state-docs.test.ts` #13 lists only the old holders; "per daemon" is per state directory (per user); a question is one `AskUserQuestion` request. Open question for the user: does the pill show the budget limit when no question waits (A, recommended: no; B: yes)?

## Review
- Deferred to milestone `v0.1.0` (docs/agents/evidence-standards.md): no seam review ran, and no ticket ran `mattpocock-skills:code-review`. Fixed point for the milestone run: `dda65709a1b58bde7416d1ceb442c3577bf3335f` (this wave's first base). Findings per axis: Standards 0, Spec 0 (none run).
- Found by the orchestrator while checking reports and merging, with outcomes:
  - #34's contract linked the budget Decision where the relay Decision belonged, and #16's changelog line misdescribed the contract version: fixed by #34 (`24ca780`).
  - #40 left `appetitePassed` out of `test/messages.test.ts` `SAMPLES`: fixed by #40 (`7318974`), merged at `1bb2873`.
  - `CHANGELOG.md` conflicts on every merge after #36, and seven-file conflicts merging #39 over #40 and #43: resolved by the orchestrator at merge, both sides kept (see the log above).
- Put off to the `v0.1.0` fix pass (named, not fixed here): `.github/workflows/ci.yml` and `docs/agents/release-checklist.md` still call `typecheck` and `test`, not `npm run check` (with `test/ci-workflow.test.ts`); the README's "The lifecycle relay" still says only `wave`/`ticket` agents; the README's "State outside the repository", smoke "State outside" step 3 and `test/state-docs.test.ts` #13 predate the three records; the duplicated `zz-stream` placeholder in `test/support/contract-doc.ts`; `CODING_STANDARDS.md` J1 on the contract version; README "Node 22" vs "Node 22.18 or later"; the three "Failing on base" items above.
- Put off to the `v0.1.0` smoke run: `paseo plugin install <path>` (#37); `refresh()` finding a resumed agent at `session_open` (#35); whether `lastUsage.totalCostUsd` is per turn or cumulative (#40); the report card renderer's types and its 64 KiB row limit as `decided` grows (#41).
- Open question for the user, not blocking (current behaviour is option A): does the pill show the question-budget limit when no question waits (#39; A, recommended: no; B: yes)?
