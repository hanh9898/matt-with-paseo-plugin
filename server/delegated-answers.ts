import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isStreamAgent, isTicketAgent } from "../shared/role-labels.ts";
import { type DecidableDoor, type Delegation, readDelegation } from "../shared/delegation.ts";
import type { Host, HostAgent, HostHooks, PermissionRequest } from "./host.ts";
import { readStateFile, writeStateFile } from "./state.ts";

/** The mark the skills put on the first option (`docs/contract.md`, "Checkpoint marks"). */
const RECOMMENDED = / \(Recommended\)$/;

/** What the plugin decides about one request: answers keyed by the questions' headers, or why it leaves the request to the user. */
export type Decision = { answers: Record<string, string> } | { leave: string };

function objectOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The `Door:` of a question's text: the value of its first line that starts with the mark, or undefined when it has none. */
export function doorOf(text: string): string | undefined {
  return text.split(/\r?\n/).find((line) => line.startsWith("Door:"))?.slice("Door:".length).trim();
}

/** The answer to one question, or the reason it stays the user's. Narrows the untyped input as it goes (T1). */
function answerOne(delegation: Delegation, raw: unknown): { header: string; label: string } | string {
  const question = objectOf(raw);
  if (question === null) return "a question is not an object";
  const { header, question: text, options, multiSelect } = question;
  if (typeof header !== "string" || header === "") return "a question has no header";
  if (typeof text !== "string") return "a question has no text";
  if (multiSelect === true) return "a multi-select question has no single recommendation";
  const lines = text.split(/\r?\n/);
  if (delegation.level < 3 && lines.some((line) => line.startsWith("Yours:"))) return "one of the user's five (level 2)";
  const door = doorOf(text);
  if (door === undefined) return "no Door line";
  if (!delegation.decide.includes(door as DecidableDoor)) return "the table does not let the orchestrator decide this door";
  const first = Array.isArray(options) ? objectOf(options[0]) : null;
  const label = first?.["label"];
  if (typeof label !== "string" || !RECOMMENDED.test(label)) return "no recommendation on the first option";
  return { header, label };
}

/** The level a decision was taken at and where it was read, as `Grounds:` of the decision log opens (`docs/contract.md`, "The decision log"). */
export function levelGrounds(delegation: Delegation | null): string {
  if (delegation === null) return "level 1 (no delegation table)";
  const { level, levelFrom } = delegation;
  if (levelFrom === "Level") return `level ${level} (the Level row)`;
  if (levelFrom === "Switch") return `level ${level} (from Switch: ${level === 2 ? "on" : "not on"})`;
  return `level ${level} (default: no Level or Switch row)`;
}

/**
 * Decides an `AskUserQuestion` input under a delegation table (ADR 0004). Level 1 leaves every request. From level 2 a
 * request is answered only when every question in it carries a `Door:` the table lets the orchestrator decide, a
 * recommended first option and, below level 3, no `Yours:` line; one question that fails leaves the whole request to
 * the user, so a partial answer never reaches the agent, and so does a stream past its appetite at every level. The
 * answer takes the recommended option's label, keyed by the question's `header` (T5); a question with no
 * recommendation is never answered, at any level (ADR 0002, non-goal 1).
 */
export function decideAnswers(delegation: Delegation | null, input: unknown, stream: { pastAppetite?: boolean } = {}): Decision {
  if (delegation === null) return { leave: "no delegation table" };
  if (delegation.level === 1) return { leave: "level 1: nothing is delegated" };
  if (stream.pastAppetite === true) return { leave: "the stream is past its appetite" };
  const questions = objectOf(input)?.["questions"];
  if (!Array.isArray(questions) || questions.length === 0) return { leave: "no questions in the request" };
  const answers: Record<string, string> = {};
  for (const raw of questions) {
    const one = answerOne(delegation, raw);
    if (typeof one === "string") return { leave: one };
    if (one.header in answers) return { leave: "two questions share a header" };
    answers[one.header] = one.label;
  }
  return { answers };
}

/** One delegated answer as the plugin keeps it: never written to the target repository. */
export type Entry = { stream: string; agent: string; header: string; answer: string; at: string };

/** What the handler reads from outside; a test passes its own. */
export type Reader = {
  /** The text of the repository's `AGENTS.md` under `cwd`, or null when there is none. */
  readTable?: (cwd: string) => Promise<string | null>;
  /** Keeps a delegated answer outside the repository; the default appends a line to `delegated-answers.jsonl` in the state directory. */
  record?: (entry: Entry) => void;
  /** Whether a stream is past its appetite; the appetite handler (`server/appetite.ts`) supplies it, and none is past when it is left out. */
  pastAppetite?: (stream: string) => boolean;
  now?: () => string;
  /** Told of each question this handler leaves to the user, once, after the agent's role is known; the question budget (#39) counts them. `reason` is the leave string, or the kind of failure when the handler failed open, never an error's message. It never changes what the handler answers. */
  left?: (left: { agent: HostAgent; request: PermissionRequest; labels: Record<string, string>; reason: string; level: string }, host: Host) => void | Promise<void>;
  /** Told once after each request this handler answered and recorded, with the answering agent, its labels, the request and the answers sent; the report card (#41) refreshes on it and the decision log writes it. It never changes what the handler answers. */
  answered?: (answered: { agent: HostAgent; labels: Record<string, string>; request: PermissionRequest; answers: Record<string, string>; level: string }, host: Host) => void | Promise<void>;
};

const RECORD_FILE = "delegated-answers.jsonl";

/** The entries in the text of the record, oldest first; a line that is not an entry is skipped, and no text is no entries. */
export function parseEntries(text: string | null): Entry[] {
  const entries: Entry[] = [];
  for (const line of (text ?? "").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const value = objectOf(JSON.parse(line));
      if (value === null) continue;
      const { stream, agent, header, answer, at } = value;
      if (typeof stream === "string" && typeof agent === "string" && typeof header === "string" && typeof answer === "string" && typeof at === "string") {
        entries.push({ stream, agent, header, answer, at });
      }
    } catch {
      // A torn or foreign line is not a decision.
    }
  }
  return entries;
}

/** The delegated answers recorded for one stream, oldest first; none when the record is missing or cannot be read. */
export function readDelegatedAnswers(stream: string): Entry[] {
  try {
    return parseEntries(readStateFile(RECORD_FILE)).filter((entry) => entry.stream === stream);
  } catch {
    return [];
  }
}

function appendRecord(entry: Entry): void {
  writeStateFile(RECORD_FILE, `${readStateFile(RECORD_FILE) ?? ""}${JSON.stringify(entry)}\n`);
}

async function readAgentsFile(cwd: string): Promise<string | null> {
  try {
    return await readFile(join(cwd, "AGENTS.md"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Answers delegated checkpoints (ADR 0001). When a ticket agent or the stream agent asks an `AskUserQuestion` and
 * the `## Delegation` table of the asking agent's repository lets the orchestrator decide it (`decideAnswers`), the
 * plugin answers with the recommendation; anything else is left to the user.
 *
 * An agent with no role labels is left alone (T3). The handler fails open (T4): a table it cannot read, or a
 * request Paseo no longer holds, leaves the question to the user and logs one line with the agent's id, never
 * the question or the answer (T6). The table is read for each request, so an edit takes effect at once. A request
 * Paseo already resolved, or one this handler already answered, is settled and left alone (ADR 0001); each answer
 * is recorded outside the repository after Paseo takes it.
 */
export function registerDelegatedAnswers(hooks: HostHooks, reader: Reader = {}): void {
  const readTable = reader.readTable ?? readAgentsFile;
  const record = reader.record ?? appendRecord;
  const pastAppetite = reader.pastAppetite ?? (() => false);
  const now = reader.now ?? (() => new Date().toISOString());
  const left = reader.left;
  const answered = reader.answered;
  /** The requests settled per agent: resolved by anyone, or answered here once Paseo took the answer. */
  const settled = new Map<string, Set<string>>();
  /** The requests being answered here per agent: a second event for one waits on the first, and a refused answer is not settled. */
  const answering = new Map<string, Set<string>>();

  function mark(requests: Map<string, Set<string>>, agentId: string, requestId: string): void {
    const ids = requests.get(agentId) ?? new Set<string>();
    ids.add(requestId);
    requests.set(agentId, ids);
  }

  function settle(agentId: string, requestId: string): void {
    mark(settled, agentId, requestId);
  }

  hooks.onPermissionResolved(({ agent, requestId }) => settle(agent.id, requestId));
  hooks.onTurnEnded(({ agent }) => void settled.delete(agent.id));
  hooks.onArchived(({ agent }) => void settled.delete(agent.id));

  hooks.onPermissionRequested(async ({ agent, request }, host) => {
    if (request.kind !== "question" || request.name !== "AskUserQuestion") return;
    /** The labels of a recognised agent, once known: a question that stays the user's is told to `left` from then on. */
    let known: Record<string, string> | null = null;
    /** The level the table gave this request and where it was read (`levelGrounds`); not known until the table is read. */
    let level = "level unknown (the delegation table was not read)";
    /** Tells `left` that the question stays the user's, unless the request is settled meanwhile; `left` never throws into the answer. */
    async function leave(reason: string): Promise<void> {
      if (left === undefined || known === null || settled.get(agent.id)?.has(request.id)) return;
      try {
        await left({ agent, request, labels: known, reason, level }, host);
      } catch (error) {
        console.error(`[matt-with-paseo] question left to the user not told for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    /** Why the question stays the user's if the handler fails open from here on: a kind, never the error's message (T6). */
    let cause = "the delegation table could not be read";
    try {
      const labels = await host.labelsOf(agent.id);
      if (!isTicketAgent(labels) && !isStreamAgent(labels)) return;
      known = labels;
      if (settled.get(agent.id)?.has(request.id)) return;
      const stream = labels["stream"] ?? "";
      const text = await readTable(agent.cwd);
      const delegation = text === null ? null : readDelegation(text);
      level = levelGrounds(delegation);
      const decision = decideAnswers(delegation, request.input, { pastAppetite: pastAppetite(stream) });
      if (!("answers" in decision)) {
        await leave(decision.leave);
        return;
      }
      if (settled.get(agent.id)?.has(request.id) || answering.get(agent.id)?.has(request.id)) return;
      mark(answering, agent.id, request.id);
      cause = "the answer could not be sent";
      try {
        await host.respondToPermission(agent.id, request.id, {
          behavior: "allow",
          updatedInput: { ...objectOf(request.input), answers: decision.answers },
        });
      } finally {
        answering.get(agent.id)?.delete(request.id);
      }
      settle(agent.id, request.id);
      const at = now();
      try {
        for (const [header, answer] of Object.entries(decision.answers)) record({ stream, agent: agent.id, header, answer, at });
      } catch (error) {
        console.error(`[matt-with-paseo] delegated answer not recorded for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        await answered?.({ agent, labels, request, answers: decision.answers, level }, host);
      } catch (error) {
        console.error(`[matt-with-paseo] delegated answer not told for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[matt-with-paseo] delegated answer left to the user for agent ${agent.id}: ${detail}`);
      await leave(cause);
    }
  });
}
