import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

test("the README has a Development section that writes down the layout", () => {
  const readme = read("README.md");
  const start = readme.indexOf("\n## Development");
  assert.ok(start !== -1, "README has a ## Development heading");
  const rest = readme.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  const section = next === -1 ? rest : rest.slice(0, next);
  for (const needle of ["index.server.ts", "server/", "shared/", "test/", "npm test", "npm run typecheck"]) {
    assert.ok(section.includes(needle), `Development section names ${needle}`);
  }
});

test("the README keeps the existing sections in order", () => {
  const headings = read("README.md")
    .split("\n")
    .filter((line) => line.startsWith("## "));
  assert.ok(headings.indexOf("## Contributing") < headings.indexOf("## Licence"));
});

test("CHANGELOG.md lists the host version range under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /requirements\.paseo/);
});
