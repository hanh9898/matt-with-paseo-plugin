# Common rules for wave 1 (tickets 54, 55, 56)

## Graph
`54 → {55, 56}`

| Ticket | Status | Blocked by | Wave |
|---|---|---|---|
| 54 | open, ready-for-agent | - | 1, first |
| 55 | open, ready-for-agent | 54 | 1, by rolling start once 54 is merged |
| 56 | open, ready-for-agent | 54 | 1, by rolling start once 54 is merged |

## Context
- Your worktree branches off `stream/plugin-decision-log` at `7c67ca9`, unless your prompt names another base commit
  (55 and 56 start mid-wave, on the commit that merged 54). `7c67ca9` equals `origin/release/v0.1.0`; this stream ships
  back into `release/v0.1.0`. Run `git branch --show-current` before every commit.
- Read before you start: your ticket (`gh issue view <n>` and `gh issue view <n> --json comments --jq '.comments[].body'`),
  `GLOSSARY.md`, `CODING_STANDARDS.md`, `docs/contract.md`, `docs/adr/0001-*.md`, `docs/adr/0002-what-the-plugin-will-never-do.md`,
  `docs/agents/evidence-standards.md`, `docs/agents/comment-template.md`, and for 55 and 56 the comments of ticket 54.
- The format the decision log copies is `D:\matt-with-paseo-streams\decisions.md` and the "## decisions.md" section of
  `D:\matt-with-paseo-streams\CLAUDE.md`. Read them; never write to them.
- 0 other agents run while 54 runs; once 54 is merged, 55 and 56 run side by side (1 other agent each).
  Work only on your own ticket.
- Your worktree has no `node_modules`: run `npm ci` once before your first test run (the repo has no `paseo.json`,
  so Paseo runs no setup). It takes about 3 minutes: start it in the background.
- Do not end your turn while work you started is still running in the background (a build, a test run,
  a long command): wait for it inside the same turn. Paseo sends no finish notification for a turn you start on
  your own afterwards, so your "finished" report must mean the work is done.
- Start any command that may take more than two minutes (`npm ci`, a test suite) in the background from the start,
  and read its output when it finishes. A foreground command the shell moves to the background halfway can leave
  your turn waiting on a result that never returns.

## Parameters
- Ticket cap: 4, the most tickets step 2 plans into a bundle. Every ticket of this wave is a bundle of one.
- Context stop: 600K `contextWindowUsedTokens`, while Jev is not available.
- With Jev, its flag is what stops a bundle; Jev is not available in this run (no `matt-with-paseo` plugin on the daemon).

## Existing interfaces to reuse
- `server/state.ts`: `writeStateFile(name, text, dir = defaultStateDir())` returns the path written;
  `readStateFile(name, dir = defaultStateDir())` returns the text or null. The only module allowed to write a file
  (`test/state-outside-repo.test.ts` fails otherwise). Both take an optional `dir`.
- `shared/state-location.ts`: `defaultStateDir()`, `stateDir(env, home, platform)`, `STATE_DIR_ENV` (`MWP_STATE_DIR`).
  Stream `plugin-real-host` moves this file to `server/` in its #51, not yet on this branch: import it from where
  this branch has it, and from as few places as you can.
- `server/delegated-answers.ts`: `decideAnswers(delegation, input, stream)` returns `{ answers }` or `{ leave }`;
  `answerOne` reads each question's `Door:` line; `parseEntries` skips torn or foreign lines; `registerDelegatedAnswers(hooks, reader)`
  with the `Reader` callbacks `record`, `left`, `answered`, `pastAppetite`, `now`. `left` and `answered` already
  swallow their callbacks' errors and log one line with the agent's id.
- `server/appetite.ts` (`registerAppetite`, its `Reader.updated`), `server/question-budget.ts` (`registerQuestionBudget`,
  `BudgetOptions`, its per-day `notified`), `server/messages.ts` (`MESSAGES.appetitePassed`, `MESSAGES.questionBudgetSpent`).
- `server/report-card.ts` (`createReportCard`), `client/report-card.ts` (schema, `CardData`), `client/report-card-text.ts`
  (the card's words), `client/report-card-view.ts`, `shared/contract.ts` (`REPORT_CARD`).
- `index.server.ts` wires every handler; `test/support/` holds the fake host.
- Business rules go through the interfaces above; new layers only call them.

## Plugin design points (from `/paseo-plugin`, loaded by the orchestrator)
- The plugin is trusted daemon code. Never install, reload, enable or restart anything on this machine's Paseo daemon,
  and never restart the daemon: it runs other streams' agents. Proof is your ticket's own tests; the real host is the
  milestone smoke.
- Server code logs with `console.error`; each line carries ids and kinds only, never question text, an answer, an
  error's environment or a credential (T6). The decision log file is the one place question text is written.
- Hooks fail open (T4): a log that cannot be read or written logs one line with the agent's id and changes nothing
  the handler answers, leaves or sends.
- A plugin timeline row's `data` is capped at 64 KiB serialised; past it Paseo refuses the append (56's reason).
- Nothing on the card can be pressed (ADR 0001): the log path is a line of text. A Paseo surface for the log is `v0.4.0`'s.
- The plugin writes nothing in a target repository but its one marked block (ADR 0002 non-goal 4): the log lives under
  the state directory, named `decision-log.md`, never `decisions.md`.

## File zones
- Ticket 54 writes `server/decision-log.ts` (new), `server/delegated-answers.ts`, `test/decision-log.test.ts` (new),
  `test/delegated-answers.test.ts`, `docs/contract.md` (new section "The decision log" and the "Each delegated answer is kept"
  sentence), `README.md` (state section row, module table row, one sentence in the delegated-answers section),
  `test/state-docs.test.ts` if needed, `test/contract.test.ts` if it pins the new section, and its wiring in `index.server.ts`.
- Ticket 55 writes `server/appetite.ts`, `server/question-budget.ts`, `test/appetite.test.ts`, `test/question-budget.test.ts`,
  `docs/contract.md` "The decision log" section only (its two kinds), and one wiring line in `index.server.ts`.
- Ticket 56 writes `server/report-card.ts`, `shared/contract.ts` (`REPORT_CARD`), `client/report-card*.ts`,
  `test/report-card*.test.ts`, `test/contract.test.ts`, `docs/contract.md` "The report card" section only,
  `README.md` "The report card" section only, `test/smoke/README.md` "Report card" step, and one wiring line in `index.server.ts`.
- Shared files (`index.server.ts`, `docs/contract.md`, `README.md`, `CHANGELOG.md`): add only your own lines, in your
  own section, and keep the order of the existing lines. 55 and 56 each add their own line in `index.server.ts` and
  leave the other's lines alone.
- None of the three tickets edits `docs/roadmap.md` (the stream adds the exit criterion at ship).
- Merge danger, name it in your report: stream `plugin-real-host` #51 moves `shared/state-location.ts` to `server/`
  and edits the README state section and `test/state-docs.test.ts`.

## Traps already hit
- Shell-written files lose backslashes: `\n`, `\b`, `\(` in a regex or a Windows path arrive broken. Write and edit
  files only with the Edit and Write tools, never a heredoc, `echo` or a script's string literals. Check:
  `git ls-files | xargs grep -lP '[\x00-\x08\x0b\x0c\x0e-\x1f]'` prints nothing.
- Tests that call `writeStateFile` without a `dir` write into the real per-user state directory
  (`%LOCALAPPDATA%\matt-with-paseo`), which the running daemon and other streams share. Check: every new test passes
  a `dir` under your private temp directory or sets `MWP_STATE_DIR` to it, and `git diff` of your tests shows no
  call that falls back to `defaultStateDir()`.
- A check that pins a sentence of a document is rewritten as a structure check (a heading, a table column, a pinned
  line, a file name) before the ticket resolves (evidence standards). Check: your new doc assertions read headings,
  table cells or code-quoted names, never prose sentences.

## Failing on base
- On `7c67ca9`, before the first spawn: `npm ci` then `npm run check` (typecheck, `node --test "test/**/*.test.ts"`, `node --test test/docs/docs-set.test.mjs`)
  exit 0: none failing, 647 tests pass in the main run and 25 in the docs-set run; 64 test files are tracked
  under `test/`.
- A failure listed here is not yours: leave it as it is unless your ticket's acceptance criteria name it, and
  name it in your report as failing on base. A failure not listed here is yours to explain.
- This repository has no version gate (`scripts/check-version-gate.py` does not exist): not applicable.

## Acceptance criteria are the contract
- A trap above, or an instruction an earlier ticket left in its comments, is guidance; your ticket's
  acceptance criteria are the contract.
- On conflict, follow the criteria and write the discrepancy and its reason in your ticket's comments;
  do not stop to ask.
- If the criteria themselves look wrong, stop that part, write the evidence in your ticket's comments,
  and move the ticket to `ready-for-human`. Never rewrite the criteria.

## What must hold, what was chosen, what is not known yet

| Part | What it holds | What you do when your evidence goes against it |
|---|---|---|
| Must hold | Your ticket's acceptance criteria, and the section above. | Follow the section above; never rewrite the criteria. |
| Chosen for you | `server/decision-log.ts` takes the state directory as an optional `dir` (default `defaultStateDir()`), passed to `readStateFile`/`writeStateFile`: 54's restart test builds a fresh log over the same directory, and every test must stay off the real state directory. | Challenge it with evidence, in your ticket's comments and your report. A challenge alone does not move the ticket to `ready-for-human`. |
| Chosen for you | `server/decision-log.ts` exports one function giving the absolute path of `decision-log.md` (for example `decisionLogPath(dir?)`), and 56 imports only that for the card's `log` field: it keeps the move of `shared/state-location.ts` (#51) to one import site, and 56's card never reads the log. | As above. |
| Chosen for you | 55 appends through the same writer 54 exports (one entry-writing function taking a kind, `asked`, `answer`, `grounds`, `stream`, `agent`, and optional `requestId`); the once-per-request rule keys on `agent` and `requestId` only when `requestId` is given. 55's entries carry no `requestId`, and each is once by the appetite's and the budget's own `notified` flags: one writer keeps the numbering in one place. | As above. |
| Chosen for you | One `D<n>` entry per request, never per question: one `AskUserQuestion` with several questions is one entry (the owner's decision). | As above. |
| Chosen for you | The file has no `## Pending for the user` section; `## Decided without evidence` sits above `## Log` as a reading list only, reading `None.` when empty (the owner's decisions D116, D117). | As above. |
| Chosen for you | The five owner items of ADR 0002 non-goal 3 still go to the owner: a question with a `Yours:` line is left to the user and logged as `left to the user`, `Grounds: one of the user's five` (the owner's decision). | As above. |
| Chosen for you | Time in the heading is the daemon's local time, `YYYY-MM-DD HH:MM`, computed from the entry's ISO `at`; tests inject `now` and pin the heading shape with a pattern, not a wall-clock value, so they pass in any time zone. | As above. |
| Not known yet | Where #51 leaves `shared/state-location.ts` when this stream merges back. | Build on this branch's `shared/state-location.ts`; name the file under merge danger in your report. The orchestrator's overlap check handles the rest. |

Whoever answers a challenge to a chosen default writes why the plan changes or stands; an answer with no reason is not a resolution.

## Resources
- Your private resources are listed in your prompt (a temp directory used as the state directory). Use exactly that
  set. Create it when you first need it, and leave it in place when you finish. The orchestrator removes it once your
  ticket is merged and the wave reviewed.
- Shared resources, read-only: the running Paseo daemon and its plugins, the real per-user state directory
  (`%LOCALAPPDATA%\matt-with-paseo`), `D:\matt-with-paseo-streams\decisions.md` and `CLAUDE.md`, the main checkout
  `D:\matt-with-paseo-streams\matt-with-paseo-plugin`.
- Shared resources you may write to, and machine-wide locks: none.

## Repo and user rules
- Commits, comments and code in English. Verify with `node --test <file>` on each new or changed test file only
  (evidence standards); run no suite, no `npm run check`, no code review, no eval.
- Commit format: conventional commits as this repo's history shows, `<type>(<scope>): <lowercase summary>`
  (for example `feat(decision-log): write a D<n> entry per delegated answer`, `test(report-card): cap the decided list`,
  `docs(contract): add the decision log section`), and end every commit message with the line
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Ticket comments follow `docs/agents/comment-template.md`; post with `gh issue comment <n> --body-file <file>`, the
  file written with the Write tool in your private temp directory. Use only `gh issue` commands; never run `gh auth status`.
- Credentials: never read, print or pass on a token or credential (no `gh auth token`, no reading a CLI's hosts or
  config file or a token's environment variable, no token in a URL or a command). A `gh`, `glab`, push or upload
  failure goes into your report with the command and its error as printed; never work around it with another tool,
  the forge's API or another account.
- Never use AskUserQuestion. When you need a decision, end your turn with the question in text and your recommendation.
- Never push, never open a pull request, never touch another worktree or branch.
- Evidence standards: read `docs/agents/evidence-standards.md`; it is not copied here. It defers the code review to
  the milestone.

## Done when:
- Commit to your branch. The orchestrator merges it. Pull-request descriptions are written by whoever ships, outside
  this wave: keep none in your worktree, and put what they need in your report.
- Run no `/mattpocock-skills:code-review`: the evidence standards defer it to the milestone. Your `Resolved:` comment reads
  `Code review: deferred to the milestone (docs/agents/evidence-standards.md)`.
- Post the `Resolved:` comment on your ticket, with a `Test run:` line for each new or changed test file: red on the
  base, then green, each with its summary line. Leave the issue open; the orchestrator closes it after the merge.
  A part a human must do moves the ticket to `ready-for-human` instead, and the comment says which part.
- Report back, with the SHA of your last commit: a design summary, files touched, how you verified with evidence,
  work not done or still in doubt, every change outside your file zone or outside git with where it is, each
  private resource you created, the merge danger (`shared/state-location.ts`, README state section,
  `test/state-docs.test.ts` against #51), and decisions the user must make. Tag each decision `decided: X because Y`
  or `assumed: X, unchecked`, and each finding `reproduced` or `traced`.
- `git status --porcelain` in your worktree is empty when you end your turn, or each file it lists is named in your report.
- End your turn after your ticket's report. Your bundle is one ticket: you end your turn once.

## Checkpoints
- Step 0 and step 2 (one Checkpoint, 2026-09-30): stage C, the graph `54 → {55, 56}`, wave 1 = 54 then 55 and 56 by rolling start at quota 2, bundles of one, no lost width. Orchestrator D119 approved as proposed. changed the work: no. took the recommendation: yes.
- Resume after the overnight overload (2026-10-01, orchestrator D122): `gh` fails behind FortiGate TLS inspection; forge actions go to `## Forge actions pending`, 54 is merged after a local check, 55 and 56 spawn. changed the work: yes (forge actions deferred, tickets handed to agents as files). no recommendation.

## Forge actions pending
`gh` cannot reach GitHub from this machine (FortiGate TLS inspection, D122). Each line is done once `gh` works, then checked.
The three `Resolved:` texts were copied, before the private directories were removed, to `C:\Users\HBLAB_OPMS\AppData\Local\Temp\plugin-decision-log-pending\`.
- [ ] #54: `gh issue view 54 --json comments` first (the agent's `gh issue comment 54` exited 0 without printing a URL); post `resolved-54.md` with `gh issue comment 54 --body-file` only if it is not there; then `gh issue close 54` (merged at 1614ffb).
- [ ] #55: post `resolved-55.md` with `gh issue comment 55 --body-file` (the agent's try failed: `x509: certificate signed by unknown authority`); then `gh issue close 55` (merged at 3d54a1f).
- [ ] #56: post `resolved-56.md` with `gh issue comment 56 --body-file` (the agent's try failed the same way); then `gh issue close 56` (merged at 579d459).

## Wave agents

| Bundle's tickets | Agent id | Workspace id | Branch | Base commit | Private resources | Merged SHAs | Cleaned |
|---|---|---|---|---|---|---|---|
| 54 | 5dba8165-653f-4a67-ac5e-1622d3798f70 | wks_832dd611f7928feb | plugin-decision-log/wave1/54-decision-log | 7c67ca9 | `C:\Users\HBLAB_OPMS\AppData\Local\Temp\plugin-decision-log-54-state` | 54: ca536a7 (merge 1614ffb) | [x] |
| 55 | 63db5747-fc09-49f3-9db2-560ab7350c36 | wks_30512797113b956c | plugin-decision-log/wave1/55-appetite-budget-stops | 1614ffb | `C:\Users\HBLAB_OPMS\AppData\Local\Temp\plugin-decision-log-55-state` | 55: c441abe (merge 3d54a1f) | [x] |
| 56 | a5a52303-e44e-41dc-aa3b-941a748bfbba | wks_825355cd6a94ee31 | plugin-decision-log/wave1/56-report-card-log-link | 1614ffb | `C:\Users\HBLAB_OPMS\AppData\Local\Temp\plugin-decision-log-56-state` | 56: 6362d34 (merge 579d459) | [x] |

## Review
Deferred to milestone `v0.1.0` (evidence standards, `docs/agents/evidence-standards.md`): no seam review runs in this wave, and no review run carries a mark. Seams for the milestone review to read: `index.server.ts` (54 wires the log, 55 its two callbacks; 56 adds no line, `decisionLogPath()` is the card's default), `docs/contract.md` ("The decision log" by 54 and 55, "The report card" by 56), `README.md` (state section by 54, report-card section by 56). Merge danger for the ship: stream `plugin-real-host` #51 moves `shared/state-location.ts` to `server/` (imported by `server/decision-log.ts`) and edits the README state section and `test/state-docs.test.ts`.
