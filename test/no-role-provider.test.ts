import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import contribute from "../index.server.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

/** What Paseo's plugin SDK offers to add a provider: the registration call, its ACP helper and its type. */
const PROVIDER_API = ["registerProvider", "runAcpProvider", "ProviderRegistration"];

function posix(path: string): string {
  return path.split(sep).join("/");
}

/** The plugin's code: every module the daemon or the app runs. Tests are outside it. */
function product(): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map(posix)
    .filter((path) => /\.tsx?$/.test(path))
    .filter((path) => !path.split("/").some((part) => part === "node_modules" || part === ".git"))
    .filter((path) => !path.startsWith("test/"));
}

function providerApiIn(text: string): string[] {
  return PROVIDER_API.filter((name) => new RegExp(`\\b${name}\\b`).test(text));
}

test("the check sees a provider registered, however it is spelled", () => {
  assert.deepEqual(providerApiIn("server.registerProvider(roleProvider);"), ["registerProvider"]);
  assert.deepEqual(providerApiIn("export default runAcpProvider({ id: role });"), ["runAcpProvider"]);
  assert.deepEqual(providerApiIn("const role: ProviderRegistration = build();"), ["ProviderRegistration"]);
  assert.deepEqual(providerApiIn("agent.provider = 'x'; // a field, not a registration"), []);
});

test("the plugin's code never calls the SDK's provider API: a role is a label, not a provider (#14)", () => {
  const files = product();
  assert.ok(files.length > 0, "the walk finds the plugin's code");
  const problems = files.flatMap((path) =>
    providerApiIn(readFileSync(new URL(`../${path}`, import.meta.url), "utf8")).map(
      (name) => `${path} uses ${name}: put the role on the agent's labels instead`,
    ),
  );
  assert.deepEqual(problems, []);
});

test("the entry touches the server context only through on, before and handle, so it registers no provider", () => {
  const touched = new Set<string>();
  const registered: unknown[] = [];
  const target = {
    on: () => () => {},
    before: () => () => {},
    handle: () => () => {},
    registerProvider: (provider: unknown) => registered.push(provider),
  };
  const server = new Proxy(target, {
    get(object, key, receiver) {
      touched.add(String(key));
      return Reflect.get(object, key, receiver);
    },
  });
  contribute(server as unknown as Parameters<typeof contribute>[0]);
  assert.deepEqual(registered, []);
  assert.deepEqual([...touched].filter((key) => !["on", "before", "handle"].includes(key)), []);
});

test("the manifest declares no provider", () => {
  const manifest: unknown = JSON.parse(readFileSync(new URL("../paseo-plugin.json", import.meta.url), "utf8"));
  assert.ok(typeof manifest === "object" && manifest !== null);
  assert.deepEqual(Object.keys(manifest).filter((key) => /provider/i.test(key)), []);
});
