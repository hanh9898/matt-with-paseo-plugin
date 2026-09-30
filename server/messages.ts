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

/**
 * The bundle agent a message speaks of: its id, and the `wave`, `bundle` (its first ticket) and `tickets` labels it
 * carries. It works a bundle of tickets, one turn per ticket, so a message names the bundle and never one ticket.
 */
export type BundleSubject = { agentId: string; wave: string; bundle: string; tickets: string };

/** The stream agent a message speaks of: its id, and the `stream` label it carries (it carries no `wave`). */
export type StreamSubject = { agentId: string; stream: string };

/** A ticket agent, whether it works one ticket or a bundle. */
export type TicketSubject = Subject | BundleSubject;

/** Who a relayed message speaks of: a ticket agent (of one ticket or a bundle) or a stream agent. */
export type Relayed = TicketSubject | StreamSubject;

function isStream(subject: Relayed): subject is StreamSubject {
  return "stream" in subject;
}

/** What a ticket agent's moves call it: `ticket <ticket>`, or `bundle <bundle>` for a bundle agent. */
function named(subject: TicketSubject): string {
  return "bundle" in subject ? `bundle ${subject.bundle}` : `ticket ${subject.ticket}`;
}

type RequestHead = Pick<PermissionRequest, "id" | "name" | "kind">;

const NEXT = "\nNext: ";
/** Separates the moves on a `Next:` line, so a move never holds it. Each move of a ticket, bundle or stream message names its ticket, bundle or stream: `combine` may join several messages' moves. */
const MOVES = "; ";

/** One message: the words that lead, then the agent it speaks of, then the detail when there is one, then the moves. */
function message(lead: string, subject: Relayed, detail: string | undefined, moves: readonly string[]): string {
  const who = isStream(subject)
    ? `stream ${subject.stream}, agent ${subject.agentId}`
    : "bundle" in subject
      ? `bundle ${subject.bundle} (tickets ${subject.tickets}) of wave ${subject.wave}, agent ${subject.agentId}`
      : `ticket ${subject.ticket} of wave ${subject.wave}, agent ${subject.agentId}`;
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

/** The moves open after a stream agent's turn ends, by how it ended. */
const AFTER_STREAM_TURN: Record<TurnOutcome["kind"], (subject: StreamSubject) => string[]> = {
  completed: (s) => [
    `check stream ${s.stream}'s report with get_agent_activity and its artifacts (commits on its branch, its pull request)`,
    `prompt agent ${s.agentId} when the report is incomplete`,
  ],
  failed: (s) => [
    `read agent ${s.agentId}'s last activity with get_agent_activity`,
    `prompt agent ${s.agentId} to resume, or record stream ${s.stream} as failed with the reason`,
  ],
  canceled: (s) => [
    `read agent ${s.agentId}'s last activity with get_agent_activity`,
    `prompt agent ${s.agentId} to resume, or leave stream ${s.stream} stopped when the cancel was deliberate`,
  ],
};

/** The moves open after a ticket agent's turn ends, by how it ended. */
const AFTER_TURN: Record<TurnOutcome["kind"], (subject: TicketSubject) => string[]> = {
  completed: (s) => [
    `check ${named(s)}'s report with get_agent_activity and its artifacts (commits on its branch, ticket status)`,
    `prompt agent ${s.agentId} when the report is incomplete`,
  ],
  failed: (s) => [
    `read agent ${s.agentId}'s last activity with get_agent_activity`,
    `prompt agent ${s.agentId} to resume, or record ${named(s)} as failed with the reason`,
  ],
  canceled: (s) => [
    `read agent ${s.agentId}'s last activity with get_agent_activity`,
    `prompt agent ${s.agentId} to resume, or leave ${named(s)} stopped when the cancel was deliberate`,
  ],
};

/**
 * The moves open after the sensor flags a ticket agent's turn end. The agent may still be inside a call, and a
 * prompt only queues behind a stuck call, so the moves name the wave skill's hung-agent table, never the prompt.
 */
const AFTER_QUIET_TURN = (s: TicketSubject): string[] => [
  `judge whether ${named(s)} is stalled: read agent ${s.agentId}'s recent activity with get_agent_activity`,
  `decide by the wave skill's hung-agent table, which says whether agent ${s.agentId} is replaced within the wave skill's restart budget or prompted to resume, or record ${named(s)} as stalled with the reason`,
  `leave ${named(s)} alone when its agent is working`,
];

/** The moves open after a running ticket or bundle agent has been quiet too long: it may be hung in a call, so it is replaced, never prompted. */
const WHILE_TICKET_RUNS = (s: TicketSubject): string[] => [
  `judge whether ${named(s)} is stalled: read agent ${s.agentId}'s recent activity with get_agent_activity`,
  `when agent ${s.agentId} is hung on a shell command or on no tool call, replace it within the wave skill's restart budget under its hung-agent table, and never prompt it, since a prompt queues behind the stuck call`,
  `leave ${named(s)} alone when agent ${s.agentId} runs a subagent or another long tool`,
];

/** The moves open after a running stream agent has been quiet too long: it may be hung in a call, so it is replaced, never prompted. */
const WHILE_RUNNING = (s: StreamSubject): string[] => [
  `judge whether stream ${s.stream} is stalled: read agent ${s.agentId}'s recent activity with get_agent_activity`,
  `when agent ${s.agentId} is hung on a shell command or on no tool call, replace it within the stream skill's restart budget, and never prompt it, since a prompt queues behind the stuck call`,
  `leave stream ${s.stream} alone when agent ${s.agentId} runs a subagent or another long tool`,
];

/**
 * The moves open while a request waits. A question is a checkpoint (ADR 0001): the user answers it in the asking
 * agent's chat, or the plugin does under the delegation table; the orchestrator reads it and leaves it to them.
 */
function afterRequest(subject: Relayed, request: RequestHead): string[] {
  const of = isStream(subject) ? `stream ${subject.stream}` : named(subject);
  const read = `read ${of}'s request ${request.id} with list_pending_permissions, and treat it as settled when it is no longer listed`;
  return request.kind === "question"
    ? [
        read,
        `leave the checkpoint to the user, who answers it in agent ${subject.agentId}'s chat, or answer it with respond_to_permission when the delegation table lets you decide`,
      ]
    : [
        read,
        `answer ${of}'s request ${request.id} with respond_to_permission, or leave it to the user when the decision is theirs`,
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
  turnEnded: (subject: Relayed, outcome: TurnOutcome) =>
    message(
      "Turn ended",
      subject,
      outcomeOf(outcome),
      isStream(subject) ? AFTER_STREAM_TURN[outcome.kind](subject) : AFTER_TURN[outcome.kind](subject),
    ),
  permissionRequested: (subject: Relayed, request: RequestHead) =>
    message("Permission pending", subject, `request ${request.id}, ${request.name} (${request.kind})`, afterRequest(subject, request)),
  created: (subject: TicketSubject) =>
    message("Agent created", subject, undefined, [
      `carry on with the wave while ${named(subject)}'s turn end and any pending permission reach you as messages`,
    ]),
  humanWords: (subject: TicketSubject, ids: readonly string[]) =>
    message("Human words", subject, humanWordsDetail(ids), [
      `read what the user typed to agent ${subject.agentId} with get_agent_activity`,
      `record in ${named(subject)}'s report that the user spoke to it, and whether it changed the plan`,
    ]),
  stallSuspected: (subject: Relayed, says: readonly string[], on?: "turn end" | "running") =>
    message(
      "Stall suspected",
      subject,
      `the sensor flagged: ${says.join("; ")}`,
      isStream(subject) ? WHILE_RUNNING(subject) : on === "running" ? WHILE_TICKET_RUNS(subject) : AFTER_QUIET_TURN(subject),
    ),
  gateCapPassed: (subject: TicketSubject, cap: number, running: number) =>
    message("Gate cap passed", subject, `${running} ticket agents run against a cap of ${cap} concurrent gates`, [
      `hold every ready ticket after ${named(subject)} in a queue, and spawn the next one only when a ticket agent's turn end or archive shows fewer than ${cap} running`,
      `leave ${named(subject)} running: agent ${subject.agentId} is already created`,
    ]),
  appetitePassed: (stream: string, spentUsd: number, appetiteUsd: number, partial: boolean) => {
    const spent = `spent ${spentUsd.toFixed(2)} USD against an appetite of ${appetiteUsd.toFixed(2)} USD`;
    const body = `Appetite passed: stream ${stream}, ${partial ? `${spent} (a partial total: some turns reported no cost)` : spent}.`;
    const moves = [
      `leave every question of stream ${stream} to the user, who answers it in the asking agent's chat, since the plugin no longer answers them for this stream`,
      "decide any Hold under the skills' rules, since the plugin cancels nothing and stops no agent",
    ];
    return `${body}${NEXT}${moves.join(MOVES)}.`;
  },
  questionBudgetSpent: (count: number, budget: number) =>
    `Question budget spent: ${count} question${count === 1 ? "" : "s"} reached the user today against a budget of ${budget}.${NEXT}${[
      "keep asking the questions only the user can answer: the plugin still leaves each one to them",
      "decide nothing extra on the budget's account: the delegation table alone says what you may decide",
    ].join(MOVES)}.`,
  archived: (subject: Relayed) =>
    message(
      "Agent archived",
      subject,
      undefined,
      isStream(subject)
        ? [
            `finish the clean-up of stream ${subject.stream} when you archived agent ${subject.agentId}`,
            `check stream ${subject.stream}'s status before counting its work done when someone else archived agent ${subject.agentId}`,
          ]
        : [
            `finish step 8's clean-up of ${named(subject)} when you archived agent ${subject.agentId}`,
            `check ${named(subject)}'s status before counting its work done when someone else archived agent ${subject.agentId}`,
          ],
    ),
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
