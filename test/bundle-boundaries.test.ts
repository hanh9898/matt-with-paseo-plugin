import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

/** The client's entry file: it compiles into the client bundle, like every file under `client/`. */
const CLIENT_ENTRY = "index.client.ts";
/** The folders the daemon compiles into the client bundle (`client/`) or into both bundles (`shared/`). */
const FOLDERS = ["shared", "client"];

const NODE_MODULES = new Set(builtinModules);

function posix(path: string): string {
  return path.split(sep).join("/");
}

/** Every source file the daemon compiles into the client bundle or into both bundles. */
function bundledFiles(): string[] {
  const inFolders = FOLDERS.flatMap((folder) =>
    readdirSync(join(root, folder), { recursive: true, encoding: "utf8" })
      .map((path) => posix(join(folder, path)))
      .filter((path) => /\.(tsx?|mjs|cjs|js)$/.test(path)),
  );
  return [CLIENT_ENTRY, ...inFolders];
}

const STATIC_IMPORT = /\b(?:import|export)\s+(?:type\s+)?[^;"']*?\s*from\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;
const CALLED_IMPORT = /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Every module specifier `text` imports, however it is spelled. */
function specifiersIn(text: string): string[] {
  const found: string[] = [];
  for (const [, from, bare] of text.matchAll(STATIC_IMPORT)) found.push(from ?? bare ?? "");
  for (const [, spec] of text.matchAll(CALLED_IMPORT)) found.push(spec ?? "");
  return found;
}

function isNodeModule(spec: string): boolean {
  if (spec.startsWith("node:")) return true;
  return NODE_MODULES.has(spec.split("/")[0] ?? spec);
}

/** What in `text` (the source of `file`) the client bundle or both bundles may not import: a Node module or the server's code. */
function breachesIn(file: string, text: string): string[] {
  const found: string[] = [];
  for (const spec of specifiersIn(text)) {
    if (isNodeModule(spec)) found.push(`${file} imports the Node module ${spec}`);
    else if (spec.startsWith(".")) {
      const target = posix(relative(root, join(root, dirname(file), spec)));
      if (target.split("/")[0] === "server") found.push(`${file} imports ${spec}, a module under server/`);
    }
  }
  return found;
}

test("the check sees a Node module or a server module, however it is imported", () => {
  assert.deepEqual(breachesIn("shared/a.ts", 'import { homedir } from "node:os";'), ["shared/a.ts imports the Node module node:os"]);
  assert.deepEqual(breachesIn("shared/a.ts", 'import { join } from "path";'), ["shared/a.ts imports the Node module path"]);
  assert.deepEqual(breachesIn("shared/a.ts", 'import { readFile } from "fs/promises";'), ["shared/a.ts imports the Node module fs/promises"]);
  assert.deepEqual(breachesIn("shared/a.ts", 'export { join } from "node:path";'), ["shared/a.ts imports the Node module node:path"]);
  assert.deepEqual(breachesIn("shared/a.ts", 'const os = await import("node:os");'), ["shared/a.ts imports the Node module node:os"]);
  assert.deepEqual(breachesIn("shared/a.ts", 'import "node:fs";'), ["shared/a.ts imports the Node module node:fs"]);
  assert.deepEqual(breachesIn("client/a.ts", 'import {\n  stateDir,\n} from "../server/state-location.ts";'), ["client/a.ts imports ../server/state-location.ts, a module under server/"]);
  assert.deepEqual(breachesIn("index.client.ts", 'import { x } from "./server/state.ts";'), ["index.client.ts imports ./server/state.ts, a module under server/"]);
});

test("the check lets shared code through", () => {
  assert.deepEqual(breachesIn("client/a.ts", 'import { ROLE } from "../shared/role-labels.ts";'), []);
  assert.deepEqual(breachesIn("shared/a.ts", 'import type { Thing } from "./b.ts";'), []);
  assert.deepEqual(breachesIn("index.client.ts", 'import { definePlugin } from "@getpaseo/plugin-sdk";'), []);
});

test("the scan covers the shared folder, the client folder and the client entry", () => {
  const files = bundledFiles();
  assert.ok(files.includes(CLIENT_ENTRY), "the client entry is scanned");
  assert.ok(files.some((file) => file.startsWith("shared/")), "a file under shared/ is scanned");
  assert.ok(files.some((file) => file.startsWith("client/")), "a file under client/ is scanned");
});

test("no file the client bundle or both bundles compile imports a Node module or a server module", () => {
  const breaches = bundledFiles().flatMap((file) => breachesIn(file, readFileSync(join(root, file), "utf8")));
  assert.deepEqual(breaches, []);
});
