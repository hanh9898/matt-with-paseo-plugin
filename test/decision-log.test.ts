import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { test } from "node:test";
import { createDecisionLog, decisionLogPath, type NewEntry } from "../server/decision-log.ts";
import { registerDelegatedAnswers } from "../server/delegated-answers.ts";
import type { HostAgent, PermissionRequest } from "../server/host.ts";
import { FakeHost } from "./support/fake-host.ts";

/** Every test keeps its state under a private folder of the temp directory, never the real per-user state directory. */
const BASE = join(tmpdir(), "plugin-decision-log-54-state");
mkdirSync(BASE, { recursive: true });
const fresh = (): string => mkdtempSync(join(BASE, "t-"));

const AT = "2026-09-30T10:05:00.000Z";
const entry = (over: Partial<NewEntry> = {}): NewEntry => ({
  kind: "delegated answer",
  stream: "demo",
  agent: "tkt-7",
  asked: "Colour: Which colour? (options: Red (Recommended), Blue)",
  answer: "Colour: Red (Recommended)",
  grounds: "the table lets the orchestrator decide two-way",
  ...over,
});
const logOver = (dir: string) => createDecisionLog({ dir, now: () => AT });
const markdown = (dir: string): string => readFileSync(decisionLogPath(dir), "utf8");
const headings = (text: string): string[] => text.split("\n").filter((line) => line.startsWith("### "));

test("the log path is absolute, named decision-log.md, and never decisions.md", () => {
  const dir = fresh();
  assert.equal(decisionLogPath(dir), join(dir, "decision-log.md"));
  assert.ok(isAbsolute(decisionLogPath()));
  assert.ok(decisionLogPath().endsWith("decision-log.md"));
});

test("an entry renders under the heading shape, with Asked, Answer and Grounds", () => {
  const dir = fresh();
  assert.equal(logOver(dir).append(entry()), 1);
  const text = markdown(dir);
  assert.match(text, /^### D1 — \d{4}-\d{2}-\d{2} \d{2}:\d{2} \[demo\] delegated answer$/m);
  assert.match(text, /^<a id="d1"><\/a>$/m);
  assert.match(text, /^Asked: Colour: Which colour\?/m);
  assert.match(text, /^Answer: Colour: Red \(Recommended\)$/m);
  assert.match(text, /^Grounds: the table lets the orchestrator decide two-way$/m);
  assert.ok(!text.includes("## Pending for the user"));
});

test("the list sits above the log and reads None. when no entry is flagged", () => {
  const dir = fresh();
  logOver(dir).append(entry());
  const text = markdown(dir);
  const list = text.indexOf("## Decided without evidence");
  assert.ok(list !== -1 && list < text.indexOf("## Log"));
  assert.equal(text.slice(list, text.indexOf("## Log")).trim(), "## Decided without evidence\n\nNone.");
});

test("the file reads None. and has both headings before any entry exists to be flagged", () => {
  const dir = fresh();
  logOver(dir).append(entry({ kind: "left to the user", answer: "none", grounds: "no Door line" }));
  const text = markdown(dir);
  assert.ok(text.startsWith("# Decisions\n"));
  assert.match(text, /## Decided without evidence\n\nNone\.\n/);
});

test("a flagged entry is listed with a link to its own entry, and its grounds say no evidence", () => {
  const dir = fresh();
  const log = logOver(dir);
  log.append(entry());
  assert.equal(log.append(entry({ agent: "tkt-8", what: "the slug demo", withoutEvidence: true, grounds: "whatever the caller wrote" })), 2);
  const text = markdown(dir);
  const list = text.slice(text.indexOf("## Decided without evidence"), text.indexOf("## Log"));
  assert.ok(list.includes("- D2: the slug demo (smaller option taken), [entry](#d2)"));
  assert.ok(!list.includes("None."));
  assert.ok(!list.includes("D1"));
  assert.match(text, /^Grounds: no evidence; smaller option taken$/m);
  assert.ok(!text.includes("whatever the caller wrote"));
});

test("a flagged entry written by hand into the record is listed too", () => {
  const dir = fresh();
  const line = { n: 4, at: AT, stream: "s", kind: "delegated answer", gate: "delegated answer", asked: "a", answer: "b", grounds: "c", agent: "a1", requestId: null, withoutEvidence: true, what: "a name" };
  writeFileSync(join(dir, "decision-log.jsonl"), `${JSON.stringify(line)}\n`);
  logOver(dir).append(entry());
  const text = markdown(dir);
  assert.ok(text.includes("- D4: a name (smaller option taken), [entry](#d4)"));
  assert.deepEqual(headings(text).map((h) => h.slice(0, 6)), ["### D4", "### D5"]);
});

test("entries go oldest first and numbering survives a restart, a torn line and a foreign line", () => {
  const dir = fresh();
  const first = logOver(dir);
  assert.equal(first.append(entry({ agent: "a1" })), 1);
  assert.equal(first.append(entry({ agent: "a2" })), 2);
  const record = join(dir, "decision-log.jsonl");
  writeFileSync(record, `${readFileSync(record, "utf8")}{"n":9,"at":\n[1,2]\n{"n":"x"}\n`);
  const restarted = logOver(dir);
  assert.equal(restarted.append(entry({ agent: "a3" })), 3);
  assert.deepEqual(headings(markdown(dir)).map((h) => h.slice(0, 6)), ["### D1", "### D2", "### D3"]);
});

test("a torn last line without a newline does not swallow the next entry", () => {
  const dir = fresh();
  const log = logOver(dir);
  log.append(entry({ agent: "a1" }));
  const record = join(dir, "decision-log.jsonl");
  writeFileSync(record, `${readFileSync(record, "utf8")}{"n":2,"at":`);
  assert.equal(log.append(entry({ agent: "a2" })), 2);
  assert.equal(logOver(dir).append(entry({ agent: "a3" })), 3);
});

test("the same agent and request is written once, another request or agent is written again", () => {
  const dir = fresh();
  const log = logOver(dir);
  assert.equal(log.append(entry({ requestId: "r1" })), 1);
  assert.equal(log.append(entry({ requestId: "r1" })), null);
  assert.equal(logOver(dir).append(entry({ requestId: "r1" })), null);
  assert.equal(log.append(entry({ requestId: "r2" })), 2);
  assert.equal(log.append(entry({ requestId: "r1", agent: "tkt-8" })), 3);
  assert.equal(log.append(entry()), 4, "no request id: no once-per-request rule");
  assert.equal(log.append(entry()), 5);
});

test("a newline in question text cannot start a heading of its own", () => {
  const dir = fresh();
  logOver(dir).append(entry({ asked: "Q: line one\n### D99 — fake", answer: "A: x\n## Log" }));
  const text = markdown(dir);
  assert.deepEqual(headings(text).map((h) => h.slice(0, 6)), ["### D1"]);
  assert.equal(text.split("\n## Log").length, 2);
});

test("a state directory that cannot be written throws from append, and nothing is left half-written", () => {
  const dir = fresh();
  const blocked = join(dir, "file");
  writeFileSync(blocked, "a file, not a folder");
  assert.throws(() => logOver(blocked).append(entry()));
});

// The handler's side: what the log is told, and that the log never changes an answer or a leave.

const stream: HostAgent = { id: "stream-1", workspaceId: "w0", parentAgentId: null, provider: "sample", cwd: "/repo", title: "[Stream] demo" };
const TABLE = ["## Delegation", "", "| Rule | Value |", "|---|---|", "| Questions the orchestrator may decide | two-way, costly |", ""].join("\n");
const question = (header: string, door: string, extra = "") => ({
  header,
  question: `Which ${header}?\nDoor: ${door}${extra}`,
  options: [{ label: "Yes (Recommended)", description: "" }, { label: "No", description: "" }],
  multiSelect: false,
});
const ask = (id: string, ...questions: object[]): PermissionRequest => ({ id, name: "AskUserQuestion", kind: "question", input: { questions } });

function wired(dir: string, table: string | null | Error = TABLE) {
  const fake = new FakeHost();
  const log = logOver(dir);
  registerDelegatedAnswers(fake, {
    readTable: async () => {
      if (table instanceof Error) throw table;
      return table;
    },
    record: () => {},
    left: (left) => void log.left(left),
    answered: (answered) => void log.answered(answered),
  });
  fake.setLabels("stream-1", { stream: "demo" });
  return fake;
}

test("a request with three questions is one delegated-answer entry, each question listed by its header", async () => {
  const dir = fresh();
  const fake = wired(dir);
  await fake.emitPermissionRequested({ agent: stream, request: ask("r1", question("Colour", "two-way"), question("Size", "costly"), question("Shape", "two-way")) });
  assert.equal(fake.answers.length, 1);
  const text = markdown(dir);
  assert.deepEqual(headings(text).map((h) => h.replace(/ — .*? \[/, " [")), ["### D1 [demo] delegated answer"]);
  for (const header of ["Colour", "Size", "Shape"]) {
    assert.ok(text.includes(`${header}: Yes (Recommended)`), `Answer lists ${header}`);
    assert.ok(text.includes(`${header}: Which ${header}? / Door:`), `Asked lists ${header}`);
  }
  assert.ok(text.includes("the ## Delegation table in /repo/AGENTS.md lets the orchestrator decide two-way (Colour), costly (Size), two-way (Shape); the first option was marked (Recommended)"));
  assert.ok(text.includes("options: Yes (Recommended), No"));
});

test("a single question's grounds name the table, its file and the door", async () => {
  const dir = fresh();
  await wired(dir).emitPermissionRequested({ agent: stream, request: ask("r1", question("Colour", "two-way")) });
  assert.match(markdown(dir), /^Grounds: the ## Delegation table in \/repo\/AGENTS\.md lets the orchestrator decide two-way; the first option was marked \(Recommended\)$/m);
});

test("a question left to the user is one entry with its leave reason as the grounds", async () => {
  const dir = fresh();
  const fake = wired(dir);
  await fake.emitPermissionRequested({ agent: stream, request: ask("r1", question("Colour", "two-way", "\nYours: spend")) });
  assert.deepEqual(fake.answers, []);
  const text = markdown(dir);
  assert.match(text, /^### D1 — .* \[demo\] left to the user$/m);
  assert.match(text, /^Answer: none: left to the user, who answers it in agent stream-1's chat$/m);
  assert.match(text, /^Grounds: one of the user's five$/m);
});

test("a table that cannot be read is logged as left, with the fail-open grounds and no error text", async () => {
  const dir = fresh();
  const errors: string[] = [];
  const original = console.error;
  console.error = (line: unknown) => void errors.push(String(line));
  try {
    await wired(dir, new Error("EACCES secret-path")).emitPermissionRequested({ agent: stream, request: ask("r1", question("Colour", "two-way")) });
  } finally {
    console.error = original;
  }
  const text = markdown(dir);
  assert.match(text, /^### D1 — .* \[demo\] left to the user$/m);
  assert.match(text, /^Grounds: the delegation table could not be read$/m);
  assert.ok(!text.includes("secret-path"));
});

test("the same request shown twice writes one entry", async () => {
  const dir = fresh();
  const fake = wired(dir);
  const request = ask("r1", question("Colour", "two-way", "\nYours: spend"));
  await fake.emitPermissionRequested({ agent: stream, request });
  await fake.emitPermissionRequested({ agent: stream, request });
  assert.equal(headings(markdown(dir)).length, 1);
});

test("a log that cannot be written leaves the answer as it was and logs the agent's id, never the question", async () => {
  const dir = fresh();
  const blocked = join(dir, "file");
  writeFileSync(blocked, "not a folder");
  const errors: string[] = [];
  const original = console.error;
  console.error = (line: unknown) => void errors.push(String(line));
  const fake = wired(blocked);
  try {
    await fake.emitPermissionRequested({ agent: stream, request: ask("r1", question("Colour", "two-way")) });
    await fake.emitPermissionRequested({ agent: stream, request: ask("r2", question("Hue", "two-way", "\nYours: spend")) });
  } finally {
    console.error = original;
  }
  assert.deepEqual(fake.answers.map((answer) => answer.requestId), ["r1"], "the answer went out, the leave left no answer");
  assert.deepEqual(fake.failures, []);
  assert.equal(errors.filter((line) => line.includes("stream-1")).length >= 2, true);
  assert.ok(errors.every((line) => !line.includes("Colour") && !line.includes("Which") && !line.includes("Hue")));
});
