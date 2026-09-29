import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDescriptor, problemsOf, type HarnessDescriptor } from "../shared/harness.ts";

/** The folder of descriptors, beside the entry: `harness/` is data the package ships, not a code module. */
export const HARNESS_DIR = fileURLToPath(new URL("../harness/", import.meta.url));

/**
 * Every `<agent>.json` in `dir`, keyed by the file name without its extension, in name order.
 * A file that is not JSON or breaks the field table throws, naming the file and the fields.
 */
export function loadHarnesses(dir: string = HARNESS_DIR): ReadonlyMap<string, HarnessDescriptor> {
  const harnesses = new Map<string, HarnessDescriptor>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (error) {
      throw new Error(`harness/${file} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isDescriptor(raw)) throw new Error(`harness/${file} breaks the descriptor's fields: ${problemsOf(raw).join("; ")}`);
    harnesses.set(file.replace(/\.json$/, ""), raw);
  }
  return harnesses;
}
