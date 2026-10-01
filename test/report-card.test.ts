import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { decisionLogPath } from "../server/decision-log.ts";
import { parseEntries } from "../server/delegated-answers.ts";
import { createReportCard, reportCardRow } from "../server/report-card.ts";
import { REPORT_CARD } from "../shared/contract.ts";

const LOG = join("C:", "state", "decision-log.md");
const STATE = "C:\\Users\\HBLAB_OPMS\\AppData\\Local\\Temp\\plugin-decision-log-56-state";

const decided = [
  { stream: "demo", agent: "tkt-7", header: "Colour", answer: "Red (Recommended)", at: "2026-09-30T10:00:00.000Z" },
  { stream: "demo", agent: "tkt-8", header: "Size", answer: "Small (Recommended)", at: "2026-09-30T10:05:00.000Z" },
];

const keys = (value: unknown) => Object.keys(value as object).sort();
const sorted = (list: readonly string[]) => [...list].sort();

test("the row has the kind, version and row id the contract fixes, and exactly the contract's fields", () => {
  const row = reportCardRow({ decided, spend: { totalUsd: 1.25, appetiteUsd: 5, partial: false, notified: false }, log: LOG, questions: { count: 3, budget: 10 } });
  assert.equal(row.kind, REPORT_CARD.kind);
  assert.equal(row.version, REPORT_CARD.version);
  assert.equal(row.id, REPORT_CARD.id);
  assert.deepEqual(keys(row.data), sorted(REPORT_CARD.fields));
});

test("the row lists each decision made on the user's behalf with the header, the answer and the time, and no stream or agent id", () => {
  const row = reportCardRow({ decided, spend: undefined, log: LOG, questions: { count: 0, budget: null } });
  const list = (row.data as { decided: unknown[] }).decided;
  assert.equal(list.length, 2);
  for (const one of list) assert.deepEqual(keys(one), sorted(REPORT_CARD.decidedEntry));
  assert.deepEqual(list[0], { header: "Colour", answer: "Red (Recommended)", at: "2026-09-30T10:00:00.000Z" });
  assert.deepEqual(list[1], { header: "Size", answer: "Small (Recommended)", at: "2026-09-30T10:05:00.000Z" });
});

test("the row shows the spend against the appetite, and says when the total is partial", () => {
  const whole = reportCardRow({ decided: [], spend: { totalUsd: 1.25, appetiteUsd: 5, partial: false, notified: false }, log: LOG, questions: { count: 0, budget: null } });
  const spend = (whole.data as { spend: unknown }).spend;
  assert.deepEqual(keys(spend), sorted(REPORT_CARD.spendFields));
  assert.deepEqual(spend, { totalUsd: 1.25, appetiteUsd: 5, partial: false });

  const partial = reportCardRow({ decided: [], spend: { totalUsd: 0.5, appetiteUsd: null, partial: true, notified: false }, log: LOG, questions: { count: 0, budget: null } });
  assert.deepEqual((partial.data as { spend: unknown }).spend, { totalUsd: 0.5, appetiteUsd: null, partial: true });
});

test("a stream with no spend yet shows zero, not partial and no appetite", () => {
  const row = reportCardRow({ decided: [], spend: undefined, log: LOG, questions: { count: 0, budget: null } });
  assert.deepEqual((row.data as { spend: unknown }).spend, { totalUsd: 0, appetiteUsd: null, partial: false });
});

test("the row shows the day's question count against the budget, and no budget as null", () => {
  const set = reportCardRow({ decided: [], spend: undefined, log: LOG, questions: { count: 4, budget: 10 } });
  const questions = (set.data as { questions: unknown }).questions;
  assert.deepEqual(keys(questions), sorted(REPORT_CARD.questionsFields));
  assert.deepEqual(questions, { count: 4, budget: 10 });
  const none = reportCardRow({ decided: [], spend: undefined, log: LOG, questions: { count: 4, budget: null } });
  assert.deepEqual((none.data as { questions: unknown }).questions, { count: 4, budget: null });
});

test("the row has no buttons: no action, button or callback key anywhere in it", () => {
  const row = reportCardRow({ decided, spend: { totalUsd: 1, appetiteUsd: 2, partial: true, notified: false }, log: LOG, questions: { count: 1, budget: 2 } });
  assert.equal(REPORT_CARD.buttons, "none");
  const text = JSON.stringify(row);
  assert.doesNotMatch(text, /button|action|rpc|onPress|callback/i);
  assert.deepEqual(JSON.parse(text), row, "the row is plain JSON, so Paseo can hold it");
});

const many = (count: number, size: number) =>
  Array.from({ length: count }, (_, index) => ({
    stream: "demo",
    agent: "tkt-7",
    header: `H${index}`.padEnd(size, "h"),
    answer: `A${index}`.padEnd(size, "a"),
    at: "2026-09-30T10:00:00.000Z",
  }));
const dataOf = (row: { data: unknown }) => row.data as { decided: { header: string; answer: string }[]; decidedCount: number; log: string };

test("the row carries the log path as given, and decidedCount is the total", () => {
  const data = dataOf(reportCardRow({ decided, spend: undefined, log: LOG, questions: { count: 0, budget: null } }));
  assert.equal(data.log, LOG);
  assert.equal(data.decidedCount, 2);
});

test("with 3 answers the card lists all 3 and decidedCount is 3", () => {
  const data = dataOf(reportCardRow({ decided: many(3, 10), spend: undefined, log: LOG, questions: { count: 0, budget: null } }));
  assert.equal(data.decided.length, 3);
  assert.equal(data.decidedCount, 3);
});

test("with 1,000 answers of 1,000 characters the row holds the latest 20, oldest first, and serialises under 64 KiB", () => {
  const row = reportCardRow({ decided: many(1000, 1000), spend: undefined, log: LOG, questions: { count: 0, budget: null } });
  const data = dataOf(row);
  assert.equal(data.decided.length, 20);
  assert.equal(data.decidedCount, 1000);
  assert.ok(data.decided[0]?.header.startsWith("H980"), "the latest 20 are 980 to 999");
  assert.ok(data.decided[19]?.header.startsWith("H999"));
  assert.ok(Buffer.byteLength(JSON.stringify(row.data), "utf8") < 64 * 1024);
});

test("a header or answer over 200 characters is cut to 200 ending with an ellipsis, and one of 200 is kept whole", () => {
  const [cut] = dataOf(reportCardRow({ decided: many(1, 1000), spend: undefined, log: LOG, questions: { count: 0, budget: null } })).decided;
  assert.equal(cut?.header.length, 200);
  assert.ok(cut?.header.endsWith("…"));
  assert.equal(cut?.answer.length, 200);
  assert.ok(cut?.answer.endsWith("…"));
  const [whole] = dataOf(reportCardRow({ decided: many(1, 200), spend: undefined, log: LOG, questions: { count: 0, budget: null } })).decided;
  assert.equal(whole?.header.length, 200);
  assert.ok(!whole?.header.endsWith("…"));
});

test("the cap holds in bytes for multi-byte text", () => {
  const wide = many(1000, 1000).map((one) => ({ ...one, header: "é".repeat(1000), answer: "日".repeat(1000) }));
  const row = reportCardRow({ decided: wide, spend: undefined, log: LOG, questions: { count: 0, budget: null } });
  assert.ok(Buffer.byteLength(JSON.stringify(row.data), "utf8") < 64 * 1024);
});

test("createReportCard puts decisionLogPath(dir) on the card and never reads the log", async () => {
  const rows: { data: unknown }[] = [];
  const host = { appendTimelineRow: async (_owner: string, row: { data: unknown }) => void rows.push(row) };
  const card = createReportCard(
    { decided: () => decided, spend: () => undefined, questions: () => ({ count: 0, budget: null }) },
    { log: decisionLogPath(STATE) },
  );
  await card.refresh({ agent: { id: "stream-1", parentAgentId: null } as never, labels: { stream: "demo" } }, host as never);
  assert.equal(rows.length, 1);
  assert.equal(dataOf(rows[0] as { data: unknown }).log, join(STATE, "decision-log.md"));
});

test("createReportCard defaults the log to decisionLogPath()", async () => {
  const rows: { data: unknown }[] = [];
  const host = { appendTimelineRow: async (_owner: string, row: { data: unknown }) => void rows.push(row) };
  const card = createReportCard({ decided: () => [], spend: () => undefined, questions: () => ({ count: 0, budget: null }) });
  await card.refresh({ agent: { id: "stream-1", parentAgentId: null } as never, labels: { stream: "demo" } }, host as never);
  assert.equal(dataOf(rows[0] as { data: unknown }).log, decisionLogPath());
});

test("parseEntries reads the delegated-answers record line by line, and skips a line that is not an entry", () => {
  const good = JSON.stringify(decided[0]);
  const text = `${good}\nnot json\n{"stream":"demo"}\n[]\n\n${JSON.stringify(decided[1])}\n`;
  assert.deepEqual(parseEntries(text), decided);
  assert.deepEqual(parseEntries(null), []);
  assert.deepEqual(parseEntries(""), []);
});
