import type { Spend } from "../shared/appetite.ts";
import { REPORT_CARD } from "../shared/contract.ts";
import type { Entry } from "./delegated-answers.ts";
import type { Host, HostAgent, HostHooks, TimelineRow } from "./host.ts";
import { ownerOf } from "./question-budget.ts";

/** What the card shows for one stream: the three records it reads, as the modules keep them. */
export type CardInput = {
  decided: readonly Entry[];
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

/** The card's row, in the shape `docs/contract.md` fixes (`REPORT_CARD`): plain JSON, and nothing in it a person can press. */
export function reportCardRow({ decided, spend, questions }: CardInput): TimelineRow {
  return {
    id: REPORT_CARD.id,
    kind: REPORT_CARD.kind,
    version: REPORT_CARD.version,
    data: {
      decided: decided.map(({ header, answer, at }) => ({ header, answer, at })),
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
 * The card reads the three records through the modules that keep them and writes none. It refreshes when a
 * delegated answer is recorded (`refresh`, from the delegated answers' `answered`), when a question is left
 * to the user (`refresh`, from `left`), and at each turn end of a ticket agent or the stream agent; register it
 * after the appetite handler so a turn's cost is summed first. It has no buttons: the round trip is unproven
 * (ADR 0001). An agent with no role labels is left alone (T3), and a host that refuses the row logs one line
 * with the agent's id, never a question or an answer (T4, T6).
 */
export function registerReportCard(hooks: HostHooks, sources: Sources): ReportCard {
  async function refresh({ agent, labels }: { agent: HostAgent; labels: Record<string, string> }, host: Host): Promise<void> {
    try {
      const stream = labels["stream"];
      const owner = ownerOf(agent, labels);
      if (stream === undefined || owner === null) return;
      await host.appendTimelineRow(
        owner,
        reportCardRow({ decided: sources.decided(stream), spend: sources.spend(stream), questions: sources.questions() }),
      );
    } catch (error) {
      console.error(`[matt-with-paseo] report card not appended for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  hooks.onTurnEnded(async ({ agent }, host) => {
    let labels: Record<string, string>;
    try {
      labels = await host.labelsOf(agent.id);
    } catch (error) {
      console.error(`[matt-with-paseo] report card labels not read for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    await refresh({ agent, labels }, host);
  });

  return { refresh };
}
