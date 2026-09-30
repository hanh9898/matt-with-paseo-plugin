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
function host(table: string | null | Error = TABLE): { host: FakeHost; read: string[] } {
  const fake = new FakeHost();
  const read: string[] = [];
  registerDelegatedAnswers(fake, {
    readTable: async (cwd) => {
      read.push(cwd);
      if (table instanceof Error) throw table;
      return table;
    },
  });
  fake.setLabels("stream-1", { stream: "demo" });
  fake.setLabels("tkt-7", { stream: "demo", wave: "1", ticket: "07" });
  return { host: fake, read };
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
