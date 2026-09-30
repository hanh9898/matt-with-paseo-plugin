import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  assert.ok(start !== -1, `a "${heading}" heading exists`);
  return text.slice(start + heading.length).split(/\n#{1,3} /, 1)[0] ?? "";
}

test("the contract says which rows the plugin reads, where, and what it never answers", () => {
  const reads = section(read("docs/contract.md"), "## What the plugin reads from the delegation table");
  assert.match(reads, /`AGENTS\.md`/, "names the file that holds the table");
  assert.match(reads, /`Switch`/);
  assert.match(reads, /`Questions the orchestrator may decide`/);
  assert.match(reads, /`Appetite`/);
  assert.match(reads, /`one-way`/, "a one-way door is never listed as decidable");
  assert.match(reads, /`Yours:`/, "a question with a Yours line is never answered");
});

test("the smoke test has a delegated-answers part with the answer, the leave and the one-way cases", () => {
  const smoke = section(read("test/smoke/README.md"), "## Delegated answers");
  assert.match(smoke, /Written, not run/);
  assert.match(smoke, /Door: two-way/);
  assert.match(smoke, /Yours:/);
  assert.match(smoke, /Door: one-way/);
  assert.match(smoke, /Switch \| off/);
});

test("CHANGELOG.md lists delegated answers under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  assert.match(changelog.slice(changelog.indexOf("## [Unreleased]")), /[Dd]elegated answers/);
});
