/**
 * The reader of the repository's `## Delegation` table (`docs/contract.md`, "What the plugin reads from the
 * delegation table"). The skills write the table, so its prose format is theirs; this reader takes the one shape
 * the contract names and reads anything else as "no delegation": what it cannot read, the plugin never acts on.
 *
 * The daily question budget is not in the table: it is a per-machine setting (`MWP_QUESTION_BUDGET`, #39).
 */

/** A door class the table can let the orchestrator decide; `one-way` is never one of them (ADR 0002: irreversible stays the user's). */
export type DecidableDoor = "two-way" | "costly";

export type Delegation = {
  /** The switch; on when the table has no `Switch` row, off when its value is anything but `on`. */
  on: boolean;
  decide: readonly DecidableDoor[];
  /** The appetite as the table writes it; #40 reads its meaning. */
  appetite: string | null;
};

const DOORS: readonly DecidableDoor[] = ["two-way", "costly"];

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

/** Reads a document's `## Delegation` table; null when it has none. */
export function readDelegation(text: string): Delegation | null {
  const rows = rowsOf(text);
  if (rows === null) return null;
  const words = (rows.get("questions the orchestrator may decide") ?? "")
    .split(/[,;]/)
    .map((word) => word.trim().toLowerCase());
  const switchValue = rows.get("switch");
  return {
    on: switchValue === undefined || switchValue.toLowerCase() === "on",
    decide: DOORS.filter((door) => words.includes(door)),
    appetite: rows.get("appetite") || null,
  };
}
