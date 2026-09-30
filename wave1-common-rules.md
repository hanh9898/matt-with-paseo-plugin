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
