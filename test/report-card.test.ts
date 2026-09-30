import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEntries } from "../server/delegated-answers.ts";
import { reportCardRow } from "../server/report-card.ts";
import { REPORT_CARD } from "../shared/contract.ts";

const decided = [
  { stream: "demo", agent: "tkt-7", header: "Colour", answer: "Red (Recommended)", at: "2026-09-30T10:00:00.000Z" },
  { stream: "demo", agent: "tkt-8", header: "Size", answer: "Small (Recommended)", at: "2026-09-30T10:05:00.000Z" },
];

const keys = (value: unknown) => Object.keys(value as object).sort();
const sorted = (list: readonly string[]) => [...list].sort();

test("the row has the kind, version and row id the contract fixes, and exactly the contract's fields", () => {
  const row = reportCardRow({ decided, spend: { totalUsd: 1.25, appetiteUsd: 5, partial: false }, questions: { count: 3, budget: 10 } });
  assert.equal(row.kind, REPORT_CARD.kind);
  assert.equal(row.version, REPORT_CARD.version);
  assert.equal(row.id, REPORT_CARD.id);
  assert.deepEqual(keys(row.data), sorted(REPORT_CARD.fields));
});

test("the row lists each decision made on the user's behalf with the header, the answer and the time, and no stream or agent id", () => {
  const row = reportCardRow({ decided, spend: undefined, questions: { count: 0, budget: null } });
  const list = (row.data as { decided: unknown[] }).decided;
  assert.equal(list.length, 2);
  for (const one of list) assert.deepEqual(keys(one), sorted(REPORT_CARD.decidedEntry));
  assert.deepEqual(list[0], { header: "Colour", answer: "Red (Recommended)", at: "2026-09-30T10:00:00.000Z" });
  assert.deepEqual(list[1], { header: "Size", answer: "Small (Recommended)", at: "2026-09-30T10:05:00.000Z" });
});

test("the row shows the spend against the appetite, and says when the total is partial", () => {
  const whole = reportCardRow({ decided: [], spend: { totalUsd: 1.25, appetiteUsd: 5, partial: false }, questions: { count: 0, budget: null } });
  const spend = (whole.data as { spend: unknown }).spend;
  assert.deepEqual(keys(spend), sorted(REPORT_CARD.spendFields));
  assert.deepEqual(spend, { totalUsd: 1.25, appetiteUsd: 5, partial: false });

  const partial = reportCardRow({ decided: [], spend: { totalUsd: 0.5, appetiteUsd: null, partial: true }, questions: { count: 0, budget: null } });
  assert.deepEqual((partial.data as { spend: unknown }).spend, { totalUsd: 0.5, appetiteUsd: null, partial: true });
});

test("a stream with no spend yet shows zero, not partial and no appetite", () => {
  const row = reportCardRow({ decided: [], spend: undefined, questions: { count: 0, budget: null } });
  assert.deepEqual((row.data as { spend: unknown }).spend, { totalUsd: 0, appetiteUsd: null, partial: false });
});

test("the row shows the day's question count against the budget, and no budget as null", () => {
  const set = reportCardRow({ decided: [], spend: undefined, questions: { count: 4, budget: 10 } });
  const questions = (set.data as { questions: unknown }).questions;
  assert.deepEqual(keys(questions), sorted(REPORT_CARD.questionsFields));
  assert.deepEqual(questions, { count: 4, budget: 10 });
  const none = reportCardRow({ decided: [], spend: undefined, questions: { count: 4, budget: null } });
  assert.deepEqual((none.data as { questions: unknown }).questions, { count: 4, budget: null });
});

test("the row has no buttons: no action, button or callback key anywhere in it", () => {
  const row = reportCardRow({ decided, spend: { totalUsd: 1, appetiteUsd: 2, partial: true }, questions: { count: 1, budget: 2 } });
  assert.equal(REPORT_CARD.buttons, "none");
  const text = JSON.stringify(row);
  assert.doesNotMatch(text, /button|action|rpc|onPress|callback/i);
  assert.deepEqual(JSON.parse(text), row, "the row is plain JSON, so Paseo can hold it");
});

test("parseEntries reads the delegated-answers record line by line, and skips a line that is not an entry", () => {
  const good = JSON.stringify(decided[0]);
  const text = `${good}\nnot json\n{"stream":"demo"}\n[]\n\n${JSON.stringify(decided[1])}\n`;
  assert.deepEqual(parseEntries(text), decided);
  assert.deepEqual(parseEntries(null), []);
  assert.deepEqual(parseEntries(""), []);
});
