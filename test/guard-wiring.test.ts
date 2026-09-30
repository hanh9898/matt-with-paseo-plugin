import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { ROLE_ENV, TICKET_ROLE } from "../shared/role-marker.ts";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function json(path: string): unknown {
  return JSON.parse(read(path));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("the marker is named once, in shared/role-marker.ts, for the plugin to import", () => {
  assert.equal(ROLE_ENV, "MWP_ROLE");
  assert.equal(TICKET_ROLE, "ticket");
  const source = read("shared/role-marker.ts");
  assert.match(source, /export const ROLE_ENV\b/);
  assert.match(source, /export const TICKET_ROLE\b/);
  assert.doesNotMatch(source, /^\s*import\b/m, "the marker module imports nothing");
});

test("the guard script reads the same marker as the plugin sets", () => {
  const script = read("guard/git-guard.mjs");
  assert.ok(script.includes(`"${ROLE_ENV}"`), "the script names the marker's variable");
  assert.ok(script.includes(`"${TICKET_ROLE}"`), "the script names the ticket role");
});

test("the guard script is one file that imports nothing from the repository or from a package", () => {
  const script = read("guard/git-guard.mjs");
  const imports = [...script.matchAll(/^\s*import\b[^\n]*?["']([^"']+)["']/gm)].map((match) => match[1]);
  for (const name of imports) assert.match(name ?? "", /^node:/, `${name} is not a Node built-in`);
  assert.doesNotMatch(script, /\brequire\(/);
  assert.doesNotMatch(script, /\bimport\(/, "no dynamic import");
  assert.match(script, /^#!\/usr\/bin\/env node/, "it starts as a script on Linux and macOS");
});

test("the guard script names no agent id: an agent is data (ticket 06)", () => {
  const script = read("guard/git-guard.mjs").toLowerCase();
  const ids = readdirSync(new URL("../harness/", import.meta.url))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
  assert.ok(ids.length > 0);
  for (const id of ids) assert.ok(!script.includes(id), `guard/git-guard.mjs names ${id}`);
});

test("hooks/hooks.json runs the guard before every shell tool call of an agent that loads the plugin", () => {
  const file = json("hooks/hooks.json");
  assert.ok(isRecord(file) && isRecord(file["hooks"]), "a hooks object");
  const pre = file["hooks"]["PreToolUse"];
  assert.ok(Array.isArray(pre) && pre.length === 1, "one PreToolUse entry");
  const entry: unknown = pre[0];
  assert.ok(isRecord(entry));
  const matcher = String(entry["matcher"]);
  for (const tool of ["Bash", "PowerShell"]) assert.match(tool, new RegExp(`^(?:${matcher})$`), `${tool} is matched`);
  for (const tool of ["Edit", "Write", "Read"]) assert.doesNotMatch(tool, new RegExp(`^(?:${matcher})$`), `${tool} is not matched`);
  const hooks = entry["hooks"];
  assert.ok(Array.isArray(hooks) && hooks.length === 1);
  const hook: unknown = hooks[0];
  assert.ok(isRecord(hook));
  assert.equal(hook["type"], "command");
  const command = String(hook["command"]);
  assert.match(command, /^node "\$\{\w+\}\/guard\/git-guard\.mjs"$/, "node runs the script under the plugin root, so no shell script or jq is needed");
  assert.ok(existsSync(new URL("../guard/git-guard.mjs", import.meta.url)));
});

test("the guard and its hook file ship with the package", () => {
  const manifest = json("package.json");
  assert.ok(isRecord(manifest) && Array.isArray(manifest["files"]));
  for (const path of ["guard/", "hooks/"]) assert.ok(manifest["files"].includes(path), `files lists ${path}`);
});

test("the guard installs nothing outside the repository", () => {
  const script = read("guard/git-guard.mjs");
  for (const word of ["writeFile", "appendFile", "mkdir", "child_process", "spawn", "exec(", "homedir", "settings.json"]) {
    assert.ok(!script.includes(word), `the script does not use ${word}`);
  }
});
