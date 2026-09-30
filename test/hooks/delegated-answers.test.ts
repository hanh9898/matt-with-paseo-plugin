import assert from "node:assert/strict";
import { test } from "node:test";
import { registerDelegatedAnswers } from "../../server/delegated-answers.ts";
import type { HostAgent, PermissionRequest } from "../../server/host.ts";
import { FakeHost } from "../support/fake-host.ts";

const stream: HostAgent = { id: "stream-1", workspaceId: "w0", parentAgentId: null, provider: "sample", cwd: "/repo", title: "[Stream] demo" };
const ticket: HostAgent = { ...stream, id: "tkt-7", workspaceId: "w1", parentAgentId: "stream-1", cwd: "/repo-tkt", title: "[Wave 1] 07" };
const stranger: HostAgent = { ...stream, id: "stranger", title: null };

const TABLE = ["## Delegation", "", "| Rule | Value |", "|---|---|", "| Questions the orchestrator may decide | two-way |", ""].join("\n");

const questions = (...doors: string[]) => ({
  questions: doors.map((door, n) => ({
    header: `Q${n}`,
    question: `Which?\nDoor: ${door}`,
    options: [{ label: "Yes (Recommended)", description: "" }, { label: "No", description: "" }],
    multiSelect: false,
  })),
});
const ask = (id: string, input: unknown = questions("two-way")): PermissionRequest => ({ id, name: "AskUserQuestion", kind: "question", input });

/** A host with the handler registered, reading `table` for every repository; `read` records the folders asked about. */
type Entry = { stream: string; agent: string; header: string; answer: string; at: string };

/** A host with the handler registered, reading `table` for every repository; `read` records the folders asked about, `recorded` the entries kept. */
function host(table: string | null | Error = TABLE, options: { pastAppetite?: boolean; record?: () => void } = {}): { host: FakeHost; read: string[]; recorded: Entry[] } {
  const fake = new FakeHost();
  const read: string[] = [];
  const recorded: Entry[] = [];
  registerDelegatedAnswers(fake, {
    readTable: async (cwd) => {
      read.push(cwd);
      if (table instanceof Error) throw table;
      return table;
    },
    record: (entry) => {
      options.record?.();
      recorded.push(entry);
    },
    pastAppetite: () => options.pastAppetite ?? false,
    now: () => "2026-09-30T10:00:00.000Z",
  });
  fake.setLabels("stream-1", { stream: "demo" });
  fake.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  return { host: fake, read, recorded };
}

test("a ticket agent's decidable question is answered with its recommendation, keyed by header", async () => {
  const { host: fake } = host();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.deepEqual(fake.answers, [
    { agentId: "tkt-7", requestId: "r1", answer: { behavior: "allow", updatedInput: { ...questions("two-way"), answers: { Q0: "Yes (Recommended)" } } } },
  ]);
  assert.deepEqual(fake.failures, []);
});

test("the stream agent's decidable question is answered too", async () => {
  const { host: fake } = host();
  await fake.emitPermissionRequested({ agent: stream, request: ask("r1") });
  assert.equal(fake.answers.length, 1);
  assert.equal(fake.answers[0]?.agentId, "stream-1");
});

test("the table is read from the asking agent's own folder", async () => {
  const { host: fake, read } = host();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.deepEqual(read, ["/repo-tkt"]);
});

test("an agent with no role labels is left alone (T3)", async () => {
  const { host: fake, read } = host();
  await fake.emitPermissionRequested({ agent: stranger, request: ask("r1") });
  fake.setLabels("stranger", { wave: "1" });
  await fake.emitPermissionRequested({ agent: stranger, request: ask("r2") });
  assert.deepEqual(fake.answers, []);
  assert.deepEqual(read, [], "no table is read for an agent the plugin does not know");
});

test("a request that is not a question is left alone", async () => {
  const { host: fake } = host();
  await fake.emitPermissionRequested({ agent: ticket, request: { id: "r1", name: "Bash", kind: "tool", input: questions("two-way") } });
  assert.deepEqual(fake.answers, []);
});

test("a question of another name than AskUserQuestion is left alone", async () => {
  const { host: fake } = host();
  await fake.emitPermissionRequested({ agent: ticket, request: { id: "r1", name: "ExitPlanMode", kind: "question", input: questions("two-way") } });
  assert.deepEqual(fake.answers, []);
});

test("a question the table does not let the orchestrator decide is left to the user", async () => {
  const { host: fake } = host();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", questions("costly")) });
  assert.deepEqual(fake.answers, []);
});

test("no AGENTS.md table, or none readable, answers nothing and throws nothing (T4)", async () => {
  for (const table of [null, new Error("EACCES: /repo-tkt/AGENTS.md")]) {
    const { host: fake } = host(table);
    await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
    assert.deepEqual(fake.answers, []);
    assert.deepEqual(fake.failures, []);
  }
});

test("a failed answer never reaches Paseo as a throw (T4)", async () => {
  const { host: fake } = host();
  fake.respondToPermission = async () => {
    throw new Error("request no longer pending");
  };
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.deepEqual(fake.failures, [], "the handler keeps the rejection out of Paseo");
});

test("the handler logs no question text or answer (T6)", async () => {
  const { host: fake } = host(new Error("boom"));
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.join(" "));
  try {
    await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  } finally {
    console.error = original;
  }
  assert.ok(lines.every((line) => !line.includes("Which?") && !line.includes("Yes (Recommended)")), lines.join("\n"));
});

test("each delegated answer is recorded with the stream, the agent, the header, the answer and the time", async () => {
  const { host: fake, recorded } = host();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", questions("two-way", "two-way")) });
  assert.deepEqual(recorded, [
    { stream: "demo", agent: "tkt-7", header: "Q0", answer: "Yes (Recommended)", at: "2026-09-30T10:00:00.000Z" },
    { stream: "demo", agent: "tkt-7", header: "Q1", answer: "Yes (Recommended)", at: "2026-09-30T10:00:00.000Z" },
  ]);
});

test("a question left to the user is not recorded", async () => {
  const { host: fake, recorded } = host();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1", questions("costly")) });
  assert.deepEqual(recorded, []);
});

test("a stream past its appetite is left to the user", async () => {
  const { host: fake, recorded } = host(TABLE, { pastAppetite: true });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.deepEqual(fake.answers, []);
  assert.deepEqual(recorded, []);
});

test("a request already resolved is settled and not answered", async () => {
  const { host: fake, recorded } = host();
  await fake.emitPermissionResolved({ agent: ticket, requestId: "r1" });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.deepEqual(fake.answers, []);
  assert.deepEqual(recorded, []);
});

test("the same request seen twice is answered once", async () => {
  const { host: fake, recorded } = host();
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.equal(fake.answers.length, 1);
  assert.equal(recorded.length, 1);
});

test("an answer Paseo refuses is not recorded", async () => {
  const { host: fake, recorded } = host();
  fake.respondToPermission = async () => {
    throw new Error("request no longer pending");
  };
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.deepEqual(recorded, []);
});

test("a record that fails does not throw into Paseo (T4)", async () => {
  const { host: fake } = host(TABLE, {
    record: () => {
      throw new Error("disk full");
    },
  });
  await fake.emitPermissionRequested({ agent: ticket, request: ask("r1") });
  assert.equal(fake.answers.length, 1);
  assert.deepEqual(fake.failures, []);
});

test("a bundle agent's decidable question is answered with its recommendation", async () => {
  const { host: fake } = host();
  const bundleAgent: HostAgent = { ...ticket, id: "bnd-7", title: "[Wave 1] [70+71] x" };
  fake.setLabels("bnd-7", { stream: "demo", wave: "1", bundle: "70", tickets: "70,71" });
  await fake.emitPermissionRequested({ agent: bundleAgent, request: ask("r1") });
  assert.equal(fake.answers.length, 1);
  assert.equal(fake.answers[0]?.agentId, "bnd-7");
});
