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

test("the layout table lists the relay and the messages module", () => {
  const rows = developmentSection().split("\n").filter((line) => line.startsWith("| `"));
  for (const path of ["server/hooks/lifecycle-relay.ts", "server/messages.ts"]) {
    assert.ok(rows.some((row) => row.startsWith(`| \`${path}\``)), `layout table has a row for ${path}`);
  }
});

test("the README says what the relay sends, to whom, and how an agent is recognised", () => {
  const section = developmentSection();
  const start = section.indexOf("### The lifecycle relay");
  assert.ok(start !== -1, "the Development section has a 'The lifecycle relay' subsection");
  const relay = section.slice(start).split("\n### ", 2)[0] ?? "";
  const needles = [
    "agent.turn_ended",
    "agent.permission_requested",
    "agent.created",
    "agent.archived",
    "parentAgentId",
    "wave",
    "ticket",
    "isRunning",
    "server/messages.ts",
  ];
  for (const needle of needles) assert.ok(relay.includes(needle), `the subsection names ${needle}`);
});

test("CHANGELOG.md lists the lifecycle relay under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /lifecycle relay/i);
});

test("the smoke test has steps that prove the relay on a real host", () => {
  const smoke = read("test/smoke/README.md");
  const start = smoke.indexOf("## Lifecycle relay");
  assert.ok(start !== -1, "the smoke test has a 'Lifecycle relay' section");
  const steps = smoke.slice(start).split("\n## ", 2)[0] ?? "";
  for (const needle of ["0.10.1", "no heartbeat", "wave", "ticket", "turn_ended", "permission", "orchestrator"]) {
    assert.ok(steps.includes(needle), `the relay steps name ${needle}`);
  }
});
