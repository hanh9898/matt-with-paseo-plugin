import { ticketOf } from "../../shared/role-labels.ts";
import type { Host, HostHooks } from "../host.ts";
import { combine, MESSAGES, type Subject } from "../messages.ts";
import { type Condition, factsOf, flagged, loadConditions, type Seen, type Streaks } from "../sensor.ts";

/**
 * The stall sensor: at a ticket agent's turn end it checks the conditions in `sensor/conditions.json`, one at a
 * time, against what the turn end already carries (its outcome and the timeline), and tells the orchestrator
 * only when one is flagged. A turn that flags nothing sends nothing; the orchestrator's stall judgement, in the
 * wave skill, reads a transcript only for the case it is sent.
 *
 * A ticket agent is recognised by its labels, `wave` and `ticket`; any other agent is left alone (T3), and one
 * with no `parentAgentId` has nobody to tell. The sensor fails open (T4): conditions that cannot be loaded, or a
 * host that cannot say whether the orchestrator is busy, never stop Paseo's own path; the orchestrator then
 * judges by its own rounds, as it did before the sensor. A message for an orchestrator that is mid-turn is held
 * and goes out, as one, when that orchestrator's turn ends.
 *
 * `conditions` defaults to the shipped data; a test passes its own.
 */
export function registerStallSensor(hooks: HostHooks, conditions?: readonly Condition[]): void {
  let loaded: readonly Condition[] | null = conditions ?? null;
  const seen = new Map<string, Seen>();
  const streaks = new Map<string, Streaks>();
  const held = new Map<string, string[]>();

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

  async function subjectOf(agentId: string, host: Host): Promise<Subject | null> {
    const found = ticketOf(await host.labelsOf(agentId));
    return found === null ? null : { agentId, ...found };
  }

  hooks.onTurnEnded(async ({ agent, outcome, timeline }, host) => {
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

    const text = MESSAGES.stallSuspected(subject, flags.map((condition) => condition.says));
    if (await isBusy(orchestrator, host)) {
      held.set(orchestrator, [...(held.get(orchestrator) ?? []), text]);
      return;
    }
    await host.send(orchestrator, text);
  });

  hooks.onArchived(({ agent }) => {
    seen.delete(agent.id);
    streaks.delete(agent.id);
    held.delete(agent.id);
  });
}
