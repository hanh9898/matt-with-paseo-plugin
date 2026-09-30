import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const CHECKLIST = "docs/agents/release-checklist.md";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

/** The numbered steps of the "Widen the host range" section: the release steps (#37) sit in a section of their own. */
function steps(): string[] {
  assert.ok(existsSync(new URL(`../${CHECKLIST}`, import.meta.url)), `${CHECKLIST} exists`);
  const text = read(CHECKLIST);
  const start = text.indexOf("## Widen the host range");
  assert.ok(start !== -1, "the checklist has a Widen the host range section");
  const next = text.indexOf("\n## ", start + 1);
  return text
    .slice(start, next === -1 ? undefined : next)
    .split("\n")
    .filter((line) => /^\d+\. /.test(line));
}

function indexOfStep(all: string[], pattern: RegExp): number {
  return all.findIndex((line) => pattern.test(line));
}

test("the release checklist has the widen item: read the changelog, widen requirements.paseo the same day", () => {
  const all = steps();
  const widen = all[indexOfStep(all, /widen/i)];
  assert.ok(widen, "a numbered step widens the range");
  assert.match(widen, /requirements\.paseo/);
  assert.match(widen, /same day/i);
  const read = all[indexOfStep(all, /changelog/i)];
  assert.ok(read, "a numbered step reads the new minor's changelog");
});

test("the widen item keeps the upper bound no tighter than the evidence requires", () => {
  const text = read(CHECKLIST);
  assert.match(text, /no tighter than the evidence requires/i);
  assert.match(text, /next minor/i);
});

test("the smoke run on the new Paseo comes before the widening", () => {
  const all = steps();
  const smoke = indexOfStep(all, /test\/smoke\/README\.md/);
  const widen = indexOfStep(all, /widen/i);
  assert.ok(smoke !== -1, "a numbered step runs test/smoke/README.md");
  assert.ok(widen !== -1, "a numbered step widens the range");
  assert.ok(smoke < widen, "the smoke step is ordered before the widen step");
  assert.match(all[smoke], /new (Paseo|minor)/i);
});

test("every step of the checklist ends on a stated condition", () => {
  for (const step of steps()) assert.match(step, /Done when/, `has a completion condition: ${step.slice(0, 60)}`);
});

test("the widen step names the three places the range is recorded", () => {
  const widen = steps().find((line) => /widen/i.test(line)) ?? "";
  for (const place of ["paseo-plugin.json", "README.md", "test/smoke/README.md"]) {
    assert.ok(widen.includes(place), `the widen step names ${place}`);
  }
});

test("CONTRIBUTING.md, the README and CHANGELOG.md point to the checklist", () => {
  assert.ok(read("CONTRIBUTING.md").includes(CHECKLIST), "CONTRIBUTING.md links the checklist");
  assert.ok(read("README.md").includes(CHECKLIST), "the README links the checklist");
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /release checklist/i);
});
