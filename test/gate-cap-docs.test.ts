import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CAP_SHARE_ENV, DEFAULT_SHARE } from "../shared/gate-cap.ts";

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

test("the layout table lists the cap and its handler", () => {
  const rows = developmentSection().split("\n").filter((line) => line.startsWith("| `"));
  for (const path of ["shared/gate-cap.ts", "server/hooks/gate-cap.ts"]) {
    assert.ok(rows.some((row) => row.startsWith(`| \`${path}\``)), `layout table has a row for ${path}`);
  }
});

test("the README documents the cap with its default and its setting (criterion 1)", () => {
  const section = developmentSection();
  const start = section.indexOf("### The gate cap");
  assert.ok(start !== -1, "the Development section has a 'The gate cap' subsection");
  const words = section.slice(start).split("\n### ", 2)[0] ?? "";
  const shareText = String(DEFAULT_SHARE);
  for (const needle of [CAP_SHARE_ENV, shareText, "processors", "Gate cap passed", "Next:", "hanh9898/matt-with-paseo", "0.10.1", "queue"]) {
    assert.ok(words.includes(needle), `the subsection names ${needle}`);
  }
});

test("the README says which part is the skills' and what the plugin does not gate", () => {
  const section = developmentSection();
  const words = (section.slice(section.indexOf("### The gate cap")).split("\n### ", 2)[0] ?? "").toLowerCase();
  for (const needle of ["skills' part", "does not stop", "shell command"]) {
    assert.ok(words.includes(needle), `the subsection says ${needle}`);
  }
});

test("the changelog and the smoke test carry the gate cap", () => {
  assert.match(read("CHANGELOG.md"), /Gate cap:/);
  const smoke = read("test/smoke/README.md");
  assert.ok(smoke.includes("## Gate cap"), "the smoke test has a Gate cap section");
  assert.ok(smoke.includes(CAP_SHARE_ENV));
});
