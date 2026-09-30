import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isStreamAgent, isTicketAgent } from "../shared/role-labels.ts";
import { type DecidableDoor, type Delegation, readDelegation } from "../shared/delegation.ts";
import type { HostHooks } from "./host.ts";

/** The mark the skills put on the first option (`docs/contract.md`, "Checkpoint marks"). */
const RECOMMENDED = / \(Recommended\)$/;

/** What the plugin decides about one request: answers keyed by the questions' headers, or why it leaves the request to the user. */
export type Decision = { answers: Record<string, string> } | { leave: string };

function objectOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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
  if (lines.some((line) => line.startsWith("Yours:"))) return "one of the user's five";
  const door = lines.find((line) => line.startsWith("Door:"))?.slice("Door:".length).trim();
  if (door === undefined) return "no Door line";
  if (!delegation.decide.includes(door as DecidableDoor)) return "the table does not let the orchestrator decide this door";
  const first = Array.isArray(options) ? objectOf(options[0]) : null;
  const label = first?.["label"];
  if (typeof label !== "string" || !RECOMMENDED.test(label)) return "no recommendation on the first option";
  return { header, label };
}

/**
 * Decides an `AskUserQuestion` input under a delegation table. A request is answered only when every question in it
 * carries a `Door:` the table lets the orchestrator decide, no `Yours:` line and a recommended first option; one
 * question that fails leaves the whole request to the user, so a partial answer never reaches the agent. The answer
 * takes the recommended option's label, keyed by the question's `header` (T5).
 */
export function decideAnswers(delegation: Delegation | null, input: unknown): Decision {
  if (delegation === null) return { leave: "no delegation table" };
  if (!delegation.on) return { leave: "the delegation switch is off" };
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

/** What the handler reads from outside; a test passes its own. */
export type Reader = {
  /** The text of the repository's `AGENTS.md` under `cwd`, or null when there is none. */
  readTable?: (cwd: string) => Promise<string | null>;
};

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
 * the question or the answer (T6). The table is read for each request, so an edit takes effect at once.
 */
export function registerDelegatedAnswers(hooks: HostHooks, reader: Reader = {}): void {
  const readTable = reader.readTable ?? readAgentsFile;

  hooks.onPermissionRequested(async ({ agent, request }, host) => {
    if (request.kind !== "question" || request.name !== "AskUserQuestion") return;
    try {
      const labels = await host.labelsOf(agent.id);
      if (!isTicketAgent(labels) && !isStreamAgent(labels)) return;
      const text = await readTable(agent.cwd);
      const decision = decideAnswers(text === null ? null : readDelegation(text), request.input);
      if (!("answers" in decision)) return;
      await host.respondToPermission(agent.id, request.id, {
        behavior: "allow",
        updatedInput: { ...objectOf(request.input), answers: decision.answers },
      });
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      console.error(`[matt-with-paseo] delegated answer left to the user for agent ${agent.id}: ${cause}`);
    }
  });
}
