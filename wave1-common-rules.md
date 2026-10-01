# Common rules for wave 1 (tickets 57, 58)

## Graph
`54✓ → [57+58]` (57 and 58 open, `ready-for-agent`; one bundle, quota 1)

| Ticket | Status | Blocked by | Wave |
|---|---|---|---|
| 57 | open, ready-for-agent | - | 1, first ticket of bundle `[57+58]` |
| 58 | open, ready-for-agent | 57, 54 (closed, merged) | 1, second ticket of bundle `[57+58]`, after 57 is merged |

57 → 58 is a pure chain and neither is a symptom ticket, so one ticket agent works both, in order, on one branch.

## Context
- Your worktree branches off `stream/plugin-autonomy-levels` at `6db199a`. That branch was cut from
  `origin/release/v0.1.0` (CI green) and ships back into `release/v0.1.0`, not `main`: it already contains
  the decision log (#54, #55, #56), `server/decision-log.ts` and its tests. The tickets' "Base branch:
  `release/v0.1.0`" means this branch.
  Run `git branch --show-current` before every commit.
- Read before you start: `GLOSSARY.md`, `docs/adr/0001-*.md` to `0003-*.md`, `docs/contract.md`
  ("Checkpoint marks", "What the plugin reads from the delegation table", "The decision log"),
  `docs/agents/evidence-standards.md`, `docs/agents/comment-template.md`, `CODING_STANDARDS.md`,
  your ticket (`gh issue view <n> --comments`), and #54's comments for the decision log's decisions.
  Ticket 58 also reads 57's `Resolved:` comment and the ADR 0004 it merged.
- 0 other agents (bundles) work in parallel. Work only on your own bundle, one ticket at a time, in the
  order of your prompt: 57, then 58.
- Do not end your turn while work you started is still running in the background (a test run, `npm ci`,
  a long command): wait for it inside the same turn. Paseo sends no finish notification for a turn you
  start on your own afterwards, so your "finished" report must mean the work is done.
- Start any command that may take more than two minutes in the background from the start, and read its
  output when it finishes.
- Your worktree has no `node_modules`: run `npm ci` once in it before the first test run (no `paseo.json`,
  so Paseo runs no setup for you).

## Parameters
- Ticket cap: 4, the most tickets step 2 plans into a bundle. While Jev is not available it is also the fallback stop: once a ticket agent has worked this many tickets, the orchestrator answers `stop` (step 5).
- Context stop: 600K `contextWindowUsedTokens`, the size of a ticket agent's context at which the orchestrator answers `stop`, while Jev is not available (step 5).
- With Jev, its flag is what stops a bundle (step 5); the ticket cap still bounds the bundle's size.
- This bundle holds two tickets, so the ticket cap does not fire; the context stop may.

## Existing interfaces to reuse
- `readDelegation(text)` (`shared/delegation.ts`): the one reader of the `## Delegation` table; 58 changes its
  return shape (`on` becomes `level` and `levelFrom`) and keeps it the only reader.
- `decideAnswers(delegation, input, stream)` and `answerOne` (`server/delegated-answers.ts`): the one place a
  question is answered or left; every leave string comes from here.
- `registerDelegatedAnswers(hooks, reader)`: the `Reader` hooks (`left`, `answered`) the decision log (#54)
  writes from; 58 extends the grounds through them, adds no new hook and no new entry kind.
- `server/decision-log.ts`: `groundsOfAnswer` and the `Grounds:` field; 58 changes the grounds strings only.
- `server/appetite.ts` and `server/question-budget.ts` do not change.
- Business rules go through the interfaces above; new layers only call them.

## Paseo plugin design points (from `/paseo-plugin` and its reference, read 2026-10-01)
- `shared/` compiles into both the client and the server bundle: `shared/delegation.ts` imports no `node:`
  module, nothing from `server/` or `client/`, no React and no runtime-specific SDK entry. A violation is a
  compile error only on the daemon's build, not in `npm run typecheck`; `test/bundle-boundaries.test.ts`
  does not exist on this base.
- No new code module in the plugin root besides `index.client.ts` and `index.server.ts`.
- The plugin answers a permission only through the host's `respondToPermission` from its lifecycle hook.
  At level 3 a `Yours: merge` answer is that call and nothing else: add no `child_process`, no git command,
  no `paseo` SDK call that merges, anywhere (ADR 0002 non-goal 6, as ADR 0004 amends it). The level-3
  merge test asserts the fake host saw only `respondToPermission`.
- Keep `requirements.paseo` in `paseo-plugin.json` as it is; this work needs no newer API.
- The contract version stays `1` (ADR 0003: `v0.1.0` is untagged, so v1 is amended in place).

## File zones
- Ticket 57: new `docs/adr/0004-three-autonomy-levels.md`; `docs/adr/0002-what-the-plugin-will-never-do.md`
  (its status line, one pointer line under each of non-goals 3 and 6, and non-goal 6's "merge stays with a
  human" and its reason, as the ticket says); `README.md`'s ADR list (line 11) and any sentence quoting the
  five owner items; any docs test that lists the ADRs (`test/docs/docs-set.test.mjs` pins ADR 0002).
- Ticket 58: `shared/delegation.ts`, `server/delegated-answers.ts`, `server/decision-log.ts` (its grounds
  only), `docs/contract.md` (the delegation, marks and decision-log sections), `README.md`'s
  delegated-answers section (around line 292), `test/smoke/README.md`'s "Delegated answers" section,
  `CHANGELOG.md` under Unreleased, and every test file of the seam list in "Traps already hit".
- Shared files (`README.md`, `CHANGELOG.md`, `test/smoke/README.md`): add or change only your own lines,
  and keep the order of the existing lines. Stream `plugin-real-host` also edits these three files (the
  smoke-copy paragraph and step 10 of "Stall sensor" in `test/smoke/README.md`; its own `CHANGELOG.md` and
  `README.md` lines): touch nothing outside your sections.
- Do not edit `test/smoke/fixtures/` (it does not exist on this base; stream `plugin-real-host` adds
  `AGENTS-p5.md` and `AGENTS-spend.md` there with `Switch | on`, which 58's mapping reads as level 2).

## Traps already hit
- A test pinning an old call or text, which no ticket ran, broke CI in the last stream (`plugin-decision-log`,
  fixed in #60): each ticket passed its own files. Before you commit, grep `test/` for every call, field,
  string and heading you change or remove (`.on`, `on: true`, `the delegation switch is off`,
  `no delegation table`, every grounds string, every ADR line a test pins), and run each file it finds, red
  then green. Check: `grep -rn "<each changed text>" test/` lists only files you ran.
- **Seam list for 58**, found on `6db199a`: a `## Delegation` table with no `Switch` row reads as on today
  and as level 1 after 58, so these fixtures flip from answered to left unless they gain `| Level | 2 |`
  (or `3` where the test needs it): `test/hooks/delegated-answers.test.ts`, `test/hooks/question-budget.test.ts`,
  `test/hooks/report-card.test.ts`, `test/decision-log.test.ts` (its `TABLE`, line 142, and the grounds it
  pins at line 178), `test/hooks/appetite.test.ts` (its `TABLE`, line 21: the ticket expects no change, so
  run it and change it only if it goes red), `test/delegation.test.ts`, `test/delegated-answers.test.ts`,
  `test/delegated-answers-docs.test.ts`, `test/contract.test.ts` (through `test/support/contract-doc.ts`).
  Check: each of these files is run once after your change, and the ones you changed also on the base.
- A path hard-coded for Windows broke CI on Linux and macOS in the last stream. Build every path in a test
  from `tmpdir()` and `join`, never a literal like `C:\...` or a `/repo` that a test then compares with a
  real file path. Check: the added lines of `git diff 6db199a -- test/` hold no drive letter followed by a
  slash or a backslash.
- The shell drops backslashes: `\n`, `\b`, `\(` in a regular expression or a Windows path arrive broken
  through a heredoc, `echo` or a script's string literals. Write files with Edit and Write only. Check:
  `git ls-files | xargs grep -lP '[\x00-\x08\x0b\x0c\x0e-\x1f]'` prints nothing.
- `node --test test/` on Node 24 fails with `Cannot find module`: pass file paths
  (`node --test test/delegation.test.ts`).
- A check reads structure, never a sentence of prose (evidence standards): a new docs test pins a heading,
  a table's columns, a row or a pinned token such as `` `Level` ``, never a sentence.

## Failing on base
- On `6db199a`, before the first spawn (Windows 11, Node 24): `npm run check` (typecheck, `npm test` and
  `node --test test/docs/docs-set.test.mjs`): 716 tests, 716 pass, 0 fail. None: every command passes.
- A failure listed here is not yours: leave it as it is unless your ticket's acceptance criteria name it, and
  name it in your report as failing on base. A failure not listed here is yours to explain.

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
| Must hold | The owner's reading of level 3 ("thả cửa"): everything the table lets the orchestrator decide is delegated, ship and merge included; the plugin answers a merge question only through `respondToPermission` and never runs git (non-goal 6); the appetite stop holds at level 3 (P29); a question with no recommended first option is left to the owner by the plugin at every level (the orchestrator, not the plugin, may decide it). | As the section above. |
| Chosen for you | What "passes" means in 57's "`npm run check` passes" and 58's "`delegated-answers-docs.test.ts` and `contract.test.ts` pass": run each test file the criterion names, once each with `node --test <file>`, red on the base where you changed it, green after; run no full suite. 58 also runs every file of the seam list in "Traps already hit", each once, whether or not it changed it: red on the base then green where 58 changes the file, green after where it does not. 57 runs `test/docs/docs-set.test.mjs` and `test/contract.test.ts`. Reason (orchestrator D129): the evidence standards say a ticket runs no suite, and CI does not run on a pull request into `release/v0.1.0`, only on the push after its merge (P28), so the seam list is the only net before the merge. | Challenge it with evidence, in your ticket's comments and your report. A challenge alone does not move the ticket to `ready-for-human`. |
| Chosen for you | No in-flow code review: the evidence standards defer it to the milestone. Your `Resolved:` comment reads `Code review: deferred to the milestone`. | as above |
| Chosen for you | 57 leaves `docs/roadmap.md` alone; the "Roadmap text for the shipping stream" section of 57 is the stream agent's, at ship. | as above |
| Not known yet | Whether the skills' ADR 0011 (hanh9898/matt-with-paseo#110) words the levels the same way. | 57 names it as a skills-side dependency, as the ticket says, and files nothing there. |

Whoever answers a challenge to a chosen default writes why the plan changes or stands; an answer with no reason is not a resolution.

## Resources
- Your private resources are listed in your prompt (a temp directory). Use exactly that set. Create it when
  you first need it, and leave it in place when you finish: a finding may come back to you. Tests make their
  own directories under `tmpdir()`.
- Shared resources, read-only: the owner's Paseo daemon (no `paseo` call is needed for this bundle; make none).
- Shared resources you may write to, and machine-wide locks: none.

## Repo and user rules
- English for commits, code, ticket comments and reports. Comments follow `docs/agents/comment-template.md`.
- Commit format: Conventional Commits, `type(scope): subject`, `type` one of `feat`, `fix`, `docs`, `test`,
  `refactor`, `chore`, `ci`; the subject in the imperative, lowercase, at most 72 characters, no final full
  stop (rule C1 of `CODING_STANDARDS.md`). End each commit message with the line
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Files are written with Edit and Write only, never shell heredocs, `echo` or a script's string literals.
- Never use AskUserQuestion: put a question in your report, with your recommendation. Use `gh issue`
  commands only; never `gh auth status`.
- Credentials: never read, print or pass on a token or credential (no `gh auth token`, no reading a CLI's
  hosts or config file or a token's environment variable, no token in a URL or a command). A `gh`, `glab`,
  push or upload failure goes into your report with the command and its error as printed; never work
  around it with another tool, the forge's API or another account. Never push.
- Evidence standards: read `docs/agents/evidence-standards.md`; it is not copied here. It defers the code
  review to the milestone: run none.

## Done when:
Each item below holds for one ticket, and you go through them again for each ticket of your bundle.
- Commit to your branch. The orchestrator merges it. Pull-request descriptions and discussion are written
  by whoever ships, outside this wave: keep none in your worktree, and put what they need in your report.
- Run no `/mattpocock-skills:code-review`: the evidence standards defer it to the milestone.
- Change the ticket status: `resolved` if fully done (a `Resolved:` comment per
  `docs/agents/comment-template.md`, with a `Test run:` line per test file, red then green, and
  `Code review: deferred to the milestone`), `ready-for-human` for the part a human must do. Write in the
  comments of that ticket's own issue what you verified, with evidence, and what remains open; there is no
  bundle-level evidence.
- Report back for that ticket, with the SHA of its last commit: a design summary, files touched, how you
  verified with evidence (each red and green run as command and output), work not done or still in doubt,
  every change outside your file zone or outside git (a file in another checkout, a machine setting, an
  uncommitted file) with where it is, each private resource you created, and decisions the user must make.
  Tag each decision `decided: X because Y` or `assumed: X, unchecked`, and each finding `reproduced` or
  `traced`, so a reader scans the report instead of parsing its prose.
- End your turn after each ticket's report, then wait for `next` (start the bundle's next ticket) or `stop`
  (hand off as the orchestrator's message says). The rule above about background work holds at every one of
  these turn ends: wait for it inside the turn, so the report means the work is done.

## Checkpoints
- 2026-10-01, steps 0 and 2 in one Checkpoint (stage C; graph `54✓ → [57+58]`, wave 1 = bundle `[57+58]`, quota 1; question 1: bundle or split, question 2: what "passes" means in 57's and 58's criteria). Answer D129: 1 bundle `[57+58]`; 2 as recommended, corrected: CI does not run on a pull request into `release/v0.1.0` (P28), so 58 runs every file of the seam list once, plus the files its criteria name, never the full suite; spawn 57. changed the work: yes (the "Chosen for you" row on test runs was rewritten before the first spawn). took the recommendation: yes.

## Wave agents

| Bundle's tickets | Agent id | Workspace id | Branch | Base commit | Private resources | Merged SHAs | Cleaned |
|---|---|---|---|---|---|---|---|
| 57+58 | fd343925-b3ee-4e42-89e7-b0e459713fb2 | wks_d2a61d94d3570195 | `plugin-autonomy-levels/wave1/57-adr-0004-three-autonomy-levels` | `6db199a` | temp dir `join(tmpdir(), "plugin-autonomy-levels-57")` | 57: c43d94c, 58: c7bcca6 | [x] |

Notes on the reports (below the frozen rules):
- 58's agent ran the full suite once after its last change (`npm test`, 728 tests, 728 pass), against the "Chosen for you" row; it says so in its report. Green, so no finding.
- 58 changed two files outside the seam list, both named in its report: `test/appetite-docs.test.ts` (its `section` helper cut at a `## Delegation` line inside a code fence of the new example tables) and `test/support/contract-doc.ts` (reads `Level`, skips fenced headings). The seam list missed them: a fenced `## Delegation` example in `docs/contract.md` breaks any docs helper that cuts sections by heading. Trap for the next wave.

## Review
- Deferred to milestone `v0.1.0` (evidence standards): a one-bundle wave, and `docs/agents/evidence-standards.md` defers the code review to the milestone run. No review run, so no mark.
