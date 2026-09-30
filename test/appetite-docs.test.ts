import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  assert.ok(start !== -1, `a "${heading}" heading exists`);
  return text.slice(start + heading.length).split(/\n#{1,3} /, 1)[0] ?? "";
}

test("the contract lists the appetite passed message with its case for a partial total", () => {
  const passed = section(read("docs/contract.md"), "### Appetite passed");
  assert.match(passed, /Type: `appetitePassed`/);
  assert.match(passed, /Lead: `Appetite passed`/);
  assert.match(passed, /^\| passed \|/m);
  assert.match(passed, /^\| partial \|/m);
});

test("the contract says how the appetite is summed and where the total is kept", () => {
  const reads = section(read("docs/contract.md"), "## What the plugin reads from the delegation table");
  assert.match(reads, /turn end/i, "the total is summed at a turn end");
  assert.match(reads, /`totalCostUsd`/);
  assert.match(reads, /`stream-spend\.json`/, "the total is kept outside the repository");
  assert.doesNotMatch(reads, /until #40/, "the appetite is wired");
});

test("the smoke test has an appetite part with the pass, the partial and the after cases", () => {
  const smoke = section(read("test/smoke/README.md"), "## Appetite");
  assert.match(smoke, /Written, not run/);
  assert.match(smoke, /Appetite \| \d+ USD/);
  assert.match(smoke, /Appetite passed:/);
  assert.match(smoke, /partial/i);
  assert.match(smoke, /left to the user/);
});

test("CHANGELOG.md lists the appetite under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  assert.match(changelog.slice(changelog.indexOf("## [Unreleased]")), /[Aa]ppetite/);
});
