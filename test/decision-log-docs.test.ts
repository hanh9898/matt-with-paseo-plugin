import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  assert.ok(start !== -1, `a "${heading}" heading exists`);
  return text.slice(start + heading.length + 2).split(/\n## /, 1)[0] ?? "";
}

test("the contract has a decision log section naming both files, the kinds and the list", () => {
  const log = section(read("docs/contract.md"), "## The decision log");
  for (const name of ["`decision-log.jsonl`", "`decision-log.md`", "`delegated answer`", "`left to the user`", "`withoutEvidence`", "`requestId`"]) {
    assert.ok(log.includes(name), `the section names ${name}`);
  }
  assert.ok(log.includes("## Decided without evidence"), "the section names the reading list");
  assert.ok(!log.split("\n").some((line) => line.startsWith("## Pending")), "the section has no pending heading");
});

test("the README lists the decision log module in the layout table, the state inventory and the delegated-answers section", () => {
  const readme = read("README.md");
  const rows = readme.split("\n").filter((line) => line.startsWith("| `server/decision-log.ts`"));
  assert.equal(rows.length, 2, "one row in the layout table, one in the state inventory");
  assert.ok(rows.some((row) => row.includes("`decision-log.jsonl`") && row.includes("`decision-log.md`")), "the state row names both files");
  assert.ok(section(readme, "### Delegated answers").includes("`decision-log.md`"), "the delegated-answers section names the log file");
});
