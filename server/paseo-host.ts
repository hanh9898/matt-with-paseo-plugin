import type {
  PluginHookContext,
  PluginLifecycleEvents,
  PluginServerContext,
} from "@getpaseo/plugin/server";
import { waitingCount } from "../shared/waiting.ts";
import type { CreateChange, CreateRequest, Handler, Host, HostHooks, SessionOpenRequest } from "./host.ts";

/** How often a tick handler runs, in milliseconds. */
export const TICK_MS = 5 * 60 * 1000;

/** The hooks the adapter registers on, and the `stop` that clears the one timer it may have started. */
export type PaseoHooks = HostHooks & { stop(): void };

type Paseo = PluginHookContext["paseo"];

/** The context Paseo hands the entry module. */
export type PaseoServer = PluginServerContext;

/** The part of the server context the adapter registers hooks on. */
type Registration = Pick<PluginServerContext, "on" | "before" | "handle">;

type AgentEvent =
  | "agent.created"
  | "agent.archived"
  | "agent.turn_ended"
  | "agent.permission_requested"
  | "agent.permission_resolved";

/** Logs a failure the handler must not throw into Paseo, with the event and the agent's id, never a payload (T6). */
function report(hook: string, agentId: string | undefined, error: unknown): void {
  const cause = error instanceof Error ? error.message : String(error);
  const whose = agentId === undefined ? "" : ` for agent ${agentId}`;
  console.error(`[matt-with-paseo] ${hook} handler failed${whose}: ${cause}`);
}

/** The host for one hook call: `context.paseo` arrives only with a hook or a panel call, so each call builds its own. */
function hostFor(paseo: Paseo): Host {
  return {
    async labelsOf(agentId) {
      const found = await paseo.agents.ref(agentId).refresh();
      return found ? { ...found.agent.labels } : {};
    },
    async isRunning(agentId) {
      const found = await paseo.agents.ref(agentId).refresh();
      return found?.agent.status === "running";
    },
    async lastTurnCostUsd(agentId) {
      const found = await paseo.agents.ref(agentId).refresh();
      const usage = (found?.agent as { lastUsage?: { totalCostUsd?: unknown } | null } | undefined)?.lastUsage;
      const cost = usage?.totalCostUsd;
      return typeof cost === "number" ? cost : null;
    },
    async lastActivityAt(agentId) {
      const found = await paseo.agents.ref(agentId).refresh();
      // Paseo 0.10.1's snapshot has no `lastActivityAt`; its `updatedAt` stands still while a call is stuck (#62).
      const snapshot = found?.agent as { lastActivityAt?: unknown; updatedAt?: unknown } | undefined;
      const at = typeof snapshot?.lastActivityAt === "string" ? snapshot.lastActivityAt : snapshot?.updatedAt;
      return typeof at === "string" ? at : null;
    },
    async parentOf(agentId) {
      const found = await paseo.agents.ref(agentId).refresh();
      const parent = (found?.agent as { parentAgentId?: unknown } | undefined)?.parentAgentId;
      return typeof parent === "string" ? parent : null;
    },
    send: (agentId, text) => paseo.agents.ref(agentId).send(text),
    respondToPermission: (agentId, requestId, answer) =>
      paseo.agents.ref(agentId).respondToPermission({ requestId, response: answer }),
    async appendTimelineRow(agentId, row) {
      await paseo.agents.ref(agentId).timeline.append({ type: "plugin", ...row });
    },
  };
}

/** The title and labels Paseo holds for an agent; null and none when it cannot read them, as before a resumed agent is registered. */
async function readAgent(paseo: Paseo, agentId: string): Promise<Pick<SessionOpenRequest, "title" | "labels">> {
  try {
    const found = await paseo.agents.ref(agentId).refresh();
    return found ? { title: found.agent.title ?? null, labels: { ...found.agent.labels } } : { title: null, labels: {} };
  } catch {
    return { title: null, labels: {} };
  }
}

/** Wraps a handler for one lifecycle event: narrows the event, hands over the host, and keeps failures in the log (T4). `remember` keeps the call's session for the tick. */
function forEvent<N extends AgentEvent, E>(
  name: N,
  handler: Handler<E>,
  narrow: (source: PluginLifecycleEvents[N]) => E,
  remember: (paseo: Paseo) => void,
) {
  return async (source: PluginLifecycleEvents[N], context: PluginHookContext): Promise<void> => {
    remember(context.paseo);
    try {
      await handler(narrow(source), hostFor(context.paseo));
    } catch (error) {
      report(name, source.agent.id, error);
    }
  };
}

/** The real adapter of the host port, and the only module that imports Paseo's SDK (T2). */
export function connectPaseo(server: Registration): PaseoHooks {
  /**
   * The session of the latest hook call. `PluginServerContext` has no `paseo` of its own, so a tick builds its host
   * from this one; the SDK says a hook's session lives as long as the subprocess, which the smoke test confirms.
   */
  let latest: Paseo | null = null;
  const remember = (paseo: Paseo): void => void (latest = paseo);
  const ticks: ((host: Host) => void | Promise<void>)[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;

  async function tick(): Promise<void> {
    if (latest === null || ticking) return;
    ticking = true;
    try {
      const host = hostFor(latest);
      for (const handler of ticks) {
        try {
          await handler(host);
        } catch (error) {
          report("tick", undefined, error);
        }
      }
    } finally {
      ticking = false;
    }
  }

  /** Whether the day's question budget is spent, per agent; served over the same RPC as the count, and absent until a handler serves it. */
  let budgetSpent: ((agentId: string) => boolean | Promise<boolean>) | null = null;
  return {
    onCreated: (handler) =>
      void server.on("agent.created", forEvent("agent.created", handler, ({ agent }) => ({ agent }), remember)),
    onArchived: (handler) =>
      void server.on("agent.archived", forEvent("agent.archived", handler, ({ agent }) => ({ agent }), remember)),
    onTurnEnded: (handler) =>
      void server.on(
        "agent.turn_ended",
        forEvent("agent.turn_ended", handler, ({ agent, outcome, timeline }) => ({ agent, outcome, timeline }), remember),
      ),
    onPermissionRequested: (handler) =>
      void server.on(
        "agent.permission_requested",
        forEvent(
          "agent.permission_requested",
          handler,
          ({ agent, request }) => ({
            agent,
            request: { id: request.id, name: request.name, kind: request.kind, input: request.input },
          }),
          remember,
        ),
      ),
    onPermissionResolved: (handler) =>
      void server.on(
        "agent.permission_resolved",
        forEvent("agent.permission_resolved", handler, ({ agent, requestId }) => ({ agent, requestId }), remember),
      ),
    onTick: (handler) => {
      ticks.push(handler);
      if (timer !== null) return;
      timer = setInterval(() => void tick(), TICK_MS);
      timer.unref();
    },
    stop: () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    serveWaitingCount: (handler) =>
      void server.handle(waitingCount, async ({ agentId }) => {
        try {
          const count = await handler(agentId);
          if (budgetSpent === null) return { count };
          try {
            return { count, budgetSpent: await budgetSpent(agentId) };
          } catch (error) {
            report("waiting.count", agentId, error);
            return { count, budgetSpent: false };
          }
        } catch (error) {
          report("waiting.count", agentId, error);
          return { count: 0 };
        }
      }),
    serveBudgetSpent: (handler) => void (budgetSpent = handler),
    beforeCreate: (handler) =>
      void server.before("agent.create", async ({ request }, context) => {
        remember(context.paseo);
        try {
          const change: CreateChange | void = await handler(
            { env: request.env ?? {}, title: request.config.title ?? null } satisfies CreateRequest,
            hostFor(context.paseo),
          );
          return change ? { ...request, env: change.env } : undefined;
        } catch (error) {
          report("agent.create", undefined, error);
          return undefined;
        }
      }),
    beforeSessionOpen: (handler) =>
      void server.before("agent.session_open", async ({ request }, context) => {
        remember(context.paseo);
        try {
          const { title, labels } = await readAgent(context.paseo, request.agentId);
          const change: CreateChange | void = await handler(
            { agentId: request.agentId, reason: request.reason, env: request.env, title, labels } satisfies SessionOpenRequest,
            hostFor(context.paseo),
          );
          return change ? { ...request, env: change.env } : undefined;
        } catch (error) {
          report("agent.session_open", request.agentId, error);
          return undefined;
        }
      }),
  };
}
