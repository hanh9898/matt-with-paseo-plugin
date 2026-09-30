import assert from "node:assert/strict";
import { test } from "node:test";
import { registerAppetite } from "../../server/appetite.ts";
import { type Entry, parseEntries, registerDelegatedAnswers } from "../../server/delegated-answers.ts";
import type { HostAgent, PermissionRequest } from "../../server/host.ts";
import { registerQuestionBudget, type BudgetRecord } from "../../server/question-budget.ts";
import { registerReportCard } from "../../server/report-card.ts";
import type { Spend } from "../../shared/appetite.ts";
import { REPORT_CARD } from "../../shared/contract.ts";
import { BUDGET_ENV, budgetOf } from "../../shared/question-budget.ts";
import { FakeHost } from "../support/fake-host.ts";

const stream: HostAgent = { id: "stream-1", workspaceId: "w0", parentAgentId: null, provider: "sample", cwd: "/repo", title: "[Stream] demo" };
const ticket: HostAgent = { ...stream, id: "tkt-7", workspaceId: "w1", parentAgentId: "stream-1", cwd: "/repo-tkt", title: "[Wave 1] 07" };
const otherStream: HostAgent = { ...stream, id: "stream-2", title: "[Stream] other" };
const stranger: HostAgent = { ...stream, id: "stranger", title: null };

const TABLE = ["## Delegation", "", "| Rule | Value |", "|---|---|", "| Questions the orchestrator may decide | two-way |", "| Appetite | 5 USD |", ""].join("\n");
const ask = (id: string, header: string, door: string): PermissionRequest => ({
  id,
  name: "AskUserQuestion",
  kind: "question",
  input: {
    questions: [
      { header, question: `Which?\nDoor: ${door}`, options: [{ label: "Yes (Recommended)", description: "" }, { label: "No", description: "" }], multiSelect: false },
    ],
  },
});
const turn = (agent: HostAgent) => ({ agent, outcome: { kind: "completed" as const }, timeline: [] });

/** A host with the appetite, the delegated answers, the budget and the card wired as `index.server.ts` wires them, over records in memory. */
function wired(env: Record<string, string> = { [BUDGET_ENV]: "10" }) {
  const fake = new FakeHost();
  const lines: Entry[] = [];
  let spends: Record<string, Spend> = {};
  let day: BudgetRecord | null = null;
  const appetite = registerAppetite(fake, { readTable: async () => TABLE, store: { read: () => spends, write: (all) => void (spends = all) } });
  const budget = registerQuestionBudget(fake, {
    env,
    now: () => new Date(2026, 8, 30, 10, 0),
    store: { load: () => (day === null ? null : { ...day }), save: (record) => void (day = { ...record }) },
  });
  const card = registerReportCard(fake, {
    decided: (name) => parseEntries(lines.map((line) => JSON.stringify(line)).join("\n")).filter((entry) => entry.stream === name),
    spend: appetite.spendOf,
    questions: () => ({ count: budget.count(), budget: budgetOf(env) }),
  });
  registerDelegatedAnswers(fake, {
    readTable: async () => TABLE,
    record: (entry) => void lines.push(entry),
    pastAppetite: appetite.pastAppetite,
    left: async (question, host) => {
      try {
        await budget.left(question, host);
      } finally {
        await card.refresh(question, host);
      }
    },
    answered: card.refresh,
    now: () => "2026-09-30T10:00:00.000Z",
  });
  fake.setLabels("stream-1", { stream: "demo" });
  fake.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  fake.setLabels("stream-2", { stream: "other" });
  return { fake };
}

type Data = {
  decided: { header: string; answer: string; at: string }[];
  spend: { totalUsd: number; appetiteUsd: number | null; partial: boolean };
  questions: { count: number; budget: number | null };
};
const cards = (fake: FakeHost, agentId = "stream-1") => fake.timeline(agentId).filter((row) => row.kind === REPORT_CARD.kind);
const data = (fake: FakeHost, agentId = "stream-1"): Data => cards(fake, agentId)[0]?.data as unknown as Data;

test("a delegated answer puts a card in the stream agent's chat listing it", async () => {
  const { fake } = wired();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", "Colour", "two-way") });
  assert.equal(cards(fake).length, 1);
  assert.equal(cards(fake)[0]?.id, REPORT_CARD.id);
  assert.equal(cards(fake)[0]?.version, REPORT_CARD.version);
  assert.deepEqual(data(fake).decided, [{ header: "Colour", answer: "Yes (Recommended)", at: "2026-09-30T10:00:00.000Z" }]);
  assert.deepEqual(fake.failures, []);
});

test("a turn cost updates the spend against the appetite on the same row", async () => {
  const { fake } = wired();
  fake.setLastTurnCost("tkt-7", 1.5);
  await fake.emitTurnEnded(turn(ticket));
  assert.deepEqual(data(fake).spend, { totalUsd: 1.5, appetiteUsd: 5, partial: false });
  fake.setLastTurnCost("tkt-7", 2);
  await fake.emitTurnEnded(turn(ticket));
  assert.deepEqual(data(fake).spend, { totalUsd: 3.5, appetiteUsd: 5, partial: false });
});

test("a turn with no cost marks the spend partial on the card", async () => {
  const { fake } = wired();
  fake.setLastTurnCost("tkt-7", 1);
  await fake.emitTurnEnded(turn(ticket));
  fake.setLastTurnCost("tkt-7", null);
  await fake.emitTurnEnded(turn(ticket));
  assert.deepEqual(data(fake).spend, { totalUsd: 1, appetiteUsd: 5, partial: true });
});

test("a question left for the user updates the day's count against the budget", async () => {
  const { fake } = wired();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", "Big", "one-way") });
  assert.deepEqual(data(fake).questions, { count: 1, budget: 10 });
  assert.deepEqual(data(fake).decided, [], "a question left to the user is not a decision");
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r2", "Bigger", "one-way") });
  assert.deepEqual(data(fake).questions, { count: 2, budget: 10 });
});

test("a delegated answer, a turn cost and a question left all land under the one row id: one row, all three fields current", async () => {
  const { fake } = wired();
  fake.setLastTurnCost("tkt-7", 0.75);
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", "Colour", "two-way") });
  await fake.emitTurnEnded(turn(ticket));
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r2", "Big", "one-way") });
  assert.equal(cards(fake).length, 1, "one row, replaced under its id");
  assert.ok(fake.rows.filter((entry) => entry.row.id === REPORT_CARD.id).length >= 3, "appended again on each change");
  assert.deepEqual(data(fake), {
    decided: [{ header: "Colour", answer: "Yes (Recommended)", at: "2026-09-30T10:00:00.000Z" }],
    spend: { totalUsd: 0.75, appetiteUsd: 5, partial: false },
    questions: { count: 1, budget: 10 },
  });
  assert.deepEqual(Object.keys(data(fake)).sort(), [...REPORT_CARD.fields].sort());
});

test("a ticket agent's change shows in its orchestrator's chat, not its own", async () => {
  const { fake } = wired();
  fake.setLastTurnCost("tkt-7", 1);
  await fake.emitTurnEnded(turn(ticket));
  assert.equal(cards(fake, "stream-1").length, 1);
  assert.deepEqual(fake.timeline("tkt-7"), []);
});

test("the card lists only its own stream's decisions and spend", async () => {
  const { fake } = wired();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", "Colour", "two-way") });
  fake.setLastTurnCost("stream-2", 4);
  await fake.emitTurnEnded(turn(otherStream));
  assert.deepEqual(data(fake, "stream-2").decided, []);
  assert.deepEqual(data(fake, "stream-2").spend, { totalUsd: 4, appetiteUsd: 5, partial: false });
  assert.deepEqual(data(fake, "stream-1").spend, { totalUsd: 0, appetiteUsd: null, partial: false });
});

test("no budget set shows a null budget", async () => {
  const { fake } = wired({});
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", "Big", "one-way") });
  assert.deepEqual(data(fake).questions, { count: 1, budget: null });
});

test("the card row carries no buttons", async () => {
  const { fake } = wired();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", "Colour", "two-way") });
  assert.doesNotMatch(JSON.stringify(cards(fake)[0]), /button|action|rpc|onPress|callback/i);
});

test("an agent with no role labels gets no card and changes none (T3)", async () => {
  const { fake } = wired();
  await fake.emitPermissionRequested({ agent: stranger, request: ask("r1", "Colour", "two-way") });
  fake.setLabels("stranger", { wave: "1" });
  fake.setLastTurnCost("stranger", 3);
  await fake.emitTurnEnded(turn(stranger));
  assert.deepEqual(fake.rows, []);
});

test("a host that refuses the row does not fail the handler, and one line is logged without the answer (T4)", async () => {
  const { fake } = wired();
  fake.appendTimelineRow = async () => {
    throw new Error("refused");
  };
  const logged: string[] = [];
  const original = console.error;
  console.error = (line: unknown) => void logged.push(String(line));
  try {
    await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", "Colour", "two-way") });
  } finally {
    console.error = original;
  }
  assert.deepEqual(fake.failures, []);
  assert.equal(fake.answers.length, 1, "the answer still went out");
  assert.ok(logged.some((line) => line.includes("tkt-7") && !line.includes("Yes (Recommended)")));
});
