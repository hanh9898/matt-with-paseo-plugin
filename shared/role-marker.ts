/**
 * The environment marker that tells a ticket agent from the orchestrator: `beforeCreate` sets it for a ticket
 * agent, the git guard refuses only where it is set, and ticket 14 reads it. The one place that names it.
 * `guard/git-guard.mjs` is a standalone script and repeats the two words; `test/guard-wiring.test.ts` fails
 * when they differ.
 */
export const ROLE_ENV = "MWP_ROLE";
export const TICKET_ROLE = "ticket";

/** Whether an environment carries the ticket marker. */
export function hasTicketMarker(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[ROLE_ENV] === TICKET_ROLE;
}
