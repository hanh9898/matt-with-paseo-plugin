import { waitingCount } from "../shared/waiting.ts";
import { PILL } from "./pill-text.ts";

/** How often every pill is read again, in case an agent update never comes. */
export const REFRESH_MS = 30_000;

/** What the pill reads of an agent update: an agent that appeared or changed, or one that went away. */
export type PillUpdate =
  | { kind: "upsert"; agent: { id: string; workspaceId?: string | null; parentAgentId?: string | null } }
  | { kind: "remove"; agentId: string };

export interface PillRegistration {
  update(patch: { label?: string; visible?: boolean }): void;
  remove(): void;
}

/** The slice of Paseo's client context the pill uses; the entry hands it the real context. */
export interface PillClient {
  paseo: {
    agents: {
      list(): Promise<{ entries: { agent: { id: string; workspaceId?: string | null; parentAgentId?: string | null } }[] }>;
      subscribe(handler: (update: PillUpdate) => void): () => void;
    };
  };
  rpc(contract: typeof waitingCount, input: { agentId: string }): Promise<{ count: number; budgetSpent?: boolean }>;
  addComposerPill(contribution: {
    id: string;
    workspaceId: string;
    agentId: string;
    button: {
      title: string;
      icon: string;
      label: string;
      visible: boolean;
      behavior: { kind: "action"; onPress(): void | Promise<void> };
    };
  }): PillRegistration;
}

/**
 * The composer pill: a button in each agent's composer that counts what waits for the user in that chat. It
 * stays hidden at zero, so an agent with nothing pending looks as Paseo made it (T3). The count comes from the
 * daemon (`waiting.count`), with whether the day's question budget is spent, and is read again whenever an agent changes, on a timer, and when the pill is pressed.
 */
export function contributeWaitingPill(client: PillClient): () => void {
  const pills = new Map<string, { registration: PillRegistration; reads: number }>();

  async function refresh(agentId: string): Promise<void> {
    const pill = pills.get(agentId);
    if (pill === undefined) return;
    pill.reads += 1;
    const read = pill.reads;
    try {
      const { count, budgetSpent } = await client.rpc(waitingCount, { agentId });
      // A newer read, or a removed pill, makes this reply stale.
      if (pills.get(agentId) !== pill || pill.reads !== read) return;
      pill.registration.update({ label: PILL.label(count, budgetSpent === true), visible: count > 0 });
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      console.error(`[matt-with-paseo] pill read failed for agent ${agentId}: ${cause}`);
    }
  }

  function refreshAll(): void {
    for (const agentId of pills.keys()) void refresh(agentId);
  }

  function ensure(agentId: string, workspaceId: string): void {
    if (pills.has(agentId)) return;
    const registration = client.addComposerPill({
      id: PILL.id,
      workspaceId,
      agentId,
      button: {
        title: PILL.title,
        icon: PILL.icon,
        label: PILL.label(0),
        visible: false,
        behavior: { kind: "action", onPress: () => refresh(agentId) },
      },
    });
    pills.set(agentId, { registration, reads: 0 });
  }

  function track({ id, workspaceId, parentAgentId }: { id: string; workspaceId?: string | null; parentAgentId?: string | null }): void {
    if (workspaceId) ensure(id, workspaceId);
    void refresh(id);
    if (parentAgentId) void refresh(parentAgentId);
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind === "remove") {
      pills.get(update.agentId)?.registration.remove();
      pills.delete(update.agentId);
      refreshAll();
      return;
    }
    track(update.agent);
  });
  // An agent that changes nothing after the plugin starts still needs its pill, or a question from its ticket agent shows nowhere.
  client.paseo.agents.list().then(
    ({ entries }) => {
      for (const { agent } of entries) track(agent);
    },
    (error: unknown) => {
      const cause = error instanceof Error ? error.message : String(error);
      console.error(`[matt-with-paseo] pill could not list the agents: ${cause}`);
    },
  );
  const timer = setInterval(refreshAll, REFRESH_MS);

  return () => {
    unsubscribe();
    clearInterval(timer);
    for (const { registration } of pills.values()) registration.remove();
    pills.clear();
  };
}
