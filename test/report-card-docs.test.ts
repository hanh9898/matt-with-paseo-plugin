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

test("the smoke test has a report card part that ends with a screenshot of the card in Paseo's window", () => {
  const smoke = section(read("test/smoke/README.md"), "## Report card");
  assert.match(smoke, /Written, not run/);
  assert.match(smoke, /screenshot/i);
  assert.match(smoke, /Paseo's window/);
  assert.match(smoke, /decided/i);
  assert.match(smoke, /partial/i);
  assert.match(smoke, /question/i);
  assert.match(smoke, /no button/i);
  assert.match(smoke, /same row|one row/i);
});

test("the README lays out the report card module and says the card has no buttons", () => {
  const readme = read("README.md");
  assert.match(readme, /`server\/report-card\.ts`/);
  assert.match(readme, /### The report card/);
  assert.match(section(readme, "### The report card"), /no buttons/i);
  assert.doesNotMatch(readme, /no report card exists in this repository yet/);
});

test("CHANGELOG.md lists the report card under Unreleased", () => {
  const unreleased = section(read("CHANGELOG.md"), "## [Unreleased]");
  assert.match(unreleased, /[Rr]eport card/);
});
