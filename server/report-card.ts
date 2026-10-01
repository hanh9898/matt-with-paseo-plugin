import type { Spend } from "../shared/appetite.ts";
import { REPORT_CARD } from "../shared/contract.ts";
import { decisionLogPath } from "./decision-log.ts";
import type { Entry } from "./delegated-answers.ts";
import type { Host, HostAgent, TimelineRow } from "./host.ts";
import { ownerOf } from "./question-budget.ts";

/** What the card shows for one stream: the three records it reads, as the modules keep them. */
export type CardInput = {
  decided: readonly Entry[];
  /** The absolute path of `decision-log.md`, shown as text; the card never reads the file. */
  log: string;
  /** The stream's spend, or undefined when no turn of it has ended yet. */
  spend: Spend | undefined;
  questions: { count: number; budget: number | null };
};

/** Where the card reads the three records: a delegated answer's record (#38), the stream's spend (#40) and the day's question count (#39). */
export type Sources = {
  decided: (stream: string) => readonly Entry[];
  spend: (stream: string) => Spend | undefined;
  questions: () => { count: number; budget: number | null };
};

/** `text` cut to `REPORT_CARD.textCap` characters, ending `…` when cut, so the row stays under Paseo's 64 KiB cap. */
function cut(text: string): string {
  const characters = Array.from(text);
  return characters.length <= REPORT_CARD.textCap ? text : `${characters.slice(0, REPORT_CARD.textCap - 1).join("")}…`;
}

/** The card's row, in the shape `docs/contract.md` fixes (`REPORT_CARD`): plain JSON, and nothing in it a person can press. */
export function reportCardRow({ decided, log, spend, questions }: CardInput): TimelineRow {
  return {
    id: REPORT_CARD.id,
    kind: REPORT_CARD.kind,
    version: REPORT_CARD.version,
    data: {
      decided: decided.slice(-REPORT_CARD.decidedCap).map(({ header, answer, at }) => ({ header: cut(header), answer: cut(answer), at })),
      decidedCount: decided.length,
      log,
      spend: { totalUsd: spend?.totalUsd ?? 0, appetiteUsd: spend?.appetiteUsd ?? null, partial: spend?.partial ?? false },
      questions: { count: questions.count, budget: questions.budget },
    },
  };
}

export type ReportCard = {
  /** Appends the card to the chat that owns the agent's stream, replacing the one there; never throws (T4). */
  refresh(who: { agent: HostAgent; labels: Record<string, string> }, host: Host): Promise<void>;
};

/**
 * The report card: one plugin timeline row in the orchestrator's chat, listing what was decided on the user's
 * behalf, the stream's spend against its appetite, and the day's question count against the budget. It is
 * appended under one row id, so each change replaces it and the chat holds one card, kept current.
 *
 * The card reads the three records through the modules that keep them and writes none. It is refreshed by the
 * modules that change a record, each through a hook of its own: the delegated answers' `answered` when an
 * answer is recorded, their `left` when a question is left to the user, and the appetite's `updated` when a turn's
 * cost is summed, so no refresh depends on the order handlers run in. It has no buttons: the round trip is
 * unproven (ADR 0001). An agent with no role labels is left alone (T3), and a host that refuses the row logs
 * one line with the agent's id, never a question or an answer (T4, T6).
 */
export function createReportCard(sources: Sources, options: { log?: string } = {}): ReportCard {
  async function refresh({ agent, labels }: { agent: HostAgent; labels: Record<string, string> }, host: Host): Promise<void> {
    try {
      const stream = labels["stream"];
      const owner = ownerOf(agent, labels);
      if (stream === undefined || owner === null) return;
      await host.appendTimelineRow(
        owner,
        reportCardRow({ decided: sources.decided(stream), log: options.log ?? decisionLogPath(), spend: sources.spend(stream), questions: sources.questions() }),
      );
    } catch (error) {
      console.error(`[matt-with-paseo] report card not appended for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { refresh };
}
