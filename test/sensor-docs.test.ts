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

function cheapSensorSubsection(): string {
  const section = developmentSection();
  const start = section.indexOf("### The cheap sensor");
  return section.slice(start).split("\n### ", 2)[0] ?? "";
}

test("the README no longer says the sensor sees turn ends only, and says it also watches a running stream agent every 5 minutes (#48)", () => {
  assert.doesNotMatch(read("README.md"), /It sees turn ends only/);
  assert.doesNotMatch(cheapSensorSubsection(), /The port has no clock/);
  const words = cheapSensorSubsection();
  assert.match(words, /every 5 minutes/);
  assert.match(words, /running stream agent/);
  assert.match(words, /quietMinutes/);
  assert.match(words, /"running"/);
});

test("the smoke test's Cheap sensor section holds the two read-not-run facts of the running check as steps (#48)", () => {
  const smoke = read("test/smoke/README.md");
  const start = smoke.indexOf("## Cheap sensor");
  const section = smoke.slice(start).split("\n## ", 2)[0] ?? "";
  assert.match(section, /context\.paseo/, "a paseo kept from a hook call stays usable after the call returns");
  assert.match(section, /lastActivityAt/, "refresh() carries lastActivityAt and it does not move while a tool call is stuck");
  assert.match(section, /updatedAt/, "the fallback is named, and the step records which field was used");
  assert.match(section, /quiet-running|30 minutes/);
  assert.match(section, /paseo plugin remove mwp-smoke/, "the cleanup step stays last");
});

test("the changelog's Cheap sensor entry names the running stream-agent check (#48)", () => {
  const entry = /^- Cheap sensor:.*$/m.exec(read("CHANGELOG.md"))?.[0] ?? "";
  assert.ok(entry !== "", "the changelog has a Cheap sensor entry");
  assert.match(entry, /running stream agent/);
});
