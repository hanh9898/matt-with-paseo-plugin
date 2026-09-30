import { isStreamAgent, ticketOf } from "../../shared/role-labels.ts";
import type { HostAgent, Host, HostHooks } from "../host.ts";
import { combine, MESSAGES, type Relayed, type TicketSubject } from "../messages.ts";
import { type Condition, factsOf, flagged, loadConditions, quietMinutesOf, type Seen, type Streaks } from "../sensor.ts";

/**
 * The stall sensor: at a ticket agent's turn end it checks the conditions in `sensor/conditions.json`, one at a
 * time, against what the turn end already carries (its outcome and the timeline), and tells the orchestrator
 * only when one is flagged. A turn that flags nothing sends nothing; the orchestrator's stall judgement, in the
 * wave skill, reads a transcript only for the case it is sent.
 *
 * A stream, ticket or bundle agent stuck in a call has no turn end, so the host port's clock covers it: the sensor
 * records each such agent that has a parent when a hook fires for it, or for an agent whose parent is a stream agent,
 * and forgets it at its archive. At each tick it checks the `"running"` conditions for every recorded agent the host
 * reports running, and flags an idle stretch once: the `lastActivityAt` it flagged is kept, and the same value is not
 * flagged again. The recorded agents sit in one map keyed by agent id, so the one clock serves all three roles.
 *
 * A ticket agent is recognised by its labels, `wave` and `ticket`, a bundle agent by `wave`, `bundle` and
 * `tickets`; any other agent is left alone (T3), and one with no `parentAgentId` has nobody to tell. The sensor fails open (T4): conditions that cannot be loaded, or a
 * host that cannot say whether the orchestrator is busy, never stop Paseo's own path; the orchestrator then
 * judges by its own rounds, as it did before the sensor. A message for an orchestrator that is mid-turn is held
 * and goes out, as one, when that orchestrator's turn ends.
 *
 * `conditions` defaults to the shipped data, and `now` to the wall clock; a test passes its own.
 */
export function registerStallSensor(hooks: HostHooks, conditions?: readonly Condition[], now: () => number = Date.now): void {
  let loaded: readonly Condition[] | null = conditions ?? null;
  const seen = new Map<string, Seen>();
  const streaks = new Map<string, Streaks>();
  const held = new Map<string, string[]>();
  /** The agents the tick checks: who they are to the orchestrator, and the orchestrator that hears of them. */
  const watched = new Map<string, { subject: Relayed; orchestrator: string }>();
  /** The `lastActivityAt` each watched agent was last flagged for, so one idle stretch flags once. */
  const flaggedAt = new Map<string, string>();
  const tickStreaks = new Map<string, Streaks>();

  function conditionsNow(): readonly Condition[] {
    loaded ??= loadConditions();
    return loaded;
  }

  async function isBusy(agentId: string, host: Host): Promise<boolean> {
    try {
      return await host.isRunning(agentId);
    } catch {
      return false;
    }
  }

  async function subjectOf(agentId: string, host: Host): Promise<TicketSubject | null> {
    const found = ticketOf(await host.labelsOf(agentId));
    return found === null ? null : { agentId, ...found };
  }

  /** Tells an orchestrator: at once, or held while its own turn runs and sent, with the others, at its turn end. */
  async function tell(orchestrator: string, text: string, host: Host): Promise<void> {
    if (await isBusy(orchestrator, host)) {
      held.set(orchestrator, [...(held.get(orchestrator) ?? []), text]);
      return;
    }
    await host.send(orchestrator, text);
  }

  async function streamSubjectOf(agentId: string, host: Host): Promise<Relayed | null> {
    const labels = await host.labelsOf(agentId);
    const stream = labels["stream"];
    return isStreamAgent(labels) && stream !== undefined ? { agentId, stream } : null;
  }

  /** A ticket agent, bundle agents included, or a stream agent: the agents the tick watches. */
  async function watchedSubjectOf(agentId: string, host: Host): Promise<Relayed | null> {
    return (await subjectOf(agentId, host)) ?? (await streamSubjectOf(agentId, host));
  }

  /** Records the ticket, bundle or stream agent a hook fires for, or the stream agent whose child it fires for; it fails open (T4), so a hook's own work goes on. */
  async function watch(agent: HostAgent, host: Host): Promise<void> {
    try {
      const parent = agent.parentAgentId;
      if (parent === null) return;
      if (!watched.has(agent.id)) {
        const subject = await watchedSubjectOf(agent.id, host);
        if (subject !== null) watched.set(agent.id, { subject, orchestrator: parent });
      }
      if (!watched.has(parent)) {
        const subject = await streamSubjectOf(parent, host);
        const orchestrator = subject === null ? null : await host.parentOf(parent);
        if (subject !== null && orchestrator !== null) watched.set(parent, { subject, orchestrator });
      }
    } catch {
      // Not recorded this time; the next hook for it tries again.
    }
  }

  hooks.onCreated(({ agent }, host) => watch(agent, host));
  hooks.onPermissionRequested(({ agent }, host) => watch(agent, host));

  hooks.onTick(async (host) => {
    const checks = conditionsNow();
    for (const [agentId, { subject, orchestrator }] of watched) {
      try {
        if (!(await host.isRunning(agentId))) continue;
        const lastActivityAt = await host.lastActivityAt(agentId);
        if (lastActivityAt === null || flaggedAt.get(agentId) === lastActivityAt) continue;
        const quietMinutes = quietMinutesOf(lastActivityAt, now());
        if (quietMinutes === null) continue;
        const agentStreaks = tickStreaks.get(agentId) ?? new Map<string, number>();
        tickStreaks.set(agentId, agentStreaks);
        const flags = flagged(checks, { quietMinutes }, agentStreaks, "running");
        if (flags.length === 0) continue;
        await tell(orchestrator, MESSAGES.stallSuspected(subject, flags.map((condition) => condition.says), "running"), host);
        flaggedAt.set(agentId, lastActivityAt);
      } catch {
        // A host that cannot answer for this agent skips it for this tick (T4).
      }
    }
  });

  hooks.onTurnEnded(async ({ agent, outcome, timeline }, host) => {
    await watch(agent, host);
    // The orchestrator's own turn ended: what was held for it goes out now.
    const waiting = held.get(agent.id);
    if (waiting !== undefined) {
      held.delete(agent.id);
      await host.send(agent.id, combine(waiting));
    }

    const subject = await subjectOf(agent.id, host);
    if (subject === null) return;
    const now = factsOf(outcome.kind, timeline, seen.get(agent.id));
    seen.set(agent.id, now.seen);
    const agentStreaks = streaks.get(agent.id) ?? new Map<string, number>();
    streaks.set(agent.id, agentStreaks);
    const flags = flagged(conditionsNow(), now.facts, agentStreaks);
    const orchestrator = agent.parentAgentId;
    if (flags.length === 0 || orchestrator === null) return;

    await tell(orchestrator, MESSAGES.stallSuspected(subject, flags.map((condition) => condition.says)), host);
  });

  hooks.onArchived(({ agent }) => {
    seen.delete(agent.id);
    streaks.delete(agent.id);
    held.delete(agent.id);
    watched.delete(agent.id);
    flaggedAt.delete(agent.id);
    tickStreaks.delete(agent.id);
  });
}
