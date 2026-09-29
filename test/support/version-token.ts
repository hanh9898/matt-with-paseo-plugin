import { readFileSync } from "node:fs";
import { join } from "node:path";

/** One spelling of an identifier: the file and field it is read from, and what it says there. */
export interface Reading {
  file: string;
  field: string;
  value: string;
}

/** Each group lists its home first: the reading every other spelling of the group is checked against. */
export interface Identifiers {
  /** The version token: `package.json` holds it, the manifests and the contract constant repeat it. */
  version: Reading[];
  /** The plugin id: `paseo-plugin.json` holds it, and every other manifest names the plugin the same. */
  id: Reading[];
}

const PLUGIN_MANIFEST = ".claude-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";
const CONTRACT_MODULE = "shared/contract.ts";
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(root: string, file: string): string {
  try {
    return readFileSync(join(root, file), "utf8");
  } catch (error) {
    throw new Error(`${file}: cannot be read (${error instanceof Error ? error.message : String(error)})`);
  }
}

function readJson(root: string, file: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(root, file));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${file}: is not JSON (${error.message})`);
    throw error;
  }
  if (!isRecord(parsed)) throw new Error(`${file}: is not a JSON object`);
  return parsed;
}

function stringAt(source: Record<string, unknown>, file: string, key: string, label: string): Reading {
  const value = source[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${file}: ${label} is missing or not a non-empty string`);
  }
  return { file, field: label, value };
}

/** The marketplace lists this repository's one plugin; its entry is the marketplace's spelling of the plugin. */
function marketplaceEntry(root: string): Record<string, unknown> {
  const plugins = readJson(root, MARKETPLACE)["plugins"];
  if (!Array.isArray(plugins) || plugins.length !== 1) {
    const count = Array.isArray(plugins) ? plugins.length : "no";
    throw new Error(`${MARKETPLACE}: lists ${count} plugins, and this repository is one plugin`);
  }
  const entry: unknown = plugins[0];
  if (!isRecord(entry)) throw new Error(`${MARKETPLACE}: plugins[0] is not an object`);
  return entry;
}

function contractVersion(root: string): Reading {
  const match = /export const CONTRACT_VERSION\s*=\s*"([^"]*)"/.exec(readText(root, CONTRACT_MODULE));
  if (match?.[1] === undefined) throw new Error(`${CONTRACT_MODULE}: does not export CONTRACT_VERSION as a string`);
  return { file: CONTRACT_MODULE, field: "CONTRACT_VERSION", value: match[1] };
}

/** Reads every spelling of the version and of the plugin id under `root`; a file or field that is missing stops the read. */
export function readIdentifiers(root: string): Identifiers {
  const pkg = readJson(root, "package.json");
  const paseo = readJson(root, "paseo-plugin.json");
  const plugin = readJson(root, PLUGIN_MANIFEST);
  const entry = marketplaceEntry(root);
  return {
    version: [
      stringAt(pkg, "package.json", "version", "version"),
      stringAt(plugin, PLUGIN_MANIFEST, "version", "version"),
      stringAt(entry, MARKETPLACE, "version", "plugins[0].version"),
      contractVersion(root),
    ],
    id: [
      stringAt(paseo, "paseo-plugin.json", "id", "id"),
      stringAt(pkg, "package.json", "name", "name"),
      stringAt(plugin, PLUGIN_MANIFEST, "name", "name"),
      stringAt(entry, MARKETPLACE, "name", "plugins[0].name"),
    ],
  };
}

/** One message for each reading that differs from the first, naming both files and both values. */
export function disagreements(readings: readonly Reading[]): string[] {
  const [home, ...others] = readings;
  if (home === undefined) return [];
  return others
    .filter((reading) => reading.value !== home.value)
    .map(
      (reading) =>
        `${reading.file} ${reading.field} is "${reading.value}" but ${home.file} ${home.field} is "${home.value}"`,
    );
}

/** What is wrong with the version token and the plugin id under `root`; an empty list means every spelling agrees. */
export function problemsIn(root: string): string[] {
  const { version, id } = readIdentifiers(root);
  const [token] = version;
  const notAVersion =
    token !== undefined && !SEMVER.test(token.value)
      ? [`${token.file} ${token.field} is "${token.value}", which is not a version such as 1.2.3`]
      : [];
  return [...notAVersion, ...disagreements(version), ...disagreements(id)];
}
