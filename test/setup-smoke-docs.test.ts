import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const numbered = (text: string): string[] => text.split("\n").filter((line) => /^\d+\. /.test(line));
const bullets = (text: string): string[] => text.split("\n").filter((line) => /^- /.test(line));

// The "Setup" smoke section

test("the smoke README has a Setup section above its Results", () => {
  const headings = read("test/smoke/README.md").split("\n").filter((line) => line.startsWith("## "));
  const at = headings.indexOf("## Setup");
  assert.notEqual(at, -1, "has ## Setup");
  assert.ok(at < headings.indexOf("## Results"), "Setup comes before Results");
});

test("the Setup section names the scratch resources and the environment it scrubs", () => {
  const setup = section(read("test/smoke/README.md"), "## Setup");
  const tokens = [
    "HOME",
    "USERPROFILE",
    "MWP_SETUP_DIR",
    "CLAUDE_CONFIG_DIR",
    "--paseo-home",
    "APPDATA",
    "PASEO_HOME",
    "PASEO_AGENT_ID",
    "PASEO_AGENT_CWD",
    "PASEO_CLI",
    "API_KEY",
    "TOKEN",
    "SECRET",
    "paseo daemon status",
    "claude plugin list",
  ];
  for (const token of tokens) assert.ok(setup.includes(token), `the Setup section names ${token}`);
});

test("the Setup section has the eight steps in order: record, setup, setup, --update, --remove, --remove, the npx dry run, record", () => {
  const steps = numbered(section(read("test/smoke/README.md"), "## Setup"));
  assert.equal(steps.length, 8);
  const pins: string[][] = [
    ["paseo daemon status", "claude plugin list"],
    ["setup"],
    ["setup"],
    ["setup --update"],
    ["setup --remove"],
    ["setup --remove"],
    ["npx github:hanh9898/matt-with-paseo-plugin#", "setup --dry-run"],
    ["paseo daemon status", "claude plugin list"],
  ];
  pins.forEach((tokens, i) => {
    for (const token of tokens) assert.ok(steps[i]?.includes(token), `step ${i + 1} names ${token}`);
  });
});

test("the Setup section says its results line is one Windows run and the macOS and Linux runs are the milestone's", () => {
  const setup = section(read("test/smoke/README.md"), "## Setup");
  for (const token of ["Windows", "macOS", "Linux", "## Results"]) assert.ok(setup.includes(token), `names ${token}`);
});

test("Results has a Setup line: section, status, date, Paseo, OS, Node, then the evidence", () => {
  const line = bullets(section(read("test/smoke/README.md"), "## Results")).find((item) => item.startsWith("- Setup | "));
  assert.ok(line !== undefined, "a Results line starts with Setup");
  const fields = line.replace(/^- /, "").split(" | ");
  assert.ok(fields.length >= 7, "seven fields or more");
  assert.match(fields[1] ?? "", /^(pass|fail|human|blocked: .+)$/, "a status of smoke-plan.ts");
  assert.match(fields[2] ?? "", /^\d{4}-\d{2}-\d{2}$/);
  assert.match(fields[3] ?? "", /^Paseo \d+\.\d+\.\d+$/);
  assert.match(fields[4] ?? "", /^Windows/);
  assert.match(fields[5] ?? "", /^Node v\d+\./);
});

// The README

test("the README's Setup section names --update and --remove", () => {
  const setup = section(read("README.md"), "## Setup");
  for (const token of ["--update", "--remove"]) assert.ok(setup.includes(token), `the Setup section names ${token}`);
});

// The roadmap

test("the roadmap has a v0.1.1 section right after v0.1.0, with its two tickets and its four exit criteria", () => {
  const roadmap = read("docs/roadmap.md");
  const headings = roadmap.split("\n").filter((line) => line.startsWith("## v0."));
  assert.equal(headings[1], "## v0.1.1: One-command setup");
  const v = section(roadmap, "## v0.1.1: One-command setup");
  const tickets = numbered(section(v, "### New tickets"));
  for (const n of [65, 66]) assert.ok(tickets.some((item) => new RegExp(`#${n}\\b`).test(item)), `lists #${n}`);
  const criteria = numbered(section(v, "### Exit criteria"));
  assert.equal(criteria.length, 4);
  assert.ok(criteria[0]?.includes("CI is green on Windows, macOS and Linux"), "CI on three systems");
  assert.ok(criteria[1]?.includes("Setup") && criteria[1].includes("test/smoke/README.md"), "the Setup smoke section");
  assert.ok(criteria[2]?.includes("`0.1.1`") && criteria[2].includes("CHANGELOG.md"), "the version token and the changelog entry");
  assert.ok(criteria[3]?.includes("The `v0.1.1` milestone run"), "the milestone run");
});
