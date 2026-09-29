/**
 * The cap on concurrent gates: a share of the machine's processors, so many worktrees running tests do not
 * starve one machine (bug report 10). The one place that names the setting and the default.
 *
 * The setting is the environment variable `MWP_GATE_SHARE`, read from the daemon's environment: a number above
 * 0 and at most 1. A value that is anything else falls back to the default, so a typo never stops a wave (T4).
 */

export const CAP_SHARE_ENV = "MWP_GATE_SHARE";
/** Half the machine's processors. */
export const DEFAULT_SHARE = 0.5;

export type Env = Readonly<Record<string, string | undefined>>;

/** The share the setting names; the default when it is absent or not a number in (0, 1]. */
export function shareOf(env: Env): number {
  const raw = env[CAP_SHARE_ENV];
  if (raw === undefined || raw.trim() === "") return DEFAULT_SHARE;
  const share = Number(raw);
  return Number.isFinite(share) && share > 0 && share <= 1 ? share : DEFAULT_SHARE;
}

/** How many gates may run at once on a machine with this many processors: the share, rounded down, at least one. */
export function gateCap(processors: number, env: Env): number {
  const whole = Number.isFinite(processors) ? Math.floor(processors * shareOf(env)) : 1;
  return Math.max(1, whole);
}
