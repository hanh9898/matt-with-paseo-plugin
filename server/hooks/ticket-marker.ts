import { ROLE_ENV, TICKET_ROLE } from "../../shared/role-marker.ts";
import { ticketOf } from "../../shared/role-labels.ts";
import type { HostHooks } from "../host.ts";

/**
 * The title the wave skill gives every ticket agent, `[Wave N] <NN> <ticket name>`. It is the only mark of a
 * ticket agent when Paseo creates one: the labels are set after the `agent.create` hook has run, and no agent
 * id exists yet.
 */
const TICKET_TITLE = /^\[Wave \d+\] \d+\b/;

/** Sets the ticket marker in the environment of a ticket agent, at creation and again when its session opens; the git guard refuses git only where it is set. */
export function registerTicketMarker(hooks: HostHooks): void {
  hooks.beforeCreate(({ env, title }) => {
    if (typeof title !== "string" || !TICKET_TITLE.test(title)) return;
    return { env: { ...env, [ROLE_ENV]: TICKET_ROLE } };
  });
  // A resumed agent loses the environment set at creation. On Paseo `0.10.1` this hook runs before the agent is
  // registered, so its title and labels may not be readable: then the agent stays unmarked and one line says so.
  hooks.beforeSessionOpen(({ agentId, env, title, labels }) => {
    if (ROLE_ENV in env) return;
    const titled = typeof title === "string" && TICKET_TITLE.test(title);
    if (titled || ticketOf(labels) !== null) return { env: { ...env, [ROLE_ENV]: TICKET_ROLE } };
    if (title === null && Object.keys(labels).length === 0) {
      console.error(`[matt-with-paseo] agent.session_open could not read the title or labels of agent ${agentId}; left unmarked`);
    }
  });
}
