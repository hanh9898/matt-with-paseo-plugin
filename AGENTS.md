## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `hanh9898/matt-with-paseo-plugin`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context; the vocabulary is the words blocks of the `matt-with-paseo` and `matt-with-paseo-streams` skills. `GLOSSARY.md` at the repo root separates "the skills" from "the plugin": read it before you name either. Decisions are ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Designing plugin work

The stream agent loads the `/paseo-plugin` skill when it plans work that designs or changes the Paseo plugin itself (its manifest, lifecycle hooks, agent-create transforms, permissions, surfaces, panels, pills, timeline items, RPCs, or how it is installed and reloaded): before it builds the graph, cuts bundles and writes the wave's common rules, so the design choices land in those rules and in each ticket agent's prompt. `/matt-with-paseo` runs the waves; it does not teach the plugin API. Ticket agents do not load `/paseo-plugin`: they work from the ticket, the common rules and the prompt.

## Evidence standards

How this repo proves a change works: `docs/agents/evidence-standards.md`. Tests and review run only at a milestone (a release `v0.x.0` in `docs/roadmap.md`, up to `v0.5.0`), once every stream of it has merged: one full test run with the smoke steps, one milestone-wide code review on both axes, one fix pass, then the eval when there is a plugin to eval. No ticket runs any test, an eval or a code review, and no merge runs the suite or the checks.

## Ship rules

How a stream of this repo ships (branch, title, template, draft, labels, merge messages): `docs/agents/ship-rules.md`. The base branch and the pull-request target are `main`.

## Coding standards

How code and agent documents are written, reviewed on the Standards axis of `mattpocock-skills:code-review`: `CODING_STANDARDS.md`.

## Comments and pull requests

A ticket comment takes a shape from `docs/agents/comment-template.md`. A pull request body follows `.github/pull_request_template.md`.
