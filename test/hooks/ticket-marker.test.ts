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
