import assert from "node:assert/strict";
import { test } from "node:test";
import { registerAppetite } from "../../server/appetite.ts";
import { registerDelegatedAnswers } from "../../server/delegated-answers.ts";
import type { HostAgent, PermissionRequest } from "../../server/host.ts";
import { MESSAGES } from "../../server/messages.ts";
import type { Spend } from "../../shared/appetite.ts";
import { FakeHost } from "../support/fake-host.ts";

const stream: HostAgent = { id: "stream-1", workspaceId: "w0", parentAgentId: null, provider: "sample", cwd: "/repo", title: "[Stream] demo" };
const ticket: HostAgent = { ...stream, id: "tkt-7", workspaceId: "w1", parentAgentId: "stream-1", cwd: "/repo-tkt", title: "[Wave 1] 07" };
const other: HostAgent = { ...stream, id: "tkt-8", workspaceId: "w2", parentAgentId: "stream-1", cwd: "/repo-tkt", title: "[Wave 1] 08" };
const stranger: HostAgent = { ...stream, id: "stranger", title: null };

const table = (rows: string[]) => ["## Delegation", "", "| Rule | Value |", "|---|---|", ...rows, ""].join("\n");
const TABLE = table(["| Questions the orchestrator may decide | two-way |", "| Appetite | 5 USD |"]);

const turn = (agent: HostAgent) => ({ agent, outcome: { kind: "completed" as const }, timeline: [] });
const ask = (id: string): PermissionRequest => ({
  id,
  name: "AskUserQuestion",
  kind: "question",
  input: {
    questions: [
      {
        header: "Q",
        question: "Which?\nDoor: two-way",
        options: [{ label: "Yes (Recommended)", description: "" }, { label: "No", description: "" }],
        multiSelect: false,
      },
    ],
  },
});

/** A host with the appetite handler registered on an in-memory record; the delegated-answers handler reads the same appetite when `answers` is set. */
function host(options: { table?: string | null | Error; answers?: boolean } = {}) {
  const fake = new FakeHost();
  let saved: Record<string, Spend> = {};
  const tableText = options.table === undefined ? TABLE : options.table;
  const readTable = async () => {
    if (tableText instanceof Error) throw tableText;
    return tableText;
  };
  const appetite = registerAppetite(fake, {
    readTable,
    store: { read: () => saved, write: (all) => void (saved = all) },
  });
  if (options.answers === true) registerDelegatedAnswers(fake, { readTable, record: () => {}, pastAppetite: appetite.pastAppetite });
  fake.setLabels("stream-1", { stream: "demo" });
  fake.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  fake.setLabels("tkt-8", { stream: "demo", wave: "1", ticket: "08" });
  return { fake, appetite, record: () => saved };
}

test("each turn end adds the agent's cost to its stream's total", async () => {
  const { fake, record } = host();
  fake.setLastTurnCost("tkt-7", 1.5);
  fake.setLastTurnCost("tkt-8", 2);
  await fake.emitTurnEnded(turn(ticket));
  await fake.emitTurnEnded(turn(other));
  await fake.emitTurnEnded(turn(ticket));
  assert.equal(record()["demo"]?.totalUsd, 5);
  assert.equal(record()["demo"]?.partial, false);
  assert.deepEqual(fake.failures, []);
});

test("the stream agent's own turn counts toward the same stream", async () => {
  const { fake, record } = host();
  fake.setLastTurnCost("stream-1", 0.5);
  await fake.emitTurnEnded(turn(stream));
  assert.equal(record()["demo"]?.totalUsd, 0.5);
});

test("a total is kept per stream label", async () => {
  const { fake, record } = host();
  fake.setLabels("tkt-8", { stream: "another", wave: "1", ticket: "08" });
  fake.setLastTurnCost("tkt-7", 1);
  fake.setLastTurnCost("tkt-8", 2);
  await fake.emitTurnEnded(turn(ticket));
  await fake.emitTurnEnded(turn(other));
  assert.equal(record()["demo"]?.totalUsd, 1);
  assert.equal(record()["another"]?.totalUsd, 2);
});

test("a turn with no cost adds nothing and marks the total partial", async () => {
  const { fake, record } = host();
  fake.setLastTurnCost("tkt-7", 2);
  await fake.emitTurnEnded(turn(ticket));
  fake.setLastTurnCost("tkt-7", null);
  await fake.emitTurnEnded(turn(ticket));
  assert.equal(record()["demo"]?.totalUsd, 2);
  assert.equal(record()["demo"]?.partial, true);
});

test("a cost the host cannot read is a turn with no cost, and throws nothing (T4)", async () => {
  const { fake, record } = host();
  fake.lastTurnCostUsd = async () => {
    throw new Error("agent unknown");
  };
  await fake.emitTurnEnded(turn(ticket));
  assert.equal(record()["demo"]?.totalUsd, 0);
  assert.equal(record()["demo"]?.partial, true);
  assert.deepEqual(fake.failures, []);
});

test("an agent with no role labels is left alone (T3)", async () => {
  const { fake, record } = host();
  fake.setLastTurnCost("stranger", 9);
  await fake.emitTurnEnded(turn(stranger));
  fake.setLabels("stranger", { wave: "1" });
  await fake.emitTurnEnded(turn(stranger));
  assert.deepEqual(record(), {});
});

test("the orchestrator gets one appetite passed message when the total passes the appetite", async () => {
  const { fake } = host();
  fake.setLastTurnCost("tkt-7", 3);
  await fake.emitTurnEnded(turn(ticket));
  assert.deepEqual(fake.sent, [], "within the appetite: nothing is sent");
  await fake.emitTurnEnded(turn(ticket));
  assert.deepEqual(fake.sent, [{ agentId: "stream-1", text: MESSAGES.appetitePassed("demo", 6, 5, false) }]);
  await fake.emitTurnEnded(turn(ticket));
  await fake.emitTurnEnded(turn(other));
  assert.equal(fake.sent.length, 1, "one message, however many turns follow");
  assert.match(fake.sent[0]?.text ?? "", /\nNext: /);
});

test("the message is held while the orchestrator is in a turn and goes out when that turn ends", async () => {
  const { fake } = host();
  fake.setRunning("stream-1", true);
  fake.setLastTurnCost("tkt-7", 6);
  await fake.emitTurnEnded(turn(ticket));
  assert.deepEqual(fake.sent, []);
  fake.setRunning("stream-1", false);
  await fake.emitTurnEnded(turn(stream));
  assert.equal(fake.sent.length, 1);
  assert.equal(fake.sent[0]?.agentId, "stream-1");
  await fake.emitTurnEnded(turn(stream));
  assert.equal(fake.sent.length, 1);
});

test("a partial total says so in the message", async () => {
  const { fake } = host();
  fake.setLastTurnCost("tkt-8", null);
  await fake.emitTurnEnded(turn(other));
  fake.setLastTurnCost("tkt-7", 6);
  await fake.emitTurnEnded(turn(ticket));
  assert.deepEqual(fake.sent, [{ agentId: "stream-1", text: MESSAGES.appetitePassed("demo", 6, 5, true) }]);
});

test("no message when the table has no appetite, or none can be read", async () => {
  for (const text of [table(["| Switch | on |"]), table(["| Appetite | plenty |"]), null, new Error("EACCES")]) {
    const { fake, appetite } = host({ table: text });
    fake.setLastTurnCost("tkt-7", 1000);
    await fake.emitTurnEnded(turn(ticket));
    assert.deepEqual(fake.sent, []);
    assert.equal(appetite.pastAppetite("demo"), false);
    assert.deepEqual(fake.failures, []);
  }
});

test("the plugin cancels nothing and answers nothing itself when a stream passes its appetite", async () => {
  const { fake } = host();
  fake.setLastTurnCost("tkt-7", 60);
  await fake.emitTurnEnded(turn(ticket));
  assert.deepEqual(fake.answers, []);
  assert.deepEqual(fake.sent.map((sent) => sent.agentId), ["stream-1"], "only the orchestrator is written to");
});

test("pastAppetite follows the total against the appetite the table last held", async () => {
  const { fake, appetite } = host();
  assert.equal(appetite.pastAppetite("demo"), false);
  fake.setLastTurnCost("tkt-7", 6);
  await fake.emitTurnEnded(turn(ticket));
  assert.equal(appetite.pastAppetite("demo"), true);
  assert.equal(appetite.pastAppetite("another"), false);
});

test("a delegated question is answered before the appetite and left for the user after it", async () => {
  const { fake } = host({ answers: true });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.equal(fake.answers.length, 1, "within the appetite the question is answered");
  fake.setLastTurnCost("tkt-7", 6);
  await fake.emitTurnEnded(turn(ticket));
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r2") });
  await fake.emitPermissionRequested({ agent: stream, request: ask("r3") });
  assert.equal(fake.answers.length, 1, "past the appetite every question is left for the user");
});

test("a stream's total survives a new registration, read back from the record", async () => {
  const fake = new FakeHost();
  let saved: Record<string, Spend> = {};
  const options = { readTable: async () => TABLE, store: { read: () => saved, write: (all: Record<string, Spend>) => void (saved = all) } };
  registerAppetite(fake, options);
  fake.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  fake.setLastTurnCost("tkt-7", 4);
  await fake.emitTurnEnded(turn(ticket));
  const again = registerAppetite(new FakeHost(), options);
  assert.equal(again.pastAppetite("demo"), false);
  fake.setLastTurnCost("tkt-7", 2);
  await fake.emitTurnEnded(turn(ticket));
  assert.equal(saved["demo"]?.totalUsd, 6);
  assert.equal(again.pastAppetite("demo"), true);
});
