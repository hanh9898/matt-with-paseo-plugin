import { isStreamAgent, isTicketAgent } from "../../shared/role-labels.ts";
import type { HostAgent, HostHooks } from "../host.ts";

/**
 * The count of what waits for the user, per agent whose chat the user answers in: the composer pill reads it.
 *
 * A request counts toward the chat where the user sees it. A ticket agent, recognised by its labels `wave`
 * and `ticket` (or `wave` and `bundle`, for a bundle agent), is answered from its orchestrator's pill, so its
 * request counts toward its `parentAgentId`.
 * The stream agent, recognised by its label `stream` and no `wave`, asks in its own chat, so its request
 * counts toward itself. Any other agent is left alone (T3). A request stops counting when Paseo resolves it,
 * when its agent's turn ends (a canceled turn leaves none open) or when the agent is archived.
 */
export function registerWaitingCount(hooks: HostHooks): void {
  /** The open requests per agent, each with the agent whose count it joins; null while its labels are being read. */
  const open = new Map<string, Map<string, string | null>>();

  function ownerOf(agent: HostAgent, labels: Record<string, string>): string | null {
    if (isTicketAgent(labels)) return agent.parentAgentId;
    if (isStreamAgent(labels)) return agent.id;
    return null;
  }

  function settle(agentId: string, requestId?: string): void {
    if (requestId === undefined) {
      open.delete(agentId);
      return;
    }
    const requests = open.get(agentId);
    requests?.delete(requestId);
    if (requests?.size === 0) open.delete(agentId);
  }

  /** Opens the request before its labels are read, so a resolution that arrives meanwhile still settles it. */
  hooks.onPermissionRequested(async ({ agent, request }, host) => {
    const requests = open.get(agent.id) ?? new Map<string, string | null>();
    requests.set(request.id, null);
    open.set(agent.id, requests);
    let owner: string | null = null;
    try {
      owner = ownerOf(agent, await host.labelsOf(agent.id));
    } finally {
      const stillOpen = open.get(agent.id);
      if (stillOpen?.has(request.id)) {
        if (owner === null) settle(agent.id, request.id);
        else stillOpen.set(request.id, owner);
      }
    }
  });

  hooks.onPermissionResolved(({ agent, requestId }) => settle(agent.id, requestId));
  hooks.onTurnEnded(({ agent }) => settle(agent.id));
  hooks.onArchived(({ agent }) => settle(agent.id));

  hooks.serveWaitingCount((agentId) => {
    let count = 0;
    for (const requests of open.values()) {
      for (const owner of requests.values()) if (owner === agentId) count += 1;
    }
    return count;
  });
}
