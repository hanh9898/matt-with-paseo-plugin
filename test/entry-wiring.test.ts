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

test("the entry registers before hooks for agent creation and session open, and the marker handler gets the same hooks", () => {
  const before: string[] = [];
  const server = {
    on: () => () => {},
    before(name: string) {
      before.push(name);
      return () => {};
    },
    handle: () => () => {},
  };
  contribute(server as unknown as Parameters<typeof contribute>[0]);
  assert.deepEqual(before, ["agent.create", "agent.session_open"]);
  const entry = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  assert.match(entry, /registerTicketMarker(hooks)/);
});

test("the entry hands the waiting count the same hooks", () => {
  const entry = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  assert.match(entry, /registerWaitingCount\(hooks\)/);
});

test("the entry registers the report card after the appetite and the budget it reads, and hands it to the delegated answers", () => {
  const entry = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  assert.match(entry, /registerReportCard\(hooks,/);
  assert.match(entry, /answered: card\.refresh/);
  assert.ok(entry.indexOf("registerAppetite(hooks)") < entry.indexOf("registerReportCard(hooks,"), "the card registers after the appetite, so a turn's cost is summed first");
});

test("the client entry default-exports a contribution that starts the waiting pill and hands back its cleanup", () => {
  const entry = readFileSync(new URL("../index.client.ts", import.meta.url), "utf8");
  assert.match(entry, /export default function contribute\(/);
  assert.match(entry, /return contributeWaitingPill\(client\)/);
});
