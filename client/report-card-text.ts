/**
 * Everything the report card shows, in one place, built from the row's data (`docs/contract.md`, "The report
 * card"). A precise term of the skills' words blocks never reaches a screen alone (`client/pill-text.ts`,
 * `test/plain-words.test.ts`); these words use none.
 */

/** The card's data as the daemon appends it: `REPORT_CARD` in `shared/contract.ts`. */
export type CardData = {
  decided: { header: string; answer: string; at: string }[];
  /** How many decisions there are in all: `decided` holds only the latest ones. */
  decidedCount: number;
  /** The absolute path of the decision log, shown as text. */
  log: string;
  spend: { totalUsd: number; appetiteUsd: number | null; partial: boolean };
  questions: { count: number; budget: number | null };
};

const NO_LIMIT = "no limit set";
const dollars = (usd: number): string => `$${usd.toFixed(2)}`;

export const CARD = {
  title: "Report card",
  decidedHeading: (count: number): string => `Decided for you (${count})`,
  none: "Nothing decided for you yet",
  decision: (header: string, answer: string): string => `${header}: ${answer}`,
  leftOut: (count: number): string => `${count} earlier ${count === 1 ? "decision is" : "decisions are"} only in the log`,
  log: (path: string): string => `All decisions: ${path}`,
  spend: ({ totalUsd, appetiteUsd, partial }: CardData["spend"]): string =>
    `Spend ${dollars(totalUsd)}${appetiteUsd === null ? ` (${NO_LIMIT})` : ` of ${dollars(appetiteUsd)}`}${partial ? " (partial: some turns had no cost)" : ""}`,
  questions: ({ count, budget }: CardData["questions"]): string =>
    `Questions today: ${count}${budget === null ? ` (${NO_LIMIT})` : ` of ${budget}`}`,
};

/** The lines of the card, in the order they are shown. */
export function cardLines(data: CardData): {
  title: string;
  decidedHeading: string;
  decided: string[];
  leftOut: string | null;
  none: string;
  log: string;
  spend: string;
  questions: string;
} {
  const leftOut = data.decidedCount - data.decided.length;
  return {
    title: CARD.title,
    decidedHeading: CARD.decidedHeading(data.decidedCount),
    decided: data.decided.map(({ header, answer }) => CARD.decision(header, answer)),
    leftOut: leftOut > 0 ? CARD.leftOut(leftOut) : null,
    none: CARD.none,
    log: CARD.log(data.log),
    spend: CARD.spend(data.spend),
    questions: CARD.questions(data.questions),
  };
}
