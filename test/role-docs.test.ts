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

function roleSubsection(): string {
  const section = developmentSection();
  const start = section.indexOf("\n### Role identity");
  assert.ok(start !== -1, "the Development section has a 'Role identity' subsection");
  const rest = section.slice(start + 1);
  const next = rest.indexOf("\n### ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

test("the layout table lists the role labels helper", () => {
  const rows = developmentSection().split("\n").filter((line) => line.startsWith("| `"));
  assert.ok(rows.some((row) => row.startsWith("| `shared/role-labels.ts`")), "layout table has a row for shared/role-labels.ts");
});

test("the README says how each part of the plugin tells a ticket agent from the orchestrator", () => {
  const text = roleSubsection();
  const needles = [
    "labels",
    "wave",
    "ticket",
    "stream",
    "shared/role-labels.ts",
    "MWP_ROLE",
    "hasTicketMarker",
    "shared/role-marker.ts",
    "beforeCreate",
    "title",
    "provider",
    "registerProvider",
    "hand-started",
    "orchestrator",
    "T3",
  ];
  for (const needle of needles) assert.ok(text.includes(needle), `Role identity names ${needle}`);
});

test("the README lists the three ways an agent is recognised in a table", () => {
  const rows = roleSubsection().split("\n").filter((line) => line.startsWith("|"));
  assert.ok(rows.length >= 5, "a header, a separator and one row for each of three ways");
  for (const word of ["labels", "env", "title"]) {
    assert.ok(rows.some((row) => row.toLowerCase().includes(word)), `a row names ${word}`);
  }
});

test("CHANGELOG.md lists role identity under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /role identity/i);
  assert.match(unreleased, /no provider/i);
});

test("the smoke test has written steps for role identity, before Results", () => {
  const smoke = read("test/smoke/README.md");
  const start = smoke.indexOf("\n## Role identity");
  assert.ok(start !== -1, "the smoke test has a 'Role identity' section");
  const rest = smoke.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  const section = next === -1 ? rest : rest.slice(0, next);
  for (const needle of ["0.10.1", "paseo provider ls", "[mwp-smoke]", "Written, not run"]) {
    assert.ok(section.includes(needle), `the Role identity section names ${needle}`);
  }
  assert.ok(smoke.indexOf("\n## Results") > start, "Results stays the last section");
});
