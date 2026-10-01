import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { addTurn, isPast, isSpend, parseAppetite, type Spend } from "../shared/appetite.ts";
import { readDelegation } from "../shared/delegation.ts";
import { isStreamAgent, isTicketAgent } from "../shared/role-labels.ts";
import type { NewEntry } from "./decision-log.ts";
import type { Host, HostAgent, HostHooks } from "./host.ts";
import { MESSAGES } from "./messages.ts";
import { readStateFile, writeStateFile } from "./state.ts";

/** Where the totals are kept: every stream's `Spend`, outside the repository. */
export type Store = {
  read: () => Record<string, Spend>;
  write: (all: Record<string, Spend>) => void;
};

/** What the handler reads from outside; a test passes its own. */
export type Reader = {
  /** The text of the repository's `AGENTS.md` under `cwd`, or null when there is none. */
  readTable?: (cwd: string) => Promise<string | null>;
  store?: Store;
  /** Told after each turn end of a ticket agent or the stream agent whose cost was summed and kept, so the report card (#41) reads the new total without depending on the order handlers run in. */
  updated?: (who: { agent: HostAgent; labels: Record<string, string> }, host: Host) => void | Promise<void>;
  /** Told once per stream, after the `Appetite passed:` message was sent or held, with the decision-log entry that records the plugin no longer answering that stream; a throw is caught and logged with the agent's id and the kind only. */
  passed?: (entry: NewEntry) => void;
};

const RECORD_FILE = "stream-spend.json";

const fileStore: Store = {
  read() {
    try {
      const parsed: unknown = JSON.parse(readStateFile(RECORD_FILE) ?? "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, Spend] => isSpend(entry[1])));
    } catch {
      return {};
    }
  },
  write: (all) => void writeStateFile(RECORD_FILE, `${JSON.stringify(all)}\n`),
};

async function readAgentsFile(cwd: string): Promise<string | null> {
  try {
    return await readFile(join(cwd, "AGENTS.md"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * The appetite from turn costs. At each turn end of a ticket agent or the stream agent, the plugin adds the agent's
 * `lastUsage.totalCostUsd` to its stream's total, keyed by the `stream` label and kept in `stream-spend.json`
 * under the state directory, never in the repository. A turn with no cost adds nothing and marks the total
 * partial. The appetite is read from the `## Delegation` table of the agent's folder at each turn end; a table
 * it cannot read keeps the appetite last seen (T4).
 *
 * When the total passes the appetite the orchestrator, the turn-ended agent's parent, is told once, with
 * `MESSAGES.appetitePassed`; a message for an orchestrator that is mid-turn is held and goes out when that turn
 * ends. `pastAppetite` is what the delegated answers read to leave every question of that stream to the user.
 * The plugin cancels nothing and stops no agent: the skills decide any Hold. An agent with no role labels is left
 * alone (T3), and a failure never reaches Paseo (T4).
 */
export function registerAppetite(
  hooks: HostHooks,
  reader: Reader = {},
): { pastAppetite: (stream: string) => boolean; spendOf: (stream: string) => Spend | undefined } {
  const readTable = reader.readTable ?? readAgentsFile;
  const store = reader.store ?? fileStore;
  const held = new Map<string, string[]>();

  async function costOf(agentId: string, host: Host): Promise<number | null> {
    try {
      return await host.lastTurnCostUsd(agentId);
    } catch {
      return null;
    }
  }

  async function appetiteOf(cwd: string): Promise<number | null | undefined> {
    try {
      const text = await readTable(cwd);
      return parseAppetite(text === null ? null : (readDelegation(text)?.appetite ?? null));
    } catch {
      return undefined;
    }
  }

  async function isBusy(agentId: string, host: Host): Promise<boolean> {
    try {
      return await host.isRunning(agentId);
    } catch {
      return false;
    }
  }

  hooks.onTurnEnded(async ({ agent }, host) => {
    // The orchestrator's own turn ended: the message held for it goes out now.
    const waiting = held.get(agent.id);
    if (waiting !== undefined) {
      held.delete(agent.id);
      for (const text of waiting) await host.send(agent.id, text);
    }

    const labels = await host.labelsOf(agent.id);
    const stream = labels["stream"];
    if (stream === undefined || (!isTicketAgent(labels) && !isStreamAgent(labels))) return;

    const known = store.read();
    let spend = addTurn(known[stream], await costOf(agent.id, host));
    const appetite = await appetiteOf(agent.cwd);
    if (appetite !== undefined) spend = { ...spend, appetiteUsd: appetite };

    const orchestrator = agent.parentAgentId;
    const tell = isPast(spend) && !spend.notified && orchestrator !== null;
    if (tell) spend = { ...spend, notified: true };
    known[stream] = spend;
    store.write(known);
    try {
      await reader.updated?.({ agent, labels }, host);
    } catch (error) {
      console.error(`[matt-with-paseo] spend update not told for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!tell || spend.appetiteUsd === null) return;

    const text = MESSAGES.appetitePassed(stream, spend.totalUsd, spend.appetiteUsd, spend.partial);
    if (await isBusy(orchestrator, host)) held.set(orchestrator, [...(held.get(orchestrator) ?? []), text]);
    else await host.send(orchestrator, text);

    // The message is sent or held: the plugin has stopped answering this stream, and the log says so once (T4: a log that cannot be written changes nothing sent).
    try {
      reader.passed?.({
        kind: "appetite passed",
        stream,
        agent: agent.id,
        asked: `none: the stream's spend passed its appetite at a turn end of agent ${agent.id}`,
        answer: text,
        grounds: `the Appetite row of the ## Delegation table in ${agent.cwd}/AGENTS.md reads ${spend.appetiteUsd.toFixed(2)} USD; spend ${spend.totalUsd.toFixed(2)} USD${spend.partial ? " (partial)" : ""}`,
      });
    } catch {
      console.error(`[matt-with-paseo] decision log not written for agent ${agent.id}: appetite passed`);
    }
  });

  hooks.onArchived(({ agent }) => void held.delete(agent.id));

  return { pastAppetite: (stream) => isPast(store.read()[stream]), spendOf: (stream) => store.read()[stream] };
}
