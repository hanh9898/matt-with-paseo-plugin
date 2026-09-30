/**
 * Everything the composer pill shows, in one place. A precise term of the skills' words blocks never reaches a
 * screen alone: a shown text that needs one takes its label from `PLAIN_LABELS` (`test/plain-words.test.ts`).
 * `icon` is a Lucide icon name.
 */

/** The plain label of each words-block term, keyed by the precise term in lower case. */
export const PLAIN_LABELS: Record<string, string> = {
  wave: "batch of tasks",
  "integration branch": "shared branch",
  "base commit": "starting point",
  "common rules": "shared instructions",
  "ticket agent": "task agent",
  checkpoint: "question for you",
  brief: "summary",
  hold: "new work stopped",
  stream: "group of tasks",
  "intake agent": "task-writing agent",
  pause: "stopped for a restart",
  "ship branch": "branch for review",
  "ship rules": "publishing settings",
};

/** Said beside the count once the day's question budget is spent; the questions still come. */
const BUDGET_SPENT = "daily question limit reached";

export const PILL = {
  id: "waiting",
  title: "Waiting for you",
  icon: "Hourglass",
  label: (count: number, budgetSpent = false): string =>
    budgetSpent ? `${count} waiting, ${BUDGET_SPENT}` : `${count} waiting`,
};
