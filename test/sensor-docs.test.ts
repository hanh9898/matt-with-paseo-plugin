import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function developmentSection(): string {
  const readme = read("README.md");
  const start = readme.indexOf("\n## Development");
  assert.ok(start !== -1, "README has a ## Development heading");
  const rest = readme.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

test("the layout table lists the sensor, its handler and its data", () => {
  const rows = developmentSection().split("\n").filter((line) => line.startsWith("| `"));
  for (const path of ["server/sensor.ts", "server/hooks/stall-sensor.ts", "sensor/"]) {
    assert.ok(rows.some((row) => row.startsWith(`| \`${path}\``)), `layout table has a row for ${path}`);
  }
});

test("the README says what the sensor checks, where its conditions live, and what it leaves out", () => {
  const section = developmentSection();
  const start = section.indexOf("### The cheap sensor");
  assert.ok(start !== -1, "the Development section has a 'The cheap sensor' subsection");
  const words = (section.slice(start).split("\n### ", 2)[0] ?? "").toLowerCase();
  for (const needle of ["sensor/conditions.json", "Stall suspected", "Next:", "no model is wired", "eval", "hanh9898/matt-with-paseo", "0.10.1"]) {
    assert.ok(words.includes(needle.toLowerCase()), `the subsection names ${needle}`);
  }
});

test("the changelog and the smoke test carry the sensor", () => {
  assert.match(read("CHANGELOG.md"), /Cheap sensor:/);
  const smoke = read("test/smoke/README.md");
  assert.ok(smoke.includes("## Cheap sensor"), "the smoke test has a Cheap sensor section");
  assert.ok(smoke.includes("0.10.1"));
});

test("the entry registers the sensor", () => {
  assert.match(read("index.server.ts"), /registerStallSensor\(hooks\)/);
});
