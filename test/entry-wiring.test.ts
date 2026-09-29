import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import contribute from "../index.server.ts";

test("the entry registers the lifecycle relay on the four agent events", () => {
  const registered: string[] = [];
  const server = {
    on(name: string) {
      registered.push(name);
      return () => {};
    },
    before() {
      return () => {};
    },
  };
  // A stub stands in for the SDK's server context; the entry only calls `on` and `before`.
  contribute(server as unknown as Parameters<typeof contribute>[0]);
  assert.deepEqual(registered.sort(), [
    "agent.archived",
    "agent.created",
    "agent.permission_requested",
    "agent.turn_ended",
  ]);
});

test("the entry hands the relay the hooks the adapter returns, and sets no heartbeat", () => {
  const entry = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  assert.match(entry, /registerLifecycleRelay\(hooks\)/);
  assert.doesNotMatch(entry, /heartbeat/i);
});
