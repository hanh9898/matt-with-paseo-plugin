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

test("a message typed in an agent that is neither a ticket agent nor a stream agent is left alone (T3)", async () => {
  const host = relayed();
  host.setLabels("stray", { role: "scratch" });
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

const streamAgent: HostAgent = { ...orchestrator, id: "strm-3", workspaceId: "w3", parentAgentId: "orch-1", title: "[Stream] demo" };
const STREAM_LABELS = { stream: "demo" };

function relayedStream(): FakeHost {
  const host = relayed();
  host.setLabels("strm-3", STREAM_LABELS);
  return host;
}

test("a stream agent's turn end reaches its parent as one message naming the stream and the agent", async () => {
  const host = relayedStream();
  await host.emitTurnEnded({ agent: streamAgent, outcome: completed, timeline: [] });
  assert.equal(host.sent.length, 1);
  const [message] = host.sent;
  assert.equal(message?.agentId, "orch-1");
  const text = message?.text ?? "";
  assert.match(text, /^Turn ended: stream demo, agent strm-3, outcome completed\./);
  assert.doesNotMatch(text, /ticket|wave/i, "the stream clause stands in for the ticket-and-wave clause");
  assert.deepEqual(host.failures, []);
});

test("a stream agent's failed and canceled turns say how they ended", async () => {
  const host = relayedStream();
  await host.emitTurnEnded({ agent: streamAgent, outcome: { kind: "failed", error: { message: "out of quota", code: "quota" } }, timeline: [] });
  await host.emitTurnEnded({ agent: streamAgent, outcome: { kind: "failed", error: { message: "boom" } }, timeline: [] });
  await host.emitTurnEnded({ agent: streamAgent, outcome: { kind: "canceled", reason: "user" }, timeline: [] });
  assert.match(host.sent[0]?.text ?? "", /stream demo, agent strm-3, outcome failed \(quota\)\./);
  assert.match(host.sent[1]?.text ?? "", /outcome failed\./);
  assert.match(host.sent[2]?.text ?? "", /outcome canceled \(user\)\./);
});

test("a stream agent's permission request reaches its parent with the stream, the agent, the request and its kind, never its input", async () => {
  const host = relayedStream();
  await host.emitPermissionRequested({
    agent: streamAgent,
    request: { id: "req-4", name: "AskUserQuestion", kind: "question", input: { secret: "hunter2" } },
  });
  await host.emitPermissionRequested({ agent: streamAgent, request: { id: "req-5", name: "Bash", kind: "tool" } });
  assert.equal(host.sent.length, 2);
  assert.ok(host.sent.every((message) => message.agentId === "orch-1"));
  assert.match(host.sent[0]?.text ?? "", /^Permission pending: stream demo, agent strm-3, request req-4, AskUserQuestion \(question\)\./);
  assert.match(host.sent[1]?.text ?? "", /request req-5, Bash \(tool\)\./);
  assert.ok(!host.sent[0]?.text.includes("hunter2"), "the request's input stays out of the message (T6)");
});

test("a stream agent's archive reaches its parent, also when Paseo no longer reports its labels", async () => {
  const host = relayedStream();
  await host.emitTurnEnded({ agent: streamAgent, outcome: completed, timeline: [] });
  host.setLabels("strm-3", {});
  await host.emitArchived({ agent: streamAgent });
  assert.equal(host.sent.length, 2);
  assert.match(host.sent[1]?.text ?? "", /^Agent archived: stream demo, agent strm-3\./);
});

test("the stream agent's creation and the words typed in its chat are not relayed: those types stay ticket-agent only", async () => {
  const host = relayedStream();
  await host.emitCreated({ agent: streamAgent });
  assert.deepEqual(host.sent, []);
  await host.emitTurnEnded({ agent: streamAgent, outcome: completed, timeline: [typed("c-1")] });
  assert.equal(host.sent.length, 1);
  assert.doesNotMatch(host.sent[0]?.text ?? "", /Human words/);
  assert.doesNotMatch(host.sent[0]?.text ?? "", /c-1/);
});

test("a stream agent's messages are held for a running parent and go out with the ticket agents' ones, in arrival order", async () => {
  const host = relayedStream();
  host.setRunning("orch-1", true);
  await host.emitTurnEnded({ agent: streamAgent, outcome: completed, timeline: [] });
  await host.emitPermissionRequested({ agent: ticketAgent, request: { id: "req-9", name: "Bash", kind: "tool" } });
  await host.emitArchived({ agent: streamAgent });
  assert.deepEqual(host.sent, []);
  host.setRunning("orch-1", false);
  await host.emitTurnEnded({ agent: orchestrator, outcome: completed, timeline: [] });
  assert.equal(host.sent.length, 1, "one message");
  const text = host.sent[0]?.text ?? "";
  const lines = text.split("
");
  assert.equal(lines.filter((line) => line.startsWith("Next:")).length, 1);
  assert.ok(lines.at(-1)?.startsWith("Next: "));
  assert.ok(text.indexOf("stream demo") < text.indexOf("ticket 07"), "arrival order");
  assert.ok(text.indexOf("ticket 07") < text.lastIndexOf("Agent archived"), "arrival order");
});

test("a stream agent with no parent is told to nobody", async () => {
  const host = relayedStream();
  await host.emitTurnEnded({ agent: { ...streamAgent, parentAgentId: null }, outcome: completed, timeline: [] });
  await host.emitPermissionRequested({ agent: { ...streamAgent, parentAgentId: null }, request: { id: "r", name: "Bash", kind: "tool" } });
  await host.emitArchived({ agent: { ...streamAgent, parentAgentId: null } });
  assert.deepEqual(host.sent, []);
  assert.deepEqual(host.failures, []);
});

test("an agent carrying both stream and the ticket labels is relayed as a ticket agent", async () => {
  const host = relayed();
  host.setLabels("tkt-7", { stream: "demo", ...TICKET_LABELS });
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  assert.match(host.sent[0]?.text ?? "", /^Turn ended: ticket 07 of wave 1, agent tkt-7,/);
});

test("an agent carrying stream and a wave without a ticket, or neither role, is left alone (T3)", async () => {
  const host = new FakeHost();
  registerLifecycleRelay(host);
  host.setLabels("strm-3", { stream: "demo", wave: "1" });
  host.setLabels("stray", { other: "x" });
  const stray: HostAgent = { ...streamAgent, id: "stray" };
  for (const agent of [streamAgent, stray]) {
    await host.emitTurnEnded({ agent, outcome: completed, timeline: [] });
    await host.emitPermissionRequested({ agent, request: { id: "r", name: "Bash", kind: "tool" } });
    await host.emitArchived({ agent });
  }
  assert.deepEqual(host.sent, []);
});

const bundleAgent: HostAgent = { ...ticketAgent, id: "bnd-7", title: "[Wave 1] [70+71] Relay and mark bundle agents" };
const BUNDLE_CLAUSE = "bundle 70 (tickets 70,71) of wave 1, agent bnd-7";

function bundled(labels: Record<string, string> = { wave: "1", bundle: "70", tickets: "70,71" }): FakeHost {
  const host = new FakeHost();
  registerLifecycleRelay(host);
  host.setLabels("bnd-7", labels);
  return host;
}

test("a bundle agent's creation, turn end, pending permission and archive reach its orchestrator with the bundle clause", async () => {
  const host = bundled();
  await host.emitCreated({ agent: bundleAgent });
  await host.emitPermissionRequested({ agent: bundleAgent, request: { id: "req-9", name: "Bash", kind: "tool" } });
  await host.emitTurnEnded({ agent: bundleAgent, outcome: completed, timeline: [] });
  await host.emitArchived({ agent: bundleAgent });
  assert.equal(host.sent.length, 4);
  const leads = ["Agent created", "Permission pending", "Turn ended", "Agent archived"];
  host.sent.forEach((message, n) => {
    assert.equal(message.agentId, "orch-1");
    assert.ok(message.text.startsWith(`${leads[n]}: ${BUNDLE_CLAUSE}`), message.text);
  });
  assert.deepEqual(host.failures, []);
});

test("a bundle agent under a stream is relayed as a bundle agent, not as a stream agent", async () => {
  const host = bundled({ stream: "demo", wave: "1", bundle: "70", tickets: "70,71" });
  await host.emitTurnEnded({ agent: bundleAgent, outcome: completed, timeline: [] });
  assert.ok(host.sent[0]?.text.startsWith(`Turn ended: ${BUNDLE_CLAUSE}`), host.sent[0]?.text);
});

test("a bundle agent's archive is relayed after its labels are gone", async () => {
  const host = bundled();
  await host.emitCreated({ agent: bundleAgent });
  host.setLabels("bnd-7", {});
  await host.emitArchived({ agent: bundleAgent });
  assert.ok(host.sent.at(-1)?.text.startsWith(`Agent archived: ${BUNDLE_CLAUSE}`), host.sent.at(-1)?.text);
});

test("the user's words in a bundle agent's chat ride its turn end, with the bundle clause", async () => {
  const host = bundled();
  await host.emitTurnEnded({ agent: bundleAgent, outcome: completed, timeline: [typed("m-1")] });
  const text = host.sent[0]?.text ?? "";
  assert.match(text, new RegExp(`Human words: bundle 70 \(tickets 70,71\) of wave 1, agent bnd-7`));
  assert.match(text, /Turn ended: bundle 70/);
});

test("a ticket agent is relayed with today's text when a bundle agent exists beside it", async () => {
  const host = relayed();
  host.setLabels("bnd-7", { wave: "1", bundle: "70", tickets: "70,71" });
  await host.emitTurnEnded({ agent: ticketAgent, outcome: completed, timeline: [] });
  assert.ok(host.sent[0]?.text.startsWith("Turn ended: ticket 07 of wave 1, agent tkt-7, outcome completed."), host.sent[0]?.text);
});
