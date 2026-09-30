# Release checklist

The steps to run for a release, and the routine step when Paseo cuts a new minor. The maintainer and any agent that runs a release read this file. Work the steps in order; each ends on a condition you can check.

A range closed at one minor hard-fails on every host release: users update Paseo and find the plugin dead. The range is widened as a routine step, the day the minor ships.

The milestone run ([`docs/agents/evidence-standards.md`](evidence-standards.md)) is where the smoke steps of step 2 run for a release. Run the widening list when Paseo's new minor lands, whether or not a milestone is under way.

## Cut a release

1. Cut `release/v0.x.0` from `main`, once every stream of the milestone has merged. Done when `git log main..release/v0.x.0` is empty and `git log release/v0.x.0..main` is empty.
2. Run the milestone run on the release branch: one full test run with the smoke steps, one milestone-wide code review, one fix pass, then the eval when there is a plugin to eval (`docs/agents/evidence-standards.md`). Done when the run is green, or each red item is named in the fix pass.
3. Set one version token across the manifests: change `version` in `package.json`, then in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` and `CONTRACT_VERSION` in `shared/contract.ts` (#16). Done when `test/version-token.test.ts` passes and names no file.
4. Write the `CHANGELOG.md` entry: move the `[Unreleased]` lines under a heading for the version, with the release date. Done when `[Unreleased]` is empty and the heading's version is the token of step 3.
5. Record the `requirements.paseo` range next to the Paseo version the smoke test ran on, and widen it when a newer minor passed the smoke test: work the steps of [Widen the host range](#widen-the-host-range) below (#3, #15). Done when the range in `paseo-plugin.json`, `README.md` and `test/smoke/README.md` agrees with the version the smoke test ran on.
6. Check that the licence and `NOTICE` are present: `LICENSE` holds MIT and `NOTICE` credits sting9k/seatworks at `6d316b0`. Done when both files exist at the root and `NOTICE` still names that source.
7. Check the README's install-from-a-clone line and its "tested on Node 22" line, and that `package.json` has no `engines` field. Done when the README says "tested on Node 22" (or the Node major the release ran on) and `package.json` has no `engines` key.
8. Merge the release pull request from `release/v0.x.0` into `main`. Done when the pull request shows merged and CI is green on all three systems.
9. The user tags the release `v0.x.0` on the merge commit. Done when the tag exists on `main`; an agent never tags.

## Widen the host range

1. Read the new minor's changelog. Done when you have written down each change that touches a hook the plugin registers, a call in `server/paseo-host.ts`, or the manifest schema, or written "none".
2. Run every step of `test/smoke/README.md` on the new Paseo. Done when its Results section holds a row for the new version with an outcome for each step.
3. Widen `requirements.paseo` the same day Paseo published the minor, in `paseo-plugin.json`, in `README.md` and in the range table of `test/smoke/README.md`, and record the new version as the tested one beside it; the upper bound is no tighter than the evidence requires: the next minor after the newest version that passed step 2, or the first minor step 1 found a breaking change in when that comes sooner. Done when the old range string appears in none of the three files and the pinned range in `test/manifest.test.ts` names the new one.
4. When the widening ships on a `release/v0.x.0` branch, read the CI run of `.github/workflows/ci.yml` on it: it runs `npm ci`, then `npm run check`, on Linux, macOS and Windows. Done when the run is green on all three systems, or each red job is named in the fix pass.
