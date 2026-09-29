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

function guardSubsection(): string {
  const section = developmentSection();
  const start = section.indexOf("\n### The git guard");
  assert.ok(start !== -1, "the Development section has a 'The git guard' subsection");
  const rest = section.slice(start + 1);
  const next = rest.indexOf("\n### ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

test("the layout table lists the guard, its hook file, the marker and the handler that sets it", () => {
  const rows = developmentSection().split("\n").filter((line) => line.startsWith("| `"));
  for (const path of ["guard/git-guard.mjs", "hooks/hooks.json", "shared/role-marker.ts", "server/hooks/ticket-marker.ts"]) {
    assert.ok(rows.some((row) => row.startsWith(`| \`${path}\``)), `layout table has a row for ${path}`);
  }
});

test("the README says what the guard refuses, where it runs, and how a ticket agent is marked", () => {
  const text = guardSubsection();
  const needles = [
    "git push",
    "git checkout",
    "commit",
    "orchestrator",
    "MWP_ROLE",
    "shared/role-marker.ts",
    "beforeCreate",
    "[Wave N]",
    "labels",
    "hooks/hooks.json",
    "PreToolUse",
    "guard/git-guard.mjs",
    "Windows",
    "macOS",
    "Linux",
    "path-shim",
    "guard",
  ];
  for (const needle of needles) assert.ok(text.includes(needle), `The git guard names ${needle}`);
});

test("the README says what the guard does not cover", () => {
  const text = guardSubsection();
  assert.match(text, /alias/i);
  assert.match(text, /resume|restart/i);
  assert.match(text, /plugin\.json/);
});

test("CHANGELOG.md lists the git guard under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /git guard/i);
  assert.match(unreleased, /guard.{0,40}(field|descriptor)|(field|descriptor).{0,40}guard/i);
});

test("the smoke test has written steps for the guard, on the three systems and the real host", () => {
  const smoke = read("test/smoke/README.md");
  const start = smoke.indexOf("\n## Git guard");
  assert.ok(start !== -1, "the smoke test has a 'Git guard' section");
  const rest = smoke.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  const section = next === -1 ? rest : rest.slice(0, next);
  for (const needle of ["0.10.1", "Windows", "macOS", "Linux", "MWP_ROLE", "git push", "git checkout", "git commit", "[mwp-smoke]", "guard/git-guard.mjs", "Written, not run"]) {
    assert.ok(section.includes(needle), `the Git guard section names ${needle}`);
  }
  assert.ok(smoke.indexOf("\n## Results") > start, "Results stays the last section");
});
