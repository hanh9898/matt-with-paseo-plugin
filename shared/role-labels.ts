/**
 * Who an agent is, read from the labels Paseo holds for it: the one place that names the role labels. A ticket
 * agent carries `wave` and `ticket`, which the wave skill puts on every ticket agent it starts; the stream agent
 * carries `stream` and no `wave`. Any other agent is neither, and the plugin leaves it alone (T3).
 *
 * Labels exist once an agent does. Where they cannot be read yet, at `before('agent.create')`, the marker in
 * `shared/role-marker.ts` and the title stand in (ticket 02).
 */

export type Labels = Readonly<Record<string, string | undefined>>;

/** The `wave` and `ticket` labels of a ticket agent; null for any other agent. */
export function ticketOf(labels: Labels): { wave: string; ticket: string } | null {
  const { wave, ticket } = labels;
  return wave !== undefined && ticket !== undefined ? { wave, ticket } : null;
}

export function isTicketAgent(labels: Labels): boolean {
  return ticketOf(labels) !== null;
}

export function isStreamAgent(labels: Labels): boolean {
  return labels["stream"] !== undefined && labels["wave"] === undefined;
}
