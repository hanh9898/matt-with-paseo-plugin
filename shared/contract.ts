/**
 * The version of the contract between the skills and the plugin, as a whole number. `docs/contract.md` holds it
 * on its `Contract version:` line; this constant spells it once more, and `test/version-token.test.ts` fails
 * when the two differ. It is not the plugin's version token: the two move independently.
 */
export const CONTRACT_VERSION = "1";

/**
 * The shape of the report card row the plugin appends to a timeline (`docs/contract.md`, "The report card"):
 * its kind and version, and the fields of its data. The card has no buttons. `test/contract.test.ts` fails when
 * the contract says otherwise; the ticket that builds the row conforms to this.
 */
export const REPORT_CARD = {
  kind: "report-card",
  version: 1,
  /** The row id: appending again under it replaces the card in the chat, so there is one card, kept current. */
  id: "report-card",
  fields: ["decided", "decidedCount", "log", "spend", "questions"],
  /** What each entry of `decided` holds. */
  decidedEntry: ["header", "answer", "at"],
  /** How many entries `decided` holds at most (the latest ones): a row's `data` is capped at 64 KiB serialised, and past it Paseo refuses the append. */
  decidedCap: 20,
  /** The characters a `header` or an `answer` keeps; a longer one is cut and ends `…`. */
  textCap: 200,
  /** What `spend` holds; `appetiteUsd` is null with no appetite, `partial` is true when a turn had no cost. */
  spendFields: ["totalUsd", "appetiteUsd", "partial"],
  /** What `questions` holds; `budget` is null with no budget set. */
  questionsFields: ["count", "budget"],
  buttons: "none",
} as const;
