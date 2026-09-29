# Common rules for wave 1 (tickets 03, 04, 06, 01, 09, 02, 16, 19, 14, 05, 18, 11, 07, 10, 12, 13, 15, 17)

## Graph
`03 → {04, 06, 10, 12, 13, 15, 16, 17} ; 04 → {01, 07, 09, 11, 14} ; 06 → {02, 19} ; 04 + 06 → 02 ; 01 → 05 ; 09 → 18 ; 08 needs-info, out of the stream`

| Ticket | Status | Blocked by | Wave |
|---|---|---|---|
| 03 | resolved, merged at `0ab216e` | - | 1 |
| 04 | resolved, merged at `e25c6dc` | 03 | 1 (rolling start, base `0ab216e`) |
| 06 | resolved, merged at `e55bd84` | 03 | 1 (rolling start, base `e25c6dc`) |
| 10 | resolved, merged at `9dc1e6e` | 03 | 1 (rolling start, base `7a6a6cc`) |
| 12 | resolved, merged at `c7f6257` and `d2dfe9a` (wave files stay in the checkout, user's decision "1 A") | 03 | 1 (rolling start, base `9dc1e6e`) |
| 13 | resolved, merged at `793e938` | 03 | 1 (rolling start, base `c7f6257`) |
| 15 | resolved, merged at `39147cc` | 03 | 1 (rolling start, base `793e938`) |
| 16 | resolved, merged at `d0f351d` and `a1ebc81` (Claude Code plugin renamed `matt-with-paseo-plugin`) | 03 | 1 (rolling start, base `2a10208`) |
| 17 | resolved, merged at `649ae8a` | 03 | 1 (rolling start, base `d2dfe9a`) |
| 01 | resolved, merged at `6de5420` | 03, 04 | 1 (rolling start, base `e55bd84`) |
| 07 | resolved, merged at `7a6a6cc` (criterion 3 passed on, user's decision "1 A") | 03, 04 | 1 (rolling start, base `d96e3a2`) |
| 09 | resolved, merged at `928afda` | 03, 04 | 1 (rolling start, base `6de5420`) |
| 11 | resolved, merged at `d96e3a2` | 03, 04 | 1 (rolling start, base `7b9ef7b`) |
| 14 | resolved, merged at `8d69b23` | 03, 04 | 1 (rolling start, base `d3f6378`) |
| 19 | resolved, merged at `d3f6378` | 03, 06 | 1 (rolling start, base `d0f351d`) |
| 02 | merged at `2a10208`, open: criterion 1 waits on a plugin manifest and on the user | 03, 04, 06 | 1 (rolling start, base `928afda`) |
| 05 | resolved, merged at `ce5ceaf` | 03, 01 | 1 (rolling start, base `a1ebc81`) |
| 18 | resolved, merged at `7b9ef7b` | 03, 09 | 1 (rolling start, base `ce5ceaf`) |
| 08 | needs-info | 03 | out of the stream (ADR 0001: no checkpoint MCP tool exists) |

## Context
- Your worktree branches off `stream/matt-with-paseo-plugin` at `68321692b0f02f5d645a52c0132cff6b13eea380`, unless your prompt names another base commit (a ticket started mid-wave). That branch holds no plugin code yet: only the repository's documents.
  Run `git branch --show-current` before every commit.
- Read before you start: your ticket and its comments (`gh issue view <n> --comments`), [`docs/adr/0001-checkpoints-use-paseo-native-questions-answered-by-the-plugin.md`](docs/adr/0001-checkpoints-use-paseo-native-questions-answered-by-the-plugin.md), `CODING_STANDARDS.md`, `docs/agents/domain.md`, `docs/agents/comment-template.md`.
- Ticket 03 is the root of the graph: every other ticket builds on the plugin skeleton it lays down (the manifest, the package, the source and test layout). Beyond its own acceptance criteria, ticket 03 delivers that skeleton: a Paseo plugin the daemon can load, with `requirements.paseo` in `paseo-plugin.json`, a `package.json`, a strict `tsconfig.json` (T1), one entry module, a place for tests with a test command, and the layout written down where later tickets read it (the README's development section). The host port is ticket 04's, the harness descriptors ticket 06's, `plugin.json`/`marketplace.json` and the version check ticket 16's, CI ticket 17's: leave them out.
- The Paseo host here is daemon and CLI `0.10.1`, the version ADR 0001's prototype ran on; `paseo --version` prints it. Load the `paseo-plugin` skill for the manifest shape, the SDK and how a plugin is loaded.
- 0 other agents run beside you in this wave (quota 1). Work only on your own ticket.
- Do not end your turn while work you started is still running in the background (a build, an install, a long command): wait for it inside the same turn. Paseo sends no finish notification for a turn you start on your own afterwards, so your "finished" report must mean the work is done.
- Start any command that may take more than two minutes (an install, a build) in the background from the start, and read its output when it finishes. A foreground command the shell moves to the background halfway can leave your turn waiting on a result that never returns.

## Existing interfaces to reuse
- not applicable: the repository has no plugin code yet.

## File zones
- Ticket 03 writes the plugin skeleton: `paseo-plugin.json`, `package.json` and its lockfile, `tsconfig.json`, the entry module and source folder, the test folder and its config, `.gitignore` entries for build output and `node_modules`, the README's development section, `CHANGELOG.md`'s entry.
- Shared files later waves will touch (`package.json`, `paseo-plugin.json`, the README, `CHANGELOG.md`): add only your own lines, and keep the order of the existing lines (J3).

## Traps already hit
- Tests do not run in a ticket (evidence standards): a ticket that runs its tests breaks the stream's rule. Write each check to fail before the change, commit it, and run none; the check is a file that exists, `git log` shows it. The stream runs every test once after the last wave.
- A smoke test on the real Paseo daemon is a test too: write it (a script or written steps that load the plugin and read what the daemon reports), and record next to the range the Paseo version it targets (`0.10.1`); the stream runs it at its end. Installing or enabling the plugin in the running daemon touches every session on this machine: leave the daemon's plugin set as it is. Check: `paseo --version` is the only daemon command in your report.

## Failing on base
- On `68321692b0f02f5d645a52c0132cff6b13eea380`, before the first spawn: the repository has no verification command (no `package.json`, no build, lint or test script), so none: nothing fails on base.
- A failure listed here is not yours: leave it as it is unless your ticket's acceptance criteria name it, and name it in your report as failing on base. A failure not listed here is yours to explain.

## Acceptance criteria are the contract
- A trap above, or an instruction an earlier ticket left in its comments, is guidance; your ticket's acceptance criteria are the contract.
- On conflict, follow the criteria and write the discrepancy and its reason in your ticket's comments; do not stop to ask.
- If the criteria themselves look wrong, stop that part, write the evidence in your ticket's comments, and move the ticket to `ready-for-human`. Never rewrite the criteria.

## Resources
- Your private resources are listed in your prompt (a temp directory). Use exactly that set. Create each one when you first need it, and leave it in place when you finish: a review finding may come back to you. The orchestrator removes it once your ticket is merged and the wave reviewed.
- Shared resources, read-only: the running Paseo daemon (read its version only), the `hanh9898/matt-with-paseo` repository and its skills.
- Shared resources you may write to, and machine-wide locks: none.

## Repo and user rules
- Commits, code, comments and documents in English. Ticket comments take a shape from `docs/agents/comment-template.md`, posted with `gh issue comment <n> --body-file <file>`.
- Commit format: Conventional Commits, `type(scope): subject`, `type` one of `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`; the subject in the imperative, lowercase, at most 72 characters, no final full stop (C1). One change per commit, its subject naming it; every commit of a ticket references its issue (`#3`) in the body (C2). End each commit message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Credentials: never read, print or pass on a token or credential (no `gh auth token`, no reading a CLI's hosts or config file or a token's environment variable, no token in a URL or a command). A `gh`, `glab`, push or upload failure goes into your report with the command and its error as printed; never work around it with another tool, the forge's API or another account.
- Git: commit on your own branch only. No push, no branch switch, no rebase, no merge: the orchestrator merges.
- Evidence standards: read `docs/agents/evidence-standards.md`; it is not copied here. It overrides the wave skill here: your flow runs no test, no drift check, no eval and no `mattpocock-skills:code-review`. At most one new eval case, and only when your ticket's acceptance criteria name an eval.

## Done when:
- Commit to your branch. The orchestrator merges it. Pull-request descriptions and discussion are written by whoever ships, outside this wave: keep none in your worktree, and put what they need in your report.
- No `mattpocock-skills:code-review` and no test run (evidence standards): your `Resolved:` comment carries the lines `Tests: deferred to the stream's end (docs/agents/evidence-standards.md)` and `Code review: deferred to the stream's end (docs/agents/evidence-standards.md)`.
- Post the `Resolved:` comment of `docs/agents/comment-template.md` when fully done, leaving the issue open; move the ticket to `ready-for-human` for the part a human must do, saying which part. Write in the comments what you verified, with evidence, and what remains open.
- For a change the user sees, the screenshots include the screen scrolled past its first view and at a narrow width.
- Report back: a design summary, files touched, how you verified with evidence, work not done or still in doubt, every change outside your file zone or outside git (a file in another checkout, a machine setting, an uncommitted file) with where it is, each private resource you created, and decisions the user must make.

## Rule changes during the wave

The rules above are frozen; each change below reaches the agents spawned after it through their prompt, and goes into the next wave's rules.

- After ticket 06 (user's standing instruction): never ask with the `AskUserQuestion` tool. A question asked mid-turn sends the orchestrator no finish notification, so it sits unseen. When you need a decision, end your turn with the question written in your final message: the options, and your recommendation first.
- After ticket 02 (user's rule, on `main` at `98d50ea`, PR #31, `docs/agents/evidence-standards.md`): tests, review and the eval run only once per milestone (`v0.x.0`, up to `v0.5.0`), on a `release/v0.x.0` branch after every stream of the milestone has merged into `main`. No ticket, no merge and no stream end runs any of them. Your `Resolved:` comment carries `Tests: deferred to the milestone` and `Code review: deferred to the milestone`. Read the file on `origin/main` (`git show origin/main:docs/agents/evidence-standards.md`) until it reaches this branch at the next wave boundary.
- After ticket 19 (the user confirmed it; every prompt carries it): for `gh`, use only issue commands (`gh issue view`, `gh issue comment`); `gh auth status` prints part of a token (ticket 19's agent saw its masked `gho_` prefix), so leave it unrun.
- After ticket 05 (orchestrator launch settings, user's instruction): ticket agents spawned from here on launch with the Paseo profile `ticket-agent` (`claude/claude-sonnet-5-5`, thinking `medium`, mode `bypassPermissions`, notes "matt-with-paseo spawn agent"), in place of thinking `high` and mode `auto`; agents already running keep their settings.
- After ticket 11 (a trap hit): ticket 05 wrote raw line breaks inside two string literals of `server/messages.ts`, so the file did not parse on the stream until ticket 11 fixed it (`3ba4592`); ticket 11's own first check commit did the same. Write a line break in a string as the escape `\n`, and after each edit that puts one in a string, read the changed lines back (`git diff`) to see the escape, not a broken line.

## For the stream's end

Items gathered while the wave runs. The "Pass on" items are filed in `hanh9898/matt-with-paseo` by the orchestrator through a triage intake when stream `plugin-v0-1-0-skills` starts (the user's instruction); #1's criteria 3 and 4, #5's criterion 2 and #11's criterion 2 (its decision "2 A") belong with them. Under the milestone rule above, this stream's end runs no test, review, fix pass or eval: it reports stage F, and its ship pull request's Evidence says "Tests, review and eval: deferred to milestone `v0.1.0` (evidence standards)".

- Milestone `v0.1.0` run's fix pass: reword T2 in `CODING_STANDARDS.md` to match the user's decision on #4 and #9 ("1 A"): every server-side call to Paseo's plugin SDK goes through `server/paseo-host.ts`; the pill's wire (`index.client.ts`, `shared/waiting.ts`, the `PILL_WIRE` list in `test/host-port.test.ts`) may import it too.
- Milestone `v0.1.0` run's fix pass: reword T3 in `CODING_STANDARDS.md` for ticket 02's exception: at `before('agent.create')` a ticket agent is recognised by its title (`[Wave N] <NN> …`), since Paseo `0.10.1` sets labels only afterwards (user's decision "1 A" on #2).
- Milestone `v0.1.0` smoke run: the user enables this repository's Claude Code plugin for ticket agents, then runs `test/smoke/README.md` "Git guard"; #2 closes once it proves criterion 1 (user's decision "3 A"). Its step 4 records the resume gap.
- Pass on to stream `plugin-vision-milestones`, to carry as its own ticket (user's decision "2 A" on #2): a resumed ticket agent loses `MWP_ROLE=ticket`, so the git guard stops refusing; the fix adds `beforeSessionOpen` to the host port and checks whether labels can be read there. See #2's last Progress comment.
- Milestone `v0.1.0` run's fix pass: `test/smoke/README.md`, "Git guard", part A step 1 lost its path separators (`<plugin>guardgit-guard.mjs`), found by ticket 16.
- Milestone `v0.1.0` run's fix pass: `test/entry-wiring.test.ts:53` matches `/registerTicketMarker(hooks)/` with unescaped parentheses, so it looks for `registerTicketMarkerhooks` and will fail (ticket 02's line, found by ticket 14).
- Milestone `v0.1.0` run's Spec review: `PLAIN_LABELS` in `client/pill-text.ts` and `test/plain-words.test.ts` pin 13 words-block terms read from a local copy of the skills, not from `hanh9898/matt-with-paseo` at a fixed commit; check them against the skills at the commit the milestone targets (ticket 18).
- Milestone `v0.1.0` run: before the full test run, `npm run typecheck` shows whether any other file carries a raw line break in a string (ticket 05's trap, fixed in `server/messages.ts` by ticket 11).
- Pass on, for a ticket in `hanh9898/matt-with-paseo` (as for #1 and #5): the wave and stream skills' summary lists the plugin's `Human words:` messages, and whether each changed the plan (#11's criterion 2). If the smoke run shows the app does not set `clientMessageId` reliably, the skills also mark the orchestrator's own prompts (#11's report).
- Milestone `v0.1.0` run's review: ticket 07 put its checks and its code in one commit (`c69e06c`), so its check-first order cannot be read from git, and the commit holds more than one change (C2).
- Pass on, for a ticket in `hanh9898/matt-with-paseo` (user's decision "1 A" on #7): an eval case showing a stalled ticket agent is still caught, run through the skills' stall judgement on the plugin's `Stall suspected:` messages (#7's criterion 3); until then `test/hooks/stall-sensor.test.ts` and the "Cheap sensor" smoke steps stand in.
- Pass on, for a ticket in `hanh9898/matt-with-paseo` (#10's criterion 2): the wave skill reads the plugin's `Gate cap passed:` message (or the cap, `MWP_GATE_SHARE`, half the processors by default) and keeps the ready tickets past it in a queue, as its quota does.
- Pass on, for a ticket in `hanh9898/matt-with-paseo` (#13's criterion 1): the skills' setup lists the cost levels of `presets/cost-levels.json` (Cheap, Balanced by default, Max), lets the user pick one or override a role (`MWP_COST_LEVEL`, `MWP_COST_<ROLE>`), and copies the chosen agent and model, with the profile's mode and thinking, into `create_agent`. The role names and the model table are ticket 13's choice, open to the user.
- Milestone `v0.1.0` run: `docs/agents/evidence-standards.md` on `main` (`98d50ea`) links `docs/roadmap.md`, which `main` does not hold yet (found by ticket 15); the milestone's exit criteria live there, so it must be on `main` before the run.
- After milestone `v0.5.0`, when the milestone rule ends: decide again whether to add a pre-commit hook (Matt's `setup-pre-commit` runs lint-staged, typecheck and tests on every commit); ticket 17 builds only the CI on three systems, triggered by `release/v*` branches and pull requests from them (user's decision "2 A" on #17).
- Ship pull request, under T7: `zod` is imported at run time by `shared/waiting.ts`; it is a peer dependency of `@getpaseo/plugin`, provided by the host (user's decision "2 A" on #9).

## Wave agents

| Ticket | Agent id | Workspace id | Branch | Base commit | Private resources | Cleaned |
|---|---|---|---|---|---|---|
| 03 | 71285b2b-ed4c-4fd3-a66c-c7f246be16a2 | wks_c161fbb15f0d2b16 | matt-with-paseo-plugin/wave1/03-host-version-range | 68321692b0f02f5d645a52c0132cff6b13eea380 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-03-tmp` | [x] |
| 04 | 50292a21-17e4-4b9d-a0cc-42cfadd695a8 | wks_bdcc1031652f6e55 | matt-with-paseo-plugin/wave1/04-one-narrow-host-port | 0ab216ec35839cb7c98834d4a14fa8fa7fe422b4 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-04-tmp` | [x] |
| 06 | 421fef12-d56e-4529-be39-69117c644ec8 | wks_e7423cf333a2b3e9 | matt-with-paseo-plugin/wave1/06-roles-and-harnesses-as-data | e25c6dcd10da402f073310e43f7957c20b6168d7 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-06-tmp` | [x] |
| 01 | 0d0a15df-d4fb-4f1e-b1cb-4a38c01fdf34 | wks_4aea960218546d0a | matt-with-paseo-plugin/wave1/01-lifecycle-hooks | e55bd8433bf9c2baee5da135cf7cb35f5a92fc67 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-01-tmp` | [x] |
| 09 | cb771360-7125-4ccd-8dc8-1077c504d52f | wks_f2565f0e3d7e7842 | matt-with-paseo-plugin/wave1/09-paseo-surfaces | 6de5420ece0157f151c87da3a588e6f689ccb4ae | temp dir `%TEMP%\matt-with-paseo-plugin-w1-09-tmp` | [x] |
| 02 | 43c806fd-74e3-4616-bf85-0c357052a1bd | wks_fca96d1df1456acf | matt-with-paseo-plugin/wave1/02-git-guard | 928afdaee3348283c47edc7bda903e176b060775 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-02-tmp` | [x] |
| 16 | e5587842-4a22-4c43-a699-c424f193d6b0 | wks_4ebba102d82240c7 | matt-with-paseo-plugin/wave1/16-one-version-token | 2a1020839f588e4be6719e76fc631b93e4dcda50 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-16-tmp` | [x] |
| 19 | e680ac99-3ad2-4c4a-994a-8419a41f7b10 | wks_31d7a6387eb8705e | matt-with-paseo-plugin/wave1/19-sandbox-capability | d0f351d96f9d66f5d6a0a3a5b6a16450d216bc7e | temp dir `%TEMP%\matt-with-paseo-plugin-w1-19-tmp` | [x] |
| 14 | 274f3b9c-32ed-4830-8151-68a0636e9ec1 | wks_bdb055644f4ce2ef | matt-with-paseo-plugin/wave1/14-role-identity-on-labels | d3f63786eb1eab4d07e8b834d4fb5e1b926c73cf | temp dir `%TEMP%\matt-with-paseo-plugin-w1-14-tmp` | [x] |
| 05 | 94db3bf4-c32d-41d2-8ff0-8875fbddfab3 | wks_d8e9571d37d2452c | matt-with-paseo-plugin/wave1/05-next-line-on-events | a1ebc81286f8ce6df6d55583731ef44ea216c45a | temp dir `%TEMP%\matt-with-paseo-plugin-w1-05-tmp` | [x] |
| 18 | 74c2c829-bfcd-4c09-9983-b6dc60e7d15d | wks_642285c06f7c225f | matt-with-paseo-plugin/wave1/18-plain-words-on-screen | ce5ceafe5297ed7514db4d6fb78dd30f138ce5f0 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-18-tmp` | [x] |
| 11 | 8af0ceee-5f10-43c6-975c-e7516f737b3f | wks_a535664165459085 | matt-with-paseo-plugin/wave1/11-human-words-reach-orchestrator | 7b9ef7bf92725dfbd8124a9fb7ae08d2d9d24d63 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-11-tmp` | [x] |
| 07 | 2a6e83f8-bdc0-4ad3-bd5a-f22c49363e29 | wks_9bd8e9174a938110 | matt-with-paseo-plugin/wave1/07-cheap-sensor | d96e3a2b4955b1b94a0e4e91424be3535adf811d | temp dir `%TEMP%\matt-with-paseo-plugin-w1-07-tmp` | [x] |
| 10 | dc02cd96-b981-4e1a-bdf2-c6f4a9e39912 | wks_4fabd712e24debf3 | matt-with-paseo-plugin/wave1/10-cap-concurrent-gates | 7a6a6cc4e96d961e9305a4b727ca275d5c008b77 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-10-tmp` | [x] |
| 12 | 125ede89-740e-41df-aabd-9efeed49d304 | wks_13d07548515fd793 | matt-with-paseo-plugin/wave1/12-state-outside-the-repo | 9dc1e6e81a5bbdb556c2733864b4d98522602e9e | temp dir `%TEMP%\matt-with-paseo-plugin-w1-12-tmp` | [x] |
| 13 | 1de4c7fd-9db0-4b4a-9cd9-2936096fbbca | wks_5064938460f5e774 | matt-with-paseo-plugin/wave1/13-cost-levels-per-role | c7f6257a69b36d0c8e2c3cab79c33717d5353960 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-13-tmp` | [x] |
| 15 | a719e2c4-0cf9-4a71-91c8-f2c94765b7b0 | wks_5ac256b854374162 | matt-with-paseo-plugin/wave1/15-widen-host-range | 793e938c33d5e78d9a037b55efbac70705db74cf | temp dir `%TEMP%\matt-with-paseo-plugin-w1-15-tmp` | [x] |
| 17 | 41e057c1-ebd8-4975-922b-8bab73e5c523 | wks_2ab5b28f48d7e61b | matt-with-paseo-plugin/wave1/17-ci-on-three-systems | d2dfe9abc987bd66827d850bbcffb7bd00f23414 | temp dir `%TEMP%\matt-with-paseo-plugin-w1-17-tmp` | [x] |

## Review

Deferred to milestone `v0.1.0` (evidence standards, `docs/agents/evidence-standards.md` on `main` at `98d50ea`): no seam review runs in this wave. The items gathered for that run are under "For the stream's end" above.
