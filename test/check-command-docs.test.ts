import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

function scripts(): Record<string, string> {
  return JSON.parse(read("package.json")).scripts;
}

function milestoneStepOne(): string {
  const line = read("docs/agents/evidence-standards.md")
    .split("\n")
    .find((l) => /^1\. \*\*One full test run\*\*/.test(l));
  assert.ok(line, "the milestone run has a step 1 on the full test run");
  return line;
}

function developmentSection(): string {
  const text = read("README.md");
  const start = text.indexOf("\n## Development");
  assert.notEqual(start, -1, "README has a Development section");
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

test("npm run check runs the typecheck, then the test script, then the docs-set test, and stops at the first failure", () => {
  const check = scripts().check;
  assert.ok(check, "package.json has a check script");
  const steps = check.split("&&").map((s) => s.trim());
  assert.deepEqual(steps, [
    "npm run typecheck",
    "npm test",
    "node --test test/docs/docs-set.test.mjs",
  ]);
  assert.doesNotMatch(check, /;|\|\|/, "no separator that lets a failure pass");
});

test("the check script has no lint or format step", () => {
  assert.doesNotMatch(scripts().check ?? "", /lint|format|prettier|eslint|biome/i);
});

test("the docs-set test is not picked up by the test script's glob, so check names it", () => {
  assert.doesNotMatch(scripts().test, /docs-set/);
  assert.match(scripts().test, /test\/\*\*\/\*\.test\.ts/);
  assert.match(scripts().check ?? "", /test\/docs\/docs-set\.test\.mjs/);
});

test("the README's development section names npm run check as the command that proves everything", () => {
  const section = developmentSection();
  assert.match(section, /npm run check/);
  assert.match(section, /proves everything/i);
});

test("the evidence standards' milestone run step 1 names npm run check, with the smoke steps still manual", () => {
  const step = milestoneStepOne();
  assert.match(step, /npm run check/);
  assert.match(step, /smoke/i);
  assert.match(step, /test\/smoke\/README\.md/);
});
