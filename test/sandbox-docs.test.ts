import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function developmentSection(): string {
  const readme = read("README.md");
  const start = readme.indexOf("\n## Development");
  assert.ok(start !== -1, "README has a ## Development heading");
  const rest = readme.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

function descriptorsSubsection(): string {
  const section = developmentSection();
  const start = section.indexOf("\n### Harness descriptors");
  assert.ok(start !== -1, "the Development section has a 'Harness descriptors' subsection");
  const rest = section.slice(start + 1);
  const next = rest.indexOf("\n### ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

test("the field table in the README has a sandboxed row that says what true and false mean", () => {
  const rows = descriptorsSubsection()
    .split("\n")
    .filter((line) => line.startsWith("| `sandboxed`"));
  assert.equal(rows.length, 1, "one row for sandboxed");
  assert.match(rows[0] ?? "", /`true`/);
  assert.match(rows[0] ?? "", /`false`/);
});

test("the README no longer lists sandboxed among the fields still to come", () => {
  assert.doesNotMatch(descriptorsSubsection(), /still to come/i);
  assert.doesNotMatch(descriptorsSubsection(), /`sandboxed` \(ticket 19\)/);
});

test("the README says nothing reads the field yet: no routing and no screen show a harness", () => {
  const text = descriptorsSubsection();
  assert.match(text, /routing/i);
  assert.match(text, /nothing (reads|yet reads)|no code (reads|yet reads)|not read/i);
});

test("CHANGELOG.md lists the sandbox field under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /sandboxed/);
});
