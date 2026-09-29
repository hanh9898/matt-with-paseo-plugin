import assert from "node:assert/strict";
import { test } from "node:test";
import { registerLifecycleRelay } from "../../server/hooks/lifecycle-relay.ts";
import type { HostAgent } from "../../server/host.ts";
import { combine } from "../../server/messages.ts";
import { FakeHost } from "../support/fake-host.ts";

const orchestrator: HostAgent = {
  id: "orch-1",
  workspaceId: "w0",
  parentAgentId: null,
  provider: "sample",
  cwd: "/repo",
  title: "[Stream] demo",
};
const ticketAgent: HostAgent = { ...orchestrator, id: "tkt-7", workspaceId: "w1", parentAgentId: "orch-1", title: "[Wave 1] 07" };
const TICKET_LABELS = { wave: "1", ticket: "07" };

function relayed(): FakeHost {
  const host = new FakeHost();
  registerLifecycleRelay(host);
  host.setLabels("tkt-7", TICKET_LABELS);
  return host;
}

const completed = { kind: "completed" } as const;

test("a ticket agent's turn end reaches its orchestrator as one message", async () => {
  const host = relayed();
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  assert.equal(host.sent.length, 1);
  const [message] = host.sent;
  assert.equal(message?.agentId, "orch-1");
  assert.match(message?.text ?? "", /turn ended/i);
  for (const fact of ["tkt-7", "07", "completed"]) assert.ok(message?.text.includes(fact), `the message names ${fact}`);
  assert.deepEqual(host.failures, []);
});

test("a failed and a canceled turn say how they ended", async () => {
  const host = relayed();
  await host.emitTurnEnded({
    agent: ticketAgent,
    outcome: { kind: "failed", error: { message: "out of quota", code: "quota" } },
    timeline: [],
  });
  await host.emitTurnEnded({ agent: ticketAgent, outcome: { kind: "canceled", reason: "user" }, timeline: [] });
  assert.match(host.sent[0]?.text ?? "", /failed/);
  assert.match(host.sent[1]?.text ?? "", /canceled/);
});

test("a pending permission on a ticket agent reaches its orchestrator as a message", async () => {
  const host = relayed();
  await host.emitPermissionRequested({
    agent: ticketAgent,
    request: { id: "req-9", name: "AskUserQuestion", kind: "question", input: { secret: "hunter2" } },
  });
  assert.equal(host.sent.length, 1);
  const [message] = host.sent;
  assert.equal(message?.agentId, "orch-1");
  assert.match(message?.text ?? "", /permission/i);
  for (const fact of ["tkt-7", "req-9", "AskUserQuestion", "question"]) {
    assert.ok(message?.text.includes(fact), `the message names ${fact}`);
  }
  assert.ok(!message?.text.includes("hunter2"), "the request's input stays out of the message (T6)");
});

test("a ticket agent's creation and archive reach its orchestrator", async () => {
  const host = relayed();
  await host.emitCreated({ agent: ticketAgent });
  await host.emitArchived({ agent: ticketAgent });
  assert.equal(host.sent.length, 2);
  assert.match(host.sent[0]?.text ?? "", /created/i);
  assert.match(host.sent[1]?.text ?? "", /archived/i);
  assert.ok(host.sent.every((message) => message.agentId === "orch-1"));
});

test("an agent without the ticket labels is left alone on every event (T3)", async () => {
  const host = new FakeHost();
  registerLifecycleRelay(host);
  host.setLabels("tkt-7", { wave: "1" });
  await host.emitCreated({ agent: ticketAgent });
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  await host.emitPermissionRequested({ agent: ticketAgent, request: { id: "r", name: "Bash", kind: "tool" } });
  await host.emitArchived({ agent: ticketAgent });
  const stranger = { ...ticketAgent, id: "stranger" };
  await host.emitTurnEnded({ agent: stranger, outcome: completed, timeline: [] });
  assert.deepEqual(host.sent, []);
  assert.deepEqual(host.answers, []);
  assert.deepEqual(host.rows, []);
});

test("a ticket agent with no parent has no orchestrator to tell", async () => {
  const host = relayed();
  await host.emitTurnEnded({ agent: { ...ticketAgent, parentAgentId: null }, outcome: completed, timeline: [] });
  assert.deepEqual(host.sent, []);
  assert.deepEqual(host.failures, []);
});

test("an archive still reaches the orchestrator when Paseo no longer reports the agent's labels", async () => {
  const host = relayed();
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  host.setLabels("tkt-7", {});
  await host.emitArchived({ agent: ticketAgent });
  assert.equal(host.sent.length, 2);
  assert.match(host.sent[1]?.text ?? "", /archived/i);
});

test("a message for a running orchestrator is held until that orchestrator's turn ends", async () => {
  const host = relayed();
  host.setRunning("orch-1", true);
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  await host.emitPermissionRequested({ agent: ticketAgent, request: { id: "req-9", name: "Bash", kind: "tool" } });
  assert.deepEqual(host.sent, [], "nothing is sent while the orchestrator's turn runs");
  host.setRunning("orch-1", false);
  await host.emitTurnEnded({ agent: orchestrator, outcome: completed, timeline: [] });
  assert.equal(host.sent.length, 1, "the held messages arrive as one message");
  assert.equal(host.sent[0]?.agentId, "orch-1");
  assert.match(host.sent[0]?.text ?? "", /turn ended/i);
  assert.match(host.sent[0]?.text ?? "", /req-9/);
  await host.emitTurnEnded({ agent: orchestrator, outcome: completed, timeline: [] });
  assert.equal(host.sent.length, 1, "a held message is sent once");
});

test("a message for an idle orchestrator is sent at once", async () => {
  const host = relayed();
  host.setRunning("orch-1", false);
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  assert.equal(host.sent.length, 1);
});

test("an orchestrator that is archived loses what was held for it", async () => {
  const host = relayed();
  host.setRunning("orch-1", true);
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  await host.emitArchived({ agent: orchestrator });
  await host.emitTurnEnded({ agent: orchestrator, outcome: completed, timeline: [] });
  assert.deepEqual(host.sent, []);
});

test("when the host cannot say whether the orchestrator runs, the message is sent at once (T4)", async () => {
  const host = relayed();
  host.isRunning = async () => {
    throw new Error("no status");
  };
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  assert.equal(host.sent.length, 1);
  assert.deepEqual(host.failures, []);
});

test("a refused send is recorded and does not reach the caller (T4)", async () => {
  const host = relayed();
  host.send = async () => {
    throw new Error("refused");
  };
  await assert.doesNotReject(host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] }));
  assert.equal(host.failures.length, 1);
});

test("held messages are combined by the messages module, in order", () => {
  assert.equal(combine(["first"]), "first");
  const both = combine(["first", "second"]);
  assert.ok(both.indexOf("first") !== -1 && both.indexOf("first") < both.indexOf("second"));
});

test("every message the relay sends ends with a `Next:` line, and held ones with one", async () => {
  const idle = relayed();
  await idle.emitCreated({ agent: ticketAgent });
  await idle.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  await idle.emitPermissionRequested({ agent: ticketAgent, request: { id: "req-9", name: "Bash", kind: "tool" } });
  await idle.emitArchived({ agent: ticketAgent });
  assert.equal(idle.sent.length, 4);
  for (const message of idle.sent) assert.ok(message.text.split("\n").at(-1)?.startsWith("Next: "), message.text);

  const busy = relayed();
  busy.setRunning("orch-1", true);
  await busy.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  await busy.emitPermissionRequested({ agent: ticketAgent, request: { id: "req-9", name: "Bash", kind: "tool" } });
  busy.setRunning("orch-1", false);
  await busy.emitTurnEnded({ agent: orchestrator, outcome: completed, timeline: [] });
  const lines = (busy.sent[0]?.text ?? "").split("\n");
  assert.ok(lines.at(-1)?.startsWith("Next: "), "the held message ends with a `Next:` line");
  assert.equal(lines.filter((line) => line.startsWith("Next:")).length, 1, "and holds only that one");
});

/** An item of the timeline as Paseo reports it: a message typed in a client carries a client message id; a prompt sent through the orchestrator's tools does not. */
const typed = (id: string) => ({ type: "user_message", text: "please use the other table", clientMessageId: id, messageId: `p-${id}` });
const prompted = { type: "user_message", text: "Ticket 07: do this", messageId: "p-0" };

test("a message the user typed in a ticket agent's chat reaches its orchestrator with the turn end, as one message", async () => {
  const host = relayed();
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [prompted, typed("c-1")] });
  assert.equal(host.sent.length, 1, "one message, not two");
  const [message] = host.sent;
  assert.equal(message?.agentId, "orch-1");
  const text = message?.text ?? "";
  assert.match(text, /Human words/);
  assert.ok(text.includes("c-1") && text.includes("tkt-7") && text.includes("07"));
  assert.ok(text.indexOf("Human words") < text.indexOf("Turn ended"), "the words come first");
  assert.equal(text.split("\n").filter((line) => line.startsWith("Next:")).length, 1);
  assert.doesNotMatch(text, /other table/, "the text of the message stays out (T6)");
  assert.deepEqual(host.failures, []);
});

test("the orchestrator's own prompts, the first one included, are not relayed as human words", async () => {
  const host = relayed();
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [prompted, { ...prompted, text: "Ticket 07: go on", messageId: "p-1" }] });
  assert.equal(host.sent.length, 1);
  assert.doesNotMatch(host.sent[0]?.text ?? "", /Human words/);
});

test("the same history at the next turn end is not relayed again, and a new message is", async () => {
  const host = relayed();
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [typed("c-1")] });
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [typed("c-1")] });
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [typed("c-1"), typed("c-2")] });
  const texts = host.sent.map((sent) => sent.text);
  assert.equal(texts.filter((text) => text.includes("c-1")).length, 1, "c-1 goes once");
  assert.equal(texts.filter((text) => text.includes("c-2")).length, 1, "c-2 goes once");
  assert.doesNotMatch(texts[1] ?? "", /Human words/);
});

test("a message typed in an agent that is not a ticket agent is left alone (T3)", async () => {
  const host = relayed();
  host.setLabels("stray", { stream: "demo" });
  const stray: HostAgent = { ...ticketAgent, id: "stray" };
  await host.emitTurnEnded({ agent: stray, outcome: completed, timeline: [typed("c-1")] });
  await host.emitTurnEnded({ agent: orchestrator, outcome: completed, timeline: [typed("c-2")] });
  assert.deepEqual(host.sent, []);
});

test("a ticket agent with no orchestrator has nobody to tell", async () => {
  const host = relayed();
  const alone: HostAgent = { ...ticketAgent, parentAgentId: null };
  await host.emitTurnEnded({ agent: alone, outcome: completed, timeline: [typed("c-1")] });
  assert.deepEqual(host.sent, []);
});

test("the words wait with the turn end while the orchestrator runs, and go out with what else is held", async () => {
  const host = relayed();
  host.setRunning("orch-1", true);
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [typed("c-1")] });
  assert.deepEqual(host.sent, []);
  host.setRunning("orch-1", false);
  await host.emitTurnEnded({ agent: orchestrator, outcome: completed, timeline: [] });
  assert.equal(host.sent.length, 1);
  const lines = (host.sent[0]?.text ?? "").split("\n");
  assert.match(host.sent[0]?.text ?? "", /Human words/);
  assert.equal(lines.filter((line) => line.startsWith("Next:")).length, 1);
  assert.ok(lines.at(-1)?.startsWith("Next: "));
});

test("a refused send leaves the words to be told at the next turn end (T4)", async () => {
  const host = relayed();
  const send = host.send.bind(host);
  let refuse = true;
  host.send = async (agentId, text) => {
    if (refuse) throw new Error("refused");
    await send(agentId, text);
  };
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [typed("c-1")] });
  assert.equal(host.failures.length, 1);
  refuse = false;
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [typed("c-1")] });
  assert.match(host.sent[0]?.text ?? "", /Human words/);
});

test("archiving forgets which words were told", async () => {
  const host = relayed();
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [typed("c-1")] });
  await host.emitArchived({ agent: ticketAgent });
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [typed("c-1")] });
  assert.equal(host.sent.filter((sent) => sent.text.includes("Human words")).length, 2);
});

test("a timeline that is not a list does not stop the turn end from being told (T4)", async () => {
  const host = relayed();
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: undefined as unknown as unknown[] });
  assert.equal(host.sent.length, 1);
  assert.deepEqual(host.failures, []);
});
