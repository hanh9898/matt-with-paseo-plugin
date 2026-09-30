import { readFileSync } from "node:fs";
import shippedPresets from "../presets/cost-levels.json" with { type: "json" };
import { isCostLevels, problemsOf, type CostLevels } from "../shared/cost-levels.ts";

/**
 * The presets in `file`, or with no `file` the shipped `presets/cost-levels.json`, embedded when the daemon builds the
 * plugin (`import.meta.url` is `undefined` in its server bundle, so no path to the data can be built).
 * A file that is not JSON or breaks the shape throws, naming the file and the fields.
 */
export function loadCostLevels(file?: string): CostLevels {
  const name = file ?? "presets/cost-levels.json";
  let raw: unknown = shippedPresets;
  if (file !== undefined) {
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`${file} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!isCostLevels(raw)) throw new Error(`${name} breaks the presets' shape: ${problemsOf(raw).join("; ")}`);
  return raw;
}
