import { MESSAGES } from "../../server/messages.ts";
import { REPORT_CARD } from "../../shared/contract.ts";

/** One case of a message type as the contract writes it: its body line and its `Next:` line, with `<placeholders>` for the ids. */
export interface CaseDoc {
  body: string;
  next: string;
}

export interface MessageDoc {
  /** The name of the type in `MESSAGES`. */
  type: string;
  lead: string;
  fields: string[];
  cases: Map<string, CaseDoc>;
}

export interface CardDoc {
  id: string;
  kind: string;
  version: string;
  fields: string[];
  decidedEntry: string[];
  spendFields: string[];
  questionsFields: string[];
  buttons: string;
}

export interface ContractDoc {
  version: string | null;
  messages: MessageDoc[];
  labels: string[];
  title: string | null;
  bundleTitle: string | null;
  marks: string[];
  delegationReads: string[];
  card: CardDoc | null;
  sections: string[];
}

/** The sections the contract must hold, by heading, in the order the ticket lists them. */
export const SECTIONS = [
  "Plugin detection",
  "Message types",
  "Labels the plugin reads",
  "The ticket-agent title",
  "Checkpoint marks",
  "Answers keyed by header",
  "What the plugin reads from the delegation table",
  "The report card",
  "What the skills declare",
  "Versioning",
] as const;

export const MARKS = ["Recommendation", "Default while silent", "Door class", "One of the user's five"] as const;
export const LABELS = ["wave", "ticket", "bundle", "tickets", "stream"] as const;
export const DELEGATION_READS = ["Questions the orchestrator may decide", "Appetite"] as const;
export const TITLE = "[Wave N] <NN> <ticket name>";
export const BUNDLE_TITLE = "[Wave N] [<NN>+<NN>] <first ticket name>";

/** Stand-ins for the values a message names; the check builds each message with them and writes them back as placeholders. */
const SUBJECT = { agentId: "zz-agent", wave: "zz-wave", ticket: "zz-ticket" };
const BUNDLE = { agentId: "zz-agent", wave: "zz-wave", bundle: "zz-bundle", tickets: "zz-tickets" };
const STREAM = { agentId: "zz-agent", stream: "zz-stream" };
const REQUEST = { id: "zz-request", name: "zz-name" } as const;

/** Every message type with each case whose text differs: the key is the type's name in `MESSAGES`, the case is the name the contract gives it. */
export const SAMPLES: Record<keyof typeof MESSAGES, Record<string, string>> = {
  turnEnded: {
    completed: MESSAGES.turnEnded(SUBJECT, { kind: "completed" }),
    failed: MESSAGES.turnEnded(SUBJECT, { kind: "failed", error: { message: "zz-message", code: "zz-code" } }),
    canceled: MESSAGES.turnEnded(SUBJECT, { kind: "canceled", reason: "zz-reason" }),
    "bundle completed": MESSAGES.turnEnded(BUNDLE, { kind: "completed" }),
    "bundle failed": MESSAGES.turnEnded(BUNDLE, { kind: "failed", error: { message: "zz-message", code: "zz-code" } }),
    "bundle canceled": MESSAGES.turnEnded(BUNDLE, { kind: "canceled", reason: "zz-reason" }),
    "stream completed": MESSAGES.turnEnded(STREAM, { kind: "completed" }),
    "stream failed": MESSAGES.turnEnded(STREAM, { kind: "failed", error: { message: "zz-message", code: "zz-code" } }),
    "stream canceled": MESSAGES.turnEnded(STREAM, { kind: "canceled", reason: "zz-reason" }),
  },
  permissionRequested: {
    question: MESSAGES.permissionRequested(SUBJECT, { ...REQUEST, kind: "question" }),
    tool: MESSAGES.permissionRequested(SUBJECT, { ...REQUEST, kind: "tool" }),
    "bundle question": MESSAGES.permissionRequested(BUNDLE, { ...REQUEST, kind: "question" }),
    "bundle tool": MESSAGES.permissionRequested(BUNDLE, { ...REQUEST, kind: "tool" }),
    "stream question": MESSAGES.permissionRequested(STREAM, { ...REQUEST, kind: "question" }),
    "stream tool": MESSAGES.permissionRequested(STREAM, { ...REQUEST, kind: "tool" }),
  },
  created: { created: MESSAGES.created(SUBJECT), bundle: MESSAGES.created(BUNDLE) },
  archived: { archived: MESSAGES.archived(SUBJECT), "bundle archived": MESSAGES.archived(BUNDLE), "stream archived": MESSAGES.archived(STREAM) },
  humanWords: { humanWords: MESSAGES.humanWords(SUBJECT, ["zz-m1", "zz-m2"]), bundle: MESSAGES.humanWords(BUNDLE, ["zz-m1", "zz-m2"]) },
  stallSuspected: {
    stallSuspected: MESSAGES.stallSuspected(SUBJECT, ["zz-says"]),
    bundle: MESSAGES.stallSuspected(BUNDLE, ["zz-says"]),
    "stream running": MESSAGES.stallSuspected(STREAM, ["zz-says"]),
  },
  gateCapPassed: { gateCapPassed: MESSAGES.gateCapPassed(SUBJECT, 77, 99), bundle: MESSAGES.gateCapPassed(BUNDLE, 77, 99) },
  appetitePassed: {
    passed: MESSAGES.appetitePassed("zz-stream", 123.45, 100, false),
    partial: MESSAGES.appetitePassed("zz-stream", 123.45, 100, true),
  },
  questionBudgetSpent: { questionBudgetSpent: MESSAGES.questionBudgetSpent(88, 66) },
};

const PLACEHOLDERS: readonly (readonly [RegExp, string])[] = [
  [/zz-tickets/g, "<tickets>"],
  [/zz-ticket/g, "<ticket>"],
  [/zz-bundle/g, "<bundle>"],
  [/zz-wave/g, "<wave>"],
  [/zz-stream/g, "<stream>"],
  [/zz-agent/g, "<agent>"],
  [/zz-request/g, "<request>"],
  [/zz-name/g, "<name>"],
  [/zz-code/g, "<code>"],
  [/zz-reason/g, "<reason>"],
  [/zz-says/g, "<says>"],
  [/zz-m1, zz-m2/g, "<ids>"],
  [/\b2 messages\b/g, "<n> messages"],
  [/\b77\b/g, "<cap>"],
  [/\b99\b/g, "<running>"],
  [/zz-stream/g, "<stream>"],
  [/123\.45/g, "<spent>"],
  [/100\.00/g, "<appetite>"],
  [/\b88 questions\b/g, "<count> questions"],
  [/\b66\b/g, "<budget>"],
];

/** A text the messages module built, split into its body and its `Next:` line, with its ids written as placeholders. */
export function builtCase(text: string): CaseDoc {
  let written = text;
  for (const [pattern, placeholder] of PLACEHOLDERS) written = written.replace(pattern, placeholder);
  const at = written.lastIndexOf("\nNext: ");
  return at === -1 ? { body: written, next: "" } : { body: written.slice(0, at), next: written.slice(at + 1) };
}

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(/<[a-z]+>/g)].map((match) => match[0].slice(1, -1));
}

function ticks(line: string): string[] {
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
}

function sectionsOf(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = text.split(/^## /m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    sections.set(part.slice(0, newline).trim(), part.slice(newline + 1));
  }
  return sections;
}

function lineValue(body: string, key: string): string | null {
  const match = new RegExp(`^${key}: (.*)$`, "m").exec(body);
  return match?.[1]?.trim() ?? null;
}

/** The rows of the first table in `body`, each as its cells without the backticks that wrap them; the header and the rule are dropped. */
function tableRows(body: string): string[][] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) =>
      line
        .slice(1, -1)
        .split(" | ")
        .map((cell) => cell.trim().replace(/^\||\|$/g, "").trim().replace(/^`(.*)`$/, "$1")),
    );
}

function messagesOf(section: string): MessageDoc[] {
  return section
    .split(/^### /m)
    .slice(1)
    .map((part) => {
      const type = ticks(lineValue(part, "Type") ?? "")[0] ?? "";
      const lead = ticks(lineValue(part, "Lead") ?? "")[0] ?? "";
      const fields = ticks(lineValue(part, "Fields") ?? "");
      const cases = new Map<string, CaseDoc>();
      for (const [name, body, next] of tableRows(part)) {
        if (name !== undefined && body !== undefined && next !== undefined) cases.set(name, { body, next });
      }
      return { type, lead, fields, cases };
    });
}

function cardOf(section: string | undefined): CardDoc | null {
  if (section === undefined) return null;
  const kind = ticks(lineValue(section, "Kind") ?? "")[0];
  const version = lineValue(section, "Version");
  const fields = ticks(lineValue(section, "Fields") ?? "");
  const buttons = lineValue(section, "Buttons");
  const id = ticks(lineValue(section, "Row id") ?? "")[0] ?? "";
  const decidedEntry = ticks(lineValue(section, "Decided entry") ?? "");
  const spendFields = ticks(lineValue(section, "Spend") ?? "");
  const questionsFields = ticks(lineValue(section, "Questions") ?? "");
  if (kind === undefined || version === null || buttons === null) return null;
  return { id, kind, version, fields, decidedEntry, spendFields, questionsFields, buttons };
}

/** Reads the contract document; a part it lacks comes back empty or null, and `contractProblems` names it. */
export function parseContract(text: string): ContractDoc {
  const sections = sectionsOf(text);
  const first = (name: string, index = 0) => tableRows(sections.get(name) ?? "").map((row) => row[index] ?? "");
  return {
    version: /^Contract version: (.*)$/m.exec(text)?.[1]?.trim() ?? null,
    messages: messagesOf(sections.get("Message types") ?? ""),
    labels: first("Labels the plugin reads"),
    title: ticks(lineValue(sections.get("The ticket-agent title") ?? "", "Title") ?? "")[0] ?? null,
    bundleTitle: ticks(lineValue(sections.get("The ticket-agent title") ?? "", "Bundle title") ?? "")[0] ?? null,
    marks: first("Checkpoint marks"),
    delegationReads: first("What the plugin reads from the delegation table"),
    card: cardOf(sections.get("The report card")),
    sections: [...sections.keys()],
  };
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);
}

function messageProblems(doc: MessageDoc, built: Record<string, string>): string[] {
  const problems: string[] = [];
  const where = `message ${doc.type}`;
  const names = Object.keys(built);
  if (!same([...doc.cases.keys()], names)) {
    problems.push(`${where}: the contract lists cases [${[...doc.cases.keys()].join(", ")}] but the messages module builds [${names.join(", ")}]`);
  }
  const used: string[] = [];
  for (const [name, text] of Object.entries(built)) {
    const made = builtCase(text);
    const written = doc.cases.get(name);
    if (written === undefined) continue;
    if (written.body !== made.body) problems.push(`${where} (${name}): the contract body is "${written.body}" but the module builds "${made.body}"`);
    if (written.next !== made.next) problems.push(`${where} (${name}): the contract Next line is "${written.next}" but the module builds "${made.next}"`);
    if (made.next === "") problems.push(`${where} (${name}): the module builds no Next line`);
    if (made.body.split(": ")[0] !== doc.lead) problems.push(`${where} (${name}): the body opens with "${made.body.split(": ")[0]}", not the lead "${doc.lead}"`);
    for (const field of [...placeholdersIn(made.body), ...placeholdersIn(made.next)]) if (!used.includes(field)) used.push(field);
  }
  if (!same(doc.fields, used)) problems.push(`${where}: the contract fields are [${doc.fields.join(", ")}] but the texts name [${used.join(", ")}]`);
  return problems;
}

/** What is wrong with a contract document against the messages module and the report card constants; an empty list means they agree. */
export function contractProblems(text: string): string[] {
  const doc = parseContract(text);
  const problems: string[] = [];
  if (doc.version === null) problems.push('the contract has no line "Contract version: <n>"');
  else if (!/^[1-9]\d*$/.test(doc.version)) problems.push(`the contract version is "${doc.version}", not a whole number`);
  for (const section of SECTIONS) if (!doc.sections.includes(section)) problems.push(`the contract has no section "${section}"`);

  const built = Object.keys(SAMPLES);
  const written = doc.messages.map((message) => message.type);
  for (const type of built) if (!written.includes(type)) problems.push(`the module builds message ${type}, which the contract does not list`);
  for (const type of written) if (!built.includes(type)) problems.push(`the contract lists message ${type}, which the module does not build`);
  for (const message of doc.messages) {
    const samples = (SAMPLES as Record<string, Record<string, string> | undefined>)[message.type];
    if (samples !== undefined) problems.push(...messageProblems(message, samples));
  }

  if (!same(doc.labels, LABELS)) problems.push(`the contract labels are [${doc.labels.join(", ")}], not [${LABELS.join(", ")}]`);
  if (doc.title !== TITLE) problems.push(`the contract ticket-agent title is "${doc.title ?? ""}", not "${TITLE}"`);
  if (doc.bundleTitle !== BUNDLE_TITLE) problems.push(`the contract bundle-agent title is "${doc.bundleTitle ?? ""}", not "${BUNDLE_TITLE}"`);
  if (!same(doc.marks, MARKS)) problems.push(`the contract checkpoint marks are [${doc.marks.join(", ")}], not [${MARKS.join(", ")}]`);
  if (!same(doc.delegationReads, DELEGATION_READS)) {
    problems.push(`the contract reads [${doc.delegationReads.join(", ")}] from the delegation table, not [${DELEGATION_READS.join(", ")}]`);
  }

  const card = doc.card;
  if (card === null) problems.push("the contract has no report card with Kind, Version, Fields and Buttons lines");
  else {
    if (card.id !== REPORT_CARD.id) problems.push(`the contract card row id is "${card.id}" but the plugin builds "${REPORT_CARD.id}"`);
    if (!same(card.decidedEntry, REPORT_CARD.decidedEntry)) problems.push(`the contract card decided entry is [${card.decidedEntry.join(", ")}] but the plugin builds [${REPORT_CARD.decidedEntry.join(", ")}]`);
    if (!same(card.spendFields, REPORT_CARD.spendFields)) problems.push(`the contract card spend is [${card.spendFields.join(", ")}] but the plugin builds [${REPORT_CARD.spendFields.join(", ")}]`);
    if (!same(card.questionsFields, REPORT_CARD.questionsFields)) problems.push(`the contract card questions are [${card.questionsFields.join(", ")}] but the plugin builds [${REPORT_CARD.questionsFields.join(", ")}]`);
    if (card.kind !== REPORT_CARD.kind) problems.push(`the contract card kind is "${card.kind}" but the plugin builds "${REPORT_CARD.kind}"`);
    if (card.version !== String(REPORT_CARD.version)) problems.push(`the contract card version is "${card.version}" but the plugin builds ${REPORT_CARD.version}`);
    if (!same(card.fields, REPORT_CARD.fields)) problems.push(`the contract card fields are [${card.fields.join(", ")}] but the plugin builds [${REPORT_CARD.fields.join(", ")}]`);
    if (card.buttons !== "none") problems.push(`the contract card says buttons "${card.buttons}", and the card has none`);
  }
  return problems;
}
