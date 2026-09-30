import assert from "node:assert/strict";
import { test } from "node:test";
import { readDelegation } from "../shared/delegation.ts";

const table = (rows: string[]) => ["# Repo", "", "## Delegation", "", "| Rule | Value |", "|---|---|", ...rows, ""].join("\n");

/** Each case is a document and what the reader makes of it; a table the plugin cannot read means it answers nothing. */
const CASES: { name: string; text: string; expected: ReturnType<typeof readDelegation> }[] = [
  {
    name: "a full table",
    text: table(["| Switch | on |", "| Questions the orchestrator may decide | two-way, costly |", "| Appetite | 20 USD |"]),
    expected: { on: true, decide: ["two-way", "costly"], appetite: "20 USD" },
  },
  {
    name: "no Delegation heading",
    text: "# Repo\n\n## Other\n\n| Rule | Value |\n|---|---|\n| Switch | on |\n",
    expected: null,
  },
  { name: "an empty document", text: "", expected: null },
  {
    name: "the switch row absent means on",
    text: table(["| Questions the orchestrator may decide | two-way |"]),
    expected: { on: true, decide: ["two-way"], appetite: null },
  },
  {
    name: "the switch off",
    text: table(["| Switch | off |", "| Questions the orchestrator may decide | two-way |"]),
    expected: { on: false, decide: ["two-way"], appetite: null },
  },
  {
    name: "a switch value that is neither on nor off reads as off",
    text: table(["| Switch | maybe |", "| Questions the orchestrator may decide | two-way |"]),
    expected: { on: false, decide: ["two-way"], appetite: null },
  },
  {
    name: "keys and values are trimmed and keys ignore case",
    text: table(["|  switch  |  ON  |", "| QUESTIONS THE ORCHESTRATOR MAY DECIDE |  Two-Way ;  costly  |"]),
    expected: { on: true, decide: ["two-way", "costly"], appetite: null },
  },
  {
    name: "one-way and unknown words are never decidable",
    text: table(["| Questions the orchestrator may decide | one-way, two-way, anything |"]),
    expected: { on: true, decide: ["two-way"], appetite: null },
  },
  {
    name: "an empty decide value decides nothing",
    text: table(["| Questions the orchestrator may decide |  |"]),
    expected: { on: true, decide: [], appetite: null },
  },
  {
    name: "the section ends at the next heading",
    text: `${table(["| Switch | on |"])}\n## Later\n\n| Rule | Value |\n|---|---|\n| Appetite | 99 USD |\n`,
    expected: { on: true, decide: [], appetite: null },
  },
  {
    name: "the first row of a key wins",
    text: table(["| Appetite | 5 USD |", "| Appetite | 50 USD |"]),
    expected: { on: true, decide: [], appetite: "5 USD" },
  },
  {
    name: "the daily question budget is not read from the table",
    text: table(["| Question budget | 12 |"]),
    expected: { on: true, decide: [], appetite: null },
  },
];

for (const { name, text, expected } of CASES) {
  test(`readDelegation: ${name}`, () => {
    assert.deepEqual(readDelegation(text), expected);
  });
}
