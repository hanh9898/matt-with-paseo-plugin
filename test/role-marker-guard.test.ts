import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { registerTicketMarker } from "../server/hooks/ticket-marker.ts";
import { hasTicketMarker, ROLE_ENV, TICKET_ROLE } from "../shared/role-marker.ts";
import { FakeHost } from "./support/fake-host.ts";

const script = fileURLToPath(new URL("../guard/git-guard.mjs", import.meta.url));

/** Runs the guard as an agent's hook runner does, in exactly the agent's environment `agentEnv` plus the machine's. */
function guard(command: string, agentEnv: Readonly<Record<string, string | undefined>>) {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env[ROLE_ENV];
  Object.assign(env, agentEnv);
  const done = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    env,
    encoding: "utf8",
  });
  return { status: done.status, stderr: done.stderr };
}

test("the guard refuses exactly where hasTicketMarker says the agent is a ticket agent", () => {
  const environments: Record<string, string | undefined>[] = [
    {},
    { [ROLE_ENV]: undefined },
    { [ROLE_ENV]: "" },
    { [ROLE_ENV]: "Ticket" },
    { [ROLE_ENV]: "orchestrator" },
    { [ROLE_ENV]: "stream" },
    { OTHER: TICKET_ROLE },
    { [ROLE_ENV]: TICKET_ROLE },
  ];
  assert.ok(environments.some((env) => hasTicketMarker(env)), "one environment is a ticket agent's");
  assert.ok(environments.some((env) => !hasTicketMarker(env)), "one is not");
  for (const env of environments) {
    const done = guard("git push", env);
    assert.equal(done.status, hasTicketMarker(env) ? 2 : 0, JSON.stringify(env));
  }
});

test("the environment the create hook builds tells the guard a ticket agent from the orchestrator", async () => {
  const host = new FakeHost();
  registerTicketMarker(host);
  const ticket = await host.create({ env: {}, title: "[Wave 1] 14 Role identity on labels" });
  const orchestrator = await host.create({ env: {}, title: "[Stream] matt-with-paseo-plugin" });
  const untitled = await host.create({ env: {} });

  assert.equal(hasTicketMarker(ticket.env), true);
  assert.equal(guard("git push", ticket.env).status, 2);
  assert.equal(guard("git checkout main", ticket.env).status, 2);
  assert.equal(guard("git commit -m x", ticket.env).status, 0, "a ticket agent still commits on its own branch");

  for (const created of [orchestrator, untitled]) {
    assert.equal(hasTicketMarker(created.env), false);
    assert.equal(guard("git push", created.env).status, 0, "the orchestrator keeps its git");
    assert.equal(guard("git checkout main", created.env).status, 0);
  }
});
