import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { HARNESS_FIELDS, problemsOf } from "../shared/harness.ts";

const dir = new URL("../harness/", import.meta.url);
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .sort();

test("harness/ ships the claude descriptor", () => {
  assert.ok(files.includes("claude.json"), "harness/claude.json exists");
});

test("harness/claude.json guards through a hook: the agent runs hooks, so no shim on its path is needed", () => {
  const raw: unknown = JSON.parse(readFileSync(new URL("claude.json", dir), "utf8"));
  assert.ok(typeof raw === "object" && raw !== null && "guard" in raw);
  assert.equal(raw.guard, "hook");
});

// The contract every descriptor passes: a file added to harness/ is covered with no edit here.
for (const file of files) {
  const text = readFileSync(new URL(file, dir), "utf8");
  const raw: unknown = JSON.parse(text);

  test(`harness/${file} has every field of the table, valid, and no other`, () => {
    assert.deepEqual(problemsOf(raw), []);
  });

  test(`harness/${file} lists its fields in the table's order (J3)`, () => {
    assert.ok(typeof raw === "object" && raw !== null, "the descriptor is an object");
    assert.deepEqual(Object.keys(raw), Object.keys(HARNESS_FIELDS));
  });

  test(`harness/${file} is plain JSON: two-space indent, trailing newline (J3)`, () => {
    assert.equal(text, `${JSON.stringify(raw, null, 2)}\n`);
  });
}
