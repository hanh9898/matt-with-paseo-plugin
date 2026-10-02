import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

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
  assert.match(smoke, /Questions today: 1 of 2/, "the steps read the card's own words");
});

test("the smoke test's report card screenshot shows the log line, and the README names the log line and the cap", () => {
  assert.match(section(read("test/smoke/README.md"), "## Report card"), /All decisions:/);
  const card = section(read("README.md"), "### The report card");
  assert.match(card, /`decision-log\.md`/);
  assert.match(card, /`decidedCount`/);
  assert.match(card, /64 KiB/);
});

test("the smoke test says a card drawn as an unavailable placeholder fails, since the client renderer is the card", () => {
  const smoke = section(read("test/smoke/README.md"), "## Report card");
  assert.match(smoke, /unavailable/i);
  assert.match(smoke, /renderer/i);
});

test("the README lays out the report card module and says the card has no buttons", () => {
  const readme = read("README.md");
  assert.match(readme, /`server\/report-card\.ts`/);
  assert.match(readme, /### The report card/);
  assert.match(section(readme, "### The report card"), /no buttons/i);
  assert.doesNotMatch(readme, /no report card exists in this repository yet/);
  assert.doesNotMatch(readme, /no client file of its own/);
  assert.match(section(readme, "### The report card"), /client\/report-card\.ts/);
});

test("CHANGELOG.md lists the report card under Unreleased, or under the release its lines moved to", () => {
  const changelog = read("CHANGELOG.md");
  // `[Unreleased]` and the newest release heading after it: a release moves the lines down one heading.
  const [unreleased = "", newest = ""] = changelog.slice(changelog.indexOf("## [Unreleased]")).split("\n## ", 3);
  assert.match(`${unreleased}\n${newest}`, /[Rr]eport card/);
});
