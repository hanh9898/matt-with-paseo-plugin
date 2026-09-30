/**
 * The appetite of a stream and its spend (`docs/contract.md`, "What the plugin reads from the delegation table").
 * The appetite is a dollar amount the `## Delegation` table writes as prose; what this reader cannot read as one,
 * the plugin reads as "no appetite", and a stream with none is never past it. The spend is the sum of the agents'
 * turn costs, kept per stream label.
 */

/** What the plugin keeps for one stream. */
export type Spend = {
  /** The sum of the turn costs seen, in USD. */
  totalUsd: number;
  /** True once a turn ended with no cost, so the total may be short of the real spend. */
  partial: boolean;
  /** The appetite the table held at the last turn end; null when it had none. */
  appetiteUsd: number | null;
  /** Whether the orchestrator has been told the appetite passed. */
  notified: boolean;
};

const AMOUNT = /^(?:\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usd)?|usd\s*(\d+(?:\.\d+)?))$/i;

/** The appetite in USD from the table's value (`20 USD`, `$20`, `USD 20`, `20`); null for anything else. */
export function parseAppetite(text: string | null): number | null {
  if (text === null) return null;
  const match = AMOUNT.exec(text.trim());
  const digits = match?.[1] ?? match?.[2] ?? match?.[3];
  return digits === undefined ? null : Number(digits);
}

/** The spend after one more turn; a turn with no usable cost adds nothing and marks the total partial. */
export function addTurn(spend: Spend | undefined, costUsd: number | null): Spend {
  const before: Spend = spend ?? { totalUsd: 0, partial: false, appetiteUsd: null, notified: false };
  const usable = costUsd !== null && Number.isFinite(costUsd) && costUsd >= 0;
  return usable
    ? { ...before, totalUsd: before.totalUsd + costUsd }
    : { ...before, partial: true };
}

/** Whether a stream's total is above its appetite; false when there is no spend or no appetite. */
export function isPast(spend: Spend | undefined): boolean {
  return spend !== undefined && spend.appetiteUsd !== null && spend.totalUsd > spend.appetiteUsd;
}
