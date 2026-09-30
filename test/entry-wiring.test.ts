import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
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
  assert.match(entry, /registerTicketMarker\(hooks\)/);
});

test("the entry hands the waiting count the same hooks", () => {
  const entry = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  assert.match(entry, /registerWaitingCount\(hooks\)/);
});

test("the entry hands the report card to the modules that change a record, so no refresh depends on handler order", () => {
  const entry = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  assert.match(entry, /createReportCard\(/);
  assert.match(entry, /updated: \(who, host\) => card\.refresh\(who, host\)/);
  assert.match(entry, /await card\.refresh\(answered, host\)/);
  assert.match(entry, /await card\.refresh\(question, host\)/);
});

test("the entry tells the decision log of each answer and each leave, before the budget and the card", () => {
  const entry = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  assert.match(entry, /createDecisionLog\(\)/);
  assert.ok(entry.indexOf("log.answered(answered)") < entry.indexOf("card.refresh(answered, host)"));
  assert.ok(entry.indexOf("log.left(question)") < entry.indexOf("budget.left(question, host)"));
});

test("the client entry default-exports a contribution that starts the waiting pill and hands back its cleanup", () => {
  const entry = readFileSync(new URL("../index.client.ts", import.meta.url), "utf8");
  assert.match(entry, /export default function contribute\(/);
  assert.match(entry, /return contributeWaitingPill\(client\)/);
});

test("the entry returns the adapter's stop as its cleanup, and the cleanup clears the one timer it started (#48)", async () => {
  const { mock } = await import("node:test");
  const server = { on: () => () => {}, before: () => () => {}, handle: () => () => {} };
  const started = mock.method(globalThis, "setInterval");
  const cleared = mock.method(globalThis, "clearInterval");
  try {
    const cleanup = contribute(server as unknown as Parameters<typeof contribute>[0]);
    assert.equal(started.mock.calls.length, 1, "one clock for every handler that ticks");
    assert.equal(cleared.mock.calls.length, 0);
    cleanup();
    assert.equal(cleared.mock.calls.length, 1, "the cleanup clears it, so a plugin reload leaves no timer behind");
  } finally {
    started.mock.restore();
    cleared.mock.restore();
  }
  const entry = readFileSync(new URL("../index.server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(entry, /return \(\) => \{\};/, "the cleanup is no longer a no-op");
});
