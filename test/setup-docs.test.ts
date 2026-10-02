import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name: string): string => readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n");

/** The text under `heading`, up to the next heading of the same level or higher. */
function section(text: string, heading: string): string {
  const level = /^#+/.exec(heading)?.[0].length ?? 2;
  const lines = text.split("\n");
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `has the heading ${heading}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => new RegExp(`^#{1,${level}}\\s`).test(line));
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

function links(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map(([, target]) => target ?? "");
}

test("the README has a Setup section right above Development", () => {
  const headings = read("README.md").split("\n").filter((line) => line.startsWith("## "));
  const at = headings.indexOf("## Setup");
  assert.notEqual(at, -1, "README has a ## Setup heading");
  assert.equal(headings[at + 1], "## Development");
});

test("the Setup section names the one command, its dry run, the overrides, and links ADR 0002 and the manual install", () => {
  const setup = section(read("README.md"), "## Setup");
  for (const token of ["npx github:hanh9898/matt-with-paseo-plugin setup", "--dry-run", "--paseo-home", "MWP_SETUP_DIR", "CLAUDE_CONFIG_DIR", "setup/paired.json"]) {
    assert.ok(setup.includes(token), `the Setup section names ${token}`);
  }
  assert.ok(links(setup).includes("docs/adr/0002-what-the-plugin-will-never-do.md"), "links ADR 0002");
  assert.ok(links(setup).includes("#development"), "points to the manual install in Development");
});

test("the README's path table has a row for setup/ and for each file in it, and for the fake runner", () => {
  const rows = read("README.md").split("\n").filter((line) => line.startsWith("| `"));
  const files = readdirSync(join(root, "setup")).map((name) => `setup/${name}`);
  for (const path of ["setup/", ...files, "test/support/fake-runner.ts"]) {
    assert.ok(rows.some((row) => (row.split("|")[1] ?? "").includes(`\`${path}\``)), `a path row names ${path}`);
  }
});

test("the release checklist checks the paired skills tag when the contract changes", () => {
  const steps = section(read("docs/agents/release-checklist.md"), "## Check the paired skills tag")
    .split("\n")
    .filter((line) => /^\d+\. /.test(line));
  assert.equal(steps.length, 1);
  const [step] = steps;
  for (const token of ["setup/paired.json", "CONTRACT_VERSION", "Done when"]) assert.ok(step?.includes(token), `the step names ${token}`);
});

test("the evidence standards say how setup is proven, at the ticket and at the milestone run", () => {
  const setup = section(read("docs/agents/evidence-standards.md"), "## Setup");
  for (const token of ["test/support/fake-runner.ts", "test/smoke/README.md", "Setup"]) assert.ok(setup.includes(token), `names ${token}`);
  for (const target of links(setup)) {
    if (/^([a-z]+:|#)/i.test(target)) continue;
    assert.ok(existsSync(resolve(root, "docs", "agents", target.split("#")[0] ?? "")), `link resolves: ${target}`);
  }
});
