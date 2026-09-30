import assert from "node:assert/strict";
import { test } from "node:test";
import { addTurn, isPast, parseAppetite, type Spend } from "../shared/appetite.ts";

test("parseAppetite reads a dollar amount the way the table writes it", () => {
  const cases: [string, number][] = [
    ["20 USD", 20],
    ["20usd", 20],
    ["$20", 20],
    ["$ 12.50", 12.5],
    ["USD 7", 7],
    ["15", 15],
  ];
  for (const [text, expected] of cases) assert.equal(parseAppetite(text), expected, text);
});

test("parseAppetite reads anything else as no appetite", () => {
  for (const text of [null, "", "unlimited", "20 EUR", "about 20 USD", "-5 USD", "USD", "1e3"]) {
    assert.equal(parseAppetite(text), null, String(text));
  }
});

test("addTurn adds a cost to the total and keeps the total whole", () => {
  const first = addTurn(undefined, 1.5);
  assert.deepEqual({ totalUsd: first.totalUsd, partial: first.partial }, { totalUsd: 1.5, partial: false });
  const second = addTurn(first, 2);
  assert.deepEqual({ totalUsd: second.totalUsd, partial: second.partial }, { totalUsd: 3.5, partial: false });
});

test("addTurn adds nothing for a turn with no cost and marks the total partial", () => {
  const start = addTurn(undefined, 4);
  for (const cost of [null, Number.NaN, -1]) {
    const next = addTurn(start, cost);
    assert.equal(next.totalUsd, 4);
    assert.equal(next.partial, true);
  }
  assert.equal(addTurn(addTurn(undefined, null), 3).partial, true, "a later cost does not clear the mark");
});

test("isPast is true only when the total is above a known appetite", () => {
  const spend = (totalUsd: number, appetiteUsd: number | null): Spend => ({ totalUsd, partial: false, appetiteUsd, notified: false });
  assert.equal(isPast(undefined), false);
  assert.equal(isPast(spend(9, null)), false);
  assert.equal(isPast(spend(10, 10)), false, "at the appetite is not past it");
  assert.equal(isPast(spend(10.01, 10)), true);
});
