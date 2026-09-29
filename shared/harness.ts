/** The ways a harness gets the plugin's skills. `native`: the agent loads them itself. `provisioned`: the plugin lays them down. */
export const SKILLS_MODES = ["native", "provisioned"] as const;

/** The ways a harness gets its MCP servers. `agent-config`: in the launch config the plugin edits before the agent is created. `config-file`: in a file in the agent's config directory. */
export const MCP_DELIVERIES = ["agent-config", "config-file"] as const;

/** The ways a harness keeps a ticket agent's git in check. `hook`: the agent runs the plugin's PreToolUse hook. `path-shim`: an agent without hooks gets a `git` shim first on its path. */
export const GUARDS = ["hook", "path-shim"] as const;

type Check<T> = (value: unknown) => value is T;

interface Field<T> {
  readonly check: Check<T>;
  /** What the field takes, in words: the tail of "<value> is not <expects>" in a problem. */
  readonly expects: string;
}

function field<T>(check: Check<T>, expects: string): Field<T> {
  return { check, expects };
}

function oneOf<const T extends string>(allowed: readonly T[]): Check<T> {
  return (value): value is T => typeof value === "string" && allowed.some((item) => item === value);
}

function isEnvVarName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value);
}

/** A path under the agent's config directory: no drive, no leading slash, no `..` segment. */
function isRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  if (/^[/\\]/.test(value) || /^[A-Za-z]:/.test(value)) return false;
  return !value.split(/[/\\]/).includes("..");
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The shape of a harness descriptor, one row per field, in the order a descriptor lists them.
 * Adding a field is adding a row here and its value to each `harness/<agent>.json`.
 */
export const HARNESS_FIELDS = {
  configDirVar: field(isEnvVarName, "an environment variable name in upper case, such as AGENT_CONFIG_DIR"),
  skillsDir: field(isRelativePath, "a relative path under the config directory, without .."),
  skills: field(oneOf(SKILLS_MODES), `one of ${SKILLS_MODES.join(", ")}`),
  mcpDelivery: field(oneOf(MCP_DELIVERIES), `one of ${MCP_DELIVERIES.join(", ")}`),
  guard: field(oneOf(GUARDS), `one of ${GUARDS.join(", ")}`),
  sandboxed: field(isBoolean, "true or false"),
};

type Fields = typeof HARNESS_FIELDS;

export type HarnessDescriptor = {
  readonly [K in keyof Fields]: Fields[K] extends Field<infer T> ? T : never;
};

/** Every way `raw` is not a descriptor; empty when it is one. */
export function problemsOf(raw: unknown): string[] {
  if (!isRecord(raw)) return ["descriptor: must be a JSON object"];
  const problems: string[] = [];
  for (const [name, { check, expects }] of Object.entries(HARNESS_FIELDS)) {
    if (!Object.hasOwn(raw, name)) problems.push(`${name}: missing, expected ${expects}`);
    else if (!check(raw[name])) problems.push(`${name}: ${JSON.stringify(raw[name])} is not ${expects}`);
  }
  for (const name of Object.keys(raw)) {
    if (!Object.hasOwn(HARNESS_FIELDS, name)) problems.push(`${name}: not a field of the descriptor`);
  }
  return problems;
}

export function isDescriptor(raw: unknown): raw is HarnessDescriptor {
  return problemsOf(raw).length === 0;
}
