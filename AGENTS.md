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

How this repo proves a change works: `docs/agents/evidence-standards.md`.

- **A ticket** runs its own new or changed test files once each: red on the base, then green after the change. It records both in its `Resolved:`. It runs no suite, no code review and no eval.
- **A merge** runs only the conflict-marker search.
- **CI** runs `npm run check` on every pull request into `main`, on three systems. A red pull request is never merged: the stream agent fixes the cause and cuts the ship branch again.
- **A milestone** (a release `v0.x.0` in `docs/roadmap.md`, up to `v0.5.0`) runs the smoke steps, one milestone-wide code review on both axes, one fix pass, then the eval when there is a plugin to eval.
- **A check** reads structure (links, files, table columns, pinned lines), never a sentence of prose.
- **Files** are written with the Edit and Write tools, never through shell heredocs: the shell drops backslashes.

## Ship rules

How a stream of this repo ships (branch, title, template, draft, labels, merge messages): `docs/agents/ship-rules.md`. The base branch and the pull-request target are `main`.

## Coding standards

How code and agent documents are written, reviewed on the Standards axis of `mattpocock-skills:code-review`: `CODING_STANDARDS.md`.

## Comments and pull requests

A ticket comment takes a shape from `docs/agents/comment-template.md`. A pull request body follows `.github/pull_request_template.md`.
