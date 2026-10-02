import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function section(text: string, heading: string, level: string): string {
  const start = text.indexOf(`\n${heading}`);
  assert.ok(start !== -1, `there is a '${heading.trim()}' heading`);
  const rest = text.slice(start + 1);
  const next = rest.indexOf(`\n${level} `, 1);
  return next === -1 ? rest : rest.slice(0, next);
}

function developmentSection(): string {
  return section(read("README.md"), "## Development", "##");
}

function tokenSubsection(): string {
  return section(developmentSection(), "### One version token", "###");
}

test("the layout table lists the two Claude Code manifests, the contract module and the check", () => {
  const rows = developmentSection().split("\n").filter((line) => line.startsWith("| `"));
  for (const path of [
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "shared/contract.ts",
    "test/support/version-token.ts",
  ]) {
    assert.ok(rows.some((row) => row.startsWith(`| \`${path}\``)), `layout table has a row for ${path}`);
  }
});

test("the README says where the token lives, what is checked against it and how a release moves it", () => {
  const text = tokenSubsection();
  const needles = [
    "package.json",
    "version",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "paseo-plugin.json",
    "CONTRACT_VERSION",
    "shared/contract.ts",
    "test/version-token.test.ts",
    "matt-with-paseo-plugin",
    "matt-with-paseo-plugin@matt-with-paseo-plugin",
  ];
  for (const needle of needles) assert.ok(text.includes(needle), `One version token names ${needle}`);
});

test("the README says why paseo-plugin.json enters the check by its id and not by a version", () => {
  const text = tokenSubsection();
  assert.match(text, /paseo-plugin\.json.{0,200}\bid\b/s);
  assert.match(text, /no version|takes no|does not take|cannot carry/i);
});

test("the git guard subsection no longer waits for a manifest that exists", () => {
  const text = section(developmentSection(), "### The git guard", "###");
  assert.ok(!text.includes("of ticket 16"), "the guard section does not name ticket 16's manifest as still to come");
  assert.match(text, /\.claude-plugin\/plugin\.json/);
});

test("CHANGELOG.md lists the version token under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /version token/i);
  assert.match(unreleased, /plugin\.json/);
  assert.match(unreleased, /marketplace\.json/);
});

test("the smoke test has written steps that load the Claude Code manifests, before Results", () => {
  const smoke = read("test/smoke/README.md");
  const start = smoke.indexOf("\n## Claude Code plugin");
  assert.ok(start !== -1, "the smoke test has a 'Claude Code plugin' section");
  const body = section(smoke, "## Claude Code plugin", "##");
  for (const needle of [
    "0.10.1",
    "Written, not run",
    "claude plugin validate",
    "CLAUDE_CONFIG_DIR",
    "matt-with-paseo-plugin@matt-with-paseo-plugin",
    "package.json",
    "CLAUDE.md",
  ]) {
    assert.ok(body.includes(needle), `the Claude Code plugin section names ${needle}`);
  }
  assert.ok(!body.includes("matt-with-paseo@"), "the section installs no plugin named matt-with-paseo");
  assert.ok(!body.includes("details matt-with-paseo`"), "the section reads the details of the renamed plugin");
  assert.ok(smoke.indexOf("\n## Results") > start, "Results stays the last section");
});
