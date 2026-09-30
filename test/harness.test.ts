import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { GUARDS, HARNESS_FIELDS, isDescriptor, problemsOf } from "../shared/harness.ts";
import * as harnessModule from "../server/harness.ts";
import { loadHarnesses } from "../server/harness.ts";

const valid = {
  configDirVar: "AGENT_CONFIG_DIR",
  skillsDir: "skills",
  skills: "native",
  mcpDelivery: "agent-config",
  guard: "hook",
  sandboxed: true,
};

test("a descriptor with every field of the table is valid", () => {
  assert.deepEqual(problemsOf(valid), []);
  assert.equal(isDescriptor(valid), true);
});

test("the sample above holds exactly the table's fields", () => {
  assert.deepEqual(Object.keys(valid), Object.keys(HARNESS_FIELDS));
});

test("a missing field is a problem that names the field", () => {
  for (const field of Object.keys(HARNESS_FIELDS)) {
    const { [field]: _dropped, ...rest } = valid as Record<string, unknown>;
    const problems = problemsOf(rest);
    assert.equal(problems.length, 1, `dropping ${field}: ${problems.join("; ")}`);
    assert.ok(problems[0]?.startsWith(`${field}:`), `the problem names ${field}: ${problems[0]}`);
    assert.equal(isDescriptor(rest), false);
  }
});

test("a key that is not a field of the table is a problem that names the key", () => {
  const problems = problemsOf({ ...valid, network: true });
  assert.equal(problems.length, 1);
  assert.ok(problems[0]?.startsWith("network:"), problems[0]);
});

const bad: Array<[field: string, value: unknown]> = [
  ["configDirVar", ""],
  ["configDirVar", "lower_case"],
  ["configDirVar", "HAS SPACE"],
  ["configDirVar", 7],
  ["skillsDir", ""],
  ["skillsDir", "/absolute"],
  ["skillsDir", "C:\\absolute"],
  ["skillsDir", "../outside"],
  ["skillsDir", "in/../outside"],
  ["skillsDir", null],
  ["skills", "cloned"],
  ["skills", true],
  ["mcpDelivery", "magic"],
  ["mcpDelivery", ["agent-config"]],
  ["guard", "magic"],
  ["guard", "Hook"],
  ["guard", true],
  ["guard", ["hook"]],
  ["sandboxed", "true"],
  ["sandboxed", "false"],
  ["sandboxed", 1],
  ["sandboxed", 0],
  ["sandboxed", null],
  ["sandboxed", ["true"]],
];

test("a value the field does not accept is a problem that names the field", () => {
  for (const [field, value] of bad) {
    const problems = problemsOf({ ...valid, [field]: value });
    assert.equal(problems.length, 1, `${field} = ${JSON.stringify(value)}: ${problems.join("; ")}`);
    assert.ok(problems[0]?.startsWith(`${field}:`), problems[0]);
  }
});

test("the guard field takes hook or path-shim, and a descriptor with either is valid", () => {
  assert.deepEqual([...GUARDS], ["hook", "path-shim"]);
  for (const guard of GUARDS) assert.deepEqual(problemsOf({ ...valid, guard }), [], guard);
});

test("the sandboxed field takes true or false, and a descriptor with either is valid", () => {
  for (const sandboxed of [true, false]) assert.deepEqual(problemsOf({ ...valid, sandboxed }), [], String(sandboxed));
});

test("a value that is not an object is not a descriptor", () => {
  for (const value of [null, [], "claude", 3, undefined]) {
    assert.equal(problemsOf(value).length, 1, JSON.stringify(value));
    assert.equal(isDescriptor(value), false);
  }
});

test("the shipped descriptors load, keyed by their file name", () => {
  const harnesses = loadHarnesses();
  assert.ok(harnesses.size > 0, "harness/ holds at least one descriptor");
  for (const descriptor of harnesses.values()) assert.equal(isDescriptor(descriptor), true);
});

test("the default descriptors are embedded: one per file of harness/, and no path to the folder is exported (#52)", () => {
  assert.equal("HARNESS_DIR" in harnessModule, false, "no exported path built from import.meta.url");
  const dir = fileURLToPath(new URL("../harness/", import.meta.url));
  const names = readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, "")).sort();
  assert.deepEqual([...loadHarnesses().keys()], names, "a descriptor added to harness/ is listed in server/harness.ts");
  assert.deepEqual(loadHarnesses(), loadHarnesses(dir), "server/data/harness/ holds the same descriptors as harness/");
});

function inTempDir(files: Record<string, string>): { dir: string; done(): void } {
  const dir = mkdtempSync(join(tmpdir(), "mwp-harness-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("a descriptor file added to the folder is loaded with no change to code", (t) => {
  const { dir, done } = inTempDir({
    "alpha.json": JSON.stringify(valid),
    "beta.json": JSON.stringify({ ...valid, skills: "provisioned" }),
    "notes.txt": "not a descriptor",
  });
  t.after(done);
  const harnesses = loadHarnesses(dir);
  assert.deepEqual([...harnesses.keys()], ["alpha", "beta"]);
  assert.equal(harnesses.get("beta")?.skills, "provisioned");
});

test("a folder with no descriptor loads as an empty map", (t) => {
  const { dir, done } = inTempDir({});
  t.after(done);
  assert.equal(loadHarnesses(dir).size, 0);
});

test("a descriptor that is not JSON is refused, naming its file", (t) => {
  const { dir, done } = inTempDir({ "broken.json": "{ not json" });
  t.after(done);
  assert.throws(() => loadHarnesses(dir), /broken\.json/);
});

test("a descriptor that breaks the table is refused, naming its file and the field", (t) => {
  const { dir, done } = inTempDir({ "odd.json": JSON.stringify({ ...valid, skills: "cloned" }) });
  t.after(done);
  assert.throws(() => loadHarnesses(dir), /odd\.json.*skills/s);
});
