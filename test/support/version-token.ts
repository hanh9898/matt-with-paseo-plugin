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
  /** The version token: `package.json` holds it, the manifests repeat it. */
  version: Reading[];
  /** The contract version, a whole number: `docs/contract.md` holds it, the constant in `shared/contract.ts` repeats it. */
  contract: Reading[];
  /** The Paseo plugin id: `paseo-plugin.json` holds it, and `package.json` names the package the same. */
  id: Reading[];
  /**
   * The Claude Code plugin name, the one exception to the id: it is not the Paseo id, so the skills repository's
   * plugin of that name and this one can be enabled together. `plugin.json` holds it, and the marketplace entry
   * repeats it, or `claude plugin install` cannot find the plugin.
   */
  claudeName: Reading[];
}

const PLUGIN_MANIFEST = ".claude-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";
const CONTRACT_MODULE = "shared/contract.ts";
const CONTRACT_DOC = "docs/contract.md";
const WHOLE_NUMBER = /^[1-9]\d*$/;
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

function contractDocVersion(root: string): Reading {
  const match = /^Contract version: (.*)$/m.exec(readText(root, CONTRACT_DOC));
  if (match?.[1] === undefined) throw new Error(`${CONTRACT_DOC}: has no "Contract version: <n>" line`);
  return { file: CONTRACT_DOC, field: "Contract version", value: match[1].trim() };
}

function contractVersion(root: string): Reading {
  const match = /export const CONTRACT_VERSION\s*=\s*"([^"]*)"/.exec(readText(root, CONTRACT_MODULE));
  if (match?.[1] === undefined) throw new Error(`${CONTRACT_MODULE}: does not export CONTRACT_VERSION as a string`);
  return { file: CONTRACT_MODULE, field: "CONTRACT_VERSION", value: match[1] };
}

/** Reads every spelling of the version, the contract version, the Paseo id and the Claude Code name under `root`; a file or field that is missing stops the read. */
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
    ],
    contract: [contractDocVersion(root), contractVersion(root)],
    id: [stringAt(paseo, "paseo-plugin.json", "id", "id"), stringAt(pkg, "package.json", "name", "name")],
    claudeName: [
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

/** What is wrong with the version token, the contract version, the Paseo id and the Claude Code name under `root`; an empty list means every spelling agrees. */
export function problemsIn(root: string): string[] {
  const { version, contract, id, claudeName } = readIdentifiers(root);
  const [token] = version;
  const notAVersion =
    token !== undefined && !SEMVER.test(token.value)
      ? [`${token.file} ${token.field} is "${token.value}", which is not a version such as 1.2.3`]
      : [];
  const [contractHome] = contract;
  const notANumber =
    contractHome !== undefined && !WHOLE_NUMBER.test(contractHome.value)
      ? [`${contractHome.file} ${contractHome.field} is "${contractHome.value}", which is not a whole number such as 1`]
      : [];
  return [
    ...notAVersion,
    ...notANumber,
    ...disagreements(version),
    ...disagreements(contract),
    ...disagreements(id),
    ...disagreements(claudeName),
  ];
}
