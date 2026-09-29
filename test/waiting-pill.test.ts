import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { PILL } from "../client/pill-text.ts";
import { contributeWaitingPill, REFRESH_MS, type PillClient, type PillUpdate } from "../client/waiting-pill.ts";

type Contribution = Parameters<PillClient["addComposerPill"]>[0];

/** Stands in for the client context: records each pill and its updates, serves the counts a test sets. */
function stubClient() {
  const counts = new Map<string, number>();
  const asked: string[] = [];
  const pills = new Map<string, { contribution: Contribution; patches: { label?: string; visible?: boolean }[]; removed: boolean }>();
  let handler: ((update: PillUpdate) => void) | null = null;
  let unsubscribed = false;
  let holding = false;
  const releases: (() => void)[] = [];
  let fail = false;
  const client: PillClient = {
    paseo: {
      agents: {
        subscribe(next) {
          handler = next;
          return () => {
            unsubscribed = true;
          };
        },
      },
    },
    async rpc(_contract, { agentId }) {
      asked.push(agentId);
      const count = counts.get(agentId) ?? 0;
      if (holding) await new Promise<void>((resolve) => void releases.push(resolve));
      if (fail) throw new Error("rpc down");
      return { count };
    },
    addComposerPill(contribution) {
      const pill = { contribution, patches: [] as { label?: string; visible?: boolean }[], removed: false };
      pills.set(contribution.agentId, pill);
      return {
        update: (patch) => void pill.patches.push(patch),
        remove: () => void (pill.removed = true),
      };
    },
  };
  const agent = (id: string, parentAgentId: string | null = null, workspaceId: string | null = "w1"): PillUpdate => ({
    kind: "upsert",
    agent: { id, workspaceId, parentAgentId },
  });
  return {
    client,
    counts,
    asked,
    pills,
    agent,
    emit: (update: PillUpdate) => handler?.(update),
    setFail: (value: boolean) => void (fail = value),
    /** From now on each read waits until the test releases it, so replies can arrive out of order. */
    hold: () => void (holding = true),
    releases,
    get unsubscribed() {
      return unsubscribed;
    },
    /** The label and visibility a pill shows now: its contribution, then every update on top. */
    shown(agentId: string) {
      const pill = pills.get(agentId);
      assert.ok(pill, `a pill exists for ${agentId}`);
      return pill.patches.reduce(
        (state, patch) => ({ ...state, ...patch }),
        { label: pill.contribution.button.label, visible: pill.contribution.button.visible },
      );
    },
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("an agent gets a pill on its own workspace and chat, hidden while nothing waits", async () => {
  const stub = stubClient();
  contributeWaitingPill(stub.client);
  stub.emit(stub.agent("stream-1"));
  await settle();
  const pill = stub.pills.get("stream-1");
  assert.equal(pill?.contribution.workspaceId, "w1");
  assert.equal(pill?.contribution.id, PILL.id);
  assert.equal(pill?.contribution.button.title, PILL.title);
  assert.equal(pill?.contribution.button.icon, PILL.icon);
  assert.equal(stub.shown("stream-1").visible, false);
});

test("the pill's count changes when a checkpoint opens and again when it settles", async () => {
  const stub = stubClient();
  contributeWaitingPill(stub.client);
  stub.emit(stub.agent("stream-1"));
  await settle();
  stub.counts.set("stream-1", 2);
  stub.emit(stub.agent("tkt-7", "stream-1"));
  await settle();
  assert.deepEqual(stub.shown("stream-1"), { label: PILL.label(2), visible: true });
  stub.counts.set("stream-1", 1);
  stub.emit(stub.agent("tkt-7", "stream-1"));
  await settle();
  assert.deepEqual(stub.shown("stream-1"), { label: PILL.label(1), visible: true });
  stub.counts.set("stream-1", 0);
  stub.emit(stub.agent("tkt-7", "stream-1"));
  await settle();
  assert.equal(stub.shown("stream-1").visible, false);
});

test("an update to an agent refreshes that agent's own pill", async () => {
  const stub = stubClient();
  contributeWaitingPill(stub.client);
  stub.emit(stub.agent("stream-1"));
  await settle();
  stub.counts.set("stream-1", 1);
  stub.emit(stub.agent("stream-1"));
  await settle();
  assert.deepEqual(stub.shown("stream-1"), { label: PILL.label(1), visible: true });
});

test("an agent with no workspace gets no pill", async () => {
  const stub = stubClient();
  contributeWaitingPill(stub.client);
  stub.emit(stub.agent("draft", null, null));
  await settle();
  assert.equal(stub.pills.size, 0);
});

test("a removed agent loses its pill and the others are read again", async () => {
  const stub = stubClient();
  contributeWaitingPill(stub.client);
  stub.emit(stub.agent("stream-1"));
  stub.emit(stub.agent("tkt-7", "stream-1"));
  await settle();
  stub.counts.set("stream-1", 1);
  stub.asked.length = 0;
  stub.emit({ kind: "remove", agentId: "tkt-7" });
  await settle();
  assert.equal(stub.pills.get("tkt-7")?.removed, true);
  assert.equal(stub.pills.get("stream-1")?.removed, false);
  assert.deepEqual(stub.asked, ["stream-1"]);
  assert.equal(stub.shown("stream-1").visible, true);
});

test("pressing the pill reads the count again", async () => {
  const stub = stubClient();
  contributeWaitingPill(stub.client);
  stub.emit(stub.agent("stream-1"));
  await settle();
  stub.counts.set("stream-1", 3);
  const behavior = stub.pills.get("stream-1")?.contribution.button.behavior;
  assert.equal(behavior?.kind, "action");
  await behavior?.onPress();
  assert.deepEqual(stub.shown("stream-1"), { label: PILL.label(3), visible: true });
});

test("a failed read leaves the pill as it was and is logged with the agent's id (T4)", async () => {
  const stub = stubClient();
  const log = mock.method(console, "error", () => {});
  try {
    contributeWaitingPill(stub.client);
    stub.emit(stub.agent("stream-1"));
    await settle();
    stub.counts.set("stream-1", 2);
    stub.emit(stub.agent("stream-1"));
    await settle();
    stub.setFail(true);
    stub.emit(stub.agent("stream-1"));
    await settle();
    assert.deepEqual(stub.shown("stream-1"), { label: PILL.label(2), visible: true });
    assert.match(String(log.mock.calls[0]?.arguments[0]), /stream-1/);
  } finally {
    log.mock.restore();
  }
});

test("a reply that arrives after a newer one is dropped", async () => {
  const stub = stubClient();
  contributeWaitingPill(stub.client);
  stub.emit(stub.agent("stream-1"));
  await settle();
  stub.counts.set("stream-1", 5);
  stub.hold();
  stub.emit(stub.agent("stream-1"));
  await settle();
  stub.counts.set("stream-1", 0);
  stub.emit(stub.agent("stream-1"));
  await settle();
  assert.equal(stub.releases.length, 2);
  stub.releases[1]?.();
  await settle();
  stub.releases[0]?.();
  await settle();
  assert.equal(stub.shown("stream-1").visible, false);
});

test("the pill is read again on a timer, as a fallback for an update that never comes", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const stub = stubClient();
    contributeWaitingPill(stub.client);
    stub.emit(stub.agent("stream-1"));
    await settle();
    stub.counts.set("stream-1", 1);
    mock.timers.tick(REFRESH_MS);
    await settle();
    assert.deepEqual(stub.shown("stream-1"), { label: PILL.label(1), visible: true });
  } finally {
    mock.timers.reset();
  }
});

test("cleanup stops listening, stops the timer and removes every pill", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const stub = stubClient();
    const cleanup = contributeWaitingPill(stub.client);
    stub.emit(stub.agent("stream-1"));
    stub.emit(stub.agent("tkt-7", "stream-1"));
    await settle();
    cleanup();
    assert.equal(stub.unsubscribed, true);
    assert.ok([...stub.pills.values()].every((pill) => pill.removed));
    stub.asked.length = 0;
    mock.timers.tick(REFRESH_MS * 2);
    await settle();
    assert.deepEqual(stub.asked, []);
  } finally {
    mock.timers.reset();
  }
});

test("every text the pill shows lives in client/pill-text.ts", () => {
  const root = new URL("../", import.meta.url);
  const others = [
    ...readdirSync(new URL("client/", root))
      .filter((name) => name.endsWith(".ts") && name !== "pill-text.ts")
      .map((name) => `client/${name}`),
    "index.client.ts",
  ];
  assert.ok(others.includes("client/waiting-pill.ts"));
  for (const path of others) {
    const text = readFileSync(new URL(path, root), "utf8");
    assert.ok(!text.includes(PILL.title), `${path} writes the pill's title`);
    assert.ok(!text.includes(PILL.label(1).slice(1)), `${path} writes the pill's label`);
  }
  assert.match(readFileSync(new URL("client/waiting-pill.ts", root), "utf8"), /from "\.\/pill-text\.ts"/);
});
