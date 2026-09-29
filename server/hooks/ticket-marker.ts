import { ROLE_ENV, TICKET_ROLE } from "../../shared/role-marker.ts";
import type { HostHooks } from "../host.ts";

/**
 * The title the wave skill gives every ticket agent, `[Wave N] <NN> <ticket name>`. It is the only mark of a
 * ticket agent when Paseo creates one: the labels are set after the `agent.create` hook has run, and no agent
 * id exists yet.
 */
const TICKET_TITLE = /^\[Wave \d+\] \d+\b/;

/** Sets the ticket marker in the environment of a ticket agent; the git guard refuses git only where it is set. */
export function registerTicketMarker(hooks: HostHooks): void {
  hooks.beforeCreate(({ env, title }) => {
    if (typeof title !== "string" || !TICKET_TITLE.test(title)) return;
    return { env: { ...env, [ROLE_ENV]: TICKET_ROLE } };
  });
}
