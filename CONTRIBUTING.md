# Contributing

Issues and pull requests are welcome. By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Work is tracked in [GitHub Issues](https://github.com/hanh9898/matt-with-paseo-plugin/issues). Pick a ticket labelled `ready-for-agent` or `help wanted`, or open one with the [ticket form](.github/ISSUE_TEMPLATE/ticket.md).
- Read the [ADRs](docs/adr/) that touch the area. A change that contradicts one says so in its pull request.
- For a vulnerability, do not open an issue: follow [SECURITY.md](SECURITY.md).

## Rules

| Topic | Where it lives |
|---|---|
| How code and agent documents are written | [`CODING_STANDARDS.md`](CODING_STANDARDS.md) |
| How a change is proven to work: a ticket runs its own tests, CI runs every pull request, review and eval run at a milestone | [`docs/agents/evidence-standards.md`](docs/agents/evidence-standards.md) |
| How ticket comments are written | [`docs/agents/comment-template.md`](docs/agents/comment-template.md) |
| How a stream of work ships | [`docs/agents/ship-rules.md`](docs/agents/ship-rules.md) |
| What to run when Paseo cuts a new minor: read its changelog, run the smoke test, widen the host range | [`docs/agents/release-checklist.md`](docs/agents/release-checklist.md) |
| What runs on Linux, macOS and Windows for every pull request into `main` and every push to a `release/v*` branch | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

## Pull requests

1. Branch from `main`.
2. Write commits as [Conventional Commits](https://www.conventionalcommits.org/) (rule C1 of the coding standards).
3. Write the checks for your acceptance criteria as structure checks, never pinning a sentence of prose. Run each new or changed test file once on the base, where it fails, and once after your change, where it passes. CI runs `npm run check` on your pull request, and a red pull request is not merged.
4. Fill in the [pull request template](.github/pull_request_template.md): Summary, Evidence, Merge Danger.
5. Add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) for any change a user can see.
6. When a fix comes from a real incident, describe the symptom you saw.

The maintainer merges. Do not merge your own pull request.
