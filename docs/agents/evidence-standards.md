# Evidence standards

How this repository proves a change works, and when each proof runs. The wave skill points every agent here from its common rules; this file overrides the wave skill's per-ticket review, per-merge verification and per-wave seam review wherever they differ.

## The rule: tests and review run only at a milestone

A **milestone** is a release in [`docs/roadmap.md`](../roadmap.md): `v0.1.0` up to `v0.5.0`, the last one planned. Several streams may deliver one milestone. Nothing is tested or reviewed until every stream of the milestone has merged into `main`.

Before that, no ticket runs any test (its own included), the drift check, an eval or a code review; no merge runs the suite or any check; and a stream's end runs none of them either. The only check a merge runs is the conflict-marker search of the wave skill's step 6. A stream that ships before its milestone is complete says so in its pull request's Evidence: "Tests, review and eval: deferred to milestone `v0.x.0` (evidence standards)".

Once the milestone's last stream has merged into `main`, the **milestone run** happens once, on a branch `release/v0.x.0` cut from `main`, in this order:

1. **One full test run**: every test the repository has, in one command, plus every smoke step in `test/smoke/README.md` on a real Paseo daemon.
2. **One milestone-wide code review**: `mattpocock-skills:code-review` on both axes, Standards and Spec, with the previous release tag (or the repository's first commit, for `v0.1.0`) as the fixed point, naming this file in the call. Standards reads `CODING_STANDARDS.md`; Spec reads every ticket the milestone resolved and the milestone's exit criteria in `docs/roadmap.md`.
3. **One fix pass**: every finding of steps 1 and 2 is fixed, skipped with a reason, or put off to a named ticket of a later milestone, in one round, on the same branch.
4. **The eval**, when the repository has a plugin to eval: the eval suite, once, after the fix pass. Until then this step reads "not applicable: no plugin to eval yet".

The run's results go into the `release/v0.x.0` pull request under Evidence: the test run's command and summary line, the smoke results, the review's findings per axis with the outcome of each, and the eval's report. The release is tagged only after that pull request merges. The stream that ships a milestone updates the roadmap in its pull request ([`docs/roadmap.md`](../roadmap.md)).

Every wave's step 7 writes its `## Review` as "deferred to milestone `v0.x.0` (evidence standards)".

## What a ticket delivers

A ticket proves its acceptance criteria with the checks it writes: a test, or for a change to no code, a `grep`, a parse or a link check. Each new check is written to fail before the change. The checks are committed with the change and are not run as a suite by the ticket; the milestone run is where they run.

The ticket's flow ends without `mattpocock-skills:code-review`. Its `Resolved:` comment carries the lines `Tests: deferred to the milestone` and `Code review: deferred to the milestone` ([`comment-template.md`](comment-template.md)); the orchestrator's report check reads them as the outcome.

## What counts as proof

- **A run, never a reading.** At the milestone run, a command and its output.
- **Behaviour on the real host.** A hook, a permission answer or a pill is proven on a running Paseo daemon, as ADR 0001's probes were: the daemon and plugin SDK versions, the operating system, the agent that triggered the event, and what the plugin did in reply. Mark every agent a probe creates, as ADR 0001's prototype marked `[mwp-proto]`, and leave every other agent alone.
- **A screenshot for what the user sees**: a card, a pill, a panel, in Paseo's own window.
- **Counts that match.** The test run's count of tests matches the test files git tracks; a mismatch is a finding.
