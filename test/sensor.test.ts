import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import * as sensorModule from "../server/sensor.ts";
import { factsOf, flagged, loadConditions, modelSlots, type Condition, type Streaks } from "../server/sensor.ts";

const shipped = loadConditions();

test("the default conditions are embedded in the module, equal the file, and no path to the file is exported (#52)", () => {
  assert.equal("CONDITIONS_FILE" in sensorModule, false, "no exported path built from import.meta.url");
  const onDisk = JSON.parse(readFileSync(fileURLToPath(new URL("../sensor/conditions.json", import.meta.url)), "utf8"));
  assert.deepEqual(shipped, onDisk.conditions);
});

function inTempFile(text: string): { file: string; done(): void } {
  const dir = mkdtempSync(join(tmpdir(), "mwp-sensor-"));
  const file = join(dir, "conditions.json");
  writeFileSync(file, text);
  return { file, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const calm = { outcome: "completed", newItems: 4, newToolCalls: 2, tailRepeats: 0 };

test("the conditions live in sensor/conditions.json as data, each with an id and a one-line reason (criterion 1)", () => {
  const raw: unknown = JSON.parse(readFileSync(new URL("../sensor/conditions.json", import.meta.url), "utf8"));
  assert.ok(typeof raw === "object" && raw !== null && "conditions" in raw);
  assert.ok(shipped.length >= 4, "the file holds the conditions");
  assert.equal(new Set(shipped.map((condition) => condition.id)).size, shipped.length, "ids are unique");
  for (const condition of shipped) assert.match(condition.says, /^[^\r\n]+$/);
});

test("a condition changes with the data alone: another file, another flag (criterion 1)", () => {
  const custom: Condition[] = [{ id: "one-item", says: "one item only", check: "code", fact: "newItems", atMost: 1, times: 1 }];
  const sample = { ...calm, newItems: 1 };
  assert.deepEqual(flagged(custom, sample, new Map()).map((c) => c.id), ["one-item"]);
  assert.deepEqual(flagged(shipped, sample, new Map()), [], "the shipped data does not flag it");
});

test("a calm turn flags nothing", () => {
  assert.deepEqual(flagged(shipped, calm, new Map()), []);
});

test("conditions are checked one at a time: each flags on its own fact", () => {
  const ids = (facts: typeof calm) => flagged(shipped, facts, new Map()).map((c) => c.id);
  assert.deepEqual(ids({ ...calm, outcome: "failed" }), ["failed-turn"]);
  assert.deepEqual(ids({ ...calm, outcome: "canceled" }), ["canceled-turn"]);
  assert.deepEqual(ids({ ...calm, newItems: 0, newToolCalls: 0 }), ["no-new-activity"]);
});

test("a condition with times 2 flags on the second turn in a row, not the first, and resets when a turn breaks it", () => {
  const streaks: Streaks = new Map();
  const quiet = { ...calm, newToolCalls: 0 };
  const idle = (facts: typeof calm) => flagged(shipped, facts, streaks).map((c) => c.id);
  assert.deepEqual(idle(quiet), []);
  assert.deepEqual(idle(quiet), ["no-tool-use"]);
  assert.deepEqual(idle(quiet), [], "a stall that goes on is not told at every turn");
  assert.deepEqual(idle(quiet), ["no-tool-use"], "and again at the next multiple");
  assert.deepEqual(idle(calm), []);
  assert.deepEqual(idle(quiet), [], "the streak started over");
});

test("a model condition is a named slot with no model wired: it is listed and never flagged", () => {
  const slots = modelSlots(shipped);
  assert.ok(slots.length >= 1);
  for (const slot of slots) {
    assert.equal(slot.model, null);
    assert.ok(slot.question.length > 0);
  }
  const everything = { outcome: "failed", newItems: 0, newToolCalls: 0, tailRepeats: 1 };
  const streaks: Streaks = new Map();
  flagged(shipped, everything, streaks);
  const flags = flagged(shipped, everything, streaks).map((c) => c.id);
  for (const slot of slots) assert.ok(!flags.includes(slot.id), `${slot.id} is not flagged`);
});

test("facts: what the turn added, its tool calls, and whether its last item repeats", () => {
  const first = [{ type: "user_message" }, { type: "tool_call", name: "Bash" }, { type: "assistant_message", text: "done" }];
  const one = factsOf("completed", first, undefined);
  assert.deepEqual(one.facts, { outcome: "completed", newItems: 3, newToolCalls: 1, tailRepeats: 0 });
  const same = factsOf("completed", first, one.seen);
  assert.deepEqual(same.facts, { outcome: "completed", newItems: 0, newToolCalls: 0, tailRepeats: 1 });
  const more = factsOf("completed", [...first, { type: "assistant_message", text: "again" }], one.seen);
  assert.deepEqual(more.facts, { outcome: "completed", newItems: 1, newToolCalls: 0, tailRepeats: 0 });
  const shrunk = factsOf("completed", [{ type: "tool_call" }], one.seen);
  assert.equal(shrunk.facts.newItems, 1, "a timeline that shrank counts whole");
  assert.equal(factsOf("completed", "nope" as unknown as unknown[], undefined).facts.newItems, 0, "a timeline that is not a list is empty");
});

test("loadConditions refuses a file that is not JSON or breaks the shape, naming what is wrong", () => {
  const cases: [string, RegExp][] = [
    ["{", /not readable JSON/],
    ["{}", /no conditions list/],
    [JSON.stringify({ conditions: [{ id: "a", says: "x", check: "code", fact: "nothing", is: "y", times: 1 }] }), /unknown fact/],
    [JSON.stringify({ conditions: [{ id: "a", says: "x", check: "code", fact: "outcome", times: 1 }] }), /exactly one of/],
    [JSON.stringify({ conditions: [{ id: "a", says: "x", check: "code", fact: "newItems", atMost: 0, times: 0 }] }), /times/],
    [JSON.stringify({ conditions: [{ id: "a", says: "x", check: "model", question: "q", model: "small" }] }), /none is wired/],
    [JSON.stringify({ conditions: [{ id: "a", says: "x", check: "model", question: "q", model: null }, { id: "a", says: "y", check: "model", question: "q", model: null }] }), /repeats the id/],
  ];
  for (const [text, message] of cases) {
    const temp = inTempFile(text);
    try {
      assert.throws(() => loadConditions(temp.file), message);
    } finally {
      temp.done();
    }
  }
});

test("the package ships the data folder", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { files?: string[] };
  assert.ok(manifest.files?.includes("sensor/"), "package.json files lists sensor/");
  assert.equal(manifest.files?.at(-1), ".claude-plugin/", "and the Claude Code folder stays last");
});

const quietRunning = { id: "q", says: "x", check: "code", on: "running", fact: "quietMinutes", atLeast: 30, times: 1 };

test("the shipped data holds quiet-running, a running condition on quietMinutes, with a role-neutral says (#48)", () => {
  const found = shipped.find((condition) => condition.id === "quiet-running");
  assert.ok(found !== undefined && found.check === "code", "quiet-running is a code condition");
  assert.equal(found.on, "running");
  assert.equal(found.fact, "quietMinutes");
  assert.equal(found.atLeast, 30);
  assert.equal(found.times, 1);
  assert.equal(found.says, "its turn has run 30 minutes with no new activity");
  assert.doesNotMatch(found.says, /ticket|stream/i, "a ticket agent's tick reuses it (#49)");
});

test("turn-end checks never evaluate a running condition, and a tick checks only running conditions (#48)", () => {
  const running: Condition[] = [{ id: "q", says: "x", check: "code", on: "running", fact: "quietMinutes", atLeast: 30, times: 1 }];
  const turnEnd: Condition[] = [{ id: "t", says: "y", check: "code", fact: "newItems", atMost: 99, times: 1 }];
  const both = [...running, ...turnEnd];
  const turn = { outcome: "completed", newItems: 1, newToolCalls: 1, tailRepeats: 0 };
  assert.deepEqual(flagged(both, turn, new Map()).map((c) => c.id), ["t"], "a turn end skips the running condition");
  assert.deepEqual(flagged(both, { quietMinutes: 45 }, new Map(), "running").map((c) => c.id), ["q"], "a tick checks the running condition only");
  assert.deepEqual(flagged(both, { quietMinutes: 29 }, new Map(), "running"), [], "below the threshold it holds no flag");
});

test("loadConditions refuses a running condition that names another fact, and a turn-end one that names quietMinutes (#48)", () => {
  const cases: [string, RegExp][] = [
    [JSON.stringify({ conditions: [{ ...quietRunning, fact: "newItems" }] }), /running condition[^;]*quietMinutes/],
    [JSON.stringify({ conditions: [{ ...quietRunning, on: undefined }] }), /quietMinutes/],
    [JSON.stringify({ conditions: [{ ...quietRunning, on: "turn-end" }] }), /quietMinutes/],
    [JSON.stringify({ conditions: [{ ...quietRunning, on: "sometimes" }] }), /turn-end or running/],
  ];
  for (const [text, message] of cases) {
    const temp = inTempFile(text);
    try {
      assert.throws(() => loadConditions(temp.file), message);
    } finally {
      temp.done();
    }
  }
  const fine = inTempFile(JSON.stringify({ conditions: [quietRunning] }));
  try {
    assert.equal(loadConditions(fine.file).length, 1, "a running condition on quietMinutes loads");
  } finally {
    fine.done();
  }
});

test("the smoke copy of the conditions loads and differs from the release file only in the quiet-running threshold", () => {
  const smoke = loadConditions(fileURLToPath(new URL("./smoke/conditions.json", import.meta.url)));
  const quiet = (list: readonly Condition[]) => list.find((condition) => condition.id === "quiet-running") as Record<string, unknown> | undefined;
  assert.equal(quiet(shipped)?.["atLeast"], 30, "the release default stays 30 minutes");
  assert.equal(quiet(smoke)?.["atLeast"], 1, "the smoke copy flags after 1 minute");
  const rest = (list: readonly Condition[]) => list.filter((condition) => condition.id !== "quiet-running");
  assert.deepEqual(rest(smoke), rest(shipped));
});
