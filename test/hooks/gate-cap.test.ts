import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { registerGateCap } from "../../server/hooks/gate-cap.ts";
import type { HostAgent } from "../../server/host.ts";
import { CAP_SHARE_ENV } from "../../shared/gate-cap.ts";
import { FakeHost } from "../support/fake-host.ts";

const orchestrator: HostAgent = { id: "stream-1", workspaceId: "w0", parentAgentId: null, provider: "sample", cwd: "/repo", title: "[Stream] demo" };

function ticketAgent(n: number): HostAgent {
  return { ...orchestrator, id: `tkt-${n}`, workspaceId: `w${n}`, parentAgentId: "stream-1", title: `[Wave 1] ${String(n).padStart(2, "0")}` };
}

/** A host with the handler registered for a machine of `processors`, and eight ticket agents labelled. */
function machine(processors: number, env: Record<string, string> = {}): FakeHost {
  const host = new FakeHost();
  registerGateCap(host, { processors, env });
  host.setLabels("stream-1", { stream: "demo" });
  for (let n = 1; n <= 8; n++) host.setLabels(`tkt-${n}`, { stream: "demo", wave: "1", ticket: String(n).padStart(2, "0") });
  return host;
}

async function start(host: FakeHost, n: number): Promise<void> {
  host.setRunning(`tkt-${n}`, true);
  await host.emitCreated({ agent: ticketAgent(n) });
}

test("ticket agents up to the cap send nothing; the one past it tells its orchestrator to queue the rest (criterion 2)", async () => {
  const host = machine(8);
  for (const n of [1, 2, 3, 4]) await start(host, n);
  assert.deepEqual([...host.sent], [], "four agents run against a cap of four");
  await start(host, 5);
  assert.equal(host.sent.length, 1);
  const [message] = host.sent;
  assert.equal(message?.agentId, "stream-1");
  assert.match(message?.text ?? "", /^Gate cap passed: ticket 05 of wave 1, agent tkt-5, 5 ticket agents run against a cap of 4 concurrent gates\./);
  assert.ok(message?.text.split("\n").at(-1)?.startsWith("Next: "));
  assert.match(message?.text ?? "", /queue/);
  assert.deepEqual(host.failures, []);
});

test("the setting changes the cap: a quarter of eight processors is two", async () => {
  const host = machine(8, { [CAP_SHARE_ENV]: "0.25" });
  await start(host, 1);
  await start(host, 2);
  assert.deepEqual([...host.sent], []);
  await start(host, 3);
  assert.match(host.sent[0]?.text ?? "", /3 ticket agents run against a cap of 2/);
});

test("an agent that is not running does not count, and an archived one leaves the count", async () => {
  const host = machine(4);
  await start(host, 1);
  await start(host, 2);
  host.setRunning("tkt-2", false);
  await start(host, 3);
  assert.deepEqual([...host.sent], [], "two running against a cap of two");
  host.setRunning("tkt-2", true);
  await host.emitArchived({ agent: ticketAgent(1) });
  host.setRunning("tkt-1", false);
  host.setRunning("tkt-3", false);
  await start(host, 4);
  assert.deepEqual([...host.sent], [], "the archived agent no longer counts");
});

test("a message for an orchestrator that is mid-turn is held and goes out when its turn ends", async () => {
  const host = machine(2);
  host.setRunning("stream-1", true);
  await start(host, 1);
  await start(host, 2);
  assert.deepEqual([...host.sent], []);
  host.setRunning("stream-1", false);
  await host.emitTurnEnded({ agent: orchestrator, outcome: { kind: "completed" }, timeline: [] });
  assert.equal(host.sent.length, 1);
  assert.match(host.sent[0]?.text ?? "", /^Gate cap passed/);
});

test("an agent the plugin does not recognise by its labels is left alone (T3), and so is one with nobody to tell", async () => {
  const host = machine(2);
  host.setLabels("half", { wave: "1" });
  host.setLabels("bare", {});
  host.setLabels("lone", { wave: "1", ticket: "09" });
  for (const id of ["half", "bare", "lone", "a", "b"]) host.setRunning(id, true);
  for (const id of ["half", "bare", "a", "b"]) await host.emitCreated({ agent: { ...ticketAgent(1), id } });
  await host.emitCreated({ agent: { ...ticketAgent(1), id: "lone", parentAgentId: null } });
  assert.deepEqual([...host.sent], []);
});

test("it fails open (T4): a host that cannot say who runs stops nothing and sends nothing", async () => {
  const host = machine(2);
  host.isRunning = async () => {
    throw new Error("host down");
  };
  await start(host, 1);
  await start(host, 2);
  await start(host, 3);
  assert.deepEqual([...host.sent], []);
  assert.deepEqual(host.failures, []);
});

test("the entry registers the gate cap, and no agent id is named in its source", () => {
  const entry = readFileSync(new URL("../../index.server.ts", import.meta.url), "utf8");
  assert.match(entry, /registerGateCap\(hooks\)/);
  const source = readFileSync(new URL("../../server/hooks/gate-cap.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /claude|codex|opencode|gemini/i);
});

function bundleAgent(n: number): HostAgent {
  return { ...orchestrator, id: `bnd-${n}`, workspaceId: `wb${n}`, parentAgentId: "stream-1", title: `[Wave 1] [70+71] bundle ${n}` };
}

async function startBundle(host: FakeHost, n: number): Promise<void> {
  host.setLabels(`bnd-${n}`, { stream: "demo", wave: "1", bundle: "70", tickets: "70,71" });
  host.setRunning(`bnd-${n}`, true);
  await host.emitCreated({ agent: bundleAgent(n) });
}

test("a bundle agent counts once toward the cap, however many tickets it carries", async () => {
  const host = machine(2);
  await startBundle(host, 1);
  assert.deepEqual([...host.sent], [], "one bundle agent of two tickets is one running agent against a cap of one");
  await start(host, 2);
  assert.match(host.sent[0]?.text ?? "", /^Gate cap passed: ticket 02 of wave 1, agent tkt-2, 2 ticket agents run against a cap of 1 concurrent gates\./);
});

test("the agent that passes the cap is told with the bundle clause when it is a bundle agent", async () => {
  const host = machine(2);
  await start(host, 1);
  await startBundle(host, 2);
  assert.equal(host.sent.length, 1);
  assert.match(host.sent[0]?.text ?? "", /^Gate cap passed: bundle 70 \(tickets 70,71\) of wave 1, agent bnd-2, 2 ticket agents run against a cap of 1 concurrent gates\./);
  assert.ok(host.sent[0]?.text.split("\n").at(-1)?.startsWith("Next: "));
});

test("an archived bundle agent leaves the count", async () => {
  const host = machine(2);
  await startBundle(host, 1);
  await host.emitArchived({ agent: bundleAgent(1) });
  host.setRunning("bnd-1", false);
  await start(host, 2);
  assert.deepEqual([...host.sent], []);
});
