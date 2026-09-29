import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import contribute from "../index.server.ts";

test("the entry registers the relay and the waiting count on the agent events, and serves the count over RPC", () => {
  const registered: string[] = [];
  const served: string[] = [];
  const server = {
    on(name: string) {
      registered.push(name);
      return () => {};
    },
    before() {
      return () => {};
    },
    handle(contract: { name: string }) {
      served.push(contract.name);
      return () => {};
    },
  };
  // A stub stands in for the SDK's server context; the entry only calls `on`, `before` and `handle`.
  contribute(server as unknown as Parameters<typeof contribute>[0]);
  assert.deepEqual([...new Set(registered)].sort(), [
    "agent.archived",
    "agent.created",
    "agent.permission_requested",
    "agent.permission_resolved",
    "agent.turn_ended",
  ]);
  assert.deepEqual(served, ["waiting.count"]);
});

test("the entry hands the relay the hooks the adapter returns, and sets no heartbeat", () => {
  const entry = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  assert.match(entry, /registerLifecycleRelay\(hooks\)/);
  assert.doesNotMatch(entry, /heartbeat/i);
});

test("the entry hands the waiting count the same hooks", () => {
  const entry = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  assert.match(entry, /registerWaitingCount\(hooks\)/);
});

test("the client entry default-exports a contribution that starts the waiting pill and hands back its cleanup", () => {
  const entry = readFileSync(new URL("../index.client.ts", import.meta.url), "utf8");
  assert.match(entry, /export default function contribute\(/);
  assert.match(entry, /return contributeWaitingPill\(client\)/);
});
