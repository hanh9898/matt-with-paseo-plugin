# Evidence standards

How this repository proves a change works, and when each proof runs. The wave skill points every agent here from its common rules. Wherever this file and the wave skill's per-ticket review, per-merge verification or per-wave seam review differ, this file wins.

## When each proof runs

| When | What runs | What never runs there |
|---|---|---|
| A ticket | Its own new or changed test files, once each: red on the base, then green after the change | The suite, the drift check, a code review, an eval |
| A merge into the integration branch | The conflict-marker search of the wave skill's step 6 | The suite, any other check |
| A pull request into `main` | CI: `npm run check` on Linux, macOS and Windows (`.github/workflows/ci.yml`) | – |
| A milestone | The milestone run below: the smoke steps, one code review on both axes, one fix pass, the eval | – |

A pull request into `main` whose CI is red is never merged. The stream agent fixes the cause on its integration branch and cuts the ship branch again from it, and CI runs on the new pull request.

A **milestone** is a release in [`docs/roadmap.md`](../roadmap.md): `v0.1.0` up to `v0.5.0`, the last one planned. Several streams may deliver one milestone.

## What a ticket delivers

A ticket proves its acceptance criteria with the checks it writes: a test, or for a change to no code, a `grep`, a parse or a link check. The ticket runs each new or changed test file once with `node --test <file>`: on the base commit, where it goes red, and after the change, where it goes green. It runs no other test file.

A check reads structure, never a sentence of prose: that a link resolves, a file exists, a table has its columns, a pinned line such as a `Next:` line or a manifest field holds its value. A new check that pins a sentence of a document is rewritten as a structure check before the ticket resolves.

The ticket's flow ends without `mattpocock-skills:code-review` and without an eval. Its `Resolved:` comment carries a `Test run:` line with each file's red and green summary lines, and `Code review: deferred to the milestone` ([`comment-template.md`](comment-template.md)). The orchestrator's report check reads them as the outcome.

Every wave's step 7 writes its `## Review` as "deferred to milestone `v0.x.0` (evidence standards)".

## The milestone run

Once the milestone's last stream has merged into `main`, the **milestone run** happens once, on a branch `release/v0.x.0` cut from `main`, in this order:

1. **One full test run**: `npm run check` (typecheck, then every test, stopping at the first failure) once on the release branch, plus every smoke step in `test/smoke/README.md` on a real Paseo daemon, which stay manual.
2. **One milestone-wide code review**: `mattpocock-skills:code-review` on both axes, Standards and Spec. The fixed point is the previous release tag, or the repository's first commit for `v0.1.0`. Name this file in the call. Standards reads `CODING_STANDARDS.md`; Spec reads every ticket the milestone resolved and the milestone's exit criteria in `docs/roadmap.md`.
3. **One fix pass**: every finding of steps 1 and 2 is fixed, skipped with a reason, or put off to a named ticket of a later milestone, in one round, on the same branch.
4. **The eval**, when the repository has a plugin to eval: the eval suite runs once, after the fix pass. Until then this step reads "not applicable: no plugin to eval yet".

The run's results go into the `release/v0.x.0` pull request under Evidence: the test run's command and summary line, the CI run, the smoke results, the review's findings per axis with the outcome of each, and the eval's report. The release is tagged only after that pull request merges. The stream that ships a milestone updates the roadmap in its pull request ([`docs/roadmap.md`](../roadmap.md)).

## What counts as proof

- **A run, never a reading.** A command and its output.
- **Behaviour on the real host.** A hook, a permission answer or a pill is proven on a running Paseo daemon, as ADR 0001's probes were. Record the daemon and plugin SDK versions, the operating system, the agent that triggered the event, and what the plugin did in reply. Mark every agent a probe creates, as ADR 0001's prototype marked `[mwp-proto]`, and leave every other agent alone.
- **A screenshot for what the user sees**: a card, a pill or a panel, in Paseo's own window.
- **Counts that match.** The test run's count of test files matches the test files git tracks. A mismatch is a finding.

## Setup

Setup (`setup/`) is proven at the ticket by unit tests on the fake runner ([`test/support/fake-runner.ts`](../../test/support/fake-runner.ts)), which start no process, and at the milestone run by the "Setup" section of [`test/smoke/README.md`](../../test/smoke/README.md), run on a scratch home only.

## Writing files

Agents write and edit files with the Edit and Write tools, never through a shell heredoc, `echo`, or a script's string literals. The shell here drops backslashes, so `\n`, `\b` and `\(` in a regular expression or a Windows path arrive broken. After any scripted change, search the tracked files for control characters: `git ls-files | xargs grep -lP '[\x00-\x08\x0b\x0c\x0e-\x1f]'` prints nothing.
