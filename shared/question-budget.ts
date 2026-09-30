/**
 * The daily question budget: how many questions may reach the user in a day before the plugin says so. The one
 * place that names the setting and the day.
 *
 * The setting is the environment variable `MWP_QUESTION_BUDGET`, read from the daemon's environment: a whole
 * number above 0. Anything else, or nothing, means no budget: the plugin still counts, and says nothing, so a
 * typo never stops a stream (T4). The budget informs and never widens delegation (spec #32, the owner's answer 3).
 */

export const BUDGET_ENV = "MWP_QUESTION_BUDGET";

export type Env = Readonly<Record<string, string | undefined>>;

/** The budget the setting names; null when it is absent or not a whole number above 0. */
export function budgetOf(env: Env): number | null {
  const raw = env[BUDGET_ENV]?.trim();
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const budget = Number(raw);
  return Number.isSafeInteger(budget) && budget > 0 ? budget : null;
}

/** The day of `at` in local time, as `YYYY-MM-DD`: the budget's day starts at the machine's midnight. */
export function dayOf(at: Date): string {
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${at.getFullYear()}-${month}-${day}`;
}
