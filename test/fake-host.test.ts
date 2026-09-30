import assert from "node:assert/strict";
import { test } from "node:test";
import type { HostAgent, HostHooks, PermissionRequestedEvent } from "../server/host.ts";
import { FakeHost } from "./support/fake-host.ts";

const orchestrator: HostAgent = {
  id: "orchestrator",
  workspaceId: "workspace",
  parentAgentId: null,
  provider: "claude",
  cwd: "/repo",
  title: null,
};
const worker: HostAgent = { ...orchestrator, id: "worker", parentAgentId: "orchestrator" };

/** A handler written the way ticket handlers are: it takes the hooks and reaches Paseo only through the host it is given. */
function registerRelay(hooks: HostHooks): void {
  hooks.onTurnEnded(async ({ agent, outcome }, host) => {
    if (agent.parentAgentId === null) return;
    await host.send(agent.parentAgentId, `${agent.id} ended: ${outcome.kind}`);
  });
  hooks.onPermissionRequested(async ({ agent, request }, host) => {
    await host.respondToPermission(agent.id, request.id, { behavior: "deny", message: "held" });
    await host.appendTimelineRow(agent.id, { kind: "held", version: 1, data: { request: request.id } });
  });
}

test("a handler registered on the fake runs on an emitted event, with the fake as its host", async () => {
  const host = new FakeHost();
  registerRelay(host);
  await host.emitTurnEnded({ agent: worker, outcome: { kind: "completed" }, timeline: [] });
  assert.deepEqual(host.sent, [{ agentId: "orchestrator", text: "worker ended: completed" }]);
});

test("the fake records answers and timeline rows without a daemon", async () => {
  const host = new FakeHost();
  registerRelay(host);
  const event: PermissionRequestedEvent = { agent: worker, request: { id: "r1", name: "Bash", kind: "tool" } };
  await host.emitPermissionRequested(event);
  assert.deepEqual(host.answers, [{ agentId: "worker", requestId: "r1", answer: { behavior: "deny", message: "held" } }]);
  assert.deepEqual(host.rows, [{ agentId: "worker", row: { kind: "held", version: 1, data: { request: "r1" } } }]);
});

test("a handler that throws does not reach the caller and is recorded (T4)", async () => {
  const host = new FakeHost();
  host.onCreated(() => {
    throw new Error("boom");
  });
  let later = false;
  host.onCreated(() => {
    later = true;
  });
  await host.emitCreated({ agent: worker });
  assert.equal(host.failures.length, 1);
  assert.equal(host.failures[0]?.hook, "agent.created");
  assert.ok(later, "the next handler still runs");
});

test("beforeCreate handlers change the environment in order; a throwing one leaves it as it was", async () => {
  const host = new FakeHost();
  host.beforeCreate(({ env }) => ({ env: { ...env, FIRST: "1" } }));
  host.beforeCreate(() => {
    throw new Error("boom");
  });
  host.beforeCreate(({ env }) => ({ env: { ...env, SECOND: env["FIRST"] ?? "missing" } }));
  const created = await host.create({ env: { KEPT: "yes" } });
  assert.deepEqual(created.env, { KEPT: "yes", FIRST: "1", SECOND: "1" });
  assert.equal(host.failures.length, 1);
});

test("beforeCreate handlers see the title the agent is created with", async () => {
  const host = new FakeHost();
  const seen: unknown[] = [];
  host.beforeCreate((request) => {
    seen.push(request.title);
  });
  await host.create({ env: {}, title: "[Wave 1] 02 x" });
  await host.create({ env: {} });
  assert.deepEqual(seen, ["[Wave 1] 02 x", undefined]);
});

test("with no beforeCreate handler the environment is unchanged", async () => {
  const host = new FakeHost();
  assert.deepEqual((await host.create({ env: { A: "b" } })).env, { A: "b" });
});

test("labelsOf reports the labels a test sets, and none for an agent it does not know", async () => {
  const host = new FakeHost();
  host.setLabels("worker", { role: "ticket" });
  assert.deepEqual(await host.labelsOf("worker"), { role: "ticket" });
  assert.deepEqual(await host.labelsOf("stranger"), {});
});

test("isRunning reports what a test sets, and idle for an agent it does not know", async () => {
  const host = new FakeHost();
  host.setRunning("orchestrator", true);
  assert.equal(await host.isRunning("orchestrator"), true);
  host.setRunning("orchestrator", false);
  assert.equal(await host.isRunning("orchestrator"), false);
  assert.equal(await host.isRunning("stranger"), false);
});

test("the fake emits the archived event to its handlers", async () => {
  const host = new FakeHost();
  const seen: string[] = [];
  host.onArchived(({ agent }) => {
    seen.push(agent.id);
  });
  await host.emitArchived({ agent: orchestrator });
  assert.deepEqual(seen, ["orchestrator"]);
});

test("the fake emits the permission-resolved event to its handlers", async () => {
  const host = new FakeHost();
  const seen: string[] = [];
  host.onPermissionResolved(({ agent, requestId }) => {
    seen.push(`${agent.id}:${requestId}`);
  });
  await host.emitPermissionResolved({ agent: worker, requestId: "r1" });
  assert.deepEqual(seen, ["worker:r1"]);
});

test("the fake answers a waiting-count query with the handler's count, and zero when none is served", async () => {
  const host = new FakeHost();
  assert.equal(await host.waitingCount("orchestrator"), 0);
  host.serveWaitingCount((agentId) => (agentId === "orchestrator" ? 3 : 0));
  assert.equal(await host.waitingCount("orchestrator"), 3);
  assert.equal(await host.waitingCount("stranger"), 0);
});

test("a waiting-count handler that throws is recorded and counts as zero (T4)", async () => {
  const host = new FakeHost();
  host.serveWaitingCount(() => {
    throw new Error("boom");
  });
  assert.equal(await host.waitingCount("orchestrator"), 0);
  assert.equal(host.failures.length, 1);
  assert.equal(host.failures[0]?.hook, "waiting.count");
});

test("beforeSessionOpen handlers change the environment in order; a throwing one leaves it as it was", async () => {
  const host = new FakeHost();
  host.beforeSessionOpen(({ env }) => ({ env: { ...env, FIRST: "1" } }));
  host.beforeSessionOpen(() => {
    throw new Error("boom");
  });
  host.beforeSessionOpen(({ env }) => ({ env: { ...env, SECOND: env["FIRST"] ?? "missing" } }));
  const opened = await host.openSession({ agentId: "worker", env: { KEPT: "yes" } });
  assert.deepEqual(opened.env, { KEPT: "yes", FIRST: "1", SECOND: "1" });
  assert.equal(host.failures.length, 1);
  assert.equal(host.failures[0]?.hook, "agent.session_open");
});

test("beforeSessionOpen handlers see the agent id, the reason, the title and the labels the fake holds", async () => {
  const host = new FakeHost();
  const seen: unknown[] = [];
  host.beforeSessionOpen((request) => {
    seen.push(request);
  });
  host.setTitle("worker", "[Wave 1] 02 x");
  host.setLabels("worker", { wave: "1", ticket: "02" });
  await host.openSession({ agentId: "worker", env: { A: "b" }, reason: "resume" });
  await host.openSession({ agentId: "ghost", env: {} });
  assert.deepEqual(seen, [
    { agentId: "worker", reason: "resume", env: { A: "b" }, title: "[Wave 1] 02 x", labels: { wave: "1", ticket: "02" } },
    { agentId: "ghost", reason: "resume", env: {}, title: null, labels: {} },
  ]);
});

test("with no beforeSessionOpen handler the environment is unchanged", async () => {
  const host = new FakeHost();
  assert.deepEqual((await host.openSession({ agentId: "worker", env: { A: "b" } })).env, { A: "b" });
});

test("the fake serves the budget's state to the pill's read, false when none is served or the handler throws (T4)", async () => {
  const host = new FakeHost();
  assert.deepEqual(await host.pill("a"), { count: 0, budgetSpent: false });
  host.serveWaitingCount(() => 3);
  host.serveBudgetSpent(() => true);
  assert.deepEqual(await host.pill("a"), { count: 3, budgetSpent: true });
  host.serveBudgetSpent(() => {
    throw new Error("boom");
  });
  assert.deepEqual(await host.pill("a"), { count: 3, budgetSpent: false });
  assert.equal(host.failures.length, 1);
});

test("a row appended again under the same id replaces the earlier one, and a row with no id stays beside it", async () => {
  const host = new FakeHost();
  await host.appendTimelineRow("worker", { id: "card", kind: "report", version: 1, data: { decided: 1 } });
  await host.appendTimelineRow("worker", { kind: "note", version: 1, data: {} });
  await host.appendTimelineRow("worker", { id: "card", kind: "report", version: 1, data: { decided: 2 } });
  await host.appendTimelineRow("other", { id: "card", kind: "report", version: 1, data: { decided: 9 } });
  assert.deepEqual(host.timeline("worker"), [
    { id: "card", kind: "report", version: 1, data: { decided: 2 } },
    { kind: "note", version: 1, data: {} },
  ]);
  assert.deepEqual(host.timeline("other"), [{ id: "card", kind: "report", version: 1, data: { decided: 9 } }]);
  assert.deepEqual(host.timeline("nobody"), []);
  assert.equal(host.rows.length, 4, "every append is still recorded in `rows`");
});
