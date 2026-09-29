import type {
  ArchivedEvent,
  CreateChange,
  CreatedEvent,
  CreateRequest,
  Handler,
  Host,
  HostHooks,
  PermissionAnswer,
  PermissionRequestedEvent,
  TimelineRow,
  TurnEndedEvent,
} from "../../server/host.ts";

type BeforeCreate = (request: CreateRequest, host: Host) => CreateChange | void | Promise<CreateChange | void>;

/**
 * The fake adapter of the host port: no daemon, no SDK. A test registers its handlers on it, emits the
 * events Paseo would send, and reads what the handlers did through `sent`, `answers` and `rows`. Like the
 * real adapter, it keeps a throwing handler out of the caller (T4) and records it in `failures`.
 */
export class FakeHost implements Host, HostHooks {
  readonly sent: { agentId: string; text: string }[] = [];
  readonly answers: { agentId: string; requestId: string; answer: PermissionAnswer }[] = [];
  readonly rows: { agentId: string; row: TimelineRow }[] = [];
  readonly failures: { hook: string; error: unknown }[] = [];

  private readonly labels = new Map<string, Record<string, string>>();
  private readonly running = new Set<string>();
  private readonly created: Handler<CreatedEvent>[] = [];
  private readonly archived: Handler<ArchivedEvent>[] = [];
  private readonly turnEnded: Handler<TurnEndedEvent>[] = [];
  private readonly permissionRequested: Handler<PermissionRequestedEvent>[] = [];
  private readonly beforeCreates: BeforeCreate[] = [];

  /** Sets the labels `labelsOf` reports for an agent. */
  setLabels(agentId: string, labels: Record<string, string>): void {
    this.labels.set(agentId, labels);
  }

  /** Sets whether `isRunning` reports an agent in a turn. */
  setRunning(agentId: string, running: boolean): void {
    if (running) this.running.add(agentId);
    else this.running.delete(agentId);
  }

  onCreated(handler: Handler<CreatedEvent>): void {
    this.created.push(handler);
  }

  onArchived(handler: Handler<ArchivedEvent>): void {
    this.archived.push(handler);
  }

  onTurnEnded(handler: Handler<TurnEndedEvent>): void {
    this.turnEnded.push(handler);
  }

  onPermissionRequested(handler: Handler<PermissionRequestedEvent>): void {
    this.permissionRequested.push(handler);
  }

  beforeCreate(handler: BeforeCreate): void {
    this.beforeCreates.push(handler);
  }

  emitCreated(event: CreatedEvent): Promise<void> {
    return this.run("agent.created", this.created, event);
  }

  emitArchived(event: ArchivedEvent): Promise<void> {
    return this.run("agent.archived", this.archived, event);
  }

  emitTurnEnded(event: TurnEndedEvent): Promise<void> {
    return this.run("agent.turn_ended", this.turnEnded, event);
  }

  emitPermissionRequested(event: PermissionRequestedEvent): Promise<void> {
    return this.run("agent.permission_requested", this.permissionRequested, event);
  }

  /** What Paseo would create with: the environment after every `beforeCreate` handler, in order. */
  async create(request: CreateRequest): Promise<CreateChange> {
    let env: Record<string, string> = { ...request.env };
    for (const handler of this.beforeCreates) {
      try {
        const change = await handler({ env }, this);
        if (change) env = change.env;
      } catch (error) {
        this.failures.push({ hook: "agent.create", error });
      }
    }
    return { env };
  }

  async labelsOf(agentId: string): Promise<Record<string, string>> {
    return { ...this.labels.get(agentId) };
  }

  async isRunning(agentId: string): Promise<boolean> {
    return this.running.has(agentId);
  }

  async send(agentId: string, text: string): Promise<void> {
    this.sent.push({ agentId, text });
  }

  async respondToPermission(agentId: string, requestId: string, answer: PermissionAnswer): Promise<void> {
    this.answers.push({ agentId, requestId, answer });
  }

  async appendTimelineRow(agentId: string, row: TimelineRow): Promise<void> {
    this.rows.push({ agentId, row });
  }

  private async run<E>(hook: string, handlers: Handler<E>[], event: E): Promise<void> {
    for (const handler of handlers) {
      try {
        await handler(event, this);
      } catch (error) {
        this.failures.push({ hook, error });
      }
    }
  }
}
