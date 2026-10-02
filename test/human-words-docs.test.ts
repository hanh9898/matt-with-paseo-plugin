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

test("the layout table lists the module that finds the user's messages", () => {
  const rows = developmentSection().split("\n").filter((line) => line.startsWith("| `"));
  assert.ok(rows.some((row) => row.startsWith("| `server/human-words.ts`")), "layout table has a row for server/human-words.ts");
});

test("the README says how the user's words are told from the orchestrator's prompts, and what is left to the skills", () => {
  const section = developmentSection();
  const start = section.indexOf("### Human words");
  assert.ok(start !== -1, "the Development section has a 'Human words' subsection");
  const words = section.slice(start).split("\n### ", 2)[0] ?? "";
  for (const needle of [
    "clientMessageId",
    "send_agent_prompt",
    "agent.turn_ended",
    "messageId",
    "get_agent_activity",
    "hanh9898/matt-with-paseo",
    "server/human-words.ts",
    "0.10.1",
  ]) {
    assert.ok(words.includes(needle), `the subsection names ${needle}`);
  }
});

test("CHANGELOG.md lists the human words relay under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /human words/i);
});

test("the smoke test has steps that prove on a real host how a person's message is told from a prompt", () => {
  const smoke = read("test/smoke/README.md");
  const start = smoke.indexOf("## Human words");
  assert.ok(start !== -1, "the smoke test has a 'Human words' section");
  const steps = smoke.slice(start).split("\n## ", 2)[0] ?? "";
  for (const needle of ["0.10.1", "clientMessageId", "send_agent_prompt", "create_agent", "turn_ended", "whole", "orchestrator", "typed"]) {
    assert.ok(steps.includes(needle), `the human words steps name ${needle}`);
  }
});
