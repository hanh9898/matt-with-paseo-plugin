import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const DIR = ".github/workflows";

function workflowFiles(): string[] {
  const dir = new URL(`../${DIR}/`, import.meta.url);
  return existsSync(dir) ? readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)) : [];
}

function workflow(): string {
  const files = workflowFiles();
  assert.equal(files.length, 1, `${DIR} holds exactly one workflow file, found ${files.length}`);
  return readFileSync(new URL(`../${DIR}/${files[0]}`, import.meta.url), "utf8");
}

// The lines nested under a key: everything indented deeper than the key's own line.
function block(text: string, key: RegExp): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => key.test(line));
  assert.ok(start !== -1, `the workflow has ${key}`);
  const indent = lines[start].search(/\S/);
  const nested: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && line.search(/\S/) <= indent) break;
    nested.push(line);
  }
  return nested;
}

// A flow list written on one line, as `key: ["a", "b"]`, read as its items.
function flowList(lines: string[], key: string): string[] {
  const line = lines.find((entry) => entry.trim().startsWith(`${key}:`));
  assert.ok(line, `a ${key} list is present`);
  const match = /\[(.*)\]/.exec(line);
  assert.ok(match, `${key} is a one-line list`);
  return match[1].split(",").map((item) => item.trim().replace(/^["']|["']$/g, ""));
}

test("the workflow runs on ubuntu-latest, macos-latest and windows-latest", () => {
  const matrix = block(workflow(), /^\s*matrix:/);
  assert.deepEqual(flowList(matrix, "os").sort(), ["macos-latest", "ubuntu-latest", "windows-latest"]);
});

test("a failure on one system does not cancel the other two", () => {
  assert.match(workflow(), /fail-fast:\s*false/);
});

test("the workflow runs npm ci, npm run typecheck and npm test, in that order", () => {
  const runs = workflow()
    .split("\n")
    .map((line) => /^\s*-?\s*run:\s*(.+)$/.exec(line)?.[1].trim())
    .filter((command): command is string => command !== undefined);
  assert.deepEqual(runs, ["npm ci", "npm run typecheck", "npm test"]);
});

test("the workflow starts only on a push to release/v* and a pull request into main", () => {
  const text = workflow();
  const triggers = block(text, /^on:/);
  const keys = triggers.filter((line) => /^ {2}\S/.test(line)).map((line) => line.trim().replace(/:.*$/, ""));
  assert.deepEqual(keys.sort(), ["pull_request", "push"], "no trigger besides push and pull_request");
  assert.deepEqual(flowList(block(text, /^ {2}push:/), "branches"), ["release/v*"]);
  assert.deepEqual(flowList(block(text, /^ {2}pull_request:/), "branches"), ["main"]);
});

test("a pull request runs the jobs only when it comes from a release/v* branch", () => {
  assert.match(workflow(), /if:\s*.*github\.event_name\s*==\s*'push'.*startsWith\(github\.head_ref,\s*'release\/v'\)/);
});

test("the workflow adds no dependency of its own and installs from the lockfile", () => {
  const text = workflow();
  assert.doesNotMatch(text, /npm install|npm i\b|npx /);
  assert.ok(existsSync(new URL("../package-lock.json", import.meta.url)), "npm ci reads package-lock.json");
});

test("the release checklist, CONTRIBUTING.md, the README and CHANGELOG.md name the CI run", () => {
  const read = (name: string): string => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
  const checklist = read("docs/agents/release-checklist.md");
  assert.match(checklist, /\.github\/workflows\/ci\.yml/, "the checklist names the workflow file");
  assert.match(checklist, /release\/v/, "the checklist ties the run to a release/v* branch");
  assert.ok(read("README.md").includes(".github/workflows/ci.yml"), "the README names the workflow");
  assert.ok(read("CONTRIBUTING.md").includes(".github/workflows/ci.yml"), "CONTRIBUTING.md names the workflow");
  const changelog = read("CHANGELOG.md");
  assert.match(changelog.slice(changelog.indexOf("## [Unreleased]")), /CI on three systems/i);
});
