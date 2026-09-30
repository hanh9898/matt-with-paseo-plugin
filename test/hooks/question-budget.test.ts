import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { registerDelegatedAnswers } from "../../server/delegated-answers.ts";
import type { HostAgent, PermissionRequest } from "../../server/host.ts";
import { registerWaitingCount } from "../../server/hooks/waiting-count.ts";
import { registerQuestionBudget, type BudgetRecord, type BudgetStore } from "../../server/question-budget.ts";
import { BUDGET_ENV } from "../../shared/question-budget.ts";
import { FakeHost } from "../support/fake-host.ts";

const stream: HostAgent = { id: "stream-1", workspaceId: "w0", parentAgentId: null, provider: "sample", cwd: "/repo", title: "[Stream] demo" };
const ticket: HostAgent = { ...stream, id: "tkt-7", workspaceId: "w1", parentAgentId: "stream-1", title: "[Wave 1] 07" };
const stranger: HostAgent = { ...stream, id: "stranger", title: null };

const TABLE = ["## Delegation", "", "| Rule | Value |", "|---|---|", "| Questions the orchestrator may decide | two-way |", ""].join("\n");
const ask = (id: string, door = "one-way"): PermissionRequest => ({
  id,
  name: "AskUserQuestion",
  kind: "question",
  input: {
    questions: [
      { header: "Q", question: `Which?\nDoor: ${door}`, options: [{ label: "Yes (Recommended)", description: "" }, { label: "No", description: "" }], multiSelect: false },
    ],
  },
});

/** A store in memory, so a second registration on it stands for a reload. */
function memoryStore(): BudgetStore {
  let kept: BudgetRecord | null = null;
  return {
    load: () => (kept === null ? null : { ...kept }),
    save: (record) => void (kept = { ...record }),
  };
}

const DAY1 = new Date(2026, 8, 30, 10, 0);
const DAY2 = new Date(2026, 9, 1, 8, 0);

/** A host with the delegated answers, the waiting count and the budget wired as `index.server.ts` wires them. */
function wired(env: Record<string, string> = { [BUDGET_ENV]: "2" }, options: { store?: BudgetStore; now?: () => Date } = {}) {
  const fake = new FakeHost();
  const budget = registerQuestionBudget(fake, { env, now: options.now ?? (() => DAY1), store: options.store ?? memoryStore() });
  registerWaitingCount(fake);
  registerDelegatedAnswers(fake, { readTable: async () => TABLE, record: () => {}, left: budget.left });
  fake.setLabels("stream-1", { stream: "demo" });
  fake.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  return { fake, budget };
}

const budgetMessages = (fake: FakeHost) => fake.sent.filter(({ text }) => text.startsWith("Question budget spent:"));

test("each question left for the user is counted, and an answered one is not", async () => {
  const { fake, budget } = wired({ [BUDGET_ENV]: "9" });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r2", "two-way") });
  await fake.emitPermissionRequested({ agent: stream, request: ask("r3") });
  assert.equal(budget.count(), 2, "two left, one answered by the table");
  assert.equal(fake.answers.length, 1);
  assert.deepEqual(fake.failures, []);
});

test("an agent with no role labels is left alone and not counted (T3)", async () => {
  const { fake, budget } = wired();
  await fake.emitPermissionRequested({ agent: stranger, request: ask("r1") });
  assert.equal(budget.count(), 0);
});

test("the same request seen twice is counted once", async () => {
  const { fake, budget } = wired();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.equal(budget.count(), 1);
});

test("when the budget is spent the orchestrator gets one message with a Next line, and no more that day", async () => {
  const { fake } = wired();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.equal(budgetMessages(fake).length, 0, "one of two is not spent");
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r2") });
  const [message] = budgetMessages(fake);
  assert.equal(budgetMessages(fake).length, 1);
  assert.equal(message?.agentId, "stream-1");
  assert.match(message?.text ?? "", /^Question budget spent: 2 questions reached the user today against a budget of 2\./);
  assert.ok(message?.text.split("\n").at(-1)?.startsWith("Next: "));
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r3") });
  await fake.emitPermissionRequested({ agent: stream, request: ask("r4") });
  assert.equal(budgetMessages(fake).length, 1, "still one");
});

test("the pill's read shows the budget spent, only once it is", async () => {
  const { fake } = wired();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.deepEqual(await fake.pill("stream-1"), { count: 1, budgetSpent: false });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r2") });
  assert.deepEqual(await fake.pill("stream-1"), { count: 2, budgetSpent: true });
});

test("questions still reach the user after the budget is spent, and none is answered because of it", async () => {
  const { fake } = wired({ [BUDGET_ENV]: "1" });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r2") });
  await fake.emitPermissionRequested({ agent: stream, request: ask("r3") });
  assert.deepEqual(fake.answers, [], "the plugin answered nothing");
  assert.deepEqual(await fake.pill("stream-1"), { count: 3, budgetSpent: true }, "all three still wait for the user");
});

test("the budget neither widens nor narrows delegation: a decidable question is answered as before once it is spent", async () => {
  const { fake, budget } = wired({ [BUDGET_ENV]: "1" });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r2", "two-way") });
  assert.equal(fake.answers.length, 1);
  assert.equal(fake.answers[0]?.requestId, "r2");
  assert.equal(budget.count(), 1, "the answered one is not counted");
});

test("the count survives a reload, and the message is not sent again", async () => {
  const store = memoryStore();
  const first = wired({ [BUDGET_ENV]: "2" }, { store });
  await first.fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  const second = wired({ [BUDGET_ENV]: "2" }, { store });
  assert.equal(second.budget.count(), 1, "the reloaded plugin reads the count back");
  await second.fake.emitPermissionRequested({ agent: ticket, request: ask("r2") });
  assert.equal(budgetMessages(second.fake).length, 1);
  const third = wired({ [BUDGET_ENV]: "2" }, { store });
  await third.fake.emitPermissionRequested({ agent: ticket, request: ask("r3") });
  assert.equal(third.budget.count(), 3);
  assert.equal(budgetMessages(third.fake).length, 0, "already told today");
});

test("a new day in local time starts the count again, and the budget can be spent again", async () => {
  let now = DAY1;
  const { fake, budget } = wired({ [BUDGET_ENV]: "1" }, { now: () => now });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.equal(budgetMessages(fake).length, 1);
  now = DAY2;
  assert.equal(budget.count(), 0, "the count of the new day");
  assert.equal(budget.spent(), false);
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r2") });
  assert.equal(budget.count(), 1);
  assert.equal(budgetMessages(fake).length, 2, "once per day");
});

test("no setting, or one that is not a whole number, counts without a budget: no message, no pill", async () => {
  for (const env of [{}, { [BUDGET_ENV]: "many" }, { [BUDGET_ENV]: "0" }]) {
    const { fake, budget } = wired(env);
    await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
    await fake.emitPermissionRequested({ agent: ticket, request: ask("r2") });
    assert.equal(budget.count(), 2);
    assert.deepEqual(budgetMessages(fake), []);
    assert.deepEqual(await fake.pill("stream-1"), { count: 2, budgetSpent: false });
  }
});

test("a message for an orchestrator that is mid-turn is held and goes out when its turn ends", async () => {
  const { fake } = wired({ [BUDGET_ENV]: "1" });
  fake.setRunning("stream-1", true);
  await fake.emitPermissionRequested({ agent: stream, request: ask("r1") });
  assert.deepEqual(budgetMessages(fake), []);
  fake.setRunning("stream-1", false);
  await fake.emitTurnEnded({ agent: stream, outcome: { kind: "completed" }, timeline: [] });
  assert.equal(budgetMessages(fake).length, 1);
  assert.equal(budgetMessages(fake)[0]?.agentId, "stream-1");
});

test("a store that cannot save leaves the question to the user, logs one line and never throws into Paseo (T4)", async () => {
  const errors = mock.method(console, "error", () => {});
  try {
    const failing: BudgetStore = {
      load: () => null,
      save: () => {
        throw new Error("disk full");
      },
    };
    const { fake, budget } = wired({ [BUDGET_ENV]: "1" }, { store: failing });
    await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
    assert.deepEqual(fake.failures, []);
    assert.deepEqual(fake.answers, []);
    assert.equal(budget.count(), 1, "the count goes on in memory");
    assert.ok(errors.mock.calls.length >= 1, "one line is logged");
    const line = String(errors.mock.calls[0]?.arguments[0]);
    assert.match(line, /tkt-7/);
    assert.doesNotMatch(line, /Which\?|Door:/, "never the question (T6)");
  } finally {
    errors.mock.restore();
  }
});

test("a table that cannot be read leaves the question to the user, and it is counted", async () => {
  const errors = mock.method(console, "error", () => {});
  try {
    const fake = new FakeHost();
    const budget = registerQuestionBudget(fake, { env: { [BUDGET_ENV]: "5" }, now: () => DAY1, store: memoryStore() });
    registerDelegatedAnswers(fake, {
      readTable: async () => {
        throw new Error("EACCES");
      },
      record: () => {},
      left: budget.left,
    });
    fake.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
    await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", "two-way") });
    assert.equal(budget.count(), 1);
    assert.deepEqual(fake.answers, []);
  } finally {
    errors.mock.restore();
  }
});

test("a request Paseo resolved before the plugin decided is not counted", async () => {
  const fake = new FakeHost();
  const budget = registerQuestionBudget(fake, { env: { [BUDGET_ENV]: "5" }, now: () => DAY1, store: memoryStore() });
  registerDelegatedAnswers(fake, {
    readTable: async () => {
      await fake.emitPermissionResolved({ agent: ticket, requestId: "r1" });
      return null;
    },
    record: () => {},
    left: budget.left,
  });
  fake.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.equal(budget.count(), 0);
});
