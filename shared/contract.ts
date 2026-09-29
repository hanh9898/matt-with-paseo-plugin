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
  fields: ["decided", "spend", "questions"],
} as const;
