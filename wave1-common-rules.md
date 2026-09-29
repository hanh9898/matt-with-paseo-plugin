# Common rules for wave 1 (tickets 33)

## Graph
`33 → 34 → 38 → {39, 40} → 41; 35, 36, 37 (each also gated on stream matt-with-paseo-plugin shipping; 37 on #15)`

| Ticket | Status | Blocked by | Wave |
|---|---|---|---|
| 33 | open, ready-for-agent | - | 1 |
| 34 | open, ready-for-agent | 33; stream `matt-with-paseo-plugin` shipped | after that stream ships |
| 35 | open, ready-for-agent | #2 (body line only, native edge dropped); stream `matt-with-paseo-plugin` shipped | after that stream ships |
| 36 | open, ready-for-agent | stream `matt-with-paseo-plugin` shipped | after that stream ships |
| 37 | open, ready-for-agent | #15; stream `matt-with-paseo-plugin` shipped | after that stream ships |
| 38 | open, ready-for-agent | 34 | after 34 |
| 39 | open, ready-for-agent | 34, 38 | after 38 |
| 40 | open, ready-for-agent | 34, 38 | after 38 |
| 41 | open, ready-for-agent | 38, 39, 40 | after 39 and 40 |

## Context
- Your worktree branches off `stream/plugin-vision-milestones` at `98d50ea7df74076ec49f80aa5b392563770e9542` (the same commit as `main`), unless your prompt names another base commit. That branch contains no ticket of spec #32 yet.
  Run `git branch --show-current` before every commit.
- Read before you start: spec #32 (`gh issue view 32 --comments`), your ticket and its comments, every issue its `## Report` and `## Source` sections link (the Decisions on #22 and #28, #23, #25, #30), `AGENTS.md`, `CODING_STANDARDS.md`, `docs/agents/domain.md`, and ADR 0001 in `docs/adr/`.
- No other agent works this wave. Work only on your own ticket.
- Another stream, `matt-with-paseo-plugin`, runs in this repository on its own branches and also edits `README.md` and files under `docs/`. Do not read from or write to its worktrees or branches; write from `main` as your base shows it. Merging the two streams is the shippers' job.
- Do not end your turn while work you started is still running in the background: wait for it inside the same turn. Paseo sends no finish notification for a turn you start on your own afterwards, so your "finished" report must mean the work is done.
- Start any command that may take more than two minutes in the background from the start, and read its output when it finishes.
- Never use AskUserQuestion. A question for the user goes at the end of your final message, written out, each with its options and your recommendation.

## Existing interfaces to reuse
- Not applicable: the ticket changes no code. The documents it edits already exist on the base (`README.md`, `AGENTS.md`, `docs/agents/domain.md`, `docs/agents/evidence-standards.md`, `.github/pull_request_template.md`); `docs/roadmap.md`, `docs/adr/0002-*.md` and `GLOSSARY.md` are new. Name ADR 0002 in the style of ADR 0001's file name.

## File zones
- Ticket 33 writes in the files above and in the checks it adds. `docs/agents/ship-rules.md` is not touched (#25).
- Shared files: none this wave.

## Traps already hit
- Tests do not run in a ticket (evidence standards): write each check to fail before the change, commit it, and run none; the milestone run on `release/v0.1.0` runs them. Check: your report and comments show no test, drift check, eval or code-review run.
- `main` has no test runner and no `package.json`: a check for a document is a script or a written command (a `grep`, a parse, a link check) committed in the repo; do not add a `package.json` or a test framework for it (the plugin stream owns `package.json`).

## Failing on base
- On `98d50ea7df74076ec49f80aa5b392563770e9542`, before the first spawn: the repository has no verification command (no `package.json`, no build, lint or test script), and by the user's standing instruction nothing is run before the milestone, so none.
- A failure listed here is not yours: leave it as it is unless your ticket's acceptance criteria name it, and name it in your report as failing on base. A failure not listed here is yours to explain.

## Acceptance criteria are the contract
- A trap above, or an instruction an earlier ticket left in its comments, is guidance; your ticket's acceptance criteria are the contract.
- On conflict, follow the criteria and write the discrepancy and its reason in your ticket's comments; do not stop to ask.
- If the criteria themselves look wrong, stop that part, write the evidence in your ticket's comments, and move the ticket to `ready-for-human`. Never rewrite the criteria.

## Resources
- Your private resources are listed in your prompt (a temp directory). Use exactly that set. Create it when you first need it, and leave it in place when you finish. The orchestrator removes it once your ticket is merged.
- Shared resources, read-only: the GitHub issues of `hanh9898/matt-with-paseo-plugin` (read with `gh issue view`), sting9k/seatworks at `6d316b0` if you need it (read only).
- Shared resources you may write to: your own ticket's comments and labels. Nothing else.

## Repo and user rules
- Commits, documents and ticket comments in English. Ticket comments take a shape from `docs/agents/comment-template.md`, posted with `gh issue comment <n> --body-file <file>`.
- Commit format: Conventional Commits, `type(scope): subject`, `type` one of `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`; the subject in the imperative, lowercase, at most 72 characters, no final full stop (C1). One change per commit, its subject naming it; every commit of a ticket references its issue (`#33`) in the body (C2). End each commit message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Credentials: never read, print or pass on a token or credential (no `gh auth token`, no `gh auth status`, no reading a CLI's hosts or config file or a token's environment variable, no token in a URL or a command). Use `gh issue` commands only. A `gh` failure goes into your report with the command and its error as printed; never work around it with another tool, the forge's API or another account.
- Git: commit on your own branch only. No push, no branch switch, no rebase, no merge: the orchestrator merges.
- Evidence standards: read `docs/agents/evidence-standards.md`; it is not copied here. It overrides the wave skill here: your flow runs no test, no drift check, no eval and no `mattpocock-skills:code-review`.

## Done when:
- Commit to your branch. The orchestrator merges it. Pull-request descriptions and discussion are written by whoever ships, outside this wave: keep none in your worktree, and put what they need in your report.
- No `mattpocock-skills:code-review` and no test run (evidence standards): your `Resolved:` comment carries the lines `Tests: deferred to the milestone (docs/agents/evidence-standards.md)` and `Code review: deferred to the milestone (docs/agents/evidence-standards.md)`.
- Post the `Resolved:` comment of `docs/agents/comment-template.md` when fully done, leaving the issue open; move the ticket to `ready-for-human` for the part a human must do, saying which part. Write in the comments what you verified, with evidence, and what remains open.
- Report back: a design summary, files touched, how you verified with evidence, work not done or still in doubt, every change outside your file zone or outside git with where it is, each private resource you created, and decisions the user must make (written out, each with options and your recommendation).

## Wave agents

| Ticket | Agent id | Workspace id | Branch | Base commit | Private resources | Cleaned |
|---|---|---|---|---|---|---|
| 33 | 4813877d-c137-4097-9934-adc72e5af720 | wks_f0cb5d4bc508455c | plugin-vision-milestones/wave1/33-docs-set | 98d50ea7df74076ec49f80aa5b392563770e9542 | temp dir `%TEMP%\plugin-vision-milestones-33` | [x] |

## Review
- Not applicable: one-ticket wave, so no seam. The code review itself is deferred to milestone `v0.1.0` (docs/agents/evidence-standards.md); ticket 33 ran none either.
- Fixed point: `98d50ea7df74076ec49f80aa5b392563770e9542`. Findings: Standards 0, Spec 0 (none run).
- Ticket 33 merged at `db699ff`; the conflict-marker search printed nothing. No suite run after the merge (standing instruction).
- Notes for the milestone run and for later tickets, from ticket 33's report:
  - `test/docs/docs-set.test.mjs` (25 checks) has never run, not even a syntax check; nothing calls `test/docs/` yet, so #36's `npm run check` should include it.
  - Two additions beyond the Decision on #28, kept by the agent's recommendation: parity row "W4 Claude Code" (#6, #19), and a `v0.2.0` exit criterion for the bundle-stop condition.
  - X2 (install from a clone) is placed on #37 per spec #32, while the Decision on #28 says "docs ticket".
  - `CHANGELOG.md` `[Unreleased]` has no line for the docs set (outside the ticket's zone): for whoever ships.
