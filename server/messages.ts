import type { PermissionRequest, TurnOutcome } from "./host.ts";

/**
 * The texts the plugin sends to an orchestrator, one per message type, all built here so a change to every
 * message is one edit in `message` and `combine`. Each text is its body on one line, then a last `Next:` line
 * that names the moves open to the reader, so the situations a standing prompt would list ride the event that
 * raises them.
 *
 * A text carries ids and kinds, never a request's input or an error's message: it can hold a credential (T6).
 */

/** The ticket agent a message speaks of: its id, and the `wave` and `ticket` labels it carries. */
export type Subject = { agentId: string; wave: string; ticket: string };

type RequestHead = Pick<PermissionRequest, "id" | "name" | "kind">;

const NEXT = "\nNext: ";
/** Separates the moves on a `Next:` line, so a move never holds it. Each move of a ticket message names its ticket: `combine` may join several messages' moves. */
const MOVES = "; ";

/** One message: the words that lead, then the ticket agent it speaks of, then the detail when there is one, then the moves. */
function message(lead: string, subject: Subject, detail: string | undefined, moves: readonly string[]): string {
  const who = `ticket ${subject.ticket} of wave ${subject.wave}, agent ${subject.agentId}`;
  const body = detail === undefined ? `${lead}: ${who}.` : `${lead}: ${who}, ${detail}.`;
  return `${body}${NEXT}${moves.join(MOVES)}.`;
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

/** The moves open after a turn ends, by how it ended. */
const AFTER_TURN: Record<TurnOutcome["kind"], (subject: Subject) => string[]> = {
  completed: (s) => [
    `check ticket ${s.ticket}'s report with get_agent_activity and its artifacts (commits on its branch, ticket status)`,
    `prompt agent ${s.agentId} when the report is incomplete`,
  ],
  failed: (s) => [
    `read agent ${s.agentId}'s last activity with get_agent_activity`,
    `prompt agent ${s.agentId} to resume, or record ticket ${s.ticket} as failed with the reason`,
  ],
  canceled: (s) => [
    `read agent ${s.agentId}'s last activity with get_agent_activity`,
    `prompt agent ${s.agentId} to resume, or leave ticket ${s.ticket} stopped when the cancel was deliberate`,
  ],
};

/**
 * The moves open while a request waits. A question is a checkpoint (ADR 0001): the user answers it in the asking
 * agent's chat, or the plugin does under the delegation table; the orchestrator reads it and leaves it to them.
 */
function afterRequest(subject: Subject, request: RequestHead): string[] {
  const read = `read ticket ${subject.ticket}'s request ${request.id} with list_pending_permissions, and treat it as settled when it is no longer listed`;
  return request.kind === "question"
    ? [
        read,
        `leave the checkpoint to the user, who answers it in agent ${subject.agentId}'s chat, or answer it with respond_to_permission when the delegation table lets you decide`,
      ]
    : [
        read,
        `answer request ${request.id} with respond_to_permission, or leave it to the user when the decision is theirs`,
      ];
}

/** The ids a human words message names before it counts the rest. */
const IDS_SHOWN = 5;

function humanWordsDetail(ids: readonly string[]): string {
  const count = `${ids.length} message${ids.length === 1 ? "" : "s"} typed in its chat`;
  const shown = ids.slice(0, IDS_SHOWN).join(", ");
  const more = ids.length > IDS_SHOWN ? ` and ${ids.length - IDS_SHOWN} more` : "";
  return `${count} (message ${shown}${more})`;
}

export const MESSAGES = {
  turnEnded: (subject: Subject, outcome: TurnOutcome) =>
    message("Turn ended", subject, outcomeOf(outcome), AFTER_TURN[outcome.kind](subject)),
  permissionRequested: (subject: Subject, request: RequestHead) =>
    message("Permission pending", subject, `request ${request.id}, ${request.name} (${request.kind})`, afterRequest(subject, request)),
  created: (subject: Subject) =>
    message("Agent created", subject, undefined, [
      `carry on with the wave while ticket ${subject.ticket}'s turn end and any pending permission reach you as messages`,
    ]),
  humanWords: (subject: Subject, ids: readonly string[]) =>
    message("Human words", subject, humanWordsDetail(ids), [
      `read what the user typed to agent ${subject.agentId} with get_agent_activity`,
      `record in ticket ${subject.ticket}'s report that the user spoke to it, and whether it changed the plan`,
    ]),
  stallSuspected: (subject: Subject, says: readonly string[]) =>
    message("Stall suspected", subject, `the sensor flagged: ${says.join("; ")}`, [
      `judge whether ticket ${subject.ticket} is stalled: read agent ${subject.agentId}'s recent activity with get_agent_activity`,
      `prompt agent ${subject.agentId} to resume, or record ticket ${subject.ticket} as stalled with the reason, when it is stalled`,
      `leave ticket ${subject.ticket} alone when its agent is working`,
    ]),
  gateCapPassed: (subject: Subject, cap: number, running: number) =>
    message("Gate cap passed", subject, `${running} ticket agents run against a cap of ${cap} concurrent gates`, [
      `hold every ready ticket after ticket ${subject.ticket} in a queue, and spawn the next one only when a ticket agent's turn end or archive shows fewer than ${cap} running`,
      `leave ticket ${subject.ticket} running: agent ${subject.agentId} is already created`,
    ]),
  questionBudgetSpent: (count: number, budget: number) =>
    `Question budget spent: ${count} question${count === 1 ? "" : "s"} reached the user today against a budget of ${budget}.${NEXT}${[
      "keep asking the questions only the user can answer: the plugin still leaves each one to them",
      "decide nothing extra on the budget's account: the delegation table alone says what you may decide",
    ].join(MOVES)}.`,
  archived: (subject: Subject) =>
    message("Agent archived", subject, undefined, [
      `finish step 8's clean-up of ticket ${subject.ticket} when you archived agent ${subject.agentId}`,
      `check ticket ${subject.ticket}'s status before counting its work done when someone else archived agent ${subject.agentId}`,
    ]),
};

/**
 * The messages held for one orchestrator, as the one message it receives when its turn ends: the bodies in
 * order, then one `Next:` line with each message's moves, a move two messages share written once. A text with no
 * `Next:` line stays whole and adds no move.
 */
export function combine(texts: readonly string[]): string {
  const bodies: string[] = [];
  const moves: string[] = [];
  for (const text of texts) {
    const at = text.lastIndexOf(NEXT);
    if (at === -1) {
      bodies.push(text);
      continue;
    }
    bodies.push(text.slice(0, at));
    for (const move of text.slice(at + NEXT.length).replace(/.$/, "").split(MOVES)) {
      if (!moves.includes(move)) moves.push(move);
    }
  }
  const joined = bodies.join("\n");
  return moves.length === 0 ? joined : `${joined}${NEXT}${moves.join(MOVES)}.`;
}
