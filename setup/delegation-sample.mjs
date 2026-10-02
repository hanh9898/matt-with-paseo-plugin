/**
 * The `## Delegation` sample setup prints for the owner to paste into a repository's `AGENTS.md`, at level 1
 * (it delegates nothing: the smaller option). Setup writes it nowhere. `shared/delegation.ts` reads it, in a test.
 */
export function delegationSample() {
  return [
    "## Delegation",
    "",
    "| Rule | Value |",
    "|---|---|",
    "| Level | 1 |",
    "| Questions the orchestrator may decide | two-way, costly |",
    "| Appetite | 20 USD |",
    "",
    "Level 1 delegates nothing; 2 lets the plugin answer the questions the table names except the five owner items, 3 answers those too (docs/adr/0004-three-autonomy-levels.md).",
  ].join("\n");
}
