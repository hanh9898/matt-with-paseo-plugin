# Evidence standards

How this repository proves a change works, and when each proof runs. The wave skill points every agent here from its common rules; this file overrides the wave skill's per-ticket and per-wave review wherever the two differ.

## The rule: tests and review run once, at the end of a stream

A ticket never runs the suite, an eval or a code review. The stream runs each of them once, at its end, in this order:

1. **One full test run**: the suite, every test the repository has, in one command.
2. **One stream-wide code review**: `mattpocock-skills:code-review` on both axes, Standards and Spec, with the stream's first base commit as the fixed point, naming this file in the call. Standards reads `CODING_STANDARDS.md`; Spec reads every ticket the stream resolved.
3. **One fix pass**: every finding of steps 1 and 2 is fixed, skipped with a reason, or put off to a named ticket, in one round. The fixes merge back like any ticket. After it, the suite runs once more to show the fixes broke nothing; that run is part of the fix pass, not a second review.
4. **The eval**, once the repository has a plugin to eval: the eval suite runs once, on the integration branch after the fix pass. Until then, this step reads "not applicable: no plugin to eval yet".

The end of a stream is the last wave: the wave after whose merges no ticket is left for agents (the wave skill's stage F). Its step 7 runs the four steps above in place of the seam review. Every earlier wave's step 7 writes its `## Review` as "deferred to the stream's end (evidence standards)".

The results go into the stream's pull request, under Evidence: the suite's command and summary line, the review's findings per axis with the outcome of each, and the eval's report.

## What a ticket runs

A ticket proves its own acceptance criteria and nothing wider:

- **Its own tests.** The tests the ticket writes or changes, run by file or by name, red before the change and green after (the `mattpocock-skills:tdd` and `mattpocock-skills:diagnosing-bugs` loops). For a symptom ticket, the red run is on the base commit. Running the whole suite is the stream's job, not the ticket's.
- **The per-merge checks** below, on its own branch before its last commit.
- **Each acceptance criterion** as a check that runs, for a change to no code: a `grep`, a parse, a link check.

The ticket's flow ends without `mattpocock-skills:code-review`. Its `Resolved:` comment carries the line `Code review: deferred to the stream's end (docs/agents/evidence-standards.md)` in place of the review's results ([`comment-template.md`](comment-template.md)); the orchestrator's report check reads that line as the review's outcome.

## The per-merge checks

After each merge into the integration branch, the orchestrator runs the cheapest checks the repository has, and none of the suite:

- every JSON file parses, and every YAML file under `.github/` parses;
- every relative link in the Markdown files resolves;
- once `package.json` declares them, its `typecheck` and `lint` scripts.

A check the repository does not have yet is skipped and named as skipped in the merge's log line.

## What counts as proof

- **A run, never a reading.** A command and its output. Code read, or a comment saying "works", proves nothing.
- **Behaviour on the real host.** A hook, a permission answer or a pill is proven on a running Paseo daemon, as ADR 0001's probes were: the daemon and plugin SDK versions, the operating system, the agent that triggered the event, and what the plugin did in reply, with its timing where it matters. Mark every agent a probe creates, as ADR 0001's prototype marked `[mwp-proto]`, and leave every other agent alone.
- **A screenshot for what the user sees**: a card, a pill, a panel, in Paseo's own window.
- **Counts that match.** A test run's count of tests matches the test files git tracks; a mismatch is a finding, not noise.
