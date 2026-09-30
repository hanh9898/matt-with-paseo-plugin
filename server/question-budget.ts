import { isStreamAgent, isTicketAgent } from "../shared/role-labels.ts";
import { budgetOf, dayOf, type Env } from "../shared/question-budget.ts";
import type { Host, HostAgent, HostHooks, PermissionRequest } from "./host.ts";
import { MESSAGES } from "./messages.ts";
import { readStateFile, writeStateFile } from "./state.ts";

/** One day's tally as the plugin keeps it, outside the repository: the local day, the questions left for the user, whether the orchestrator was told. */
export type BudgetRecord = { day: string; count: number; notified: boolean };

/** Where the tally lives; a test passes its own, the default is `question-budget.json` in the state directory. */
export type BudgetStore = { load(): BudgetRecord | null; save(record: BudgetRecord): void };

/** What the handler reads from outside; a test passes its own. */
export type BudgetOptions = { env?: Env; now?: () => Date; store?: BudgetStore };

const RECORD_FILE = "question-budget.json";

/** The tally as a file holds it, or null when the file is missing or is not a tally (a corrupt file starts the day again, T4). */
function parseRecord(text: string | null): BudgetRecord | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return null;
    const { day, count, notified } = value as Record<string, unknown>;
    if (typeof day !== "string" || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || typeof notified !== "boolean") return null;
    return { day, count, notified };
  } catch {
    return null;
  }
}

const fileStore: BudgetStore = {
  load: () => parseRecord(readStateFile(RECORD_FILE)),
  save: (record) => void writeStateFile(RECORD_FILE, `${JSON.stringify(record)}\n`),
};

/** The chat where the user sees the agent's question: a ticket agent's is its orchestrator's, the stream agent's its own; null for any other agent (T3). */
export function ownerOf(agent: HostAgent, labels: Record<string, string>): string | null {
  if (isTicketAgent(labels)) return agent.parentAgentId;
  if (isStreamAgent(labels)) return agent.id;
  return null;
}

/** What `left` takes: one question this plugin left to the user, as the delegated-answers handler reports it. */
export type LeftQuestion = { agent: HostAgent; request: PermissionRequest; labels: Record<string, string> };

export type QuestionBudget = {
  /** Counts a question left to the user, and tells the orchestrator once when the day's budget is spent. */
  left(question: LeftQuestion, host: Host): Promise<void>;
  /** The questions counted today. */
  count(): number;
  /** Whether a budget is set and today's count has reached it. */
  spent(): boolean;
};

/**
 * The daily question budget. The delegated-answers handler tells `left` about each question it leaves for the
 * user (only agents it recognises by their labels, T3); the plugin counts them per local day, per daemon, in
 * `question-budget.json` under the state directory, so the count survives a reload. When the count reaches the
 * budget (`MWP_QUESTION_BUDGET`, `shared/question-budget.ts`), the orchestrator that owns the chat is sent one
 * `Question budget spent:` message with its `Next:` line, once a day, held while its own turn runs; the composer
 * pill shows it beside the count.
 *
 * The budget informs and never decides: it answers nothing and stops nothing, so questions keep reaching the
 * user (spec #32, the owner's answer 3). The handler fails open (T4): a store that cannot be read or written
 * logs one line with the agent's id and the count goes on in memory; a text never carries a question (T6).
 */
export function registerQuestionBudget(hooks: HostHooks, options: BudgetOptions = {}): QuestionBudget {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const store = options.store ?? fileStore;
  const held = new Map<string, string[]>();
  /** The requests counted per agent, so one Paseo shows twice counts once; forgotten at the turn's end. */
  const counted = new Map<string, Set<string>>();
  let current: BudgetRecord | null = null;
  let loaded = false;

  /** Today's record: the one in memory, else the store's, else a fresh one; a record of another day is replaced. */
  function today(): BudgetRecord {
    const day = dayOf(now());
    if (!loaded) {
      loaded = true;
      try {
        current = store.load();
      } catch (error) {
        console.error(`[matt-with-paseo] question budget not read: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (current === null || current.day !== day) current = { day, count: 0, notified: false };
    return current;
  }

  async function left({ agent, request, labels }: LeftQuestion, host: Host): Promise<void> {
    const seen = counted.get(agent.id) ?? new Set<string>();
    if (seen.has(request.id)) return;
    seen.add(request.id);
    counted.set(agent.id, seen);

    const record = today();
    record.count += 1;
    const budget = budgetOf(env);
    const owner = budget !== null && record.count >= budget && !record.notified ? ownerOf(agent, labels) : null;
    if (owner !== null) record.notified = true;
    save(record, agent.id);
    if (owner === null || budget === null) return;

    const text = MESSAGES.questionBudgetSpent(record.count, budget);
    try {
      // A host that cannot say who runs counts the orchestrator as idle, so the message goes out.
      const running = await host.isRunning(owner).catch(() => false);
      if (running) held.set(owner, [...(held.get(owner) ?? []), text]);
      else await host.send(owner, text);
    } catch (error) {
      // Untold: the next question tries again, rather than losing the message for the day.
      record.notified = false;
      save(record, agent.id);
      throw error;
    }
  }

  function save(record: BudgetRecord, agentId: string): void {
    try {
      store.save(record);
    } catch (error) {
      console.error(`[matt-with-paseo] question budget not saved for agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  hooks.onTurnEnded(async ({ agent }, host) => {
    counted.delete(agent.id);
    const waiting = held.get(agent.id);
    if (waiting === undefined) return;
    held.delete(agent.id);
    for (const text of waiting) await host.send(agent.id, text);
  });

  hooks.onArchived(({ agent }) => {
    counted.delete(agent.id);
    held.delete(agent.id);
  });

  hooks.serveBudgetSpent(() => spent());

  function spent(): boolean {
    const budget = budgetOf(env);
    return budget !== null && today().count >= budget;
  }

  return { left, count: () => today().count, spent };
}
