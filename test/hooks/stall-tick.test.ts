import assert from "node:assert/strict";
import { test } from "node:test";
import { registerStallSensor } from "../../server/hooks/stall-sensor.ts";
import type { HostAgent, TurnOutcome } from "../../server/host.ts";
import { MESSAGES } from "../../server/messages.ts";
import { FakeHost } from "../support/fake-host.ts";

// A running stream agent between turn ends (#48): the tick checks the `running` conditions.

const MINUTE = 60_000;
const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const iso = (minutes: number) => new Date(T0 + minutes * MINUTE).toISOString();

const done: TurnOutcome = { kind: "completed" };
const working = [{ type: "user_message" }, { type: "tool_call", name: "Bash" }, { type: "assistant_message", text: "step" }];

const streams: HostAgent = { id: "streams-0", workspaceId: "w0", parentAgentId: null, provider: "sample", cwd: "/repo", title: "[Streams] home" };
const streamAgent: HostAgent = { ...streams, id: "strm-3", workspaceId: "w1", parentAgentId: "streams-0", title: "[Stream] demo" };
const QUIET_TEXT =
  "Stall suspected: stream demo, agent strm-3, the sensor flagged: its turn has run 30 minutes with no new activity.";

/** A sensor on the shipped conditions with a clock the test sets; `clock.now` is in minutes after T0. */
function ticked() {
  const clock = { now: 0 };
  const host = new FakeHost();
  registerStallSensor(host, undefined, () => T0 + clock.now * MINUTE);
  host.setLabels("streams-0", { stream: "home" });
  host.setLabels("strm-3", { stream: "demo" });
  host.setParent("strm-3", "streams-0");
  host.setRunning("strm-3", true);
  host.setLastActivity("strm-3", iso(0));
  return { host, clock };
}

test("a running stream agent quiet for 30 minutes gets one Stall suspected to its parent, with the running Next line", async () => {
  const { host, clock } = ticked();
  await host.emitCreated({ agent: streamAgent });
  clock.now = 29;
  await host.tick();
  assert.deepEqual(host.sent, [], "29 minutes is not 30");
  clock.now = 30;
  await host.tick();
  assert.equal(host.sent.length, 1);
  assert.equal(host.sent[0]?.agentId, "streams-0");
  assert.equal(host.sent[0]?.text, MESSAGES.stallSuspected({ agentId: "strm-3", stream: "demo" }, ["its turn has run 30 minutes with no new activity"]));
  assert.ok(host.sent[0]?.text.startsWith(QUIET_TEXT));
  assert.match(host.sent[0]?.text ?? "", /never prompt it/);
  assert.deepEqual(host.failures, []);
});

test("the same idle stretch flags once; new activity and 30 more quiet minutes flag again", async () => {
  const { host, clock } = ticked();
  await host.emitCreated({ agent: streamAgent });
  clock.now = 30;
  await host.tick();
  clock.now = 35;
  await host.tick();
  clock.now = 90;
  await host.tick();
  assert.equal(host.sent.length, 1, "the same lastActivityAt flags once");
  host.setLastActivity("strm-3", iso(90));
  clock.now = 119;
  await host.tick();
  assert.equal(host.sent.length, 1, "a new stretch is not quiet long enough yet");
  clock.now = 120;
  await host.tick();
  assert.equal(host.sent.length, 2, "30 quiet minutes after the new activity flag again");
});

test("an idle stream agent, an unlabelled agent and a stream agent with no parent get no tick message", async () => {
  const { host, clock } = ticked();
  host.setRunning("strm-3", false);
  await host.emitCreated({ agent: streamAgent });
  host.setLabels("plain", {});
  host.setRunning("plain", true);
  host.setLastActivity("plain", iso(0));
  await host.emitCreated({ agent: { ...streamAgent, id: "plain" } });
  host.setLabels("root", { stream: "home" });
  host.setRunning("root", true);
  host.setLastActivity("root", iso(0));
  await host.emitCreated({ agent: { ...streamAgent, id: "root", parentAgentId: null } });
  clock.now = 500;
  await host.tick();
  assert.deepEqual(host.sent, []);
  assert.deepEqual(host.failures, []);
});

const QUIET_SAYS = ["its turn has run 30 minutes with no new activity"];
const ticketAgent: HostAgent = { ...streamAgent, id: "tkt-7", workspaceId: "w2", parentAgentId: "streams-0", title: "[Wave 1] 07 sample" };
const bundleAgent: HostAgent = { ...ticketAgent, id: "bnd-7", title: "[Wave 1] [07+08] sample" };
const TICKET_SUBJECT = { agentId: "tkt-7", wave: "1", ticket: "07" };
const BUNDLE_SUBJECT = { agentId: "bnd-7", wave: "1", bundle: "07", tickets: "07,08" };

/** `ticked()` with a ticket agent and a bundle agent, both running and quiet since minute 0. */
function tickedTickets() {
  const { host, clock } = ticked();
  host.setLabels("tkt-7", { wave: "1", ticket: "07" });
  host.setLabels("bnd-7", { wave: "1", bundle: "07", tickets: "07,08" });
  for (const id of ["tkt-7", "bnd-7"]) {
    host.setParent(id, "streams-0");
    host.setRunning(id, true);
    host.setLastActivity(id, iso(0));
  }
  return { host, clock };
}

test("a running ticket agent quiet for 30 minutes gets one Stall suspected to its parent, with the running Next line (#49)", async () => {
  const { host, clock } = tickedTickets();
  await host.emitCreated({ agent: ticketAgent });
  clock.now = 29;
  await host.tick();
  assert.deepEqual(host.sent, [], "29 minutes is not 30");
  clock.now = 30;
  await host.tick();
  assert.equal(host.sent.length, 1);
  assert.equal(host.sent[0]?.agentId, "streams-0");
  assert.equal(host.sent[0]?.text, MESSAGES.stallSuspected(TICKET_SUBJECT, QUIET_SAYS, "running"));
  assert.ok(
    host.sent[0]?.text.startsWith("Stall suspected: ticket 07 of wave 1, agent tkt-7, the sensor flagged: its turn has run 30 minutes with no new activity."),
  );
  assert.match(host.sent[0]?.text ?? "", /never prompt it/);
  assert.doesNotMatch(host.sent[0]?.text ?? "", /prompt agent/);
  assert.deepEqual(host.failures, []);
});

test("a running bundle agent quiet for 30 minutes gets one Stall suspected with the bundle body and line (#49)", async () => {
  const { host, clock } = tickedTickets();
  await host.emitCreated({ agent: bundleAgent });
  clock.now = 30;
  await host.tick();
  assert.equal(host.sent.length, 1);
  assert.equal(host.sent[0]?.agentId, "streams-0");
  assert.equal(host.sent[0]?.text, MESSAGES.stallSuspected(BUNDLE_SUBJECT, QUIET_SAYS, "running"));
  assert.ok(host.sent[0]?.text.startsWith("Stall suspected: bundle 07 (tickets 07,08) of wave 1, agent bnd-7, the sensor flagged:"));
  assert.match(host.sent[0]?.text ?? "", /leave bundle 07 alone/);
});

test("a ticket agent's idle stretch flags once, and again after new activity and 30 more quiet minutes (#49)", async () => {
  const { host, clock } = tickedTickets();
  await host.emitCreated({ agent: ticketAgent });
  clock.now = 30;
  await host.tick();
  clock.now = 35;
  await host.tick();
  clock.now = 90;
  await host.tick();
  assert.equal(host.sent.length, 1, "the same lastActivityAt flags once");
  host.setLastActivity("tkt-7", iso(90));
  clock.now = 119;
  await host.tick();
  assert.equal(host.sent.length, 1);
  clock.now = 120;
  await host.tick();
  assert.equal(host.sent.length, 2);
});

test("an idle ticket agent, an agent with neither role and a ticket agent with no parent get no tick message (#49)", async () => {
  const { host, clock } = tickedTickets();
  host.setRunning("tkt-7", false);
  await host.emitCreated({ agent: ticketAgent });
  host.setLabels("plain", { wave: "1" });
  host.setRunning("plain", true);
  host.setLastActivity("plain", iso(0));
  await host.emitCreated({ agent: { ...ticketAgent, id: "plain" } });
  host.setLabels("orphan", { wave: "1", ticket: "09" });
  host.setRunning("orphan", true);
  host.setLastActivity("orphan", iso(0));
  await host.emitCreated({ agent: { ...ticketAgent, id: "orphan", parentAgentId: null } });
  clock.now = 500;
  await host.tick();
  assert.deepEqual(host.sent, []);
  assert.deepEqual(host.failures, []);
});

test("a ticket and a bundle agent are recorded by their created, turn-ended and permission-requested hooks (#49)", async () => {
  for (const agent of [ticketAgent, bundleAgent]) {
    for (const emit of [
      (host: FakeHost) => host.emitCreated({ agent }),
      (host: FakeHost) => host.emitTurnEnded({ agent, outcome: done, timeline: working }),
      (host: FakeHost) => host.emitPermissionRequested({ agent, request: { id: "r1", name: "Bash", kind: "tool" } }),
    ]) {
      const { host, clock } = tickedTickets();
      await emit(host);
      host.sent.length = 0;
      clock.now = 30;
      await host.tick();
      assert.equal(host.sent.length, 1, `${agent.id} is watched after the hook`);
      assert.equal(host.sent[0]?.agentId, "streams-0");
      assert.match(host.sent[0]?.text ?? "", new RegExp(`agent ${agent.id},`));
    }
  }
});

test("the ticket agent's tick message is held while the parent is mid-turn and goes out at its turn end (#49)", async () => {
  const { host, clock } = tickedTickets();
  await host.emitCreated({ agent: ticketAgent });
  host.setRunning("streams-0", true);
  clock.now = 30;
  await host.tick();
  assert.deepEqual(host.sent, []);
  host.setRunning("streams-0", false);
  await host.emitTurnEnded({ agent: streams, outcome: done, timeline: [] });
  assert.equal(host.sent.length, 1);
  assert.equal(host.sent[0]?.text, MESSAGES.stallSuspected(TICKET_SUBJECT, QUIET_SAYS, "running"));
});

test("an archived ticket agent is forgotten: the tick no longer looks at it (#49)", async () => {
  const { host, clock } = tickedTickets();
  await host.emitCreated({ agent: ticketAgent });
  await host.emitArchived({ agent: ticketAgent });
  clock.now = 500;
  await host.tick();
  assert.deepEqual(host.sent, []);
});

test("a ticket agent whose host cannot answer is skipped for the tick and breaks no other (#49, T4)", async () => {
  const { host, clock } = tickedTickets();
  await host.emitCreated({ agent: ticketAgent });
  await host.emitCreated({ agent: bundleAgent });
  const running = host.isRunning.bind(host);
  host.isRunning = async (agentId) => {
    if (agentId === "tkt-7") throw new Error("no answer");
    return running(agentId);
  };
  clock.now = 30;
  await host.tick();
  assert.equal(host.sent.length, 1, "only the agent the host could read is flagged");
  assert.match(host.sent[0]?.text ?? "", /agent bnd-7,/);
  assert.deepEqual(host.failures, []);
});

test("a stream agent is recorded by its created, turn-ended and permission-requested hooks", async () => {
  for (const emit of [
    (host: FakeHost) => host.emitCreated({ agent: streamAgent }),
    (host: FakeHost) => host.emitTurnEnded({ agent: streamAgent, outcome: done, timeline: working }),
    (host: FakeHost) => host.emitPermissionRequested({ agent: streamAgent, request: { id: "r1", name: "Bash", kind: "tool" } }),
  ]) {
    const { host, clock } = ticked();
    await emit(host);
    host.sent.length = 0;
    clock.now = 30;
    await host.tick();
    assert.equal(host.sent.length, 1);
  }
});

test("a hook for an agent whose parent is a stream agent records that stream agent, so a reload mid-stream finds it", async () => {
  const { host, clock } = ticked();
  host.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  await host.emitTurnEnded({ agent: { ...streamAgent, id: "tkt-7", parentAgentId: "strm-3" }, outcome: done, timeline: working });
  host.sent.length = 0;
  clock.now = 30;
  await host.tick();
  assert.equal(host.sent.length, 1);
  assert.equal(host.sent[0]?.agentId, "streams-0");
  assert.ok(host.sent[0]?.text.startsWith(QUIET_TEXT));
});

test("the tick message is held while the parent is mid-turn and goes out at its turn end", async () => {
  const { host, clock } = ticked();
  await host.emitCreated({ agent: streamAgent });
  host.setRunning("streams-0", true);
  clock.now = 30;
  await host.tick();
  assert.deepEqual(host.sent, []);
  host.setRunning("streams-0", false);
  await host.emitTurnEnded({ agent: streams, outcome: done, timeline: [] });
  assert.equal(host.sent.length, 1);
  assert.equal(host.sent[0]?.agentId, "streams-0");
  assert.ok(host.sent[0]?.text.startsWith(QUIET_TEXT));
});

test("an archived stream agent is forgotten: the tick no longer looks at it", async () => {
  const { host, clock } = ticked();
  await host.emitCreated({ agent: streamAgent });
  await host.emitArchived({ agent: streamAgent });
  clock.now = 500;
  await host.tick();
  assert.deepEqual(host.sent, []);
});

test("a host that cannot give isRunning or lastActivityAt skips that agent for the tick and breaks no other (T4)", async () => {
  const { host, clock } = ticked();
  host.setLabels("strm-4", { stream: "other" });
  host.setParent("strm-4", "streams-0");
  host.setRunning("strm-4", true);
  host.setLastActivity("strm-4", iso(0));
  await host.emitCreated({ agent: streamAgent });
  await host.emitCreated({ agent: { ...streamAgent, id: "strm-4" } });
  const running = host.isRunning.bind(host);
  const activity = host.lastActivityAt.bind(host);
  host.isRunning = async (agentId) => {
    if (agentId === "strm-3") throw new Error("no answer");
    return running(agentId);
  };
  clock.now = 30;
  await host.tick();
  assert.equal(host.sent.length, 1, "only the agent the host could read is flagged");
  assert.match(host.sent[0]?.text ?? "", /agent strm-4/);
  host.isRunning = running;
  host.lastActivityAt = async (agentId) => {
    if (agentId === "strm-3") throw new Error("no answer");
    return activity(agentId);
  };
  clock.now = 75;
  host.setLastActivity("strm-4", iso(40));
  await host.tick();
  assert.equal(host.sent.length, 2, "strm-4 has a new stretch, which flags; strm-3 stays skipped");
  assert.deepEqual(host.failures, []);
});

test("an agent with no lastActivityAt, or one that is not a time, sends nothing (T4)", async () => {
  const { host, clock } = ticked();
  await host.emitCreated({ agent: streamAgent });
  host.setLastActivity("strm-3", null);
  clock.now = 500;
  await host.tick();
  host.setLastActivity("strm-3", "not a time");
  await host.tick();
  assert.deepEqual(host.sent, []);
  assert.deepEqual(host.failures, []);
});

test("turn-end checks still never evaluate quiet-running: a ticket turn that adds items sends nothing", async () => {
  const host = new FakeHost();
  registerStallSensor(host);
  host.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  const ticket: HostAgent = { ...streamAgent, id: "tkt-7" };
  await host.emitTurnEnded({ agent: ticket, outcome: done, timeline: working });
  assert.deepEqual(host.sent, []);
});
