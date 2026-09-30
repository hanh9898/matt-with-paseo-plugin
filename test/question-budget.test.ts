import assert from "node:assert/strict";
import { test } from "node:test";
import { BUDGET_ENV, budgetOf, dayOf } from "../shared/question-budget.ts";

test("the setting is the environment variable MWP_QUESTION_BUDGET", () => {
  assert.equal(BUDGET_ENV, "MWP_QUESTION_BUDGET");
});

const CASES: { name: string; value: string | undefined; budget: number | null }[] = [
  { name: "absent means no budget", value: undefined, budget: null },
  { name: "empty means no budget", value: " ", budget: null },
  { name: "a whole number is the budget", value: "12", budget: 12 },
  { name: "spaces around it are ignored", value: " 5 ", budget: 5 },
  { name: "zero is not a budget", value: "0", budget: null },
  { name: "a negative number is not a budget", value: "-3", budget: null },
  { name: "a fraction is not a budget", value: "2.5", budget: null },
  { name: "words are not a budget", value: "many", budget: null },
  { name: "an exponent is not a budget", value: "1e2", budget: null },
];

for (const { name, value, budget } of CASES) {
  test(`budgetOf: ${name}`, () => {
    assert.equal(budgetOf(value === undefined ? {} : { [BUDGET_ENV]: value }), budget);
  });
}

test("dayOf is the day in local time, so a late evening stays on its day", () => {
  assert.equal(dayOf(new Date(2026, 8, 30, 23, 59)), "2026-09-30");
  assert.equal(dayOf(new Date(2026, 9, 1, 0, 1)), "2026-10-01");
  assert.equal(dayOf(new Date(2026, 0, 5, 12)), "2026-01-05");
});
