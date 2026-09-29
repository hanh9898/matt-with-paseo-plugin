# Evidence standards

How this repository proves a change works, and when each proof runs. The wave skill points every agent here from its common rules; this file overrides the wave skill's per-ticket review, per-merge verification and per-wave seam review wherever they differ.

## The rule: tests and review run only at the end of a stream

Nothing runs before the stream's last wave has merged. No ticket runs any test (its own included), the drift check, an eval or a code review, and no merge runs the suite or any check. The only check a merge runs is the conflict-marker search of the wave skill's step 6.

After the last wave of a stream (the wave after which no ticket is left for agents), the stream runs, in this order:

1. **One full test run**: every test the repository has, in one command.
2. **One stream-wide code review**: `mattpocock-skills:code-review` on both axes, Standards and Spec, with the stream's first base commit as the fixed point, naming this file in the call. Standards reads `CODING_STANDARDS.md`; Spec reads every ticket the stream resolved.
3. **One fix pass**: every finding of steps 1 and 2 is fixed, skipped with a reason, or put off to a named ticket, in one round, merged back like any ticket.
4. **The eval**, when the repository has a plugin to eval: the eval suite, once, on the integration branch after the fix pass. Until then this step reads "not applicable: no plugin to eval yet".

Every earlier wave's step 7 writes its `## Review` as "deferred to the stream's end (evidence standards)".

The results go into the stream's pull request under Evidence: the test run's command and summary line, the review's findings per axis with the outcome of each, and the eval's report.

## What a ticket delivers

A ticket proves its acceptance criteria with the checks it writes: a test, or for a change to no code, a `grep`, a parse or a link check. Each new check is written to fail before the change. The checks are committed with the change and are not run as a suite by the ticket; the stream's full test run is where they run.

The ticket's flow ends without `mattpocock-skills:code-review`. Its `Resolved:` comment carries the lines `Tests: deferred to the stream's end` and `Code review: deferred to the stream's end` ([`comment-template.md`](comment-template.md)); the orchestrator's report check reads them as the outcome.

## What counts as proof

- **A run, never a reading.** At the stream's end, a command and its output.
- **Behaviour on the real host.** A hook, a permission answer or a pill is proven on a running Paseo daemon, as ADR 0001's probes were: the daemon and plugin SDK versions, the operating system, the agent that triggered the event, and what the plugin did in reply. Mark every agent a probe creates, as ADR 0001's prototype marked `[mwp-proto]`, and leave every other agent alone.
- **A screenshot for what the user sees**: a card, a pill, a panel, in Paseo's own window.
- **Counts that match.** The test run's count of tests matches the test files git tracks; a mismatch is a finding.
