import assert from "node:assert/strict";
import { test } from "node:test";
import { registerTicketMarker } from "../../server/hooks/ticket-marker.ts";
import { hasTicketMarker, ROLE_ENV, TICKET_ROLE } from "../../shared/role-marker.ts";
import { FakeHost } from "../support/fake-host.ts";

function marked(): FakeHost {
  const host = new FakeHost();
  registerTicketMarker(host);
  return host;
}

test("a ticket agent is created with the marker, and the rest of its environment is kept", async () => {
  const host = marked();
  const created = await host.create({ env: { KEPT: "yes" }, title: "[Wave 1] 02 Git guard for ticket agents" });
  assert.deepEqual(created.env, { KEPT: "yes", [ROLE_ENV]: TICKET_ROLE });
  assert.equal(hasTicketMarker(created.env), true);
  assert.deepEqual(host.failures, []);
});

test("a ticket agent is created with the marker whatever its wave and ticket numbers", async () => {
  const host = marked();
  for (const title of ["[Wave 2] 14 Export CSV", "[Wave 10] 105 x", "[Wave 1] 02"]) {
    const created = await host.create({ env: {}, title });
    assert.equal(hasTicketMarker(created.env), true, title);
  }
});

test("every other agent is created as Paseo made it (T3)", async () => {
  const host = marked();
  const titles: (string | null | undefined)[] = [
    undefined,
    null,
    "",
    "[Stream] matt-with-paseo-plugin",
    "[Wave 1]",
    "[Wave x] 02 y",
    "[Wave 1] ticket two",
    "Wave 1 02 x",
    " [Wave 1] 02 x",
    "notes on [Wave 1] 02 x",
    "[mwp-smoke] orchestrator",
    "Fix the login bug",
  ];
  for (const title of titles) {
    const created = await host.create({ env: { KEPT: "yes" }, title });
    assert.deepEqual(created.env, { KEPT: "yes" }, `title ${JSON.stringify(title)}`);
    assert.equal(hasTicketMarker(created.env), false);
  }
  assert.deepEqual((await host.create({ env: { KEPT: "yes" } })).env, { KEPT: "yes" });
});

test("an environment's own marker stays as it is, whatever the title", async () => {
  const host = marked();
  assert.deepEqual((await host.create({ env: { [ROLE_ENV]: "orchestrator" }, title: "[Stream] x" })).env, { [ROLE_ENV]: "orchestrator" });
  assert.equal(hasTicketMarker((await host.create({ env: { [ROLE_ENV]: TICKET_ROLE }, title: "[Stream] x" })).env), true);
});

test("the handler needs no label and no agent id: neither exists when Paseo creates the agent", async () => {
  const host = marked();
  await host.create({ env: {}, title: "[Wave 1] 02 x" });
  assert.deepEqual(host.sent, []);
  assert.deepEqual(host.answers, []);
});

test("hasTicketMarker reads the ticket role and nothing else", () => {
  assert.equal(hasTicketMarker({ [ROLE_ENV]: TICKET_ROLE }), true);
  for (const env of [{}, { [ROLE_ENV]: "" }, { [ROLE_ENV]: "Ticket" }, { [ROLE_ENV]: "orchestrator" }, { OTHER: TICKET_ROLE }, { [ROLE_ENV]: undefined }]) {
    assert.equal(hasTicketMarker(env), false, JSON.stringify(env));
  }
});

/** Runs `fn` with `console.error` recorded, so a test reads the lines the handler logged. */
async function logged(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines;
}

test("a resumed ticket agent is marked when its session opens, by its title, and the rest of its environment is kept", async () => {
  const host = marked();
  host.setTitle("worker", "[Wave 2] 35 Re-set the ticket marker");
  const opened = await host.openSession({ agentId: "worker", env: { KEPT: "yes" } });
  assert.deepEqual(opened.env, { KEPT: "yes", [ROLE_ENV]: TICKET_ROLE });
  assert.deepEqual(host.failures, []);
});

test("a resumed ticket agent is marked by its labels when the title is not there", async () => {
  const host = marked();
  host.setLabels("worker", { wave: "2", ticket: "35" });
  const opened = await host.openSession({ agentId: "worker", env: {}, reason: "resume" });
  assert.equal(hasTicketMarker(opened.env), true);
});

test("every other agent keeps its environment when its session opens", async () => {
  const host = marked();
  host.setTitle("plain", "Fix the login bug");
  host.setLabels("plain", { wave: "2" });
  host.setTitle("stream", "[Stream] matt-with-paseo-plugin");
  host.setLabels("stream", { stream: "x" });
  for (const agentId of ["plain", "stream"]) {
    const opened = await host.openSession({ agentId, env: { KEPT: "yes" } });
    assert.deepEqual(opened.env, { KEPT: "yes" }, agentId);
  }
});

test("an environment's own marker is kept when the session opens", async () => {
  const host = marked();
  host.setTitle("worker", "[Wave 2] 35 x");
  assert.deepEqual((await host.openSession({ agentId: "worker", env: { [ROLE_ENV]: "orchestrator" } })).env, { [ROLE_ENV]: "orchestrator" });
  assert.deepEqual((await host.openSession({ agentId: "worker", env: { [ROLE_ENV]: TICKET_ROLE } })).env, { [ROLE_ENV]: TICKET_ROLE });
});

test("an agent whose title and labels cannot be read is left unmarked, with one logged line and nothing thrown", async () => {
  const host = marked();
  let opened: { env: Record<string, string> } | undefined;
  const lines = await logged(async () => {
    opened = await host.openSession({ agentId: "ghost", env: { KEPT: "yes" } });
  });
  assert.deepEqual(opened?.env, { KEPT: "yes" });
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /^\[matt-with-paseo\] /);
  assert.match(lines[0] ?? "", /ghost/);
  assert.deepEqual(host.failures, []);
});

test("an agent that is read and is not a ticket agent logs nothing", async () => {
  const host = marked();
  host.setTitle("plain", "Fix the login bug");
  const lines = await logged(async () => void (await host.openSession({ agentId: "plain", env: {} })));
  assert.deepEqual(lines, []);
});
