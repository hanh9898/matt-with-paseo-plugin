import type {
  PluginHookContext,
  PluginLifecycleEvents,
  PluginServerContext,
} from "@getpaseo/plugin/server";
import { waitingCount } from "../shared/waiting.ts";
import type { CreateChange, CreateRequest, Handler, Host, HostHooks, SessionOpenRequest } from "./host.ts";

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
function hostFor(paseo: PluginHookContext["paseo"]): Host {
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
    send: (agentId, text) => paseo.agents.ref(agentId).send(text),
    respondToPermission: (agentId, requestId, answer) =>
      paseo.agents.ref(agentId).respondToPermission({ requestId, response: answer }),
    async appendTimelineRow(agentId, row) {
      await paseo.agents.ref(agentId).timeline.append({ type: "plugin", ...row });
    },
  };
}

/** The title and labels Paseo holds for an agent; null and none when it cannot read them, as before a resumed agent is registered. */
async function readAgent(paseo: PluginHookContext["paseo"], agentId: string): Promise<Pick<SessionOpenRequest, "title" | "labels">> {
  try {
    const found = await paseo.agents.ref(agentId).refresh();
    return found ? { title: found.agent.title ?? null, labels: { ...found.agent.labels } } : { title: null, labels: {} };
  } catch {
    return { title: null, labels: {} };
  }
}

/** Wraps a handler for one lifecycle event: narrows the event, hands over the host, and keeps failures in the log (T4). */
function forEvent<N extends AgentEvent, E>(
  name: N,
  handler: Handler<E>,
  narrow: (source: PluginLifecycleEvents[N]) => E,
) {
  return async (source: PluginLifecycleEvents[N], context: PluginHookContext): Promise<void> => {
    try {
      await handler(narrow(source), hostFor(context.paseo));
    } catch (error) {
      report(name, source.agent.id, error);
    }
  };
}

/** The real adapter of the host port, and the only module that imports Paseo's SDK (T2). */
export function connectPaseo(server: Registration): HostHooks {
  return {
    onCreated: (handler) =>
      void server.on("agent.created", forEvent("agent.created", handler, ({ agent }) => ({ agent }))),
    onArchived: (handler) =>
      void server.on("agent.archived", forEvent("agent.archived", handler, ({ agent }) => ({ agent }))),
    onTurnEnded: (handler) =>
      void server.on(
        "agent.turn_ended",
        forEvent("agent.turn_ended", handler, ({ agent, outcome, timeline }) => ({ agent, outcome, timeline })),
      ),
    onPermissionRequested: (handler) =>
      void server.on(
        "agent.permission_requested",
        forEvent("agent.permission_requested", handler, ({ agent, request }) => ({
          agent,
          request: { id: request.id, name: request.name, kind: request.kind, input: request.input },
        })),
      ),
    onPermissionResolved: (handler) =>
      void server.on(
        "agent.permission_resolved",
        forEvent("agent.permission_resolved", handler, ({ agent, requestId }) => ({ agent, requestId })),
      ),
    serveWaitingCount: (handler) =>
      void server.handle(waitingCount, async ({ agentId }) => {
        try {
          return { count: await handler(agentId) };
        } catch (error) {
          report("waiting.count", agentId, error);
          return { count: 0 };
        }
      }),
    beforeCreate: (handler) =>
      void server.before("agent.create", async ({ request }, context) => {
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
