/**
 * Who an agent is, read from the labels Paseo holds for it: the one place that names the role labels. A ticket
 * agent carries `wave` and `ticket`, which the wave skill puts on every ticket agent it starts; a bundle agent,
 * which works a bundle of tickets, carries `wave`, `bundle` and `tickets` and no `ticket`, and is a ticket agent
 * too; the stream agent carries `stream` and no `wave`. Any other agent is neither, and the plugin leaves it alone (T3).
 *
 * Labels exist once an agent does. Where they cannot be read yet, at `before('agent.create')`, the marker in
 * `shared/role-marker.ts` and the title stand in (ticket 02).
 */

export type Labels = Readonly<Record<string, string | undefined>>;

/** The labels of a ticket agent: `wave` and `ticket`, or for a bundle agent `wave`, `bundle` (its first ticket) and `tickets`. */
export type TicketLabels = { wave: string; ticket: string } | { wave: string; bundle: string; tickets: string };

/**
 * The labels of a ticket agent; null for any other agent. `wave` and `ticket` win; `wave` and `bundle` make a
 * bundle agent, whose `tickets` label defaults to its first ticket when absent.
 */
export function ticketOf(labels: Labels): TicketLabels | null {
  const { wave, ticket, bundle, tickets } = labels;
  if (wave === undefined) return null;
  if (ticket !== undefined) return { wave, ticket };
  return bundle !== undefined ? { wave, bundle, tickets: tickets ?? bundle } : null;
}

export function isTicketAgent(labels: Labels): boolean {
  return ticketOf(labels) !== null;
}

/** The `stream` label of the stream agent; null for any other agent. */
export function streamOf(labels: Labels): string | null {
  const { stream, wave } = labels;
  return stream !== undefined && wave === undefined ? stream : null;
}

export function isStreamAgent(labels: Labels): boolean {
  return streamOf(labels) !== null;
}
