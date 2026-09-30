import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const manifestUrl = new URL("../paseo-plugin.json", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const smokeUrl = new URL("./smoke/README.md", import.meta.url);

const SMOKE_PASEO_VERSION = "0.10.1";

function readManifest(): unknown {
  return JSON.parse(readFileSync(manifestUrl, "utf8"));
}

function declaredRange(): string {
  const manifest = readManifest();
  assert.ok(typeof manifest === "object" && manifest !== null, "manifest is an object");
  const requirements: unknown = Reflect.get(manifest, "requirements");
  assert.ok(typeof requirements === "object" && requirements !== null, "requirements is declared");
  const range: unknown = Reflect.get(requirements, "paseo");
  assert.ok(typeof range === "string" && range.trim() !== "", "requirements.paseo is a non-empty string");
  return range;
}

test("paseo-plugin.json declares requirements.paseo", () => {
  declaredRange();
});

test("the range has a floor at the tested version and a ceiling below the next minor", () => {
  const range = declaredRange();
  assert.equal(range, `>=${SMOKE_PASEO_VERSION} <0.11.0`);
});

test("paseo-plugin.json holds only keys the host accepts", () => {
  const manifest = readManifest();
  assert.ok(typeof manifest === "object" && manifest !== null);
  const allowed = new Set(["id", "description", "requirements", "build"]);
  for (const key of Object.keys(manifest)) {
    assert.ok(allowed.has(key), `unknown manifest key: ${key}`);
  }
});

test("paseo-plugin.json is plain JSON: two-space indent, trailing newline (J3)", () => {
  const text = readFileSync(manifestUrl, "utf8");
  assert.ok(text.endsWith("}\n"), "ends with a closing brace and one newline");
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
});

test("the README records the range next to the Paseo version the smoke test targets", () => {
  const range = declaredRange();
  const readme = readFileSync(readmeUrl, "utf8");
  const line = readme.split("\n").find((l) => l.includes(`\`${range}\``));
  assert.ok(line !== undefined, `README names the range \`${range}\``);
  assert.ok(line.includes(SMOKE_PASEO_VERSION), `that README line names ${SMOKE_PASEO_VERSION}`);
});

test("the smoke test records the range next to the Paseo version it targets", () => {
  const range = declaredRange();
  const smoke = readFileSync(smokeUrl, "utf8");
  const line = smoke.split("\n").find((l) => l.includes(`\`${range}\``));
  assert.ok(line !== undefined, `smoke test names the range \`${range}\``);
  assert.ok(line.includes(SMOKE_PASEO_VERSION), `that smoke test line names ${SMOKE_PASEO_VERSION}`);
});
