import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isCostLevels, problemsOf, type CostLevels } from "../shared/cost-levels.ts";

/** The presets, beside the entry: `presets/` is data the package ships, not a code module. */
export const COST_LEVELS_FILE = fileURLToPath(new URL("../presets/cost-levels.json", import.meta.url));

/** The presets in `file`; a file that is not JSON or breaks the shape throws, naming the file and the fields. */
export function loadCostLevels(file: string = COST_LEVELS_FILE): CostLevels {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isCostLevels(raw)) throw new Error(`${file} breaks the presets' shape: ${problemsOf(raw).join("; ")}`);
  return raw;
}
