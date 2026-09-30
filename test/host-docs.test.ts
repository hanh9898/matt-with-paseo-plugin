import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

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

test("the README's Development section says how a handler takes the port", () => {
  const section = developmentSection();
  for (const needle of ["server/host.ts", "server/paseo-host.ts", "server/hooks/", "HostHooks", "(event, host)"]) {
    assert.ok(section.includes(needle), `Development section names ${needle}`);
  }
});

test("the README's Development section says how a test swaps in the fake", () => {
  const section = developmentSection();
  for (const needle of ["test/support/fake-host.ts", "FakeHost", "test/hooks/"]) {
    assert.ok(section.includes(needle), `Development section names ${needle}`);
  }
});

test("the layout table lists the port, the adapter and the fake", () => {
  const section = developmentSection();
  const rows = section.split("\n").filter((line) => line.startsWith("| `"));
  for (const path of ["server/host.ts", "server/paseo-host.ts", "test/support/fake-host.ts"]) {
    assert.ok(rows.some((row) => row.startsWith(`| \`${path}\``)), `layout table has a row for ${path}`);
  }
});

test("CHANGELOG.md lists the host port under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /host port/i);
});
