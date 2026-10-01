# Common rules for wave 1 (tickets 51, 52, 53)

## Graph
`51 → 52 → 53` (all open, `ready-for-agent`; 52 and 53 join by rolling start, quota 1)

| Ticket | Status | Blocked by | Wave |
|---|---|---|---|
| 51 | open, ready-for-agent | - | 1 (first spawn) |
| 52 | open, ready-for-agent | 51 | 1, by rolling start once 51 is merged |
| 53 | open, ready-for-agent | 52 | 1, by rolling start once 52 is merged |

Every ticket is a bundle of one: 51 and 52 are symptom tickets (label `bug`), and a symptom ticket cuts a chain.

## Context
- Your worktree branches off `stream/plugin-real-host` at the commit that adds this file (its parent is `7c67ca9`; your prompt names the SHA), unless your prompt names another base commit
  (52 and 53 start mid-wave, on the integration branch's head after the ticket before them merged).
  `stream/plugin-real-host` was cut from `release/v0.1.0`, not `main`, and ships back into `release/v0.1.0`:
  it already carries the milestone's fix pass, `test/smoke/conditions.json`, the "Daemon batches" section of
  `test/smoke/README.md`, and the new `docs/agents/evidence-standards.md`.
  Run `git branch --show-current` before every commit.
- Read before you start: `GLOSSARY.md`, `docs/adr/`, `docs/agents/evidence-standards.md`,
  `docs/agents/comment-template.md`, `CODING_STANDARDS.md`, your ticket (`gh issue view <n> --comments`),
  `D:\matt-with-paseo-streams\research\v0.1.0-smoke-findings.md`, and the comments of the tickets before yours
  in the graph for decisions already made. Ticket 53 also reads `D:\matt-with-paseo-streams\research\ai-written-tests.md`
  sections 2 and 4.
- 0 other agents (bundles) work in parallel: the chain runs one ticket agent at a time. Work only on your own ticket.
- Do not end your turn while work you started is still running in the background (a build, a test run,
  a scratch daemon you are waiting on, a long command): wait for it inside the same turn. Paseo sends no finish
  notification for a turn you start on your own afterwards, so your "finished" report must mean the work is done.
- Start any command that may take more than two minutes (a test run, `npm ci`, a scratch daemon, an install)
  in the background from the start, and read its output when it finishes. A foreground command the shell moves
  to the background halfway can leave your turn waiting on a result that never returns.
- Your worktree has no `node_modules`: run `npm ci` once in it before the first test run (no `paseo.json`, so
  Paseo runs no setup for you).

## Parameters
- Ticket cap: 4, the most tickets step 2 plans into a bundle. While Jev is not available it is also the fallback stop: once a ticket agent has worked this many tickets, the orchestrator answers `stop` (step 5).
- Context stop: 600K `contextWindowUsedTokens`, the size of a ticket agent's context at which the orchestrator answers `stop`, while Jev is not available (step 5).
- With Jev, its flag is what stops a bundle (step 5); the ticket cap still bounds the bundle's size.
- Every bundle of this wave is one ticket, so neither stop is expected to fire.

## Existing interfaces to reuse
- `server/state.ts` is the only runtime importer of the state location (ticket 51 moves `shared/state-location.ts` to `server/state-location.ts`).
- `loadConditions(file)` (`server/sensor.ts`), `loadCostLevels(file)` (`server/cost-levels.ts`), `loadHarnesses(dir)` (`server/harness.ts`): the tests pass their own data through these; ticket 52 keeps a way to do that.
- `test/bundle-boundaries.test.ts` (added by 51) is where 52's `import.meta.url` structure check goes, unless 52 says why a new file is better.
- Business rules go through the interfaces above; new layers only call them.

## Paseo plugin design points (from `/paseo-plugin` and the reference at paseo.sh, read 2026-09-30)
- `shared/` compiles into both bundles and imports only shared code: no `node:` module, nothing from `server/` or `client/`, no React and no runtime-specific SDK entry or type. A client import of `server/`, a server import of `client/`, and any `node:` import reachable from client code are compile errors on the daemon's build.
- No code module in the plugin root besides `index.client.ts` and `index.server.ts`; a relative import to another code file in the root is a compile error.
- The daemon builds the plugin at install and reload. The reference does not document how `import.meta.url`, `__dirname`, the subprocess `cwd` or JSON imports behave in the built server bundle, and `PluginServerContext` (SDK `0.10.1`) has no plugin-directory field: prove on the scratch daemon whichever you rely on.
- `console.log` / `console.error` from server code land in `paseo plugin logs <id> --home <scratch>` and in the scratch home's `daemon.log`. Never log a credential.
- Apply a source change with `paseo plugin reload mwp-smoke --home <scratch>` (source edits) or a fresh install from a new copy; never restart a daemon to load source.
- `paseo plugin remove` keeps a local source directory; install from a scratch copy (`git archive HEAD` into your temp directory), never from your worktree.
- Keep `requirements.paseo` in `paseo-plugin.json` as it is (`>=0.10.1 <0.11.0`) unless your ticket needs a newer API.
- Plugins need `pluginsEnabled: true` in the target home's `config.json`; set it only in the scratch home, never in `~/.paseo`.

## The scratch daemon (tickets 51, 52, 53)
The owner's consent (orchestrator decisions D110, D111, and the stream's rules): a separate Paseo daemon on a scratch home and its own port, the plugin installed there as `mwp-smoke`, stopped and its home deleted at the end, once per ticket. It never covers the owner's daemon (pid 16736, port 6767, home `~/.paseo`), its sessions, its config or its plugins.
- Scratch home: a fresh folder inside your private temp directory. Port: the one in your prompt.
- Start it from a small Node script (written with Write, kept in your temp directory, not committed unless your ticket ships it) that builds the child environment as a copy of `process.env` with every key starting `PASEO_` deleted, and every key whose name contains `API_KEY`, `TOKEN` or `SECRET` deleted, and passes it to `spawn`. Never `env -u` (Windows). Print at most the names removed, never a value; never read a value.
- Use that same scrubbed environment for every `paseo` CLI call against the scratch daemon, and put `--home <scratch>` (or `--host 127.0.0.1:<port>`) on every call. A `paseo` call without it goes to the owner's daemon: never make one, except `paseo daemon status` and `paseo --version`, read-only, before and after, to show the owner's daemon unchanged (same pid, same version).
- Run the daemon in the background; stop it with `--home <scratch>` and delete the scratch home at the end, also after a failure. Record in your `Resolved:` comment: Paseo daemon and CLI version, OS, Node version, the commands and their output.
- If a scratch agent needs a provider login, stop that part, never read or copy a credential, and list it in your report as a human step (`blocked: provider login`).

## File zones
- Ticket 51: `shared/state-location.ts` → `server/state-location.ts`, `server/state.ts`, `test/state-docs.test.ts`, `test/state-outside-repo.test.ts`, new `test/bundle-boundaries.test.ts`, the lines of `README.md` and `CHANGELOG.md` that name the path.
- Ticket 52: `server/sensor.ts`, `server/cost-levels.ts`, `server/harness.ts`, `server/hooks/stall-sensor.ts` and any other caller of the three constants, their test files (at least `test/cost-levels.test.ts`), `test/bundle-boundaries.test.ts` (add your own test cases only), the smoke copy paragraph of `test/smoke/README.md`, and new data modules if you embed.
- Ticket 53: new files under `test/smoke/` (the runner, its decision module, that module's `*.test.ts`), `test/smoke/README.md` (the command at its top, `## Results`).
- Shared files (`README.md`, `CHANGELOG.md`, `test/smoke/README.md`, `test/bundle-boundaries.test.ts`): add only your own lines, and keep the order of the existing lines.

## Traps already hit
- Unit tests on `FakeHost` import modules from disk, where `node:` imports and `import.meta.url` work, so 647 of them caught neither real-host failure: only a scratch daemon install proves the plugin loads. Check: `paseo plugin ls --home <scratch>` shows `mwp-smoke` and its status.
- An agent's environment carries `PASEO_HOME`, `PASEO_AGENT_ID`, `PASEO_AGENT_CWD`, `PASEO_CLI` and a hub API key; a daemon started from it inherits them, and its agents could call the owner's daemon. Check: your spawn script deletes those keys, and it prints only key names.
- The shell drops backslashes: `\n`, `\b`, `\(` in a regular expression or a Windows path arrive broken through a heredoc, `echo` or a script's string literals. Write files with Edit and Write only. Check: `git ls-files | xargs grep -lP '[\x00-\x08\x0b\x0c\x0e-\x1f]'` prints nothing.
- `node --test test/` on Node 24 fails with `Cannot find module`: pass file paths (`node --test test/bundle-boundaries.test.ts`).
- The daemon build error names the file (`node:os imported by ...\shared\state-location.ts`) but the load error "Invalid URL" carries no stack trace: log from the server entry to find what throws.

## Failing on base
- On `7c67ca9`, before the first spawn (Windows 11, Node 24.19.0): `npm ci`, `npx tsc --noEmit`, `npm test` (647 tests, 647 pass, 0 fail) and `node --test test/docs/docs-set.test.mjs` (25 pass, 0 fail): none: every command passes. The plugin does not load on a real Paseo `0.10.1` daemon (the findings file): that is tickets 51 and 52, not a unit test.
- A failure listed here is not yours: leave it as it is unless your ticket's acceptance criteria name it, and
  name it in your report as failing on base. A failure not listed here is yours to explain.
- Your ticket runs only its own new or changed test files (evidence standards); a failure there on the base is the red you record.

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
| Chosen for you | Base: 51's and 53's text says the stream's base is `main`; it is `release/v0.1.0` at `7c67ca9`. Ticket 53 may use `test/smoke/conditions.json` and the "Daemon batches" section, since the stream ships back into `release/v0.1.0`, where they live; it still makes its own smoke copy the way 52 leaves in place. | Challenge it with evidence, in your ticket's comments and your report. A challenge alone does not move the ticket to `ready-for-human`. |
| Chosen for you | Scratch ports: 51 uses `127.0.0.1:6791`, 52 `6792`, 53 `6793` (53's runner may pick a free port itself, never 6767): distinct from the owner's 6767 and the milestone run's 6790. | as above |
| Chosen for you | Ticket 52's reproduction on its base is ticket 51's post-fix install output ("Invalid URL"), since 51's merge leaves the tree of its tip; 52 still confirms the cause itself (its first criterion). | as above |
| Chosen for you | Environment scrub: delete every `PASEO_*` key and every key whose name contains `API_KEY`, `TOKEN` or `SECRET`, because the hub API key's variable name is not written anywhere a script may read, and a wider net never passes a credential on. | as above |
| Chosen for you | No in-flow code review and no suite: the evidence standards defer review to the milestone; each ticket runs only its own new or changed test files, red on its base then green. `Code review: deferred to the milestone` in your `Resolved:` comment. | as above |
| Not known yet | Whether `import.meta.url` is a file URL in the daemon's server bundle, and what the subprocess `cwd` is (52). | 52 logs both from the server entry on the scratch daemon and records them. |
| Not known yet | Whether `MWP_*` reaches plugin code through `daemon start` or only `daemon run`; whether a script can create labelled agents on the scratch daemon, and how an orchestrator there becomes their parent (53). | 53 settles each with a probe on the scratch daemon and writes the answer; one it cannot settle is marked `blocked: <reason>`. |

Whoever answers a challenge to a chosen default writes why the plan changes or stands; an answer with no reason is not a resolution.

## Resources
- Your private resources are listed in your prompt (temp directory, scratch home inside it, port).
  Use exactly that set. Create each one when you first need it. The scratch daemon is the exception: stop it and delete
  its home before you report, as the criteria say; keep the rest of the temp directory until the orchestrator removes it.
- Shared resources, read-only: the owner's daemon (`paseo daemon status`, `paseo --version` only), `D:\matt-with-paseo-streams\research\`.
- Shared resources you may write to, and machine-wide locks: none.

## Repo and user rules
- English for commits, code, ticket comments and reports. Comments follow `docs/agents/comment-template.md`.
- Commit format: Conventional Commits, `type(scope): subject`, `type` one of `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`; the subject in the imperative, lowercase, at most 72 characters, no final full stop (rule C1 of `CODING_STANDARDS.md`). End each commit message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Files are written with Edit and Write only, never shell heredocs, `echo` or a script's string literals.
- Never use AskUserQuestion: put a question in your report, with your recommendation. Use `gh issue` commands only; never `gh auth status`.
- Credentials: never read, print or pass on a token or credential (no `gh auth token`, no reading a CLI's hosts or config file or a token's environment variable, no token in a URL or a command). A `gh`, `glab`,
  push or upload failure goes into your report with the command and its error as printed; never work
  around it with another tool, the forge's API or another account. Never push.
- Evidence standards: read `docs/agents/evidence-standards.md`; it is not copied here. It defers the code review to the milestone: run none.

## Done when:
Each item below holds for your ticket.
- Commit to your branch. The orchestrator merges it. Pull-request descriptions and discussion are written
  by whoever ships, outside this wave: keep none in your worktree, and put what they need in your report.
- Run no `/mattpocock-skills:code-review`: the evidence standards defer it to the milestone.
- Change the ticket status: `resolved` if fully done (a `Resolved:` comment per `docs/agents/comment-template.md`, with `Test run:` and `Code review: deferred to the milestone`), `ready-for-human` for the part a human must do.
  Write in the comments of your ticket what you verified, with evidence, and what remains open.
- For a change the user sees, the screenshots include the screen scrolled past its first view and at a
  narrow width.
- The scratch daemon is stopped, its home deleted, and `paseo daemon status` of the owner's daemon shows the same pid and version as before you started.
- Report back with the SHA of your last commit: a design summary, files touched, how you verified with evidence (each red and green run as command and output), work not done or still
  in doubt, every change outside your file zone or outside git (a file in another checkout, a machine
  setting, an uncommitted file) with where it is, each private resource you created, and decisions the
  user must make. Tag each decision `decided: X because Y` or `assumed: X, unchecked`, and each finding
  `reproduced` or `traced`, so a reader scans the report instead of parsing its prose.
- End your turn after your report. The rule above about background work holds: wait for it inside the turn, so the report means the work is done.

## Checkpoints
- 2026-09-30, steps 0 and 2 in one Checkpoint (stage C, graph `51 → 52 → 53`, wave 1 = 51 with 52 and 53 by rolling start, quota 1; questions 1 to 4: scratch daemon for 51, 51's reproduction from the findings run plus its agent's red, the base discrepancy chosen for 53, 52's reproduction from 51's post-fix install). Answer D114: agreed, 1 to 4 as recommended; commit the common rules and spawn 51. changed the work: no. took the recommendation: yes.
- The owner asked to commit this file before the first spawn, against step 8's rule that it stays uncommitted until the wave ends; the rules part is frozen, and every prompt names this checkout's absolute path, so a worktree's copy is never the one to read.

## Incidents
- 2026-09-30, ticket 51's agent ran `paseo daemon config` without `--home` once and read the structure of the owner's `~/.paseo/config.json` (string values masked, by its own report; nothing printed or copied). Sent to 52 and 53 as a trap in their prompts (the rules are frozen); the next wave's rules carry it.
- 2026-09-30 about 20:30 to 2026-10-01 morning: the machine was overloaded; 53's `git commit` hung and its agent went idle with no commit and no report (D122). No scratch daemon was left running (port 6793 free, no process on its home).
- 2026-10-01T04:42Z: the owner's daemon was restarted outside this wave (pid 16736 → 18276, worker 17208, port 6767, `0.10.1`); 53's agent was last active 2026-09-30 23:21 local. 53 was told the new pid as its "before" value.

## Pending `gh` steps
`gh` fails on this network since 2026-10-01 (FortiGate TLS inspection, D122). Each step below runs once `gh` works again, in order:
- [ ] #53: post the agent's `Resolved:` comment, its full text under "Text of 53's `Resolved:` comment" at the end of this file (copy it to a file, then `gh issue comment 53 --body-file <that file>`). Its temp-folder copy is deleted with 53's private resources.
- [ ] #53: post the orchestrator's merge comment: "Merged into `stream/plugin-real-host` at `a1b1361` (ticket tip `4536754`; merge tree equals the tip). Conflict-marker search: empty. Report checked by the orchestrator: `node --test test/smoke/smoke-plan.test.ts` re-run on `4536754`: tests 16, pass 16, fail 0; worktree clean; no control characters in tracked files; `## Results` committed (13 pass, 2 human, 1 fail: Cheap sensor)."
- [ ] New ticket, once the owner agrees: the stall sensor never flags a running agent on Paseo 0.10.1 (`lastActivityAt` absent from the agent snapshot; fall back to `updatedAt` in `server/paseo-host.ts`), from 53's finding and the Cheap sensor `fail` line under `## Results`.
- [ ] #51, #52, #53: close each issue as the stream's ship step decides (`gh issue close <n>`); their `Resolved:` comments for 51 and 52, and the merge comments for 51 and 52, are already posted.

## Wave agents

| Bundle tickets | Agent id | Workspace id | Branch | Base commit | Private resources | Merged SHAs | Cleaned |
|---|---|---|---|---|---|---|---|
| 51 | 332f4ef5-43ca-40a6-bef3-b7111e32ca1f | wks_e02a1f1feea51665 | plugin-real-host/wave1/51-state-location-to-server | 3a3de919bb5f62149206ab45ac3e3d2f2d73a94f | temp dir C:\Users\HBLAB_OPMS\AppData\Local\Temp\plugin-real-host-51 (scratch home inside), port 6791 | 51: 2a77ca4 (merge 0113175) | [x] |
| 52 | 47363d91-d267-49c1-bf95-01c03ce48ace | wks_6830e858f6015e31 | plugin-real-host/wave1/52-no-import-meta-url | 0113175477d4161c12e3314bacb0a44d9eafcfc5 | temp dir C:\Users\HBLAB_OPMS\AppData\Local\Temp\plugin-real-host-52 (scratch home inside), port 6792 | 52: 7100bcd (merge cde4a73) | [x] |
| 53 | e0212f3c-016d-45ea-a5b5-2887bc32f812 | wks_7e459b1d10a95faa | plugin-real-host/wave1/53-scripted-smoke-runner | cde4a738a69fc6d525b30db6ebe27ed462368995 | temp dir C:\Users\HBLAB_OPMS\AppData\Local\Temp\plugin-real-host-53 (scratch homes, copies, state dir, scratch repo, scratch CLAUDE_CONFIG_DIR inside), port 6793 | 53: 4536754 (merge a1b1361) | [x] |

Heartbeat `e295a7f5` (every 15 min, expires 2026-10-01T12:15Z) watched 53 since its resume; deleted in step 8.

## Review
Deferred to milestone `v0.1.0` (evidence standards). Not a review run: no mark. Points for the milestone review: the three data files now live twice (`sensor/`, `presets/`, `harness/` and their embedded copies in `server/data/`, kept equal by tests only; 52's report); 53's agent edited `test/smoke/run-smoke.ts` once with `sed -i` against the Edit/Write rule (no backslash in the expression; the control-character check over tracked files printed nothing); the smoke runner spends real model quota through the machine's own Claude Code login (about 0.014 USD a turn, about a hundred turns a run).

## Text of 53's `Resolved:` comment
Copied verbatim from the agent's `resolved-53.md` on 2026-10-01, to post once `gh` works (see `## Pending gh steps`).

````markdown
Resolved: a scripted smoke runner (`node test/smoke/run-smoke.ts`) runs probes P1 to P12 on a scratch Paseo 0.10.1 daemon, cleans up after itself, and its first full run is committed under `## Results`: of its 16 sections 13 pass (the runner's own Clean-up included), 2 are `human` (Waiting pill, Report card) and 1 fails (Cheap sensor: a real finding on the plugin, below).

Branch: `plugin-real-host/wave1/53-scripted-smoke-runner` at `4536754`, base `cde4a73`

Acceptance criteria:
- [x] A runner in `test/smoke/`, not matched by `test/**/*.test.ts`, started by one command at the top of `test/smoke/README.md`, runs on Windows: `test/smoke/run-smoke.ts`, command in the new "The scripted run" section of `test/smoke/README.md`. Its name does not match the `npm test` glob; `git ls-files test | grep run-smoke` lists it once.
- [x] Scratch home and port, `PASEO_*` and `API_KEY`/`TOKEN`/`SECRET` keys removed from every child environment, values never printed, every `paseo` call carries `--home <scratch>`: `scrubEnv` in `test/smoke/smoke-plan.ts`, the single `paseo()` helper in `run-smoke.ts`. The run printed the names only: `CLAUDE_CODE_MESSAGING_TOKEN, GITLAB_WEBHOOK_SECRET, PASEO_AGENT_CWD, PASEO_AGENT_ID, PASEO_CLI, PASEO_HOME, PASEO_HUB_API_KEY`. The port is a free one the runner picks (49708 to 60386 in my runs), never 6767 or 6790.
- [x] Probes P1 to P12, one result line per section under `## Results`: all 16 sections have a line. P11 and the Waiting pill are `human` (reason below), the Cheap sensor line is `fail`, nothing is `blocked`.
- [x] Human list printed and written under `## Results`: four items (enable the Claude Code plugin, pill screenshots, report card screenshot, one message typed in the app). No provider login was needed (see Findings).
- [x] On exit the runner removes `mwp-smoke`, stops the scratch daemon and deletes the scratch folder, also on failure (`main().catch`), on SIGINT/SIGTERM and in an `exit` handler; verified: the last run printed `cleanup: plugin remove exit 0; daemon stop: stopped; status: stopped; scratch folder deleted`, and afterwards no process listens on 6793, no scratch home is left in the temp folder. Owner's daemon before and after (`paseo daemon status`, `paseo --version`, read-only): pid `18276`, worker `17208`, `127.0.0.1:6767`, version `0.10.1`, unchanged. (The owner's daemon was restarted outside this wave at 2026-10-01T04:42Z; that is the "before" value the orchestrator gave me.)
- [x] The module that decides without a daemon has its own test file: `test/smoke/smoke-plan.test.ts`, below.
- [x] One full run on Paseo 0.10.1, `## Results` committed: `4536754`; output below.

Checks written: `test/smoke/smoke-plan.test.ts` (16 cases: the scrub removes `PASEO_*` and `API_KEY`/`TOKEN`/`SECRET` keys and returns names only; scratch overrides are applied after the scrub and never let an owner value through; the input is not mutated; the probe table holds P1 to P12 once with their launch; the section table names 16 sections, each probe backs a section and each probe-less section says why; `resultLine` field order, one-line and pipe escaping; `withResults` replaces what follows `## Results`, is idempotent, appends the heading when missing; the human list).
Test run:
- `node --test test/smoke/smoke-plan.test.ts`: red on `cde4a73` (module absent, `ERR_MODULE_NOT_FOUND` for `test/smoke/smoke-plan.ts`; `tests 1, pass 0, fail 1`; log kept as `red.log`), green on `4536754` (`tests 16, pass 16, fail 0`).
- `npx tsc --noEmit`: no output (the runner is typechecked under `strict` and `erasableSyntaxOnly`).

Full run (Windows 11 10.0.26200, Node v24.19.0, Paseo daemon and CLI 0.10.1, 12 processors), `MWP_SMOKE_DEBUG=1 node test/smoke/run-smoke.ts`, 24 minutes:
```
pass     Steps
pass     Lifecycle relay
human    Waiting pill
pass     Git guard
pass     Claude Code plugin
pass     Role identity
pass     Human words
fail     Cheap sensor
pass     Gate cap
pass     State outside the repository
pass     Cost levels
pass     Delegated answers
pass     Appetite
pass     Question budget
human    Report card
pass     Clean-up
```
The decisive output of each section is on its line under `## Results` of `test/smoke/README.md` (checks named `ok`/`FAIL`), and the raw relay timelines of P2 and P4 are saved in `test/smoke/fixtures/paseo-0.10.1/`.

Findings (each tagged):
- **reproduced, FAIL** The stall sensor never flags a running agent on Paseo 0.10.1. The agent snapshot a plugin gets from `paseo.agents.ref(id).refresh()` has no `lastActivityAt` (keys: `id, provider, cwd, workspaceId, model, thinkingOptionId, effectiveThinkingOptionId, runtimeInfo, createdAt, updatedAt, lastUserMessageAt, status, activeTurn, capabilities, currentModeId, availableModes, features, pendingPermissions, persistence, title, labels, lastUsage, requiresAttention, attentionReason, attentionTimestamp, archivedAt`), so `server/paseo-host.ts` `lastActivityAt()` returns null and the tick skips every agent. Found with a throwaway patched copy (two `console.log` lines, outside git, in my temp folder): `[diag] tick latest=true` at 09:24:17 and `[diag] lastActivityAt type=undefined value=undefined keys=... status=running`, while the stream agent ran a foreground 400 s command for 7 minutes and the orchestrator got no `Stall suspected:`. The smoke README's own fallback (`updatedAt`) is not implemented. In the committed run the stream agent was `running` at minute 7 and was not flagged; the ticket agent had already gone `idle` (haiku sometimes ended its turn early), so that check also reads FAIL; the cause of the missing flags is the one above. `UpdatedAt` read at minute 2 and minute 7 was equal while the call was stuck, so the field a fix would use behaves as the sensor needs. Not fixed here (outside my file zone): a ticket for `server/paseo-host.ts` is needed.
- **reproduced** `MWP_*` reaches plugin code through `daemon start`, not only `daemon run`: P8 passed on a daemon launched by `paseo daemon start` with `MWP_GATE_SHARE=0.01` in the launching process's environment (message names `a cap of 1`); P10 and P9 passed likewise for `MWP_QUESTION_BUDGET=2` and `MWP_STATE_DIR`. The runner uses `start` and falls back to `run` only if P8 fails.
- **reproduced** A script can create labelled agents and parent them: `paseo run -d --title ... --label k=v` with `PASEO_AGENT_ID=<scratch orchestrator id>` in the child environment gives `ParentAgentId` equal to that id (`paseo inspect`), and the plugin treats the orchestrator as the parent (relay messages arrive in its timeline).
- **reproduced** A child created with `PASEO_AGENT_ID` set lands in the parent's workspace and takes the parent's `cwd`, whatever `--cwd` says (the plugin saw `cwd=<orchestrator's folder>`). So an orchestrator must be created in the folder its children need (the repo with the `## Delegation` table); the runner does that.
- **reproduced** `paseo send` always carries a `clientMessageId`: with the orchestrator as `PASEO_AGENT_ID` or without, the ticket agent's next turn end reached the orchestrator as `Human words:` (one message id). An agent created with `paseo run` carries none (no `Human words:`). The MCP paths (`create_agent`, `send_agent_prompt` called by an agent) were attempted by a scratch orchestrator and are marked `not covered` in the P4 line: the orchestrator did not create the child (its model had no usable paseo MCP tools in the scratch daemon, reason not isolated). The CLI timeline text (`paseo logs`) shows no `messageId`/`clientMessageId` fields, so the per-path fact is read from the relay.
- **reproduced** `paseo restart --home <scratch>` on a daemon started by `daemon start` works (supervisor pid kept, worker replaced), and the resumed ticket agent still printed `ROLE-IS:ticket`; in an earlier, overloaded probe the CLI hung after a restart on a `daemon run` launch (not reproduced in the full runs).
- **reproduced** Every agent creation logs `[matt-with-paseo] agent.session_open could not read the title or labels of agent <id>; left unmarked` (the README's "if the agent was resumed" warning also fires at creation). Not a failure for the marker (the ticket marker is set by `beforeCreate`), but the line is noise in `paseo plugin logs`; the P3 check looks for it only for the resumed ticket agent.
- **reproduced** A foreground `sleep N` of several minutes is not a stuck call under Claude Code: the agent ended its turn at once. The runner holds agents with `node -e "setTimeout(function(){},780000)"`, with `BASH_MAX_TIMEOUT_MS` raised through `paseo run --env`.
- **reproduced** The CLI's `paseo logs` (text, `-o json`, `-o yaml`) shows no plugin timeline rows, so the report-card row (kind, version, in-place update) is not readable by a script: P11 checks that the plugin logged no `report card not appended` failure before and after `plugin reload`, and the section is `human` (the card's drawing is a human item anyway).
- **decided: no `blocked: provider login`** because the scratch home's `claude` provider worked on the first try with the machine's own Claude Code login (nothing read, copied or logged in). Cost: agents spend that login's quota; a trivial haiku turn cost about 0.014 USD (`paseo inspect` `CostUsd`), a full run uses roughly a hundred turns.
- **decided: `list_profiles` and "the `Next:` line names existing tools"** are not checked (they are MCP tools the CLI cannot call); P6 compares provider ids before and after the install instead, P2 checks the tool names are written in the line.

Design: `test/smoke/smoke-plan.ts` holds what is decided without a daemon (scrub, probe table P1 to P12 with the launch each needs, section-to-probe table, human list, results writer); `test/smoke/run-smoke.ts` does the work: scratch folder under the system temp folder (`MWP_SMOKE_TEMP` moves it), `git archive HEAD` copy with `test/smoke/conditions.json` over `server/data/conditions.json`, two scratch git repos from `test/smoke/fixtures/AGENTS-p5.md` and `AGENTS-spend.md` (appetite `0.0001 USD`), launch A (`MWP_GATE_SHARE=0.01`: P1, P8) then launch B (`MWP_QUESTION_BUDGET=2`, `MWP_STATE_DIR=<scratch>`: P10, P2, P4, P5, P6, P11 one agent at a time, P7 beside them, P12 beside them, then P3 with the one restart, then P9). Every agent title carries `[mwp-smoke]`. `--only P1,P8` runs named probes and writes nothing.

Code review: deferred to the milestone (docs/agents/evidence-standards.md)
Open: (1) the Cheap sensor finding above needs a ticket (`lastActivityAt` absent on 0.10.1; fall back to `updatedAt`); (2) the MCP paths of P4 and "Next: names existing tools" are `not covered`; (3) the Waiting pill and Report card sections and the four human items stay with the owner; (4) the runner spends real model quota (about 0.01 USD per haiku turn); (5) the P7 sleepers are model-driven: an agent can end its turn early (seen once for the ticket agent), which the run reports as its own FAIL line.
Outside the file zone: none in git (new files only under `test/smoke/`, and the "The scripted run" section plus `## Results` of `test/smoke/README.md`). Outside git, in `C:\Users\HBLAB_OPMS\AppData\Local\Temp\plugin-real-host-53`: logs of my runs (`dry*.log`, `full*.log`, `red.log`, `green.log`, `plugin-real-host-evidence.log`), the throwaway probe and diagnostic scripts (`probe.mjs`, `probe2.mjs`, `diag.mjs`, `diag3.mjs`, `diag.tar`), and this file. No scratch daemon or scratch home remains.
````
