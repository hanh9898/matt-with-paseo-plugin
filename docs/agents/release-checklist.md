# Release checklist

The steps to run when Paseo cuts a new minor, so the plugin's host range follows it. The maintainer and any agent that runs a release read this file. Work the steps in order; each ends on a condition you can check.

A range closed at one minor hard-fails on every host release: users update Paseo and find the plugin dead. The range is widened as a routine step, the day the minor ships.

The milestone run ([`docs/agents/evidence-standards.md`](evidence-standards.md)) is where the smoke steps of step 2 run for a release. Run this list when Paseo's new minor lands, whether or not a milestone is under way.

## Widen the host range

1. Read the new minor's changelog. Done when you have written down each change that touches a hook the plugin registers, a call in `server/paseo-host.ts`, or the manifest schema, or written "none".
2. Run every step of `test/smoke/README.md` on the new Paseo. Done when its Results section holds a row for the new version with an outcome for each step.
3. Widen `requirements.paseo` the same day Paseo published the minor, in `paseo-plugin.json`, in `README.md` and in the range table of `test/smoke/README.md`, and record the new version as the tested one beside it; the upper bound is no tighter than the evidence requires: the next minor after the newest version that passed step 2, or the first minor step 1 found a breaking change in when that comes sooner. Done when the old range string appears in none of the three files and the pinned range in `test/manifest.test.ts` names the new one.
4. When the widening ships on a `release/v0.x.0` branch, read the CI run of `.github/workflows/ci.yml` on it: it runs `npm ci`, `npm run typecheck` and `npm test` on Linux, macOS and Windows. Done when the run is green on all three systems, or each red job is named in the fix pass.
