import type { PermissionRequest, TurnOutcome } from "./host.ts";

/**
 * The texts the plugin sends to an orchestrator, one per message type, all built here so a change to every
 * message (a closing `Next:` line, ticket 05) is one edit in `line` and `combine`.
 *
 * A text carries ids and kinds, never a request's input or an error's message: it can hold a credential (T6).
 */

/** The ticket agent a message speaks of: its id, and the `wave` and `ticket` labels it carries. */
export type Subject = { agentId: string; wave: string; ticket: string };

type RequestHead = Pick<PermissionRequest, "id" | "name" | "kind">;

/** One message: the words that lead, then the ticket agent it speaks of, then the detail when there is one. */
function line(lead: string, subject: Subject, detail?: string): string {
  const who = `ticket ${subject.ticket} of wave ${subject.wave}, agent ${subject.agentId}`;
  return detail === undefined ? `${lead}: ${who}.` : `${lead}: ${who}, ${detail}.`;
}

function outcomeOf(outcome: TurnOutcome): string {
  switch (outcome.kind) {
    case "completed":
      return "outcome completed";
    case "failed":
      return outcome.error.code === undefined ? "outcome failed" : `outcome failed (${outcome.error.code})`;
    case "canceled":
      return `outcome canceled (${outcome.reason})`;
  }
}

export const MESSAGES = {
  turnEnded: (subject: Subject, outcome: TurnOutcome) => line("Turn ended", subject, outcomeOf(outcome)),
  permissionRequested: (subject: Subject, request: RequestHead) =>
    line("Permission pending", subject, `request ${request.id}, ${request.name} (${request.kind})`),
  created: (subject: Subject) => line("Agent created", subject),
  archived: (subject: Subject) => line("Agent archived", subject),
};

/** The messages held for one orchestrator, as the one message it receives when its turn ends. */
export function combine(texts: readonly string[]): string {
  return texts.join("\n");
}
