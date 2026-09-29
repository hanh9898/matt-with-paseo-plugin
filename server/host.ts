/**
 * The host port: the one interface through which the plugin reaches Paseo (T2). Hook handlers import this
 * module and nothing from Paseo's SDK; the real adapter (`paseo-host.ts`) is the only module that does, and
 * a test swaps in the fake (`test/support/fake-host.ts`).
 *
 * The port speaks the plugin's words and its own types, so no SDK type leaks through it. A value that
 * comes from outside (`input`, a `timeline` item) enters as `unknown` and the handler narrows it (T1).
 *
 * Interface, beyond the types:
 * - A handler takes `HostHooks` to register and receives `(event, host)`; it reaches Paseo only through
 *   that `host`, which is valid for the one call.
 * - A handler never throws into Paseo (T4): the adapter catches what it throws or rejects, logs it with the
 *   event and the agent's id, and Paseo carries on its default path. A `beforeCreate` handler that returns
 *   nothing or throws leaves the create request as it was.
 * - Every `Host` action returns a promise and rejects when Paseo refuses it.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type HostAgent = {
  id: string;
  workspaceId: string | null;
  /** The agent that created this one; null for an agent a person started. */
  parentAgentId: string | null;
  provider: string;
  cwd: string;
  title: string | null;
};

export type PermissionRequest = {
  id: string;
  name: string;
  kind: "tool" | "plan" | "question" | "mode" | "other";
  /** The tool's input as Paseo holds it: unknown until the handler narrows it. */
  input?: unknown;
};

export type TurnOutcome =
  | { kind: "completed" }
  | { kind: "failed"; error: { message: string; code?: string } }
  | { kind: "canceled"; reason: string };

/** Answers a permission request; a question's `updatedInput.answers` is keyed by the question's `header` (T5). */
export type PermissionAnswer =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message?: string };

/** A plugin-owned row in an agent's timeline; appending a row with the same `id` replaces the earlier one. */
export type TimelineRow = { id?: string; kind: string; version: number; data: Json };

export type CreatedEvent = { agent: HostAgent };
export type ArchivedEvent = { agent: HostAgent };
export type TurnEndedEvent = { agent: HostAgent; outcome: TurnOutcome; timeline: readonly unknown[] };
export type PermissionRequestedEvent = { agent: HostAgent; request: PermissionRequest };
/** A request settled, however it was answered; the answer itself stays out: it can carry a credential (T6). */
export type PermissionResolvedEvent = { agent: HostAgent; requestId: string };

/**
 * What Paseo is about to create an agent with. Neither labels nor an agent id exist yet, so the title is the
 * only mark of who the agent is; it is absent when the creator gave none.
 */
export type CreateRequest = { env: Readonly<Record<string, string>>; title?: string | null };
/** What a `beforeCreate` handler changes: the environment the agent is created with, whole. */
export type CreateChange = { env: Record<string, string> };

/** What a handler does with Paseo: the actions it may take while handling one event. */
export interface Host {
  /** The labels Paseo holds for an agent; empty when it has none or is unknown. */
  labelsOf(agentId: string): Promise<Record<string, string>>;
  /** Whether Paseo reports the agent in a turn right now; false when it is idle, gone or unknown. */
  isRunning(agentId: string): Promise<boolean>;
  /** Sends a message to an agent as a prompt. */
  send(agentId: string, text: string): Promise<void>;
  respondToPermission(agentId: string, requestId: string, answer: PermissionAnswer): Promise<void>;
  appendTimelineRow(agentId: string, row: TimelineRow): Promise<void>;
}

export type Handler<E> = (event: E, host: Host) => void | Promise<void>;

/** Where a handler subscribes to what Paseo does. */
export interface HostHooks {
  onCreated(handler: Handler<CreatedEvent>): void;
  onArchived(handler: Handler<ArchivedEvent>): void;
  onTurnEnded(handler: Handler<TurnEndedEvent>): void;
  onPermissionRequested(handler: Handler<PermissionRequestedEvent>): void;
  onPermissionResolved(handler: Handler<PermissionResolvedEvent>): void;
  /** Serves the composer pill's question, "how many things wait for the user in this agent's chat"; a handler that throws answers zero (T4). */
  serveWaitingCount(handler: (agentId: string) => number | Promise<number>): void;
  beforeCreate(
    handler: (request: CreateRequest, host: Host) => CreateChange | void | Promise<CreateChange | void>,
  ): void;
}
