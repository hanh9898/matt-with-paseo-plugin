import assert from "node:assert/strict";
import { test } from "node:test";
import { registerWaitingCount } from "../../server/hooks/waiting-count.ts";
import type { HostAgent, PermissionRequest } from "../../server/host.ts";
import { FakeHost } from "../support/fake-host.ts";

const streamAgent: HostAgent = {
  id: "stream-1",
  workspaceId: "w0",
  parentAgentId: null,
  provider: "sample",
  cwd: "/repo",
  title: "[Stream] demo",
};
const ticketAgent: HostAgent = { ...streamAgent, id: "tkt-7", workspaceId: "w1", parentAgentId: "stream-1", title: "[Wave 1] 07" };
const otherTicket: HostAgent = { ...ticketAgent, id: "tkt-8" };
const stranger: HostAgent = { ...streamAgent, id: "stranger", title: null };

const question = (id: string): PermissionRequest => ({ id, name: "AskUserQuestion", kind: "question" });

function counted(): FakeHost {
  const host = new FakeHost();
  registerWaitingCount(host);
  host.setLabels("stream-1", { stream: "demo" });
  host.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  host.setLabels("tkt-8", { wave: "1", ticket: "08" });
  return host;
}

test("a checkpoint that opens on a ticket agent adds one to its orchestrator's count", async () => {
  const host = counted();
  assert.equal(await host.waitingCount("stream-1"), 0);
  await host.emitPermissionRequested({ agent: ticketAgent, request: question("r1") });
  assert.equal(await host.waitingCount("stream-1"), 1);
  await host.emitPermissionRequested({ agent: otherTicket, request: question("r2") });
  assert.equal(await host.waitingCount("stream-1"), 2);
  assert.deepEqual(host.failures, []);
});

test("a checkpoint that settles takes one off, however it was answered", async () => {
  const host = counted();
  await host.emitPermissionRequested({ agent: ticketAgent, request: question("r1") });
  await host.emitPermissionRequested({ agent: ticketAgent, request: question("r2") });
  await host.emitPermissionResolved({ agent: ticketAgent, requestId: "r1" });
  assert.equal(await host.waitingCount("stream-1"), 1);
  await host.emitPermissionResolved({ agent: ticketAgent, requestId: "r2" });
  assert.equal(await host.waitingCount("stream-1"), 0);
});

test("a question the stream agent asks itself waits in its own chat", async () => {
  const host = counted();
  await host.emitPermissionRequested({ agent: streamAgent, request: question("r1") });
  assert.equal(await host.waitingCount("stream-1"), 1);
  await host.emitPermissionResolved({ agent: streamAgent, requestId: "r1" });
  assert.equal(await host.waitingCount("stream-1"), 0);
});

test("a resolution for a request that never opened changes nothing and never goes below zero", async () => {
  const host = counted();
  await host.emitPermissionResolved({ agent: ticketAgent, requestId: "unknown" });
  assert.equal(await host.waitingCount("stream-1"), 0);
  await host.emitPermissionRequested({ agent: ticketAgent, request: question("r1") });
  await host.emitPermissionResolved({ agent: ticketAgent, requestId: "unknown" });
  await host.emitPermissionResolved({ agent: ticketAgent, requestId: "r1" });
  await host.emitPermissionResolved({ agent: ticketAgent, requestId: "r1" });
  assert.equal(await host.waitingCount("stream-1"), 0);
});

test("the same request announced twice counts once", async () => {
  const host = counted();
  await host.emitPermissionRequested({ agent: ticketAgent, request: question("r1") });
  await host.emitPermissionRequested({ agent: ticketAgent, request: question("r1") });
  assert.equal(await host.waitingCount("stream-1"), 1);
});

test("an agent the plugin does not recognise by its labels adds nothing (T3)", async () => {
  const host = counted();
  host.setLabels("half", { wave: "1" });
  host.setLabels("review", { stream: "demo", wave: "1" });
  await host.emitPermissionRequested({ agent: stranger, request: question("r1") });
  await host.emitPermissionRequested({ agent: { ...ticketAgent, id: "half" }, request: question("r2") });
  await host.emitPermissionRequested({ agent: { ...ticketAgent, id: "review" }, request: question("r3") });
  assert.equal(await host.waitingCount("stream-1"), 0);
  assert.equal(await host.waitingCount("stranger"), 0);
  assert.equal(await host.waitingCount("orchestrator"), 0);
});

test("a ticket agent with no orchestrator has nobody's count to join", async () => {
  const host = counted();
  await host.emitPermissionRequested({ agent: { ...ticketAgent, parentAgentId: null }, request: question("r1") });
  assert.equal(await host.waitingCount("stream-1"), 0);
  assert.equal(await host.waitingCount("tkt-7"), 0);
});

test("a turn that ends drops what its agent still had open", async () => {
  const host = counted();
  await host.emitPermissionRequested({ agent: ticketAgent, request: question("r1") });
  await host.emitPermissionRequested({ agent: otherTicket, request: question("r2") });
  await host.emitTurnEnded({ agent: ticketAgent, outcome: { kind: "canceled", reason: "user" }, timeline: [] });
  assert.equal(await host.waitingCount("stream-1"), 1);
});

test("an archived agent drops what it had open", async () => {
  const host = counted();
  await host.emitPermissionRequested({ agent: ticketAgent, request: question("r1") });
  await host.emitPermissionRequested({ agent: streamAgent, request: question("r2") });
  await host.emitArchived({ agent: ticketAgent });
  assert.equal(await host.waitingCount("stream-1"), 1);
  await host.emitArchived({ agent: streamAgent });
  assert.equal(await host.waitingCount("stream-1"), 0);
});

test("a host that cannot read the labels leaves the request out and does not throw into Paseo (T4)", async () => {
  class Blind extends FakeHost {
    override async labelsOf(): Promise<Record<string, string>> {
      throw new Error("no labels");
    }
  }
  const host = new Blind();
  registerWaitingCount(host);
  await host.emitPermissionRequested({ agent: ticketAgent, request: question("r1") });
  assert.equal(await host.waitingCount("stream-1"), 0);
  assert.equal(host.failures.length, 1);
});

test("the count never carries a request's input or a question's text (T6)", async () => {
  const host = counted();
  await host.emitPermissionRequested({
    agent: ticketAgent,
    request: { id: "r1", name: "AskUserQuestion", kind: "question", input: { secret: "hunter2" } },
  });
  assert.equal(typeof (await host.waitingCount("stream-1")), "number");
  assert.deepEqual(host.sent, []);
  assert.deepEqual(host.rows, []);
});
