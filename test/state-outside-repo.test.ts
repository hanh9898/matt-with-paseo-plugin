import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { MARKED_BLOCK, STATE_DIR_ENV, stateDir, withMarkedBlock } from "../server/state-location.ts";
import { readStateFile, writeMarkedBlock, writeStateFile } from "../server/state.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

/** The one module that may write: it writes under the state directory, or into the one marked block. */
const WRITER = "server/state.ts";
/** The one module that names where the state lives. */
const LOCATION = "server/state-location.ts";

/** What a read-only import of `node:fs` may name: nothing that creates, changes or removes a file. */
const READ_ONLY = new Set(["readFileSync", "readFile", "readdirSync", "readdir", "existsSync", "statSync", "stat", "lstatSync", "lstat", "accessSync", "access", "realpathSync", "realpath", "createReadStream", "constants"]);
/** Modules that can write anywhere, or run something that does. */
const FILE_MODULES = new Set(["fs", "fs/promises"]);
const PROCESS_MODULES = new Set(["child_process"]);

function posix(path: string): string {
  return path.split(sep).join("/");
}

/** The plugin's code: every module the daemon, the app or a hook script runs. Tests are outside it. */
function product(): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map(posix)
    .filter((path) => /\.(tsx?|mjs|cjs|js)$/.test(path))
    .filter((path) => !path.split("/").some((part) => part === "node_modules" || part === ".git"))
    .filter((path) => !path.startsWith("test/"));
}

const STATIC_IMPORT = /\b(?:import|export)\s+(type\s+)?([^;"']*?)\s*from\s*["']([^"']+)["']/g;
const CALLED_IMPORT = /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

/** What `text` imports that can write a file or start a process, however it is spelled: the way in is the import. */
function writeApiIn(text: string): string[] {
  const found: string[] = [];
  for (const [, isType, clause, spec] of text.matchAll(STATIC_IMPORT)) {
    const module = (spec ?? "").replace(/^node:/, "");
    if (isType || module === "" || !(FILE_MODULES.has(module) || PROCESS_MODULES.has(module))) continue;
    const braces = /\{([^}]*)\}/.exec(clause ?? "");
    const outside = (clause ?? "").replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
    if (PROCESS_MODULES.has(module)) found.push(`imports ${module}`);
    else if (outside !== "" || braces === null) found.push(`imports all of ${module}`);
    else {
      for (const item of (braces[1] ?? "").split(",")) {
        const name = item.trim().split(/\s+as\s+/)[0]?.trim() ?? "";
        if (name !== "" && !name.startsWith("type ") && !READ_ONLY.has(name)) found.push(`imports ${name} from ${module}`);
      }
    }
  }
  for (const [, spec] of text.matchAll(CALLED_IMPORT)) {
    const module = (spec ?? "").replace(/^node:/, "");
    if (FILE_MODULES.has(module) || PROCESS_MODULES.has(module)) found.push(`loads ${module} at run time`);
  }
  return found;
}

test("the check sees a write API, however it is imported", () => {
  assert.deepEqual(writeApiIn('import { writeFileSync } from "node:fs";'), ["imports writeFileSync from fs"]);
  assert.deepEqual(writeApiIn('import { readFileSync, rmSync as remove } from "fs";'), ["imports rmSync from fs"]);
  assert.deepEqual(writeApiIn('import { readFile, mkdir } from "node:fs/promises";'), ["imports mkdir from fs/promises"]);
  assert.deepEqual(writeApiIn('import * as fs from "node:fs";'), ["imports all of fs"]);
  assert.deepEqual(writeApiIn('import fs from "node:fs";'), ["imports all of fs"]);
  assert.deepEqual(writeApiIn('import fs, { readFileSync } from "node:fs";'), ["imports all of fs"]);
  assert.deepEqual(writeApiIn('import { promises } from "node:fs";'), ["imports promises from fs"]);
  assert.deepEqual(writeApiIn('import {\n  readFileSync,\n  appendFileSync,\n} from "node:fs";'), ["imports appendFileSync from fs"]);
  assert.deepEqual(writeApiIn('export { writeFile } from "node:fs/promises";'), ["imports writeFile from fs/promises"]);
  assert.deepEqual(writeApiIn('const fs = require("node:fs");'), ["loads fs at run time"]);
  assert.deepEqual(writeApiIn('const fs = await import("fs/promises");'), ["loads fs/promises at run time"]);
  assert.deepEqual(writeApiIn('import { execFile } from "node:child_process";'), ["imports child_process"]);
});

test("the check lets a read pass", () => {
  assert.deepEqual(writeApiIn('import { readdirSync, readFileSync } from "node:fs";'), []);
  assert.deepEqual(writeApiIn('import { readFile } from "node:fs/promises";'), []);
  assert.deepEqual(writeApiIn('import type { Stats } from "node:fs";'), []);
  assert.deepEqual(writeApiIn('import { join } from "node:path";'), []);
  assert.deepEqual(writeApiIn("// writeFileSync is named in a comment only"), []);
});

test("the plugin's code writes no file except in the state module, so the target repository is left as it was", () => {
  const files = product();
  assert.ok(files.length > 0, "the walk finds the plugin's code");
  assert.ok(files.includes(WRITER), "the state module is part of the plugin's code");
  const problems = files
    .filter((path) => path !== WRITER)
    .flatMap((path) =>
      writeApiIn(readFileSync(new URL(`../${path}`, import.meta.url), "utf8")).map(
        (what) => `${path} ${what}: write through ${WRITER}, which keeps it under the state directory`,
      ),
    );
  assert.deepEqual(problems, []);
});

test("the state module is the one writer, and it does write", () => {
  const found = writeApiIn(readFileSync(new URL(`../${WRITER}`, import.meta.url), "utf8"));
  assert.ok(found.length > 0, "the check would see the state module write");
  assert.ok(!found.some((what) => what.includes("child_process")), "the state module starts no process");
});

test("where the state lives is named in one module", () => {
  const places = [STATE_DIR_ENV, "XDG_DATA_HOME", "LOCALAPPDATA", ".local", "homedir"];
  const problems = product()
    .filter((path) => path !== LOCATION)
    .flatMap((path) => {
      const text = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      return places.filter((place) => text.includes(place)).map((place) => `${path} names ${place}: ask ${LOCATION}`);
    });
  assert.deepEqual(problems, []);
});

test("the state directory follows the platform and one setting", () => {
  assert.equal(stateDir({}, "/home/a", "linux"), join("/home/a", ".local", "share", "matt-with-paseo"));
  assert.equal(stateDir({ XDG_DATA_HOME: "/data" }, "/home/a", "linux"), join("/data", "matt-with-paseo"));
  assert.equal(stateDir({}, "/Users/a", "darwin"), join("/Users/a", "Library", "Application Support", "matt-with-paseo"));
  assert.equal(stateDir({ LOCALAPPDATA: "C:\\L" }, "C:\\Users\\a", "win32"), join("C:\\L", "matt-with-paseo"));
  assert.equal(stateDir({}, "C:\\Users\\a", "win32"), join("C:\\Users\\a", "AppData", "Local", "matt-with-paseo"));
  const set = join(tmpdir(), "elsewhere");
  assert.equal(stateDir({ [STATE_DIR_ENV]: set }, "/home/a", "linux"), set);
  assert.equal(stateDir({ [STATE_DIR_ENV]: "relative/dir" }, "/home/a", "linux"), join("/home/a", ".local", "share", "matt-with-paseo"));
  assert.equal(stateDir({ [STATE_DIR_ENV]: "" }, "/home/a", "linux"), join("/home/a", ".local", "share", "matt-with-paseo"));
});

test("state is written and read under the state directory, and never leaves it", () => {
  const scratch = mkdtempSync(join(tmpdir(), "mwp-state-"));
  const state = join(scratch, "state");
  const repo = join(scratch, "repo");
  mkdirSync(repo);
  writeFileSync(join(repo, "README.md"), "mine\n");
  const before = readdirSync(repo, { recursive: true, encoding: "utf8" }).sort();

  const path = writeStateFile("waves/one.json", '{"n":1}\n', state);
  assert.equal(path, join(state, "waves", "one.json"));
  assert.equal(readStateFile("waves/one.json", state), '{"n":1}\n');
  assert.equal(readStateFile("waves/none.json", state), null);
  assert.deepEqual(readdirSync(repo, { recursive: true, encoding: "utf8" }).sort(), before);

  for (const name of ["../escape.txt", "/abs.txt", "a/../../b.txt", "", "C:\\x.txt"]) {
    assert.throws(() => writeStateFile(name, "x", state), /state directory/, `refuses ${JSON.stringify(name)}`);
  }
  assert.deepEqual(readdirSync(scratch).sort(), ["repo", "state"]);
});

test("the marked block is inserted once, replaced in place, and touches nothing else", () => {
  const { begin, end } = MARKED_BLOCK;
  assert.equal(withMarkedBlock("", "hello"), `${begin}\nhello\n${end}\n`);
  assert.equal(withMarkedBlock("# Mine\n", "hello"), `# Mine\n\n${begin}\nhello\n${end}\n`);
  const once = withMarkedBlock("# Mine\n", "hello");
  assert.equal(withMarkedBlock(once, "again"), `# Mine\n\n${begin}\nagain\n${end}\n`);
  const around = `top\n${begin}\nold\n${end}\nbottom\n`;
  assert.equal(withMarkedBlock(around, "new"), `top\n${begin}\nnew\n${end}\nbottom\n`);
  assert.equal(withMarkedBlock(withMarkedBlock(around, "new"), "new"), withMarkedBlock(around, "new"));
  for (const broken of [`${begin}\nno end\n`, `no begin\n${end}\n`, `${end}\n${begin}\n`, `${begin}\na\n${end}\n${begin}\nb\n${end}\n`]) {
    assert.throws(() => withMarkedBlock(broken, "x"), /marked block/, `refuses ${JSON.stringify(broken)}`);
  }
});

test("writing the marked block creates one file in the repository and keeps the person's text", () => {
  const repo = mkdtempSync(join(tmpdir(), "mwp-repo-"));
  const file = join(repo, MARKED_BLOCK.file);
  assert.equal(writeMarkedBlock(repo, "first"), file);
  assert.deepEqual(readdirSync(repo), [MARKED_BLOCK.file]);
  writeFileSync(file, `# Mine\n\n${readFileSync(file, "utf8")}`);
  writeMarkedBlock(repo, "second");
  const text = readFileSync(file, "utf8");
  assert.ok(text.startsWith("# Mine\n"), "the person's text stays");
  assert.equal(text.split(MARKED_BLOCK.begin).length - 1, 1, "one block");
  assert.ok(text.includes("second") && !text.includes("first"));
  assert.deepEqual(readdirSync(repo), [MARKED_BLOCK.file]);

  writeFileSync(file, `${MARKED_BLOCK.begin}\nunfinished\n`);
  assert.throws(() => writeMarkedBlock(repo, "third"), /marked block/);
  assert.equal(readFileSync(file, "utf8"), `${MARKED_BLOCK.begin}\nunfinished\n`, "a broken block is left as it was");
});
