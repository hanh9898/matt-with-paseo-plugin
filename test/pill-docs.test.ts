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

test("the layout table lists the pill's modules and the client entry", () => {
  const rows = developmentSection().split("\n").filter((line) => line.startsWith("| `"));
  for (const path of [
    "index.client.ts",
    "client/",
    "client/pill-text.ts",
    "client/waiting-pill.ts",
    "shared/waiting.ts",
    "server/hooks/waiting-count.ts",
  ]) {
    assert.ok(rows.some((row) => row.startsWith(`| \`${path}\``)), `layout table has a row for ${path}`);
  }
});

test("the README says what the pill counts, where its count comes from and where its words live", () => {
  const section = developmentSection();
  const start = section.indexOf("### The waiting pill");
  assert.ok(start !== -1, "the Development section has a 'The waiting pill' subsection");
  const pill = section.slice(start).split("\n### ", 2)[0] ?? "";
  for (const needle of [
    "agent.permission_requested",
    "agent.permission_resolved",
    "parentAgentId",
    "stream",
    "wave",
    "ticket",
    "waiting.count",
    "client/pill-text.ts",
    "AskUserQuestion",
    "ADR 0001",
  ]) {
    assert.ok(pill.includes(needle), `the subsection names ${needle}`);
  }
});

test("the host port section names the two additions", () => {
  const section = developmentSection();
  for (const name of ["onPermissionResolved", "serveWaitingCount"]) {
    assert.ok(section.includes(name), `the host port section names ${name}`);
  }
});

test("the README and the smoke steps leave the pill's own words to client/pill-text.ts", () => {
  for (const name of ["README.md", "test/smoke/README.md"]) {
    assert.doesNotMatch(read(name), /`(?:<n>|\d+) waiting`/, `${name} writes the pill's label`);
  }
});

test("CHANGELOG.md lists the composer pill under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /composer pill/i);
});

test("the smoke test has steps that open and settle a checkpoint and take the pill's screenshots", () => {
  const smoke = read("test/smoke/README.md");
  const start = smoke.indexOf("## Waiting pill");
  assert.ok(start !== -1, "the smoke test has a 'Waiting pill' section");
  const steps = smoke.slice(start).split("\n## ", 2)[0] ?? "";
  for (const needle of ["0.10.1", "stream=", "wave=", "ticket=", "AskUserQuestion", "first view", "scrolled", "narrow"]) {
    assert.ok(steps.includes(needle), `the pill steps name ${needle}`);
  }
});
