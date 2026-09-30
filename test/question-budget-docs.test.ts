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

test("the contract lists the question budget spent message and where the budget is read", () => {
  const contract = read("docs/contract.md");
  const row = section(contract, "### Question budget spent");
  assert.match(row, /Type: `questionBudgetSpent`/);
  assert.match(row, /Lead: `Question budget spent`/);
  assert.match(row, /Next: /);
  assert.match(contract, /`MWP_QUESTION_BUDGET`/);
  assert.match(contract, /one message a day/i);
});

test("the smoke test has a question budget part: the count, the one message, the pill and the questions still reaching the user", () => {
  const smoke = section(read("test/smoke/README.md"), "## Question budget");
  assert.match(smoke, /Written, not run/);
  assert.match(smoke, /MWP_QUESTION_BUDGET/);
  assert.match(smoke, /Question budget spent:/);
  assert.match(smoke, /pill/i);
  assert.match(smoke, /reload/i);
  assert.match(smoke, /still reach/i);
});

test("the README names the setting, the record and the checks, and inventories the budget's state", () => {
  const readme = read("README.md");
  const words = section(readme, "### The question budget");
  for (const needle of ["MWP_QUESTION_BUDGET", "question-budget.json", "test/hooks/question-budget.test.ts", "test/question-budget-docs.test.ts", "local time"]) {
    assert.ok(words.includes(needle), `the subsection names ${needle}`);
  }
  assert.match(readme, /\| `server\/question-budget\.ts` \|/);
  assert.match(readme, /\| `shared\/question-budget\.ts` \|/);
  assert.match(readme, /\| `server\/question-budget\.ts` \| [^|]*\| `question-budget\.json` under the state directory \|/);
});

test("the changelog has a line for the question budget, and the entry registers it", () => {
  assert.match(read("CHANGELOG.md"), /Question budget:.*MWP_QUESTION_BUDGET/);
  const entry = read("index.server.ts");
  assert.match(entry, /registerQuestionBudget\(hooks\)/);
  assert.match(entry, /left: /);
});
