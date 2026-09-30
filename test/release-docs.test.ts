import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const CHECKLIST = "docs/agents/release-checklist.md";
const SEATWORKS_COMMIT = "6d316b0";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

/** The numbered steps of the "Cut a release" section, in the order the file lists them. */
function releaseSteps(): string[] {
  const text = read(CHECKLIST);
  const start = text.indexOf("## Cut a release");
  assert.ok(start !== -1, "the checklist has a Cut a release section");
  const next = text.indexOf("\n## ", start + 1);
  return text
    .slice(start, next === -1 ? undefined : next)
    .split("\n")
    .filter((line) => /^\d+\. /.test(line));
}

/** What each of the nine steps names, in order: from the release branch to the tag. */
const STEP_PATTERNS: RegExp[] = [
  /release\/v0\.x\.0/,
  /milestone run/i,
  /version token/i,
  /CHANGELOG\.md/,
  /requirements\.paseo/,
  /NOTICE/,
  /Node 22/,
  /pull request/i,
  /tag/i,
];

test("the release checklist lists nine steps, in order, from release/v0.x.0 to the tag", () => {
  const all = releaseSteps();
  assert.equal(all.length, 9, "nine numbered steps");
  STEP_PATTERNS.forEach((pattern, index) => {
    assert.match(all[index], pattern, `step ${index + 1} names ${pattern}`);
  });
});

test("step 1 cuts the release branch from main", () => {
  assert.match(releaseSteps()[0], /\bmain\b/);
});

test("step 3 checks one version token across the manifests with the version-token check", () => {
  const step = releaseSteps()[2];
  assert.match(step, /test\/version-token\.test\.ts/);
  assert.match(step, /package\.json/);
});

test("step 4 checks the CHANGELOG.md entry of the release", () => {
  assert.match(releaseSteps()[3], /\[Unreleased\]/);
});

test("step 5 keeps the widening step: smoke test on the new minor, then widen requirements.paseo", () => {
  const step = releaseSteps()[4];
  assert.match(step, /smoke/i);
  assert.match(step, /widen/i);
  assert.match(step, /\(#widen-the-host-range\)|Widen the host range/);
  const text = read(CHECKLIST);
  assert.ok(text.includes("## Widen the host range"), "#15's section stays in the file");
});

test("step 6 names the licence and NOTICE, step 7 the install line, Node 22 and no engines field", () => {
  const all = releaseSteps();
  assert.match(all[5], /LICENSE/);
  assert.match(all[6], /install/i);
  assert.match(all[6], /engines/);
});

test("step 8 merges the release pull request and step 9 leaves the tag to the user", () => {
  const all = releaseSteps();
  assert.match(all[7], /merges?/i);
  assert.match(all[8], /user/i);
});

test("every release step ends on a stated condition", () => {
  for (const step of releaseSteps()) assert.match(step, /Done when/, `has a completion condition: ${step.slice(0, 60)}`);
});

test("NOTICE credits sting9k/seatworks at 6d316b0 as the source of the lessons and the adapted designs", () => {
  assert.ok(existsSync(new URL("../NOTICE", import.meta.url)), "NOTICE exists");
  const notice = read("NOTICE");
  assert.match(notice, /sting9k\/seatworks/);
  assert.ok(notice.includes(SEATWORKS_COMMIT), "NOTICE names the commit 6d316b0");
  assert.match(notice, /lessons/i);
  assert.match(notice, /adapted designs/i);
  assert.match(notice, /MIT/);
});

test("the licence stays MIT", () => {
  assert.match(read("LICENSE"), /^MIT License/);
  assert.match(read("README.md"), /## Licence\s+MIT, see \[LICENSE\]\(LICENSE\)/);
});

test("the README says how to install from a clone and that the plugin was tested on Node 22", () => {
  const readme = read("README.md");
  assert.match(readme, /git clone https:\/\/github\.com\/hanh9898\/matt-with-paseo-plugin/);
  assert.match(readme, /paseo plugin install/);
  assert.match(readme, /tested on Node 22/i);
});

test("package.json has no engines field", () => {
  const manifest = JSON.parse(read("package.json")) as Record<string, unknown>;
  assert.equal("engines" in manifest, false);
});

test("the README and CHANGELOG.md point to NOTICE", () => {
  assert.ok(read("README.md").includes("NOTICE"), "the README links NOTICE");
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /NOTICE/);
});
