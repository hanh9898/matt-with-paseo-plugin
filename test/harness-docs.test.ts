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

function subsection(heading: string): string {
  const section = developmentSection();
  const start = section.indexOf(`\n### ${heading}`);
  assert.ok(start !== -1, `the Development section has a ### ${heading} heading`);
  const rest = section.slice(start + 1);
  const next = rest.indexOf("\n### ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

test("the layout table lists the descriptors, their shape and their loader", () => {
  const rows = developmentSection()
    .split("\n")
    .filter((line) => line.startsWith("| `"));
  for (const path of ["harness/", "shared/harness.ts", "server/harness.ts"]) {
    assert.ok(rows.some((row) => row.startsWith(`| \`${path}\``)), `layout table has a row for ${path}`);
  }
});

test("the README says how an agent and how a field is added", () => {
  const text = subsection("Harness descriptors");
  for (const needle of ["harness/<agent>.json", "HARNESS_FIELDS", "loadHarnesses", "test/harness-contract.test.ts"]) {
    assert.ok(text.includes(needle), `Harness descriptors names ${needle}`);
  }
});

test("the README names each field and the values a field takes", () => {
  const text = subsection("Harness descriptors");
  for (const needle of ["configDirVar", "skillsDir", "skills", "mcpDelivery", "native", "provisioned", "agent-config", "config-file"]) {
    assert.ok(text.includes(needle), `Harness descriptors names ${needle}`);
  }
});

test("the README says where the descriptors are read at run time, and why", () => {
  const text = subsection("Harness descriptors");
  assert.match(text, /`files`/);
  assert.match(text, /import\.meta\.url/);
});

test("package.json ships harness/ with the plugin, after the folders Paseo loads", () => {
  const manifest: unknown = JSON.parse(read("package.json"));
  assert.ok(typeof manifest === "object" && manifest !== null && "files" in manifest);
  const files = manifest.files;
  assert.ok(Array.isArray(files));
  assert.deepEqual(files.slice(-2), ["shared/", "harness/"]);
});

test("CHANGELOG.md lists the harness descriptors under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /harness descriptor/i);
});
