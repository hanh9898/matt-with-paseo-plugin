/**
 * The reader of the repository's `## Delegation` table (`docs/contract.md`, "What the plugin reads from the
 * delegation table"). The skills write the table, so its prose format is theirs; this reader takes the one shape
 * the contract names and reads anything else as "no delegation": what it cannot read, the plugin never acts on.
 *
 * The daily question budget is not in the table: it is a per-machine setting (`MWP_QUESTION_BUDGET`, #39).
 */

/** A door class the table can let the orchestrator decide; `one-way` is one of them only at level 3 (ADR 0004). */
export type DecidableDoor = "two-way" | "costly" | "one-way";

/** The autonomy level of a repository (ADR 0004): 1 delegates nothing, 2 all but the user's five, 3 all the table lets it. */
export type Level = 1 | 2 | 3;

/** Where the level was read: the `Level` row, the contract v1 `Switch` row, or neither. */
export type LevelFrom = "Level" | "Switch" | "default";

export type Delegation = {
  level: Level;
  levelFrom: LevelFrom;
  decide: readonly DecidableDoor[];
  /** The appetite as the table writes it; #40 reads its meaning. */
  appetite: string | null;
};

const DOORS: readonly DecidableDoor[] = ["two-way", "costly"];
const DOORS_AT_LEVEL_3: readonly DecidableDoor[] = ["two-way", "costly", "one-way"];

/** The level and its source: a `Level` row wins and anything but `1`, `2` or `3` in it is level 1; else `Switch` (`on` is 2); else level 1. */
function levelOf(rows: Map<string, string>): { level: Level; levelFrom: LevelFrom } {
  const levelValue = rows.get("level");
  if (levelValue !== undefined) {
    const level = levelValue === "1" ? 1 : levelValue === "2" ? 2 : levelValue === "3" ? 3 : 1;
    return { level, levelFrom: "Level" };
  }
  const switchValue = rows.get("switch");
  if (switchValue !== undefined) return { level: switchValue.toLowerCase() === "on" ? 2 : 1, levelFrom: "Switch" };
  return { level: 1, levelFrom: "default" };
}

const HEADING = /^##\s+Delegation\s*$/i;

/** The rows of the table under `## Delegation` as key and value, keys lowercased; the first row of a key wins. */
function rowsOf(text: string): Map<string, string> | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => HEADING.test(line));
  if (start === -1) return null;
  const rows = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    const [key, value] = cells;
    if (key === undefined || value === undefined || key === "" || /^[-: ]+$/.test(key)) continue;
    const name = key.toLowerCase();
    if (name === "rule" && value.toLowerCase() === "value") continue;
    if (!rows.has(name)) rows.set(name, value);
  }
  return rows;
}

/** Reads a document's `## Delegation` table; null when it has none (the handler reads that as level 1). */
export function readDelegation(text: string): Delegation | null {
  const rows = rowsOf(text);
  if (rows === null) return null;
  const words = (rows.get("questions the orchestrator may decide") ?? "")
    .split(/[,;]/)
    .map((word) => word.trim().toLowerCase());
  const { level, levelFrom } = levelOf(rows);
  return {
    level,
    levelFrom,
    decide: (level === 3 ? DOORS_AT_LEVEL_3 : DOORS).filter((door) => words.includes(door)),
    appetite: rows.get("appetite") || null,
  };
}
