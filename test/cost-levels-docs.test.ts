import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LEVEL_ENV, roleEnv, ROLES } from "../shared/cost-levels.ts";

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

function costLevels(): string {
  const section = developmentSection();
  const start = section.indexOf("\n### Cost levels");
  assert.ok(start !== -1, "the Development section has a ### Cost levels heading");
  const rest = section.slice(start + 1);
  const next = rest.indexOf("\n### ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

test("the layout table lists the presets, their reader and their loader", () => {
  const rows = developmentSection().split("\n").filter((line) => line.startsWith("| `"));
  for (const path of ["presets/", "shared/cost-levels.ts", "server/cost-levels.ts"]) {
    assert.ok(rows.some((row) => row.startsWith(`| \`${path}\``)), `layout table has a row for ${path}`);
  }
});

test("package.json ships the presets", () => {
  const files: unknown = JSON.parse(read("package.json")).files;
  assert.ok(Array.isArray(files) && files.includes("presets/"), "files lists presets/");
});

test("the README names the levels, the settings and the override (criteria 1 and 2)", () => {
  const text = costLevels();
  const needles = ["Cheap", "Balanced", "Max", "presets/cost-levels.json", LEVEL_ENV, ...ROLES.map(roleEnv), "agent/model", "list_profiles", "0.10.1"];
  for (const needle of needles) assert.ok(text.includes(needle), `Cost levels names ${needle}`);
});

test("the README says which part is the skills' and that the plugin touches no profile", () => {
  const text = costLevels().toLowerCase();
  for (const needle of ["skills' part", "hanh9898/matt-with-paseo", "never creates, edits or deletes a profile", "falls back"]) {
    assert.ok(text.includes(needle), `Cost levels says ${needle}`);
  }
});

test("the changelog and the smoke test carry the cost levels", () => {
  assert.match(read("CHANGELOG.md"), /Cost levels:/);
  const smoke = read("test/smoke/README.md");
  assert.ok(smoke.includes("## Cost levels"), "the smoke test has a Cost levels section");
  assert.ok(smoke.includes(LEVEL_ENV));
});
