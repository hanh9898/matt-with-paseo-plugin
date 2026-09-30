import assert from "node:assert/strict";
import { test } from "node:test";
import { registerStallSensor } from "../../server/hooks/stall-sensor.ts";
import type { HostAgent, TurnOutcome } from "../../server/host.ts";
import type { Condition } from "../../server/sensor.ts";
import { FakeHost } from "../support/fake-host.ts";

const orchestrator: HostAgent = { id: "stream-1", workspaceId: "w0", parentAgentId: null, provider: "sample", cwd: "/repo", title: "[Stream] demo" };
const ticket: HostAgent = { ...orchestrator, id: "tkt-7", workspaceId: "w1", parentAgentId: "stream-1", title: "[Wave 1] 07" };

const done: TurnOutcome = { kind: "completed" };
const working = [{ type: "user_message" }, { type: "tool_call", name: "Bash" }, { type: "assistant_message", text: "step" }];

function sensed(conditions?: readonly Condition[]): FakeHost {
  const host = new FakeHost();
  registerStallSensor(host, conditions);
  host.setLabels("stream-1", { stream: "demo" });
  host.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  return host;
}

test("a turn that flags nothing sends nothing: only flagged cases reach the judgement (criterion 2)", async () => {
  const host = sensed();
  await host.emitTurnEnded({ agent: ticket, outcome: done, timeline: working });
  await host.emitTurnEnded({ agent: ticket, outcome: done, timeline: [...working, { type: "tool_call", name: "Edit" }, { type: "assistant_message", text: "next" }] });
  assert.deepEqual(host.sent, []);
  assert.deepEqual(host.failures, []);
});

test("a stalled agent is still caught: a turn that adds nothing is sent to its orchestrator with a `Next:` line (criterion 3)", async () => {
  const host = sensed();
  await host.emitTurnEnded({ agent: ticket, outcome: done, timeline: working });
  await host.emitTurnEnded({ agent: ticket, outcome: done, timeline: working });
  assert.equal(host.sent.length, 1);
  const [message] = host.sent;
  assert.equal(message?.agentId, "stream-1");
  assert.match(message?.text ?? "", /^Stall suspected: ticket 07 of wave 1, agent tkt-7, the sensor flagged: the turn added nothing to the timeline\./);
  assert.ok(message?.text.split("\n").at(-1)?.startsWith("Next: "));
  assert.match(message?.text ?? "", /get_agent_activity/);
});

test("a failed turn is flagged at once; two quiet turns in a row are flagged on the second", async () => {
  const host = sensed();
  await host.emitTurnEnded({ agent: ticket, outcome: { kind: "failed", error: { message: "token=hunter2" } }, timeline: working });
  assert.equal(host.sent.length, 1);
  assert.match(host.sent[0]?.text ?? "", /ended in failure/);
  assert.doesNotMatch(host.sent[0]?.text ?? "", /hunter2/, "an error's message stays out (T6)");
  const chat = [...working, { type: "assistant_message", text: "thinking" }];
  await host.emitTurnEnded({ agent: ticket, outcome: done, timeline: chat });
  assert.equal(host.sent.length, 1, "one quiet turn is not a flag");
  await host.emitTurnEnded({ agent: ticket, outcome: done, timeline: [...chat, { type: "assistant_message", text: "still thinking" }] });
  assert.equal(host.sent.length, 2);
  assert.match(host.sent[1]?.text ?? "", /ran no tool/);
});

test("a flagged case for a mid-turn orchestrator is held and goes out when its turn ends", async () => {
  const host = sensed();
  host.setRunning("stream-1", true);
  await host.emitTurnEnded({ agent: ticket, outcome: { kind: "canceled", reason: "user" }, timeline: working });
  assert.deepEqual(host.sent, []);
  host.setRunning("stream-1", false);
  await host.emitTurnEnded({ agent: orchestrator, outcome: done, timeline: [] });
  assert.equal(host.sent.length, 1);
  assert.match(host.sent[0]?.text ?? "", /^Stall suspected/);
});

test("conditions come from the data given: the sensor holds no condition of its own", async () => {
  const only: Condition[] = [{ id: "any", says: "any turn at all", check: "code", fact: "newItems", atLeast: 1, times: 1 }];
  const host = sensed(only);
  await host.emitTurnEnded({ agent: ticket, outcome: done, timeline: working });
  assert.match(host.sent[0]?.text ?? "", /any turn at all/);
  const none = sensed([]);
  await none.emitTurnEnded({ agent: ticket, outcome: { kind: "failed", error: { message: "x" } }, timeline: [] });
  assert.deepEqual(none.sent, []);
});

test("an agent the plugin does not recognise by its labels is left alone (T3), and so is one with nobody to tell", async () => {
  const host = sensed();
  host.setLabels("half", { wave: "1" });
  host.setLabels("bare", {});
  host.setLabels("lone", { wave: "1", ticket: "09" });
  for (const agent of [{ ...ticket, id: "half" }, { ...ticket, id: "bare" }, { ...ticket, id: "lone", parentAgentId: null }]) {
    await host.emitTurnEnded({ agent, outcome: { kind: "failed", error: { message: "x" } }, timeline: [] });
  }
  assert.deepEqual(host.sent, []);
});

test("it fails open (T4): a host that cannot say whether the orchestrator is busy stops nothing", async () => {
  const shaky = sensed();
  shaky.isRunning = async () => {
    throw new Error("no answer");
  };
  await shaky.emitTurnEnded({ agent: ticket, outcome: { kind: "canceled", reason: "user" }, timeline: working });
  assert.equal(shaky.sent.length, 1, "a host that cannot say counts the orchestrator as idle");
  assert.deepEqual(shaky.failures, []);
});

test("an archived agent's history is forgotten: its next timeline starts over", async () => {
  const host = sensed();
  await host.emitTurnEnded({ agent: ticket, outcome: done, timeline: working });
  await host.emitArchived({ agent: ticket });
  await host.emitTurnEnded({ agent: ticket, outcome: done, timeline: working });
  assert.deepEqual(host.sent, [], "the same timeline counts as new after the archive");
});

const bundleAgent: HostAgent = { ...ticket, id: "bnd-7", title: "[Wave 1] [70+71] x" };

test("a bundle agent's stalled turn is sent to its orchestrator with the bundle clause", async () => {
  const host = sensed();
  host.setLabels("bnd-7", { stream: "demo", wave: "1", bundle: "70", tickets: "70,71" });
  await host.emitTurnEnded({ agent: bundleAgent, outcome: done, timeline: working });
  await host.emitTurnEnded({ agent: bundleAgent, outcome: done, timeline: working });
  assert.equal(host.sent.length, 1);
  assert.equal(host.sent[0]?.agentId, "stream-1");
  assert.match(host.sent[0]?.text ?? "", /^Stall suspected: bundle 70 \(tickets 70,71\) of wave 1, agent bnd-7, the sensor flagged: the turn added nothing to the timeline\./);
  assert.ok(host.sent[0]?.text.split("\n").at(-1)?.startsWith("Next: "));
  assert.deepEqual(host.failures, []);
});

test("a ticket and a bundle agent's turn-end Next line names the hung-agent table and offers no bare prompt (#48)", async () => {
  const host = sensed();
  host.setLabels("bnd-7", { stream: "demo", wave: "1", bundle: "70", tickets: "70,71" });
  await host.emitTurnEnded({ agent: ticket, outcome: { kind: "canceled", reason: "user" }, timeline: working });
  await host.emitTurnEnded({ agent: bundleAgent, outcome: { kind: "canceled", reason: "user" }, timeline: working });
  assert.equal(host.sent.length, 2);
  for (const message of host.sent) {
    const next = message.text.split("\n").at(-1) ?? "";
    assert.match(next, /decide by the wave skill's hung-agent table/);
    assert.doesNotMatch(next, /prompt agent/);
  }
});
