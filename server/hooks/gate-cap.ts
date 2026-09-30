import { availableParallelism } from "node:os";
import { type Env, gateCap } from "../../shared/gate-cap.ts";
import { ticketOf } from "../../shared/role-labels.ts";
import type { Host, HostHooks } from "../host.ts";
import { combine, MESSAGES } from "../messages.ts";

/** What the handler reads about the machine; a test passes its own. */
export type Machine = { processors?: number; env?: Env };

/**
 * The gate cap at the orchestrator: a ticket agent runs its tests and setup commands, so the ticket agents that
 * run at once bound the gates that run at once. When a ticket agent is created and, with it, more ticket agents of
 * one orchestrator run than the cap allows (`shared/gate-cap.ts`), the orchestrator is told with a
 * `Gate cap passed:` message and its `Next:` line; holding the spawns back is the wave skill's part, in
 * `hanh9898/matt-with-paseo`. The plugin does not stop a spawn or a command itself.
 *
 * A ticket agent is recognised by its labels, `wave` and `ticket`; a bundle agent by `wave`, `bundle` and
 * `tickets`, and it takes one slot for the whole bundle (ADR 0010 of the skills). Any other agent is left alone
 * (T3), and one with no `parentAgentId` has nobody to tell. The handler fails open (T4): a host that cannot say who runs counts
 * that agent as not running, so it never over-counts. A message for an orchestrator that is mid-turn is held and
 * goes out when that orchestrator's turn ends.
 */
export function registerGateCap(hooks: HostHooks, machine: Machine = {}): void {
  const cap = gateCap(machine.processors ?? availableParallelism(), machine.env ?? process.env);
  /** The ticket agents seen per orchestrator, until they are archived. */
  const live = new Map<string, Set<string>>();
  const held = new Map<string, string[]>();

  async function isRunning(agentId: string, host: Host): Promise<boolean> {
    try {
      return await host.isRunning(agentId);
    } catch {
      return false;
    }
  }

  hooks.onCreated(async ({ agent }, host) => {
    const orchestrator = agent.parentAgentId;
    const found = ticketOf(await host.labelsOf(agent.id));
    if (found === null || orchestrator === null) return;

    const siblings = live.get(orchestrator) ?? new Set<string>();
    siblings.add(agent.id);
    live.set(orchestrator, siblings);
    // The new agent counts as running: its first turn has begun or is about to.
    const others = [...siblings].filter((id) => id !== agent.id);
    const running = 1 + (await Promise.all(others.map((id) => isRunning(id, host)))).filter(Boolean).length;
    if (running <= cap) return;

    const text = MESSAGES.gateCapPassed({ agentId: agent.id, ...found }, cap, running);
    if (await isRunning(orchestrator, host)) {
      held.set(orchestrator, [...(held.get(orchestrator) ?? []), text]);
      return;
    }
    await host.send(orchestrator, text);
  });

  hooks.onTurnEnded(async ({ agent }, host) => {
    const waiting = held.get(agent.id);
    if (waiting === undefined) return;
    held.delete(agent.id);
    await host.send(agent.id, combine(waiting));
  });

  hooks.onArchived(({ agent }) => {
    held.delete(agent.id);
    const orchestrator = agent.parentAgentId;
    if (orchestrator !== null) live.get(orchestrator)?.delete(agent.id);
  });
}
