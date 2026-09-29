# Ship rules

How a stream of this repository ships. The stream skill (`/matt-with-paseo:matt-with-paseo-streams`) reads this table from `origin/main`, at setup and again at ship; it never writes it. Placeholders: `<slug>` (the stream's slug), `<owner>` (its Owner cell), `<key>` (its Key cell); in `wave merge message` also `<ticket>` (the ticket's number) and `<name>` (its title). An empty value means none.

| Key | Value |
|---|---|
| ship branch | `ship/<slug>` |
| title | `Stream <slug>` |
| description template | `/mattpocock-skills:pr` |
| draft | on |
| labels | `plugin` |
| reviewers | |
| assignees | |
| squash | not set |
| delete source branch | not set |
| ship commit message | `chore(ship): leave agent-only paths out` |
| wave merge message | `Merge ticket <ticket> (<name>) into stream <slug>` |

Why each value:

- **ship branch**: outside `stream/` and `<slug>/`, which the stream skill keeps for the integration branch and the ticket branches.
- **description template**: the skill's own default, so the description is filled from `.github/pull_request_template.md` (Summary, Evidence, Merge Danger).
- **draft on**: the owner marks the pull request ready once they have read it.
- **labels**: `plugin`, the label every ticket of this repository carries.
- **reviewers and assignees empty**: GitHub refuses a review request to the pull request's own author, and `<owner>` is a display name, not a login.
- **squash and delete source branch not set**: GitHub's own repository settings stand, and no auto-merge is queued.
- **wave merge message**: names the stream, since the integration branch is `stream/<slug>`.
