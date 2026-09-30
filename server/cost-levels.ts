import { readFileSync } from "node:fs";
import shippedPresets from "./data/cost-levels.json" with { type: "json" };
import { isCostLevels, problemsOf, type CostLevels } from "../shared/cost-levels.ts";

/**
 * The presets in `file`, or with no `file` the shipped presets, embedded when the daemon builds the
 * plugin from `server/data/cost-levels.json`, a copy of `presets/cost-levels.json` that `test/cost-levels.test.ts` keeps equal
 * (the daemon builds only files under `client/`, `server/` and `shared/`, and `import.meta.url` is `undefined` there).
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
