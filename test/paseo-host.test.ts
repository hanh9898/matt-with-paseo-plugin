import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { connectPaseo } from "../server/paseo-host.ts";

/** Stands in for the SDK's server context: keeps each hook's registered function and fires it with a stub `paseo`. */
function stubServer() {
  const listeners = new Map<string, unknown>();
  const server = {
    on(name: string, handler: unknown) {
      listeners.set(name, handler);
      return () => {};
    },
    before(name: string, handler: unknown) {
      listeners.set(`before:${name}`, handler);
      return () => {};
    },
  };
  async function fire(name: string, ...args: unknown[]): Promise<unknown> {
    const handler = listeners.get(name);
    if (typeof handler !== "function") throw new Error(`nothing registered for ${name}`);
    return handler(...args);
  }
  return { server, fire, listeners };
}

/** The slice of the SDK's `paseo` the adapter calls, recording each call. */
function stubPaseo(labels: Record<string, string> = {}) {
  const calls: { agentId: string; method: string; args: unknown[] }[] = [];
  const paseo = {
    agents: {
      ref(agentId: string) {
        return {
          send: async (...args: unknown[]) => void calls.push({ agentId, method: "send", args }),
          respondToPermission: async (...args: unknown[]) =>
            void calls.push({ agentId, method: "respondToPermission", args }),
          refresh: async () => ({ agent: { labels } }),
          timeline: { append: async (...args: unknown[]) => void calls.push({ agentId, method: "append", args }) },
        };
      },
    },
  };
  return { paseo, calls };
}

const agent = { id: "worker", workspaceId: "w", parentAgentId: "orchestrator", provider: "claude", cwd: "/repo", title: null };

test("each host hook registers one Paseo lifecycle hook", () => {
  const { server, listeners } = stubServer();
  const hooks = connectPaseo(server);
  hooks.onCreated(() => {});
  hooks.onArchived(() => {});
  hooks.onTurnEnded(() => {});
  hooks.onPermissionRequested(() => {});
  hooks.beforeCreate(() => {});
  assert.deepEqual([...listeners.keys()].sort(), [
    "agent.archived",
    "agent.created",
    "agent.permission_requested",
    "agent.turn_ended",
    "before:agent.create",
  ]);
});

test("an event reaches the handler narrowed to the port's shape, with a host bound to that call's paseo", async () => {
  const { server, fire } = stubServer();
  const { paseo, calls } = stubPaseo();
  const seen: unknown[] = [];
  connectPaseo(server).onTurnEnded(async (event, host) => {
    seen.push(event);
    await host.send("orchestrator", "ended");
  });
  const timeline = [{ type: "user_message" }];
  await fire("agent.turn_ended", { agent, turnId: "t", outcome: { kind: "completed" }, timeline }, { paseo });
  assert.deepEqual(seen, [{ agent, outcome: { kind: "completed" }, timeline }]);
  assert.deepEqual(calls, [{ agentId: "orchestrator", method: "send", args: ["ended"] }]);
});

test("a permission request reaches the handler with its id, name, kind and input", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo();
  const seen: unknown[] = [];
  connectPaseo(server).onPermissionRequested((event) => {
    seen.push(event.request);
  });
  const request = { id: "r1", provider: "claude", name: "AskUserQuestion", kind: "question", input: { questions: [] } };
  await fire("agent.permission_requested", { agent, request }, { paseo });
  assert.deepEqual(seen, [{ id: "r1", name: "AskUserQuestion", kind: "question", input: { questions: [] } }]);
});

test("the host's actions become the matching Paseo calls", async () => {
  const { server, fire } = stubServer();
  const { paseo, calls } = stubPaseo({ role: "ticket" });
  let labels: unknown;
  connectPaseo(server).onCreated(async (_event, host) => {
    labels = await host.labelsOf("worker");
    await host.respondToPermission("worker", "r1", { behavior: "allow", updatedInput: { answers: { Colour: "Red" } } });
    await host.appendTimelineRow("worker", { id: "card", kind: "report", version: 1, data: { decided: 2 } });
  });
  await fire("agent.created", { agent }, { paseo });
  assert.deepEqual(labels, { role: "ticket" });
  assert.deepEqual(calls, [
    {
      agentId: "worker",
      method: "respondToPermission",
      args: [{ requestId: "r1", response: { behavior: "allow", updatedInput: { answers: { Colour: "Red" } } } }],
    },
    {
      agentId: "worker",
      method: "append",
      args: [{ type: "plugin", id: "card", kind: "report", version: 1, data: { decided: 2 } }],
    },
  ]);
});

test("a handler that throws is logged with the event and the agent's id and does not reach Paseo (T4)", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo();
  const log = mock.method(console, "error", () => {});
  try {
    connectPaseo(server).onArchived(() => {
      throw new Error("boom");
    });
    await assert.doesNotReject(fire("agent.archived", { agent, archivedAt: "now" }, { paseo }));
    const line = String(log.mock.calls[0]?.arguments[0]);
    assert.match(line, /agent\.archived/);
    assert.match(line, /worker/);
    assert.match(line, /boom/);
  } finally {
    log.mock.restore();
  }
});

test("beforeCreate returns the request with the handler's environment", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo();
  connectPaseo(server).beforeCreate(({ env }) => ({ env: { ...env, MWP_ROLE: "ticket" } }));
  const request = { config: { provider: "claude", cwd: "/repo" }, env: { KEPT: "yes" } };
  const changed = await fire("before:agent.create", { request }, { paseo });
  assert.deepEqual(changed, { ...request, env: { KEPT: "yes", MWP_ROLE: "ticket" } });
});

test("beforeCreate leaves the request alone when the handler changes nothing or throws (T4)", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo();
  const log = mock.method(console, "error", () => {});
  try {
    const hooks = connectPaseo(server);
    const request = { config: { provider: "claude", cwd: "/repo" } };
    hooks.beforeCreate(() => {});
    assert.equal(await fire("before:agent.create", { request }, { paseo }), undefined);
    hooks.beforeCreate(() => {
      throw new Error("boom");
    });
    assert.equal(await fire("before:agent.create", { request }, { paseo }), undefined);
    assert.match(String(log.mock.calls[0]?.arguments[0]), /agent\.create/);
  } finally {
    log.mock.restore();
  }
});
