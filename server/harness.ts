import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import claude from "../harness/claude.json" with { type: "json" };
import { isDescriptor, problemsOf, type HarnessDescriptor } from "../shared/harness.ts";

/**
 * The shipped descriptors, one entry per file of `harness/`, embedded when the daemon builds the plugin
 * (`import.meta.url` is `undefined` in its server bundle, so the folder cannot be listed). A file added to `harness/`
 * is added here too; `test/harness.test.ts` fails when the two differ.
 */
const SHIPPED: Readonly<Record<string, unknown>> = { claude };

/**
 * Every `<agent>.json` in `dir`, keyed by the file name without its extension, in name order; with no `dir`, the
 * shipped descriptors of `harness/`. A file that is not JSON or breaks the field table throws, naming the file and
 * the fields.
 */
export function loadHarnesses(dir?: string): ReadonlyMap<string, HarnessDescriptor> {
  const found = new Map<string, unknown>();
  if (dir === undefined) {
    for (const name of Object.keys(SHIPPED).sort()) found.set(name, SHIPPED[name]);
  } else {
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
      try {
        found.set(file.replace(/\.json$/, ""), JSON.parse(readFileSync(join(dir, file), "utf8")));
      } catch (error) {
        throw new Error(`harness/${file} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  const harnesses = new Map<string, HarnessDescriptor>();
  for (const [name, raw] of found) {
    if (!isDescriptor(raw)) throw new Error(`harness/${name}.json breaks the descriptor's fields: ${problemsOf(raw).join("; ")}`);
    harnesses.set(name, raw);
  }
  return harnesses;
}
