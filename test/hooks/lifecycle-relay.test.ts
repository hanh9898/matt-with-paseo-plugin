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
