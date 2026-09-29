import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function relaySection(): string {
  const readme = read("README.md");
  const start = readme.indexOf("### The lifecycle relay");
  assert.ok(start !== -1, "the README has a 'The lifecycle relay' subsection");
  return readme.slice(start).split("\n### ", 2)[0] ?? "";
}

test("the README says every message ends with a `Next:` line and where combine keeps it", () => {
  const relay = relaySection();
  assert.match(relay, /`Next:` line/);
  assert.match(relay, /combine/);
  assert.match(relay, /git guard/i);
});

test("CHANGELOG.md lists the `Next:` line under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /`Next:` line/);
});

test("the smoke test checks the `Next:` line of a relay message, a held one and the guard's refusal", () => {
  const smoke = read("test/smoke/README.md");
  const relay = smoke.slice(smoke.indexOf("## Lifecycle relay")).split("\n## ", 2)[0] ?? "";
  assert.match(relay, /`Next:` line/, "the relay steps read it");
  const guard = smoke.slice(smoke.indexOf("## Git guard")).split("\n## ", 2)[0] ?? "";
  assert.match(guard, /`Next:` line/, "the guard steps read it");
});
