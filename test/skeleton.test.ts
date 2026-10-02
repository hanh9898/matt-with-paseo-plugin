import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

function readJson(name: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
  assert.ok(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed), `${name} is an object`);
  return Object.fromEntries(Object.entries(parsed));
}

test("the manifest names the plugin with an id", () => {
  const manifest = readJson("paseo-plugin.json");
  assert.equal(typeof manifest["id"], "string");
  assert.notEqual(manifest["id"], "");
});

test("package.json has a typecheck script and a test command", () => {
  const scripts = readJson("package.json")["scripts"];
  assert.ok(typeof scripts === "object" && scripts !== null);
  assert.equal(Reflect.get(scripts, "typecheck"), "tsc --noEmit");
  assert.equal(Reflect.get(scripts, "test"), "node --test \"test/**/*.test.ts\"");
});

test("package.json keeps the SDK out of runtime dependencies (T7)", () => {
  assert.equal(readJson("package.json")["dependencies"], undefined);
});

test("tsconfig.json runs strict and leaves out the DOM library (T1)", () => {
  const options = readJson("tsconfig.json")["compilerOptions"];
  assert.ok(typeof options === "object" && options !== null);
  assert.equal(Reflect.get(options, "strict"), true);
  const lib: unknown = Reflect.get(options, "lib");
  assert.ok(Array.isArray(lib));
  assert.ok(!lib.some((entry) => typeof entry === "string" && entry.toLowerCase() === "dom"));
});

test("the entry module default-exports a contribution function", () => {
  const entry = new URL("../index.server.ts", import.meta.url);
  assert.ok(existsSync(entry), "index.server.ts exists");
  assert.match(readFileSync(entry, "utf8"), /export default function contribute\(/);
});

test(".gitignore keeps node_modules and build output out of git", () => {
  const lines = readFileSync(new URL("../.gitignore", import.meta.url), "utf8").split("\n");
  assert.ok(lines.includes("node_modules/"));
  assert.ok(lines.includes("dist/"));
});

test("the lockfile is tracked next to package.json", () => {
  assert.ok(existsSync(new URL("../package-lock.json", import.meta.url)));
});
