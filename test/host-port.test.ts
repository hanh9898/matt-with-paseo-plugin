import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const ADAPTER = "server/paseo-host.ts";
/**
 * The two modules beyond the adapter that name the SDK, because the pill's wire is not a host call: the RPC
 * contract both runtimes import (`defineRpc`) and the client entry (the type of the context Paseo hands it).
 */
const PILL_WIRE = ["index.client.ts", "shared/waiting.ts"];

function posix(path: string): string {
  return path.split(sep).join("/");
}

function sources(): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map(posix)
    .filter((path) => /\.tsx?$/.test(path))
    .filter((path) => !path.split("/").some((part) => part === "node_modules" || part === ".git"));
}

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

/** A static import, a bare import or a dynamic import of any Paseo SDK package (the `@getpaseo` scope), type imports included. */
function importsSdk(text: string): boolean {
  return /(?:\bfrom\s*|\bimport\s*\(?\s*)["']@getpaseo\//.test(text);
}

test("only the Paseo adapter and the pill's wire import the Paseo SDK (T2)", () => {
  const importing = sources().filter((path) => importsSdk(read(path)));
  assert.deepEqual(importing.sort(), [ADAPTER, ...PILL_WIRE].sort());
});

test("the entry module reaches Paseo through the adapter", () => {
  const entry = read("index.server.ts");
  assert.ok(entry.includes(`"./${ADAPTER}"`), "index.server.ts imports the adapter");
  assert.match(entry, /export default function contribute\(/);
});

test("the port is its own module and imports nothing", () => {
  const port = "server/host.ts";
  assert.ok(existsSync(new URL(`../${port}`, import.meta.url)), `${port} exists`);
  const text = read(port);
  for (const name of ["Host", "HostHooks"]) {
    assert.match(text, new RegExp(`export interface ${name}\\b`), `${port} exports ${name}`);
  }
  assert.doesNotMatch(text, /^\s*import\b/m, `${port} imports nothing`);
});

test("no module but the entry depends on the adapter", () => {
  const dependents = sources()
    .filter((path) => path !== ADAPTER && path !== "index.server.ts")
    .filter((path) => path !== "test/host-port.test.ts" && path !== "test/paseo-host.test.ts")
    .filter((path) => /\bfrom\s+["'][^"']*paseo-host(?:\.ts)?["']|import\(\s*["'][^"']*paseo-host(?:\.ts)?["']/.test(read(path)));
  assert.deepEqual(dependents, []);
});

test("every hook handler has a test that runs it on the fake adapter", () => {
  const dir = new URL("../server/hooks/", import.meta.url);
  if (!existsSync(dir)) return;
  const missing: string[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
    const name = file.replace(/\.ts$/, "");
    const check = new URL(`../test/hooks/${name}.test.ts`, import.meta.url);
    const covered = existsSync(check) && /FakeHost/.test(readFileSync(check, "utf8"));
    if (!covered) missing.push(`server/hooks/${file}`);
  }
  assert.deepEqual(missing, []);
});
