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
  PermissionResolvedEvent,
  SessionOpenRequest,
  TimelineRow,
  TurnEndedEvent,
} from "../../server/host.ts";

type BeforeCreate = (request: CreateRequest, host: Host) => CreateChange | void | Promise<CreateChange | void>;

type BeforeSessionOpen = (request: SessionOpenRequest, host: Host) => CreateChange | void | Promise<CreateChange | void>;

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
  private readonly titles = new Map<string, string>();
  private readonly running = new Set<string>();
  private readonly created: Handler<CreatedEvent>[] = [];
  private readonly archived: Handler<ArchivedEvent>[] = [];
  private readonly turnEnded: Handler<TurnEndedEvent>[] = [];
  private readonly permissionRequested: Handler<PermissionRequestedEvent>[] = [];
  private readonly permissionResolved: Handler<PermissionResolvedEvent>[] = [];
  private readonly beforeCreates: BeforeCreate[] = [];
  private readonly beforeSessionOpens: BeforeSessionOpen[] = [];
  private waitingCounter: ((agentId: string) => number | Promise<number>) | null = null;
  private budgetSpentServer: ((agentId: string) => boolean | Promise<boolean>) | null = null;

  /** Sets the labels `labelsOf` reports for an agent. */
  setLabels(agentId: string, labels: Record<string, string>): void {
    this.labels.set(agentId, labels);
  }

  /** Sets the title `openSession` reports for an agent; an agent with none is one Paseo cannot read yet. */
  setTitle(agentId: string, title: string): void {
    this.titles.set(agentId, title);
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

  onPermissionResolved(handler: Handler<PermissionResolvedEvent>): void {
    this.permissionResolved.push(handler);
  }

  serveWaitingCount(handler: (agentId: string) => number | Promise<number>): void {
    this.waitingCounter = handler;
  }

  serveBudgetSpent(handler: (agentId: string) => boolean | Promise<boolean>): void {
    this.budgetSpentServer = handler;
  }

  beforeCreate(handler: BeforeCreate): void {
    this.beforeCreates.push(handler);
  }

  beforeSessionOpen(handler: BeforeSessionOpen): void {
    this.beforeSessionOpens.push(handler);
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

  emitPermissionResolved(event: PermissionResolvedEvent): Promise<void> {
    return this.run("agent.permission_resolved", this.permissionResolved, event);
  }

  /** What the composer pill would read: the served count, zero when none is served or the handler throws (T4). */
  async waitingCount(agentId: string): Promise<number> {
    if (this.waitingCounter === null) return 0;
    try {
      return await this.waitingCounter(agentId);
    } catch (error) {
      this.failures.push({ hook: "waiting.count", error });
      return 0;
    }
  }

  /** What the composer pill would read: the served count and whether the budget is spent; false when none is served or its handler throws (T4). */
  async pill(agentId: string): Promise<{ count: number; budgetSpent: boolean }> {
    const count = await this.waitingCount(agentId);
    if (this.budgetSpentServer === null) return { count, budgetSpent: false };
    try {
      return { count, budgetSpent: await this.budgetSpentServer(agentId) };
    } catch (error) {
      this.failures.push({ hook: "waiting.count", error });
      return { count, budgetSpent: false };
    }
  }

  /** What Paseo would create with: the environment after every `beforeCreate` handler, in order. */
  async create(request: CreateRequest): Promise<CreateChange> {
    let env: Record<string, string> = { ...request.env };
    for (const handler of this.beforeCreates) {
      try {
        const change = await handler({ env, title: request.title }, this);
        if (change) env = change.env;
      } catch (error) {
        this.failures.push({ hook: "agent.create", error });
      }
    }
    return { env };
  }

  /** What Paseo would open a session with: the environment after every `beforeSessionOpen` handler, in order. */
  async openSession(request: { agentId: string; env: Readonly<Record<string, string>>; reason?: SessionOpenRequest["reason"] }): Promise<CreateChange> {
    let env: Record<string, string> = { ...request.env };
    const title = this.titles.get(request.agentId) ?? null;
    const labels = { ...this.labels.get(request.agentId) };
    for (const handler of this.beforeSessionOpens) {
      try {
        const change = await handler({ agentId: request.agentId, reason: request.reason ?? "resume", env, title, labels }, this);
        if (change) env = change.env;
      } catch (error) {
        this.failures.push({ hook: "agent.session_open", error });
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
