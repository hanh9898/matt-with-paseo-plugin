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
    handle(contract: { name: string }, handler: unknown) {
      listeners.set(`rpc:${contract.name}`, handler);
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
function stubPaseo(labels: Record<string, string> = {}, title: string | null = null) {
  const calls: { agentId: string; method: string; args: unknown[] }[] = [];
  const paseo = {
    agents: {
      ref(agentId: string) {
        return {
          send: async (...args: unknown[]) => void calls.push({ agentId, method: "send", args }),
          respondToPermission: async (...args: unknown[]) =>
            void calls.push({ agentId, method: "respondToPermission", args }),
          refresh: async () => ({ agent: { labels, title } }),
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
  hooks.onPermissionResolved(() => {});
  hooks.beforeCreate(() => {});
  assert.deepEqual([...listeners.keys()].sort(), [
    "agent.archived",
    "agent.created",
    "agent.permission_requested",
    "agent.permission_resolved",
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

test("isRunning is true only while Paseo reports the agent running", async () => {
  const { server, fire } = stubServer();
  let status: string | undefined = "running";
  const paseo = {
    agents: { ref: () => ({ refresh: async () => (status === undefined ? null : { agent: { status, labels: {} } }) }) },
  };
  const seen: boolean[] = [];
  connectPaseo(server).onCreated(async (_event, host) => {
    seen.push(await host.isRunning("worker"));
    status = "idle";
    seen.push(await host.isRunning("worker"));
    status = undefined;
    seen.push(await host.isRunning("worker"));
  });
  await fire("agent.created", { agent }, { paseo });
  assert.deepEqual(seen, [true, false, false]);
});

test("beforeCreate returns the request with the handler's environment", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo();
  connectPaseo(server).beforeCreate(({ env }) => ({ env: { ...env, MWP_ROLE: "ticket" } }));
  const request = { config: { provider: "claude", cwd: "/repo" }, env: { KEPT: "yes" } };
  const changed = await fire("before:agent.create", { request }, { paseo });
  assert.deepEqual(changed, { ...request, env: { KEPT: "yes", MWP_ROLE: "ticket" } });
});

test("beforeCreate hands the handler the title the agent is created with, and null when it has none", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo();
  const seen: unknown[] = [];
  connectPaseo(server).beforeCreate((request) => {
    seen.push(request);
  });
  await fire("before:agent.create", { request: { config: { provider: "claude", cwd: "/repo", title: "[Wave 1] 02 x" }, env: { A: "b" } } }, { paseo });
  await fire("before:agent.create", { request: { config: { provider: "claude", cwd: "/repo" } } }, { paseo });
  await fire("before:agent.create", { request: { config: { provider: "claude", cwd: "/repo", title: null }, env: {} } }, { paseo });
  assert.deepEqual(seen, [
    { env: { A: "b" }, title: "[Wave 1] 02 x" },
    { env: {}, title: null },
    { env: {}, title: null },
  ]);
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

test("a permission resolution reaches the handler with the agent and the request id, and none of the answer", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo();
  const seen: unknown[] = [];
  connectPaseo(server).onPermissionResolved((event) => {
    seen.push(event);
  });
  const resolution = { behavior: "allow", updatedInput: { answers: { Colour: "Red" } } };
  await fire("agent.permission_resolved", { agent, requestId: "r1", resolution }, { paseo });
  assert.deepEqual(seen, [{ agent, requestId: "r1" }]);
});

test("the waiting-count query is served over the plugin's RPC and answers zero when the handler throws (T4)", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo();
  const log = mock.method(console, "error", () => {});
  try {
    const asked: string[] = [];
    connectPaseo(server).serveWaitingCount((agentId) => {
      asked.push(agentId);
      if (agentId === "broken") throw new Error("boom");
      return 2;
    });
    assert.deepEqual(await fire("rpc:waiting.count", { agentId: "orchestrator" }, { paseo }), { count: 2 });
    assert.deepEqual(await fire("rpc:waiting.count", { agentId: "broken" }, { paseo }), { count: 0 });
    assert.deepEqual(asked, ["orchestrator", "broken"]);
    assert.match(String(log.mock.calls[0]?.arguments[0]), /waiting\.count/);
  } finally {
    log.mock.restore();
  }
});

test("the waiting-count query carries the budget's state when one is served, and false when its handler throws (T4)", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo();
  const log = mock.method(console, "error", () => {});
  try {
    const hooks = connectPaseo(server);
    hooks.serveWaitingCount(() => 2);
    hooks.serveBudgetSpent((agentId) => {
      if (agentId === "broken") throw new Error("boom");
      return true;
    });
    assert.deepEqual(await fire("rpc:waiting.count", { agentId: "orchestrator" }, { paseo }), { count: 2, budgetSpent: true });
    assert.deepEqual(await fire("rpc:waiting.count", { agentId: "broken" }, { paseo }), { count: 2, budgetSpent: false });
    assert.match(String(log.mock.calls[0]?.arguments[0]), /waiting\.count/);
  } finally {
    log.mock.restore();
  }
});

const openRequest = { agentId: "worker", workspaceId: "w", provider: "claude", cwd: "/repo", reason: "resume", purpose: "interactive", env: { KEPT: "yes" } };

test("beforeSessionOpen registers the agent.session_open hook and returns the request with the handler's environment", async () => {
  const { server, fire, listeners } = stubServer();
  const { paseo } = stubPaseo();
  connectPaseo(server).beforeSessionOpen(({ env }) => ({ env: { ...env, MWP_ROLE: "ticket" } }));
  assert.deepEqual([...listeners.keys()], ["before:agent.session_open"]);
  const changed = await fire("before:agent.session_open", { request: openRequest }, { paseo });
  assert.deepEqual(changed, { ...openRequest, env: { KEPT: "yes", MWP_ROLE: "ticket" } });
});

test("beforeSessionOpen hands the handler the agent id, the reason, the environment, and the title and labels Paseo holds", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo({ wave: "2", ticket: "35" }, "[Wave 2] 35 x");
  const seen: unknown[] = [];
  connectPaseo(server).beforeSessionOpen((request) => {
    seen.push(request);
  });
  await fire("before:agent.session_open", { request: openRequest }, { paseo });
  assert.deepEqual(seen, [
    { agentId: "worker", reason: "resume", env: { KEPT: "yes" }, title: "[Wave 2] 35 x", labels: { wave: "2", ticket: "35" } },
  ]);
});

test("beforeSessionOpen hands null and no labels when Paseo cannot read the agent yet, and when reading throws", async () => {
  const { server, fire } = stubServer();
  const seen: unknown[] = [];
  connectPaseo(server).beforeSessionOpen((request) => {
    seen.push(request);
  });
  const unknown = { agents: { ref: () => ({ refresh: async () => null }) } };
  const broken = {
    agents: {
      ref: () => ({
        refresh: async () => {
          throw new Error("not registered");
        },
      }),
    },
  };
  await fire("before:agent.session_open", { request: openRequest }, { paseo: unknown });
  await fire("before:agent.session_open", { request: openRequest }, { paseo: broken });
  const unread = { agentId: "worker", reason: "resume", env: { KEPT: "yes" }, title: null, labels: {} };
  assert.deepEqual(seen, [unread, unread]);
});

test("beforeSessionOpen leaves the request alone when the handler changes nothing or throws (T4)", async () => {
  const { server, fire } = stubServer();
  const { paseo } = stubPaseo();
  const log = mock.method(console, "error", () => {});
  try {
    const hooks = connectPaseo(server);
    hooks.beforeSessionOpen(() => {});
    assert.equal(await fire("before:agent.session_open", { request: openRequest }, { paseo }), undefined);
    hooks.beforeSessionOpen(() => {
      throw new Error("boom");
    });
    assert.equal(await fire("before:agent.session_open", { request: openRequest }, { paseo }), undefined);
    assert.match(String(log.mock.calls[0]?.arguments[0]), /agent\.session_open/);
    assert.match(String(log.mock.calls[0]?.arguments[0]), /worker/);
  } finally {
    log.mock.restore();
  }
});

test("lastTurnCostUsd reads the agent's lastUsage.totalCostUsd after a refresh, and null when there is none", async () => {
  const { server, fire } = stubServer();
  const usages: Record<string, unknown> = { paid: { totalCostUsd: 0.25 }, free: {}, unpriced: undefined };
  const paseo = {
    agents: {
      ref: (agentId: string) => ({
        refresh: async () => (agentId === "gone" ? null : { agent: { labels: {}, title: null, lastUsage: usages[agentId] } }),
      }),
    },
  };
  const costs: (number | null)[] = [];
  connectPaseo(server).onCreated(async (_event, host) => {
    for (const id of ["paid", "free", "unpriced", "gone"]) costs.push(await host.lastTurnCostUsd(id));
  });
  await fire("agent.created", { agent }, { paseo });
  assert.deepEqual(costs, [0.25, null, null, null]);
});
