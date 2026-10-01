import assert from "node:assert/strict";
import { test } from "node:test";
import { readDelegation } from "../shared/delegation.ts";

const table = (rows: string[]) => ["# Repo", "", "## Delegation", "", "| Rule | Value |", "|---|---|", ...rows, ""].join("\n");

/** Each case is a document and what the reader makes of it; a table the plugin cannot read means it answers nothing. */
const CASES: { name: string; text: string; expected: ReturnType<typeof readDelegation> }[] = [
  {
    name: "a full table at level 2",
    text: table(["| Level | 2 |", "| Questions the orchestrator may decide | two-way, costly |", "| Appetite | 20 USD |"]),
    expected: { level: 2, levelFrom: "Level", decide: ["two-way", "costly"], appetite: "20 USD" },
  },
  {
    name: "no Delegation heading",
    text: "# Repo\n\n## Other\n\n| Rule | Value |\n|---|---|\n| Switch | on |\n",
    expected: null,
  },
  { name: "an empty document", text: "", expected: null },
  {
    name: "a Level row of 1",
    text: table(["| Level | 1 |", "| Questions the orchestrator may decide | two-way |"]),
    expected: { level: 1, levelFrom: "Level", decide: ["two-way"], appetite: null },
  },
  {
    name: "a Level row of 3 keeps one-way when the row lists it",
    text: table(["| Level | 3 |", "| Questions the orchestrator may decide | two-way, costly, one-way |"]),
    expected: { level: 3, levelFrom: "Level", decide: ["two-way", "costly", "one-way"], appetite: null },
  },
  {
    name: "a Level row of 3 without one-way in the row leaves one-way out",
    text: table(["| Level | 3 |", "| Questions the orchestrator may decide | two-way, costly |"]),
    expected: { level: 3, levelFrom: "Level", decide: ["two-way", "costly"], appetite: null },
  },
  {
    name: "a Level row of 4 is level 1 and does not fall back to Switch",
    text: table(["| Level | 4 |", "| Switch | on |", "| Questions the orchestrator may decide | two-way |"]),
    expected: { level: 1, levelFrom: "Level", decide: ["two-way"], appetite: null },
  },
  {
    name: "a Level row that is not a number is level 1",
    text: table(["| Level | high |"]),
    expected: { level: 1, levelFrom: "Level", decide: [], appetite: null },
  },
  {
    name: "a Level row wins over Switch off",
    text: table(["| Level | 3 |", "| Switch | off |", "| Questions the orchestrator may decide | two-way |"]),
    expected: { level: 3, levelFrom: "Level", decide: ["two-way"], appetite: null },
  },
  {
    name: "a Level row wins over Switch on",
    text: table(["| Level | 1 |", "| Switch | on |"]),
    expected: { level: 1, levelFrom: "Level", decide: [], appetite: null },
  },
  {
    name: "Switch on with no Level row is level 2",
    text: table(["| Switch | on |", "| Questions the orchestrator may decide | two-way |"]),
    expected: { level: 2, levelFrom: "Switch", decide: ["two-way"], appetite: null },
  },
  {
    name: "Switch off with no Level row is level 1",
    text: table(["| Switch | off |", "| Questions the orchestrator may decide | two-way |"]),
    expected: { level: 1, levelFrom: "Switch", decide: ["two-way"], appetite: null },
  },
  {
    name: "a Switch value that is neither on nor off is level 1",
    text: table(["| Switch | maybe |", "| Questions the orchestrator may decide | two-way |"]),
    expected: { level: 1, levelFrom: "Switch", decide: ["two-way"], appetite: null },
  },
  {
    name: "neither row is level 1 by default",
    text: table(["| Questions the orchestrator may decide | two-way |"]),
    expected: { level: 1, levelFrom: "default", decide: ["two-way"], appetite: null },
  },
  {
    name: "keys and values are trimmed and keys ignore case",
    text: table(["|  switch  |  ON  |", "| QUESTIONS THE ORCHESTRATOR MAY DECIDE |  Two-Way ;  costly  |"]),
    expected: { level: 2, levelFrom: "Switch", decide: ["two-way", "costly"], appetite: null },
  },
  {
    name: "a Level value is trimmed",
    text: table(["|  LEVEL  |   3   |"]),
    expected: { level: 3, levelFrom: "Level", decide: [], appetite: null },
  },
  {
    name: "one-way is not decidable below level 3, even when listed",
    text: table(["| Level | 2 |", "| Questions the orchestrator may decide | one-way, two-way, anything |"]),
    expected: { level: 2, levelFrom: "Level", decide: ["two-way"], appetite: null },
  },
  {
    name: "unknown words are never decidable at level 3",
    text: table(["| Level | 3 |", "| Questions the orchestrator may decide | one-way, anything |"]),
    expected: { level: 3, levelFrom: "Level", decide: ["one-way"], appetite: null },
  },
  {
    name: "an empty decide value decides nothing",
    text: table(["| Questions the orchestrator may decide |  |"]),
    expected: { level: 1, levelFrom: "default", decide: [], appetite: null },
  },
  {
    name: "the section ends at the next heading",
    text: `${table(["| Switch | on |"])}\n## Later\n\n| Rule | Value |\n|---|---|\n| Appetite | 99 USD |\n`,
    expected: { level: 2, levelFrom: "Switch", decide: [], appetite: null },
  },
  {
    name: "the first row of a key wins",
    text: table(["| Appetite | 5 USD |", "| Appetite | 50 USD |"]),
    expected: { level: 1, levelFrom: "default", decide: [], appetite: "5 USD" },
  },
  {
    name: "the first Level row wins",
    text: table(["| Level | 2 |", "| Level | 3 |"]),
    expected: { level: 2, levelFrom: "Level", decide: [], appetite: null },
  },
  {
    name: "the daily question budget is not read from the table",
    text: table(["| Question budget | 12 |"]),
    expected: { level: 1, levelFrom: "default", decide: [], appetite: null },
  },
];

for (const { name, text, expected } of CASES) {
  test(`readDelegation: ${name}`, () => {
    assert.deepEqual(readDelegation(text), expected);
  });
}
