import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The cheap sensor in front of the orchestrator's stall judgement: conditions kept as data
 * (`sensor/conditions.json`), each checked on its own against facts the plugin already sees at a ticket agent's
 * turn end, so the orchestrator reads a transcript only when one is flagged.
 *
 * A condition is `check: "code"` (a fact, a comparison and `times`, the turns in a row it must hold) or
 * `check: "model"` (a question for a small model). No model is wired: a model condition is a named slot, read
 * from the data and never flagged, until a later ticket gives it a caller.
 *
 * The facts, all from the turn end event and never from a message's text (T6):
 * - `outcome`: how the turn ended (`completed`, `failed`, `canceled`)
 * - `newItems`: the timeline items added since the last turn end
 * - `newToolCalls`: the `tool_call` items among them
 * - `tailRepeats`: 1 when the last timeline item has the same type and words as at the last turn end, else 0
 */

/** The data file, beside the entry: `sensor/` is data the package ships, not a code module. */
export const CONDITIONS_FILE = fileURLToPath(new URL("../sensor/conditions.json", import.meta.url));

export type Facts = { outcome: string; newItems: number; newToolCalls: number; tailRepeats: number };
export type FactName = keyof Facts;

type Base = { id: string; says: string };
export type CodeCondition = Base & {
  check: "code";
  fact: FactName;
  /** Holds when the fact equals it, or is at most, or at least, a number: exactly one of the three. */
  is?: string;
  atMost?: number;
  atLeast?: number;
  /** The turns in a row the condition holds before it flags. */
  times: number;
};
export type ModelCondition = Base & { check: "model"; question: string; model: null };
export type Condition = CodeCondition | ModelCondition;

const FACTS: readonly FactName[] = ["outcome", "newItems", "newToolCalls", "tailRepeats"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function problemsOf(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw["conditions"])) return ["no conditions list"];
  const problems: string[] = [];
  const ids = new Set<string>();
  (raw["conditions"] as unknown[]).forEach((entry, at) => {
    const name = `condition ${at}`;
    if (!isRecord(entry)) {
      problems.push(`${name} is not an object`);
      return;
    }
    const { id, says, check } = entry;
    if (typeof id !== "string" || id === "") problems.push(`${name} has no id`);
    else if (ids.has(id)) problems.push(`${name} repeats the id ${id}`);
    else ids.add(id);
    if (typeof says !== "string" || says === "" || /[\r\n]/.test(says)) problems.push(`${name} needs a one-line says`);
    if (check === "model") {
      if (typeof entry["question"] !== "string" || entry["question"] === "") problems.push(`${name} needs a question`);
      if (entry["model"] !== null) problems.push(`${name} names a model, and none is wired`);
    } else if (check === "code") {
      if (!FACTS.includes(entry["fact"] as FactName)) problems.push(`${name} names an unknown fact`);
      const tests = ["is", "atMost", "atLeast"].filter((key) => entry[key] !== undefined);
      if (tests.length !== 1) problems.push(`${name} needs exactly one of is, atMost, atLeast`);
      if (!Number.isInteger(entry["times"]) || (entry["times"] as number) < 1) problems.push(`${name} needs times of 1 or more`);
    } else problems.push(`${name} has check ${String(check)}, not code or model`);
  });
  return problems;
}

/** The conditions in `file`; a file that is not JSON or breaks the shape throws, naming what is wrong. */
export function loadConditions(file: string = CONDITIONS_FILE): readonly Condition[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`sensor conditions are not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const problems = problemsOf(raw);
  if (problems.length > 0) throw new Error(`sensor conditions break their shape: ${problems.join("; ")}`);
  return (raw as { conditions: Condition[] }).conditions;
}

/** How many turns in a row each condition has held for one agent. */
export type Streaks = Map<string, number>;

function holds(condition: CodeCondition, facts: Facts): boolean {
  const value = facts[condition.fact];
  if (condition.is !== undefined) return value === condition.is;
  if (typeof value !== "number") return false;
  if (condition.atMost !== undefined) return value <= condition.atMost;
  return condition.atLeast !== undefined && value >= condition.atLeast;
}

/**
 * The conditions this turn flags, checked one at a time. A condition flags when its streak reaches `times`, and
 * again at each further multiple of it, so a stall that goes on is told again but not at every turn. `streaks`
 * is updated. A model condition is skipped: no model is wired.
 */
export function flagged(conditions: readonly Condition[], facts: Facts, streaks: Streaks): CodeCondition[] {
  const flags: CodeCondition[] = [];
  for (const condition of conditions) {
    if (condition.check !== "code") continue;
    const streak = holds(condition, facts) ? (streaks.get(condition.id) ?? 0) + 1 : 0;
    streaks.set(condition.id, streak);
    if (streak > 0 && streak % condition.times === 0) flags.push(condition);
  }
  return flags;
}

/** The slots that wait for a model: named in the data, not checked. */
export function modelSlots(conditions: readonly Condition[]): ModelCondition[] {
  return conditions.filter((condition): condition is ModelCondition => condition.check === "model");
}

function tailKey(item: unknown): string {
  if (typeof item !== "object" || item === null) return "";
  const { type, text, name } = item as { type?: unknown; text?: unknown; name?: unknown };
  const words = typeof text === "string" ? text : typeof name === "string" ? name : "";
  return `${typeof type === "string" ? type : ""}|${words}`;
}

/** What the sensor keeps of an agent's last turn end. */
export type Seen = { length: number; tail: string };

/** The facts of one turn end, and what to keep for the next. A timeline that shrank counts whole. */
export function factsOf(outcome: string, timeline: readonly unknown[], seen: Seen | undefined): { facts: Facts; seen: Seen } {
  const items = Array.isArray(timeline) ? (timeline as unknown[]) : [];
  const fresh = seen !== undefined && items.length >= seen.length ? items.slice(seen.length) : items;
  const tail = tailKey(items.at(-1));
  return {
    facts: {
      outcome,
      newItems: fresh.length,
      newToolCalls: fresh.filter((item) => typeof item === "object" && item !== null && (item as { type?: unknown }).type === "tool_call").length,
      tailRepeats: seen !== undefined && items.length > 0 && tail === seen.tail ? 1 : 0,
    },
    seen: { length: items.length, tail },
  };
}
