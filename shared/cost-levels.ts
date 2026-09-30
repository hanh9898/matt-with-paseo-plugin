/**
 * Cost levels per role: named presets (Cheap, Balanced, Max) that set each role's agent and model, kept as data
 * in `presets/cost-levels.json`, and the one place that reads them. A preset sits on top of Paseo's own profiles
 * (`list_profiles`): it names an agent and a model, `overlay` lays them over the profile a caller holds, and the
 * plugin never creates, edits or deletes a profile.
 *
 * Two settings, both read from the daemon's environment; anything they hold that does not parse falls back, so a
 * typo never stops a wave (T4):
 * - `MWP_COST_LEVEL`: the id of the level to use; the file's `default` when absent or unknown.
 * - `MWP_COST_<ROLE>` (`MWP_COST_TICKET`): `agent/model` for that one role, over the level.
 */

/** The roles a level sets, in the order a level lists them. */
export const ROLES = ["stream", "wave", "ticket"] as const;
export type Role = (typeof ROLES)[number];

export const LEVEL_ENV = "MWP_COST_LEVEL";

/** The setting that overrides one role. */
export function roleEnv(role: Role): string {
  return `MWP_COST_${role.toUpperCase()}`;
}

export type Env = Readonly<Record<string, string | undefined>>;

/** An agent (a `harness/<agent>.json` id) and one of its model ids. */
export type Choice = { readonly agent: string; readonly model: string };

export type Level = {
  readonly id: string;
  readonly says: string;
  readonly roles: Readonly<Record<Role, Choice>>;
};

export type CostLevels = { readonly default: string; readonly levels: readonly Level[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWord(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function choiceProblems(where: string, raw: unknown): string[] {
  if (!isRecord(raw)) return [`${where}: must be an object with agent and model`];
  const problems: string[] = [];
  for (const key of ["agent", "model"]) {
    if (!isWord(raw[key])) problems.push(`${where}.${key}: must be a non-empty string`);
  }
  for (const key of Object.keys(raw)) {
    if (key !== "agent" && key !== "model") problems.push(`${where}.${key}: not a field of a choice`);
  }
  return problems;
}

/** Every way `raw` is not the presets; empty when it is them. */
export function problemsOf(raw: unknown): string[] {
  if (!isRecord(raw)) return ["presets: must be a JSON object"];
  const levels = raw["levels"];
  const problems: string[] = [];
  if (!Array.isArray(levels) || levels.length === 0) problems.push("levels: must be a non-empty list");
  const ids: string[] = [];
  for (const level of Array.isArray(levels) ? (levels as unknown[]) : []) {
    if (!isRecord(level) || !isWord(level["id"])) {
      problems.push("levels: each level needs an id");
      continue;
    }
    const id = level["id"];
    if (ids.includes(id)) problems.push(`levels: ${id} is listed twice`);
    ids.push(id);
    if (!isWord(level["says"])) problems.push(`${id}.says: must be a non-empty string`);
    const roles = level["roles"];
    if (!isRecord(roles)) {
      problems.push(`${id}.roles: must be an object`);
      continue;
    }
    for (const role of ROLES) {
      if (!Object.hasOwn(roles, role)) problems.push(`${id}.roles.${role}: missing`);
      else problems.push(...choiceProblems(`${id}.roles.${role}`, roles[role]));
    }
    for (const key of Object.keys(roles)) {
      if (!(ROLES as readonly string[]).includes(key)) problems.push(`${id}.roles.${key}: not a role`);
    }
  }
  const named = raw["default"];
  if (!isWord(named) || !ids.includes(named)) problems.push(`default: ${JSON.stringify(named)} is not the id of a level`);
  return problems;
}

export function isCostLevels(raw: unknown): raw is CostLevels {
  return problemsOf(raw).length === 0;
}

/** `agent/model` as a setting writes it: the agent up to the first slash, the model after it, no spaces inside either. */
export function parseChoice(text: string): Choice | null {
  const trimmed = text.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0) return null;
  const agent = trimmed.slice(0, slash);
  const model = trimmed.slice(slash + 1);
  if (model === "" || /\s/.test(agent) || /\s/.test(model)) return null;
  return { agent, model };
}

function defaultLevel(levels: CostLevels): Level {
  const found = levels.levels.find((level) => level.id === levels.default);
  if (found === undefined) throw new Error(`default ${levels.default} is not a level`);
  return found;
}

/** The level `MWP_COST_LEVEL` names, in any case; the default level when it is absent or names none. */
export function levelOf(levels: CostLevels, env: Env): Level {
  const wanted = env[LEVEL_ENV]?.trim().toLowerCase();
  const named = wanted === undefined || wanted === "" ? undefined : levels.levels.find((level) => level.id === wanted);
  return named ?? defaultLevel(levels);
}

/** What a role runs on: its override when the setting parses, else the level's choice. */
export function choiceFor(levels: CostLevels, role: Role, env: Env): { choice: Choice; from: "override" | "level" } {
  const raw = env[roleEnv(role)];
  const override = raw === undefined ? null : parseChoice(raw);
  if (override !== null) return { choice: override, from: "override" };
  return { choice: levelOf(levels, env).roles[role], from: "level" };
}

/** A copy of a Paseo profile with the choice's agent and model on top; the profile itself is left as it is. */
export function overlay<P extends { readonly provider: string; readonly model: string }>(choice: Choice, profile: P): P {
  return { ...profile, provider: choice.agent, model: choice.model };
}
