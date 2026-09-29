import type { Host, HostAgent, HostHooks } from "../host.ts";
import { combine, MESSAGES, type Subject } from "../messages.ts";

/**
 * The lifecycle relay: what a ticket agent does (its turn ends, a permission waits, it is created, it is
 * archived) reaches the orchestrator that owns it as a message, so the orchestrator needs no heartbeat.
 *
 * A ticket agent is recognised by its labels, `wave` and `ticket`, which the wave skill puts on every ticket
 * agent it starts; any other agent is left alone (T3). Its orchestrator is its `parentAgentId`; an agent with
 * none has nobody to tell. A message for an orchestrator that is mid-turn is held and goes out, as one message,
 * when that orchestrator's turn ends.
 */
export function registerLifecycleRelay(hooks: HostHooks): void {
  /** The ticket labels last seen per agent: Paseo may no longer report them once the agent is archived. */
  const seen = new Map<string, Subject>();
  /** The texts held per orchestrator, in the order they arrived. */
  const held = new Map<string, string[]>();

  async function subjectOf(agent: HostAgent, host: Host): Promise<Subject | null> {
    const labels = await host.labelsOf(agent.id);
    const { wave, ticket } = labels;
    if (wave !== undefined && ticket !== undefined) {
      const subject = { agentId: agent.id, wave, ticket };
      seen.set(agent.id, subject);
      return subject;
    }
    if (Object.keys(labels).length > 0) seen.delete(agent.id);
    return Object.keys(labels).length === 0 ? (seen.get(agent.id) ?? null) : null;
  }

  /** Fails open: a host that cannot say counts the orchestrator as idle, and the message goes out now. */
  async function isBusy(agentId: string, host: Host): Promise<boolean> {
    try {
      return await host.isRunning(agentId);
    } catch {
      return false;
    }
  }

  async function deliver(agent: HostAgent, text: string, host: Host): Promise<void> {
    const orchestrator = agent.parentAgentId;
    if (orchestrator === null) return;
    if (await isBusy(orchestrator, host)) {
      held.set(orchestrator, [...(held.get(orchestrator) ?? []), text]);
      return;
    }
    await host.send(orchestrator, text);
  }

  async function flush(agentId: string, host: Host): Promise<void> {
    const texts = held.get(agentId);
    if (texts === undefined) return;
    held.delete(agentId);
    await host.send(agentId, combine(texts));
  }

  async function tell(agent: HostAgent, host: Host, compose: (subject: Subject) => string): Promise<void> {
    const subject = await subjectOf(agent, host);
    if (subject !== null) await deliver(agent, compose(subject), host);
  }

  hooks.onCreated(({ agent }, host) => tell(agent, host, MESSAGES.created));

  hooks.onPermissionRequested(({ agent, request }, host) =>
    tell(agent, host, (subject) => MESSAGES.permissionRequested(subject, request)),
  );

  hooks.onTurnEnded(async ({ agent, outcome }, host) => {
    try {
      await flush(agent.id, host);
    } finally {
      await tell(agent, host, (subject) => MESSAGES.turnEnded(subject, outcome));
    }
  });

  hooks.onArchived(async ({ agent }, host) => {
    held.delete(agent.id);
    try {
      await tell(agent, host, MESSAGES.archived);
    } finally {
      seen.delete(agent.id);
    }
  });
}
