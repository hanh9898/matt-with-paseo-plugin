import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { quoteForCmd, spawnPlan } from "../setup/run.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name: string): string => readFileSync(join(root, name), "utf8");
const posix = (path: string): string => path.split(sep).join("/");

/** The runner seam: the one module under `setup/` that starts a process. */
const RUNNER = "setup/run.mjs";

/** Every code module under `setup/`. */
function setupModules(): string[] {
  return readdirSync(join(root, "setup"), { recursive: true, encoding: "utf8" })
    .map((path) => `setup/${posix(path)}`)
    .filter((path) => /\.(mjs|cjs|js|tsx?)$/.test(path));
}

const IMPORT = /\b(?:import|export)\s+(?:type\s+)?[^;"']*?\s*from\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(text: string): string[] {
  return [...text.matchAll(IMPORT)].map(([, a, b, c]) => a ?? b ?? c ?? "");
}

test("package.json has bin matt-with-paseo -> setup/cli.mjs and ships setup/", () => {
  const manifest = JSON.parse(read("package.json")) as { bin?: Record<string, string>; files?: string[] };
  assert.deepEqual(manifest.bin, { "matt-with-paseo": "setup/cli.mjs" });
  assert.ok(manifest.files?.includes("setup/"), "files lists setup/");
});

test("setup/cli.mjs starts with #!/usr/bin/env node and has no carriage return", () => {
  const text = read("setup/cli.mjs");
  assert.equal(text.split("\n")[0], "#!/usr/bin/env node");
  assert.ok(!text.includes("\r"), "a CRLF shebang breaks on macOS and Linux");
});

test("only the runner module in setup/ imports node:child_process", () => {
  const modules = setupModules();
  assert.ok(modules.includes(RUNNER), "the runner module exists");
  const importers = modules.filter((path) => importsOf(read(path)).some((spec) => spec.replace(/^node:/, "") === "child_process"));
  assert.deepEqual(importers, [RUNNER]);
});

test("setup/ imports only node: builtins and its own relative .mjs files, so npx runs it from node_modules", () => {
  const problems = setupModules().flatMap((path) =>
    importsOf(read(path))
      .filter((spec) => !spec.startsWith("node:") && !/^\.\/[^/]+\.mjs$/.test(spec))
      .map((spec) => `${path} imports ${spec}`),
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(setupModules().filter((path) => !path.endsWith(".mjs")), [], "setup/ holds .mjs modules only");
});

test("no plugin code imports setup/: setup is not plugin code", () => {
  const plugin = ["index.client.ts", "index.server.ts", ...["client", "server", "shared"].flatMap((folder) =>
    readdirSync(join(root, folder), { recursive: true, encoding: "utf8" }).map((path) => `${folder}/${posix(path)}`),
  )].filter((path) => /\.(tsx?|mjs|cjs|js)$/.test(path));
  assert.deepEqual(plugin.filter((path) => importsOf(read(path)).some((spec) => /(^|\/)setup\//.test(spec))), []);
});

test("setup reads no environment variable but MWP_SETUP_DIR and CLAUDE_CONFIG_DIR", () => {
  const reads = setupModules().flatMap((path) => [...read(path).matchAll(/process\.env(\.\w+|\[[^\]]*\])?/g)].map(([whole]) => `${path}: ${whole}`));
  assert.ok(reads.length > 0, "the check sees the reads");
  assert.deepEqual(reads.filter((what) => !/process\.env\.(MWP_SETUP_DIR|CLAUDE_CONFIG_DIR)$/.test(what)), []);
});

test("on Windows the runner goes through the shell with every argument quoted, so a .cmd shim runs", () => {
  const path = join(tmpdir(), "a b");
  const plan = spawnPlan("paseo", ["plugin", "install", path], "win32");
  assert.equal(plan.shell, true);
  assert.deepEqual(plan.args, []);
  assert.equal(plan.file, `paseo ${quoteForCmd("plugin")} ${quoteForCmd("install")} ${quoteForCmd(path)}`);
});

test("elsewhere the runner starts the command itself, with its arguments as they are", () => {
  for (const platform of ["linux", "darwin"]) {
    assert.deepEqual(spawnPlan("git", ["clone", "a b"], platform), { file: "git", args: ["clone", "a b"], shell: false });
  }
});

test("the Windows quoting escapes cmd's specials and the program's own quotes", () => {
  assert.equal(quoteForCmd("plugin"), '^"plugin^"');
  assert.equal(quoteForCmd("a b"), '^"a^ b^"');
  assert.equal(quoteForCmd("x&y|z"), '^"x^&y^|z^"');
  assert.equal(quoteForCmd('say "hi"'), '^"say^ \\^"hi\\^"^"');
  assert.equal(quoteForCmd("end\\"), '^"end\\\\^"');
  assert.equal(quoteForCmd("v1^{commit}"), '^"v1^^{commit}^"');
});
