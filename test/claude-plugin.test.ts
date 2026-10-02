import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function readJson(name: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(read(name));
  assert.ok(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed), `${name} is an object`);
  return Object.fromEntries(Object.entries(parsed));
}

const PLUGIN = ".claude-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";

test("the plugin manifest holds the minimum, in a stable order: name, version, description, author", () => {
  assert.deepEqual(Object.keys(readJson(PLUGIN)), ["name", "version", "description", "author"]);
});

test("the plugin manifest's author is the marketplace's owner, so validate warns of no missing author", () => {
  assert.deepEqual(readJson(PLUGIN)["author"], readJson(MARKETPLACE)["owner"]);
});

test("the plugin manifest names the plugin apart from the skills repository's plugin, `matt-with-paseo`", () => {
  const name = readJson(PLUGIN)["name"];
  assert.equal(name, "matt-with-paseo-plugin");
  assert.notEqual(name, "matt-with-paseo");
});

test("the Paseo id stays `matt-with-paseo`, as the Claude Code name is not the id", () => {
  assert.equal(readJson("paseo-plugin.json")["id"], "matt-with-paseo");
  assert.equal(readJson("package.json")["name"], "matt-with-paseo");
});

test("the plugin manifest names no hooks: hooks/hooks.json is found at its default place", () => {
  assert.equal(readJson(PLUGIN)["hooks"], undefined);
  assert.ok(existsSync(new URL("../hooks/hooks.json", import.meta.url)));
});

test("the marketplace holds a name, an owner, a description and one plugin, in a stable order", () => {
  const marketplace = readJson(MARKETPLACE);
  assert.deepEqual(Object.keys(marketplace), ["name", "owner", "description", "plugins"]);
  const owner = marketplace["owner"];
  assert.ok(typeof owner === "object" && owner !== null);
  assert.equal(typeof Reflect.get(owner, "name"), "string");
  const plugins = marketplace["plugins"];
  assert.ok(Array.isArray(plugins) && plugins.length === 1);
});

test("the marketplace entry is the plugin at this repository's root", () => {
  const plugins = readJson(MARKETPLACE)["plugins"];
  assert.ok(Array.isArray(plugins));
  const entry: unknown = plugins[0];
  assert.ok(typeof entry === "object" && entry !== null);
  assert.deepEqual(Object.keys(entry), ["name", "source", "version"]);
  assert.equal(Reflect.get(entry, "name"), "matt-with-paseo-plugin");
  assert.equal(Reflect.get(entry, "source"), "./");
});

test("the marketplace name is not the skills repository's marketplace, which a user could not register beside it", () => {
  const name = readJson(MARKETPLACE)["name"];
  assert.equal(name, "matt-with-paseo-plugin");
  assert.notEqual(name, "matt-with-paseo");
  assert.match(String(name), /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test("both Claude Code manifests are plain JSON: two-space indent, trailing newline (J3)", () => {
  for (const name of [PLUGIN, MARKETPLACE]) {
    const text = read(name);
    assert.ok(text.endsWith("}\n"), `${name} ends with a closing brace and one newline`);
    assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  }
});

test("package.json ships the Claude Code manifests, after the folders already listed", () => {
  const files = readJson("package.json")["files"];
  assert.ok(Array.isArray(files));
  assert.equal(files[files.length - 1], ".claude-plugin/");
  assert.ok(files.indexOf("guard/") < files.indexOf("hooks/"));
});
