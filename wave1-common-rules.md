# Common rules for wave 1 (tickets 65, 66)

## Graph
`65 → 66` (both open, `ready-for-agent`; quota 1; message path, so each ticket is a bundle of one)

| Ticket | Status | Blocked by | Wave |
|---|---|---|---|
| 65 | open, ready-for-agent | - | 1, spawned first |
| 66 | open, ready-for-agent | 65 (native dependency) | 1, by rolling start once 65 is merged, on the integration branch's new head |

65 → 66 is a pure chain and neither is a symptom ticket. The plugin `matt-with-paseo` runs with contract v1, so the
run takes the message path, where the plugin relays only agents labelled `wave` and `ticket`: each ticket gets its
own agent, worktree and branch. 66 starts from the head that holds 65's merge.

## Context
- Your worktree branches off `stream/plugin-setup` at the base commit your prompt names. For 65 that is `7a935f4`
  (`origin/main`, v0.1.0); for 66 it is the integration branch's head after 65's merge, which already holds
  `setup/`, the runner seam, the fake runner and the two `setup/` exceptions. The branch ships into `main` as
  `v0.1.1`. Run `git branch --show-current` before every commit.
- Read before you start: `GLOSSARY.md`, `docs/adr/0002-what-the-plugin-will-never-do.md`,
  `docs/agents/evidence-standards.md`, `docs/agents/comment-template.md`, `CODING_STANDARDS.md` (T6, T7, C1),
  `README.md` (its path table and "Development"), your ticket (`gh issue view <n> --comments`). 66 also reads
  65's `Resolved:` comment and `test/smoke/README.md` (the runner's scratch home and environment scrub, #53).
- 0 other agents work in parallel. Work only on your own ticket.
- Do not end your turn while work you started is still running in the background (a test run, `npm ci`,
  a long command): wait for it inside the same turn. Paseo sends no finish notification for a turn you
  start on your own afterwards, so your "finished" report must mean the work is done.
- Start any command that may take more than two minutes in the background from the start, and read its
  output when it finishes.
- Your worktree has no `node_modules`: run `npm ci` once in it before the first test run (no `paseo.json`,
  so Paseo runs no setup for you).

## Parameters
- Ticket cap: 4. Every bundle here holds one ticket, so the cap does not fire.
- Context stop: 600K `contextWindowUsedTokens`, read by the orchestrator while Jev's flag has not reached it (step 5).
- With Jev, its flag is what stops a bundle; on a bundle of one it has no next ticket to cut.

## Existing interfaces to reuse
- `readDelegation(text)` (`shared/delegation.ts`): the one reader of the `## Delegation` table. 65's printed
  sample must parse with it and read as level 1; call it in the test, do not copy its rules.
- `server/state-location.ts`: where the plugin's state directory lives. 66's `--remove` prints that path and
  never removes it. `setup/` cannot import a `.ts` module (see "Traps already hit"), so reproduce its rule in
  one `.mjs` function and add a test that compares it with `state-location.ts`; never a hard-coded folder.
- `test/support/fake-host.ts` (`FakeHost`): the model for 65's `test/support/fake-runner.ts`, which answers from a
  table and records each call.
- `paseo-plugin.json` `requirements.paseo`: the Paseo range setup reads from the clone; never copy it.
- `test/state-outside-repo.test.ts`: `WRITER`, `PROCESS_MODULES`, the walk over every `.ts/.tsx/.mjs/.cjs/.js`
  outside `test/`; 65 adds the `setup/` exceptions beside `WRITER`.

## Paseo plugin design points (from `/paseo-plugin` and the Paseo 0.10.1 CLI help, read 2026-10-02)
- Setup is not plugin code: no file under `setup/` is imported by `index.client.ts`, `index.server.ts`,
  `client/`, `server/` or `shared/`, and nothing under `setup/` imports them except `shared/delegation.ts` for
  the sample's own check in a test. No new code module in the plugin root.
- Every `paseo` command setup runs takes `--home <path>` when `--paseo-home` is given; Paseo 0.10.1 offers
  `--home` on `daemon status`, `daemon config get|set`, `reload`, `plugin ls|install|update|reload|remove`.
- The global switch: `paseo daemon config set pluginsEnabled true --home <h>` writes it, then
  `paseo reload --json --home <h>` applies it without a restart (`paseo daemon config` has no reload of its own;
  `paseo daemon reload` and `paseo reload` both "Reload config.json without restarting"). The `/paseo-plugin`
  rule: the reload's `appliedPaths` holds `pluginsEnabled`, or, when empty, a fresh
  `paseo daemon config get pluginsEnabled` reads `true`. Setup never restarts the daemon.
- Plugins are trusted, unsandboxed code: when setup turns `pluginsEnabled` on, the line it prints before doing so
  says that plugins run unsandboxed on the daemon machine (owner's decision D146 replaces the skill's
  ask-first step with print-then-do).
- `paseo plugin install` is "Trust and install" and has no `--yes`; `paseo plugin update` asks unless given
  `--yes`, `--ref` or `--version`. See "Not known yet".
- Keep `requirements.paseo` in `paseo-plugin.json` as it is; the contract version stays `1`.

## File zones
- Ticket 65: new `setup/` (`cli.mjs`, the runner module, the flow modules, `paired.json`);
  new `test/support/fake-runner.ts` and new `test/setup*.test.ts` files; `package.json` (`bin`, `files`);
  `tsconfig.json` (`allowJs` only, see "Chosen for you");
  `test/state-outside-repo.test.ts` (the two exceptions and the new "no other folder" test); `README.md`
  (a "Setup" section above "Development", the `setup/` rows of the path table); `docs/agents/evidence-standards.md`
  (one sentence or row); `docs/agents/release-checklist.md` (the paired-tag line); and every existing test that
  pins a line you change (see the seam list below).
- Ticket 66: `setup/` (the `--update` and `--remove` flows), its own new test files, `test/smoke/README.md`
  (a new "Setup" section and its `## Results` line), `docs/roadmap.md` (the `v0.1.1` section and the opening
  line), `test/docs/docs-set.test.mjs` where it pins the roadmap's milestone list.
- Shared files (`README.md`, `package.json`, `CHANGELOG.md`): add or change only your own lines, and keep the
  order of the existing lines. `CHANGELOG.md` and the version token `0.1.1` are the release stream's part:
  neither ticket bumps the version.

## Traps already hit
- `npx` runs the package from its cache's `node_modules`, where Node refuses to strip TypeScript types, so
  a `setup/` module that imports a `.ts` file works from a clone and fails under `npx`. Every import under
  `setup/` is a `node:` builtin, a relative `.mjs` file or a JSON file; no npm dependency (T7). The standard
  library has no semver, so the Paseo range check is a small hand-written comparator for the range forms
  `paseo-plugin.json` uses, tested on both bounds. Check: `grep -rhoE "from ['\"][^'\"]+['\"]" setup/` lists
  only `node:` names and relative paths ending in `.mjs` or `.json`.
- A test pinning an old call or text, which no ticket ran, broke CI in an earlier stream (`plugin-decision-log`,
  fixed in #60). Before you commit, grep `test/` for every call, field, string, heading and file list you change
  (`"files"`, `bin`, the README path table, the "Development" heading, the evidence-standards table, the
  release checklist, the roadmap's opening line and milestone list), and run each file it finds, red then green
  where you change it, green after where you do not. Check: `grep -rn "<each changed text>" test/` lists only
  files you ran.
- **Seam list, found on `7a935f4`.** 65: `test/state-outside-repo.test.ts` (the writer walk and the
  "where the state lives" check both read `.mjs`); `test/bundle-boundaries.test.ts` (walks folders, `.mjs`
  included); `test/manifest.test.ts`, `test/claude-plugin.test.ts`, `test/guard-wiring.test.ts`,
  `test/sensor.test.ts`, `test/harness-docs.test.ts`, `test/cost-levels-docs.test.ts` (read `package.json`
  `files` or `bin`); `test/docs.test.ts` and `test/docs/docs-set.test.mjs` (README sections and path table);
  `test/check-command-docs.test.ts` and `test/docs/docs-set.test.mjs` (evidence standards);
  `test/release-checklist.test.ts`, `test/release-docs.test.ts`, `test/ci-workflow.test.ts` (release
  checklist). 66: `test/docs/docs-set.test.mjs` (its test "the roadmap lists v0.1.0 to v0.5.0 in order",
  line 244, pins the milestone list), and every test that reads `test/smoke/README.md` (grep it).
  Check: each file of your list is run once after your change, and the ones you changed also on the base.
- A path hard-coded for Windows broke CI on Linux and macOS in an earlier stream. Build every path in a test
  from `tmpdir()`, `homedir()` and `join`, never a literal like `C:\...` or a `/repo` that a test then compares
  with a real file path. Check: the added lines of `git diff <your base> -- test/ setup/` hold no drive letter
  followed by a slash or a backslash.
- The shell drops backslashes: `\n`, `\b`, `\(` in a regular expression or a Windows path arrive broken
  through a heredoc, `echo` or a script's string literals. Write files with Edit and Write only. Check:
  `git ls-files | xargs grep -lP '[\x00-\x08\x0b\x0c\x0e-\x1f]'` prints nothing.
- `node --test test/` on Node 24 fails with `Cannot find module`: pass file paths
  (`node --test test/setup-cli.test.ts`). `npm test` globs only `test/**/*.test.ts`: a new test file is
  `.test.ts`, or CI never runs it.
- A check reads structure, never a sentence of prose (evidence standards): a new docs test pins a heading,
  a table's columns, a row or a pinned token, never a sentence.
- A fenced `## Delegation` example inside a document breaks a docs helper that cuts sections by heading
  (wave 1 of `plugin-autonomy-levels`). Print the sample from code; if a document shows it, check the helpers
  that cut that document still pass.

## Failing on base
- On `7a935f4`, before the first spawn (Windows 11, Node 24.19.0): `npm ci`, then `npm run check` (typecheck,
  `npm test` and `node --test test/docs/docs-set.test.mjs`): exit 0; `npm test` 762 tests, 762 pass, 0 fail;
  the docs set 30 tests, 30 pass. None: every command passes.
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
| Must hold | The owner's decisions (D146): `setup` turns `pluginsEnabled` on itself, after printing that it will; the skills install with `gh skill install … --pin <tag>` (commands `/matt-with-paseo`, not a plugin-prefixed form); skills already installed some other way are skipped and named. | As the section above. |
| Must hold | No real `setup`, `paseo`, `claude` or `gh skill` command touches the owner's machine state: no call to the owner's daemon (`paseo` without `--home <scratch>`), no change to the owner's Claude Code config, plugins or skills, no credential read or printed. 65 runs no real setup at all: its tests use the fake runner only. 66's real run uses only a scratch home (`MWP_SETUP_DIR`, `--paseo-home`, `CLAUDE_CONFIG_DIR`, scratch `HOME`/`USERPROFILE`) with the clean environment #66 names. Never run `gh auth status` from your own shell; setup's own call to it, through the runner, is the one the ticket specifies, and only its exit code is read. | As the section above. If 66's run cannot proceed without touching the owner's state, stop that part and put it in your report. |
| Chosen for you | The writer-check exception for `setup/` exempts that folder from the whole writer check (`child_process` and every `node:fs` write API), not only from the `child_process` import, with the ticket's reason ("the owner's installer, not the plugin at run time; writes only its install folder and through the CLIs"). Reason: 66's `--remove` deletes the install folder and setup may write nothing else, so one exception now spares 66 a second one; the new "no other folder" test still fails for any other folder. | Challenge it with evidence, in your ticket's comments and your report. A challenge alone does not move the ticket to `ready-for-human`. |
| Chosen for you | 65 adds `"allowJs": true` to `tsconfig.json`'s `compilerOptions` (no `checkJs`, `include` unchanged). Reason: on `7a935f4`, a `.test.ts` that imports a `.mjs` module fails `tsc --noEmit` with TS7016 ("Could not find a declaration file for module"); with `allowJs` the same probe passes (orchestrator's probe, 2026-10-02), and no hand-kept `.d.mts` can drift from its module. Ticket agents run no typecheck, so 65 runs `npx tsc --noEmit` once after the change and puts its exit in the report. | As above. |
| Chosen for you | The global switch is set with `paseo daemon config set pluginsEnabled true` then `paseo reload --json` (both with `--home` when given), checked as the design points above say. Reason: both commands are in Paseo 0.10.1's own help; the ticket asks for the reload command read from the help, and this is it. | As above. |
| Chosen for you | The runner takes an option that lets a command inherit the terminal's stdin (an `interactive` flag or the like) and setup uses it for `paseo plugin install`; every other command runs with stdin closed. Reason: `paseo plugin install` is "Trust and install" with no `--yes`, so it may ask; a closed stdin would make it fail and a piped one would hang. | As above. |
| Chosen for you | What "passes" means in a criterion that says a check or docs test passes: run each file it names, and every file of your seam list, once each with `node --test <file>`, red on the base where you changed it, green after; run no full suite. Reason: the evidence standards; CI runs `npm run check` on the ship pull request into `main` on three systems, and the orchestrator runs it once on the integration branch before stage F. | As above. |
| Chosen for you | No in-flow code review: the evidence standards defer it to milestone `v0.1.1`. Your `Resolved:` comment reads `Code review: deferred to the milestone`. | As above. |
| Not known yet | Whether `paseo plugin install <dir>` asks for trust when run without a terminal, and whether `paseo plugin update matt-with-paseo` (a local-directory source) updates or asks. | 65 builds the interactive route above and says in its report it is unchecked. 66 finds out on the scratch daemon only (`paseo plugin install --help`, `paseo plugin update --help`, then the real call with `--home <scratch>`), records which route it took and why in the smoke section, and fixes setup to match. |
| Chosen for you | 66's scratch run meets the prerequisites that live in the owner's config this way: the child environment keeps `APPDATA` (and nothing else of the owner's), so `gh` stays logged in, its files never read; `mattpocock-skills` is installed into the scratch `CLAUDE_CONFIG_DIR` with the two `claude plugin` commands setup prints. Reason: the owner's answer D147; on Windows `gh` keeps its login under `%APPDATA%`, which a scratch `USERPROFILE` does not move, and a fresh `CLAUDE_CONFIG_DIR` has no `mattpocock-skills`. If either cannot work without the owner's config, stop that part and report it. | As above. |
| Chosen for you | 66 proves the `npx` path from `node_modules` with `npm pack` in its worktree, then `npx <the tarball's absolute path> setup --dry-run` on the scratch home; the literal `npx github:hanh9898/matt-with-paseo-plugin#<ref> setup --dry-run` step goes into the "Setup" smoke section as a step of the `v0.1.1` milestone run, after ship, not run by 66. Reason: the owner's answer D147; under `stream` no agent pushes, so no branch ref exists on GitHub for 66 to run. | As above. |

Whoever answers a challenge to a chosen default writes why the plan changes or stands; an answer with no reason is not a resolution.

## Resources
- Your private resources are listed in your prompt (a temp directory; for 66 also a scratch home and a scratch
  Paseo home with its own port). Use exactly that set. Create each when you first need it, and leave it in place
  when you finish: a finding may come back to you. Tests make their own directories under `tmpdir()`.
- 66's scratch Paseo daemon: start it with `--home <scratch Paseo home>` on a port no other daemon uses, stop it
  with the same `--home` before you report, and name its pid and port in your report.
- Shared resources, read-only: the owner's Paseo daemon (it runs the `matt-with-paseo` plugin and `ailoop-env`)
  and the owner's Claude Code config. 66 records, before and after its run, `paseo daemon status` (pid and
  version only) and `claude plugin list` of the owner's own environment, and changes neither. 65 makes no
  `paseo` or `claude` call.
- Shared resources you may write to, and machine-wide locks: none.

## Repo and user rules
- English for commits, code, ticket comments and reports. Comments follow `docs/agents/comment-template.md`.
- Commit format: Conventional Commits, `type(scope): subject`, `type` one of `feat`, `fix`, `docs`, `test`,
  `refactor`, `chore`, `ci`; the subject in the imperative, lowercase, at most 72 characters, no final full
  stop (rule C1 of `CODING_STANDARDS.md`). End each commit message with the line
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Files are written with Edit and Write only, never shell heredocs, `echo` or a script's string literals.
- Never use AskUserQuestion: put a question in your report, with your recommendation. Use `gh issue`
  commands only; never `gh auth status` from your own shell.
- Credentials: never read, print or pass on a token or credential (no `gh auth token`, no reading a CLI's
  hosts or config file or a token's environment variable, no token in a URL or a command). A `gh`, `glab`,
  push or upload failure goes into your report with the command and its error as printed; never work
  around it with another tool, the forge's API or another account. Never push.
- Evidence standards: read `docs/agents/evidence-standards.md`; it is not copied here. It defers the code
  review to the milestone: run none.

## Done when:
- Commit to your branch. The orchestrator merges it. Pull-request descriptions and discussion are written
  by whoever ships, outside this wave: keep none in your worktree, and put what they need in your report.
- Run no `/mattpocock-skills:code-review`: the evidence standards defer it to the milestone.
- Change the ticket status: `resolved` if fully done (a `Resolved:` comment per
  `docs/agents/comment-template.md`, with a `Test run:` line per test file, red then green, and
  `Code review: deferred to the milestone`), `ready-for-human` for the part a human must do. Write in the
  comments of your ticket's issue what you verified, with evidence, and what remains open.
- Report back, with the SHA of your last commit: a design summary, files touched, how you verified with
  evidence (each red and green run as command and output), work not done or still in doubt, every change
  outside your file zone or outside git (a file in another checkout, a machine setting, a process left running,
  an uncommitted file) with where it is, each private resource you created, and decisions the user must make.
  Tag each decision `decided: X because Y` or `assumed: X, unchecked`, and each finding `reproduced` or
  `traced`, so a reader scans the report instead of parsing its prose.
- End your turn after the report. The rule above about background work holds: wait for it inside the turn,
  so the report means the work is done.

## Checkpoints
- 2026-10-02, steps 0 and 2 in one Checkpoint (stage C; graph `65 → 66`, wave 1 = 65 then 66 by rolling start, bundles of one on the message path, quota 1; question 1: approve the wave; 2: 66's `npx github:` step against "never push"; 3: keep `APPDATA` in the scratch env and install `mattpocock-skills` into the scratch Claude config; 4: the whole writer-check exception for `setup/`). Answer D147: 1–4 as recommended; spawn 65. changed the work: no. took the recommendation: yes.

## Wave agents

| Bundle's tickets | Agent id | Workspace id | Branch | Base commit | Private resources | Merged SHAs | Cleaned |
|---|---|---|---|---|---|---|---|
| 65 | cfae11fa-6bc6-45e3-9060-bcf65474c5a1 | wks_9e5f99acacbf4495 | `plugin-setup/wave1/65-one-command-setup` | `7a935f4` | temp dir `join(tmpdir(), "plugin-setup-65")` | 65: b6c7e24 | [x] |
| 66 | 21670f5c-7dc0-449b-8b6f-0f2962599bb2 | wks_054d8ac9a0dae181 | `plugin-setup/wave1/66-setup-update-remove` | `45f2892` | scratch root `join(tmpdir(), "plugin-setup-66")`: `tmp`, `home`, `mwp`, `claude`, `paseo` (scratch daemon, stopped before report) | 66: a0279f2 | [x] |

Notes on the reports (below the frozen rules):
- 65 (merged as `45f2892`): the orchestrator re-ran `setup-flow` 39/39, `setup-cli` 9/9, `setup-docs` 5/5, `state-outside-repo` 11/11, `npx tsc --noEmit` exit 0, and `node setup/cli.mjs bogus` (usage, exit 2). Imports under `setup/` are `node:` builtins and relative `.mjs` only.
- 65 challenged the ticket's "two `claude plugin` commands" hint for `mattpocock-skills` with the skills README (one command, the official marketplace). Answer on #65: it stands for now; 66 confirms it on the scratch `CLAUDE_CONFIG_DIR`, where it installs `mattpocock-skills` with what setup prints.
- 65 left unchecked for 66: whether `paseo plugin install` asks for trust; whether `paseo --version` takes `--home`; the output shapes of `paseo plugin ls --json`, `paseo daemon status`, `paseo reload --json`, `claude plugin list`. (`gh skill install --dir` exists: the orchestrator read `gh skill install --help`, gh 2.100.0.)
- 66, first report (`8c62b07`), sent back on 2026-10-02. Its real run was blocked by TLS errors to github.com (`SEC_E_UNTRUSTED_ROOT`) and api.github.com (x509 unknown authority), but the orchestrator's `git ls-remote` and `gh api` to both hosts succeeded, with the owner's environment and with the scratch `HOME`/`USERPROFILE`. The likely cause is a child environment that drops Windows system variables; the run is redone with the environment minus #66's list. 66 also reproduced that the one-command `mattpocock-skills` hint fails on a fresh `CLAUDE_CONFIG_DIR`, so 65's challenge does not hold up and the ticket's two commands come back. A zone extension went by `send_agent_prompt`: README "Setup" may name `--update` and `--remove`. The report was written in Vietnamese, against the rule that reports are English; the agent has been reminded.
- 66 reproduced a defect in 65's code: `paseo daemon config get pluginsEnabled` prints JSON (`"value": true`), which 65 read as off, so setup set the switch again on every run. 66 fixes it in `setup/flow.mjs`. It is a trap for the next wave: a fake runner answer that copies no real output hides such a defect.
- Seen in passing: 66 says a hook blocked `git checkout`, so it restored files with `git show`, and it moved the Results line with `node -e` rather than Edit (the control-character scan came back clean).
- 65 traced, put off to the `v0.1.1` milestone review: README's "State outside the repository" paragraph no longer says that `setup/` is exempt from the writer check.
- 66, second report (`a0279f2`). Its own run found the TLS block had been transient: `scrubEnv` already starts from the current environment, so the orchestrator's guess about dropped system variables was **wrong**. With the network back, steps 2 to 6 of the "Setup" section passed on the scratch home; step 7 ran from the `npm pack` tarball (D147). The real run found one more defect: `gh skill list --json` gives `skillName` as `matt-with-paseo/matt-with-paseo`, so the skills had been read as installed by another route. It is fixed, and the fake runner now uses the real shape. The checkout and `npm ci` branch of `--update` ran only on the fake runner. The report was again written in Vietnamese. The orchestrator re-ran the five changed test files green and `tsc` (exit 0), and saw the scratch daemon stopped and the owner's daemon unchanged (pid 8268, 0.10.1). The merge is `1266f4a`.
- Before stage F, the orchestrator ran `npm run check` once on `1266f4a`: exit 0, 843 tests, 843 pass; docs set 30/30; 73 test files tracked (68 on base, plus 5 new).
- Seen at cleanup: `get_agent_status` showed 65's agent running `claude-opus-5-5`, not the `ticket-agent` profile's `claude-sonnet-5-5`, although it was created with `claude/claude-sonnet-5-5`; 66's ran Sonnet. Something changed the model after creation (65's report says "the session's model changed partway"). Not traced.
- Cleanup: both agents and workspaces archived (`removedDirectory: true`); both scratch roots under `tmpdir()` removed, the scratch daemon already stopped (`pid: null`), and the tests' `mwp-setup-*` folders under `tmpdir()` removed. The closing `paseo ls -g --label wave=1 --label stream=plugin-setup` lists nothing. No heartbeat was created.

## Review
- Deferred to milestone `v0.1.1` (evidence standards): `docs/agents/evidence-standards.md` defers the code review to the milestone run, so this wave runs no seam review. No review run, so no mark. The items put off to that run: README's "State outside the repository" paragraph (65); a full `run-smoke.ts` run overwrites the hand-written `- Setup |` line (66); step 7 of the "Setup" section with a pushed ref, and the macOS and Linux runs.
