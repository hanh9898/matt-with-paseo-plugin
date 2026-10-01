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
  // A heading-like line inside a fenced example (a sample `## Delegation` table) does not end the section.
  let fenced = false;
  const rest = text
    .slice(start + heading.length)
    .split("\n")
    .map((line) => {
      if (line.startsWith("```")) fenced = !fenced;
      return fenced && /^#{1,3} /.test(line) ? ` ${line}` : line;
    })
    .join("\n");
  return rest.split(/\n#{1,3} /, 1)[0] ?? "";
}

test("the contract says which rows the plugin reads, where, and what it never answers", () => {
  const reads = section(read("docs/contract.md"), "## What the plugin reads from the delegation table");
  assert.match(reads, /`AGENTS\.md`/, "names the file that holds the table");
  assert.match(reads, /`Switch`/);
  assert.match(reads, /`Questions the orchestrator may decide`/);
  assert.match(reads, /`Appetite`/);
  assert.match(reads, /`one-way`/, "a one-way door is never listed as decidable");
  assert.match(reads, /`Yours:`/, "a question with a Yours line is never answered");
});

test("the smoke test has a delegated-answers part with the answer, the leave and the one-way cases", () => {
  const smoke = section(read("test/smoke/README.md"), "## Delegated answers");
  assert.match(smoke, /Written, not run/);
  assert.match(smoke, /Door: two-way/);
  assert.match(smoke, /Yours:/);
  assert.match(smoke, /Door: one-way/);
  assert.match(smoke, /Switch \| off/);
});

/** The cells of every row of the Markdown tables in a text, the separator rows left out. */
function tableRows(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^[-: ]*$/.test(cell)));
}

test("the contract reads the `Level` row, resolves it in a table, keeps `Switch` as a mapping and shows both example tables", () => {
  const reads = section(read("docs/contract.md"), "## What the plugin reads from the delegation table");
  assert.match(reads, /`Level`/);
  const rows = tableRows(reads);
  const header = rows.find((cells) => cells[0] === "The table holds");
  assert.deepEqual(header, ["The table holds", "Level", "`levelFrom`"]);
  const resolved = rows.slice(rows.indexOf(header ?? []) + 1, rows.indexOf(header ?? []) + 7).map((cells) => cells.slice(1).join(" / "));
  assert.deepEqual(resolved, ["that value / `Level`", "1 / `Level`", "2 / `Switch`", "1 / `Switch`", "1 / `default`", "1 (the handler reads a missing table as level 1) / none"]);
  assert.ok(rows.some((cells) => cells[0] === "Level" && cells[1] === "2"), "the level 2 example table");
  assert.ok(rows.some((cells) => cells[0] === "Level" && cells[1] === "3"), "the level 3 example table");
  assert.ok(rows.some((cells) => cells[0] === "Questions the orchestrator may decide" && cells[1] === "two-way, costly, one-way"), "the level 3 example lists one-way");
  assert.match(reads, /\*\*Doors per level\.\*\*/);
});

test("the contract's `Yours:` mark is never answered below level 3 and a question with no recommendation is never answered", () => {
  const marks = section(read("docs/contract.md"), "## Checkpoint marks");
  const yours = tableRows(marks).find((cells) => cells[0] === "One of the user's five");
  assert.ok(yours?.[1]?.includes("below level 3"), "the Yours row says below level 3");
  const recommendation = tableRows(marks).find((cells) => cells[0] === "Recommendation");
  assert.ok(recommendation?.[1]?.includes("the plugin never answers it"));
});

test("the decision log's `Grounds:` column names the level and where it was read", () => {
  const log = section(read("docs/contract.md"), "## The decision log");
  const answered = tableRows(log).find((cells) => cells[0] === "`delegated answer`");
  const left = tableRows(log).find((cells) => cells[0] === "`left to the user`");
  for (const cells of [answered, left]) {
    assert.ok(cells?.[2]?.includes("the level"), `${cells?.[0]}: grounds name the level`);
    assert.ok(cells?.[2]?.includes("`level"), `${cells?.[0]}: grounds give an example`);
  }
});

test("the README names the three levels and the smoke test has a level 3 step beside `Level | 2`", () => {
  const readme = read("README.md");
  for (const level of ["Level 1", "Level 2", "Level 3"]) assert.ok(readme.includes(`**${level}**`), `${level} in the README`);
  const smoke = section(read("test/smoke/README.md"), "## Delegated answers");
  assert.match(smoke, /Level \| 2/);
  assert.match(smoke, /Level \| 3/);
  assert.doesNotMatch(smoke, /Switch \| on/);
});

test("CHANGELOG.md lists delegated answers under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  assert.match(changelog.slice(changelog.indexOf("## [Unreleased]")), /[Dd]elegated answers/);
});
