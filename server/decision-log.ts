import { resolve } from "node:path";
import { defaultStateDir } from "./state-location.ts";
import { doorOf } from "./delegated-answers.ts";
import type { HostAgent, PermissionRequest } from "./host.ts";
import { readStateFile, writeStateFile } from "./state.ts";

const RECORD_FILE = "decision-log.jsonl";
const LOG_FILE = "decision-log.md";

/** What the owner reads when the log holds an entry decided without evidence. */
const NO_EVIDENCE = "no evidence; smaller option taken";

/** One decision as the record keeps it, one JSON line each. `gate` is the word in the heading; `requestId` is null when the entry is not about one request. */
export type LogEntry = {
  n: number;
  at: string;
  stream: string;
  kind: string;
  gate: string;
  asked: string;
  answer: string;
  grounds: string;
  agent: string;
  requestId: string | null;
  withoutEvidence: boolean;
  what: string;
};

/** What a caller gives for one entry: the log numbers it and stamps its time. `asked` and `answer` hold one question per line. */
export type NewEntry = {
  kind: string;
  stream: string;
  agent: string;
  asked: string;
  answer: string;
  grounds: string;
  requestId?: string;
  /** Decided without evidence: listed under `## Decided without evidence`, and its grounds are fixed. */
  withoutEvidence?: boolean;
  /** The one line the reading list shows for a flagged entry. */
  what?: string;
};

export type DecisionLogOptions = {
  /** The state directory; the default is the per-user one. Tests pass their own. */
  dir?: string;
  now?: () => string;
};

/** The absolute path of `decision-log.md`, for whoever shows the owner where to read it. */
export function decisionLogPath(dir: string = defaultStateDir()): string {
  return resolve(dir, LOG_FILE);
}

function objectOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The entries in the text of the record, oldest first; a torn or foreign line is skipped and never counts toward a number. */
export function parseLog(text: string | null): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of (text ?? "").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const value = objectOf(JSON.parse(line));
      if (value === null) continue;
      const { n, at, stream, kind, gate, asked, answer, grounds, agent, requestId, withoutEvidence, what } = value;
      if (
        typeof n === "number" && Number.isInteger(n) && n >= 1 &&
        typeof at === "string" && typeof stream === "string" && typeof kind === "string" && typeof gate === "string" &&
        typeof asked === "string" && typeof answer === "string" && typeof grounds === "string" && typeof agent === "string"
      ) {
        entries.push({
          n, at, stream, kind, gate, asked, answer, grounds, agent,
          requestId: typeof requestId === "string" ? requestId : null,
          withoutEvidence: withoutEvidence === true,
          what: typeof what === "string" ? what : "",
        });
      }
    } catch {
      // A torn or foreign line is not a decision.
    }
  }
  return entries;
}

/** One line: a newline in question text would otherwise start a heading of the owner's file. */
function fold(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, " / ").trim();
}

/** A field of several lines under its label: the first line after the label, the rest indented so the file keeps one entry per heading. */
function field(label: string, text: string): string {
  return `${label}: ${text.split("\n").map(fold).join("\n  ")}`;
}

/** `YYYY-MM-DD HH:MM` in the daemon's local time, from an ISO time; the text as it came when it is not a time. */
function localTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** The whole `decision-log.md` for a record, oldest first. */
export function renderLog(entries: LogEntry[]): string {
  const without = entries.filter((entry) => entry.withoutEvidence);
  const list = without.length === 0 ? ["None."] : without.map((entry) => `- D${entry.n}: ${fold(entry.what)} (smaller option taken), [entry](#d${entry.n})`);
  const log = entries.map((entry) =>
    [
      `<a id="d${entry.n}"></a>`,
      `### D${entry.n} — ${localTime(entry.at)} [${fold(entry.stream)}] ${fold(entry.gate)}`,
      field("Asked", entry.asked),
      field("Answer", entry.answer),
      field("Grounds", entry.withoutEvidence ? NO_EVIDENCE : entry.grounds),
    ].join("\n"),
  );
  return [
    "# Decisions",
    "",
    'Decisions the matt-with-paseo plugin took or left on the user\'s behalf. Rules: docs/contract.md, "The decision log".',
    "",
    "## Decided without evidence",
    "",
    ...list,
    "",
    "## Log",
    "",
    ...(log.length === 0 ? [] : [log.join("\n\n")]),
    "",
  ].join("\n");
}

/** The questions of an `AskUserQuestion` input, each as far as it can be read; none for an input that is not one. */
function questionsOf(input: unknown): Record<string, unknown>[] {
  const questions = objectOf(input)?.["questions"];
  if (!Array.isArray(questions)) return [];
  const found: Record<string, unknown>[] = [];
  for (const raw of questions) {
    const question = objectOf(raw);
    if (question !== null) found.push(question);
  }
  return found;
}

function labelsOfOptions(options: unknown): string[] {
  return Array.isArray(options) ? options.flatMap((raw) => { const label = objectOf(raw)?.["label"]; return typeof label === "string" ? label : []; }) : [];
}

/** One line per question: its header, its text with newlines folded, and the options it offered by label. */
function askedOf(request: PermissionRequest): string {
  const lines = questionsOf(request.input).map((question) => {
    const header = typeof question["header"] === "string" ? question["header"] : "(no header)";
    const text = typeof question["question"] === "string" ? fold(question["question"]) : "(no text)";
    return `${fold(header)}: ${text} (options: ${labelsOfOptions(question["options"]).map(fold).join(", ")})`;
  });
  return lines.length === 0 ? "(the request held no readable question)" : lines.join("\n");
}

/** The `Yours:` items a request's questions carry, in order and once each; none for a request with no `Yours:` line. */
function yoursOf(questions: Record<string, unknown>[]): string[] {
  const items: string[] = [];
  for (const question of questions) {
    const text = question["question"];
    if (typeof text !== "string") continue;
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("Yours:")) continue;
      const item = fold(line.slice("Yours:".length));
      if (!items.includes(item)) items.push(item);
    }
  }
  return items;
}

/** The clause of `Grounds:` for a delegated answer: the level and where it was read, the doors (one per question, named by its header when there are several), any `Yours:` item answered, and the recommendation. */
function groundsOfAnswer(agent: HostAgent, request: PermissionRequest, level: string): string {
  const questions = questionsOf(request.input);
  const doors = questions.map((question) => {
    const text = question["question"];
    const door = typeof text === "string" ? doorOf(text) : undefined;
    const header = question["header"];
    return questions.length > 1 && typeof header === "string" ? `${door ?? "an unread door"} (${fold(header)})` : (door ?? "an unread door");
  });
  const yours = yoursOf(questions).map((item) => `Yours: ${item} answered at level 3`);
  return [
    fold(level),
    `the ## Delegation table in ${agent.cwd}/AGENTS.md lets the orchestrator decide ${doors.join(", ")}`,
    ...yours,
    "the first option was marked (Recommended)",
  ].join("; ");
}

/** What the delegated-answers handler tells the log after it answered a request. */
export type AnsweredRequest = { agent: HostAgent; labels: Record<string, string>; request: PermissionRequest; answers: Record<string, string>; level: string };
/** What it tells the log after it left a request to the user; `reason` is the leave string or a fail-open kind, never an error's message. */
export type LeftRequest = { agent: HostAgent; labels: Record<string, string>; request: PermissionRequest; reason: string; level: string };

export type DecisionLog = {
  /** Writes one entry and renders the file; returns its number, or null when that agent's request is already in the record. Throws when the state directory cannot be written. */
  append: (entry: NewEntry) => number | null;
  /** Logs a delegated answer; never throws into the handler (T4). */
  answered: (answered: AnsweredRequest) => void;
  /** Logs a question left to the user; never throws into the handler (T4). */
  left: (left: LeftRequest) => void;
};

/**
 * The decision log: `decision-log.jsonl` is the record, `decision-log.md` the file the owner reads, rendered whole
 * after each entry. The next number is the record's highest plus one, read each time, so it survives a reload and a
 * daemon restart. Both files go through `server/state.ts`.
 */
export function createDecisionLog(options: DecisionLogOptions = {}): DecisionLog {
  const { dir } = options;
  const now = options.now ?? (() => new Date().toISOString());

  function append(entry: NewEntry): number | null {
    const text = readStateFile(RECORD_FILE, dir) ?? "";
    const entries = parseLog(text);
    if (entry.requestId !== undefined && entries.some((seen) => seen.agent === entry.agent && seen.requestId === entry.requestId)) return null;
    const n = entries.reduce((highest, seen) => Math.max(highest, seen.n), 0) + 1;
    const made: LogEntry = {
      n,
      at: now(),
      stream: entry.stream,
      kind: entry.kind,
      gate: entry.kind,
      asked: entry.asked,
      answer: entry.answer,
      grounds: entry.withoutEvidence === true ? NO_EVIDENCE : entry.grounds,
      agent: entry.agent,
      requestId: entry.requestId ?? null,
      withoutEvidence: entry.withoutEvidence === true,
      what: entry.what ?? "",
    };
    const lead = text === "" || text.endsWith("\n") ? text : `${text}\n`;
    writeStateFile(RECORD_FILE, `${lead}${JSON.stringify(made)}\n`, dir);
    writeStateFile(LOG_FILE, renderLog([...entries, made]), dir);
    return n;
  }

  /** Runs one write for a handler: a failure logs the agent's id and the kind, never the question or an error's message (T4, T6). */
  function guarded(agent: HostAgent, kind: string, write: () => void): void {
    try {
      write();
    } catch {
      console.error(`[matt-with-paseo] decision log not written for agent ${agent.id}: ${kind}`);
    }
  }

  return {
    append,
    answered: ({ agent, labels, request, answers, level }) =>
      guarded(agent, "delegated answer", () => {
        append({
          kind: "delegated answer",
          stream: labels["stream"] ?? "",
          agent: agent.id,
          requestId: request.id,
          asked: askedOf(request),
          answer: Object.entries(answers).map(([header, label]) => `${header}: ${label}`).join("\n"),
          grounds: groundsOfAnswer(agent, request, level),
        });
      }),
    left: ({ agent, labels, request, reason, level }) =>
      guarded(agent, "left to the user", () => {
        append({
          kind: "left to the user",
          stream: labels["stream"] ?? "",
          agent: agent.id,
          requestId: request.id,
          asked: askedOf(request),
          answer: `none: left to the user, who answers it in agent ${agent.id}'s chat`,
          grounds: `${fold(level)}; ${fold(reason)}`,
        });
      }),
  };
}
