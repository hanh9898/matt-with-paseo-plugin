/**
 * Finds what a person typed in a ticket agent's chat, in the timeline Paseo hands `agent.turn_ended`.
 *
 * The orchestrator prompts its ticket agents too (`create_agent`'s first prompt, `send_agent_prompt`), and both
 * reach the timeline as `user_message` items. They are told apart by `clientMessageId`: a client (the app, the
 * CLI) sends one with the messages a person types, while the orchestrator's tools send none, so its prompts carry
 * only Paseo's own `messageId`. This was read in the `0.10.1` daemon's source, not run; the smoke test
 * ("Human words") confirms it on a real host. An item that says nothing is taken for the orchestrator's: a
 * message a client sent without an id is missed, and none of the orchestrator's prompts is passed on as a
 * person's.
 *
 * The timeline is the agent's whole history, so the same id comes back at every turn end; the caller keeps which
 * it has told. Only the id comes back, never the message's text: it can hold a credential (T6), and the
 * orchestrator reads it with `get_agent_activity`.
 */

const MAX_ID_LENGTH = 64;

/** An id cut to the characters of an identifier, so it is one word in a one-line text. */
function plain(id: string): string {
  return id.replace(/[^\w.-]/g, "").slice(0, MAX_ID_LENGTH);
}

/** The client message ids of the messages a person typed, in the order of the timeline. */
export function humanMessageIds(timeline: readonly unknown[]): string[] {
  if (!Array.isArray(timeline)) return [];
  const ids: string[] = [];
  for (const item of timeline as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const { type, clientMessageId } = item as { type?: unknown; clientMessageId?: unknown };
    if (type !== "user_message" || typeof clientMessageId !== "string") continue;
    const id = plain(clientMessageId);
    if (id !== "" && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
