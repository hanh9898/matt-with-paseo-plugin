/**
 * What the scripted smoke runner (`run-smoke.ts`) decides without a daemon: the environment it hands the scratch
 * daemon, which probe backs which section of `test/smoke/README.md`, and how a result reaches `## Results`. Nothing
 * here starts a process or reads a file, so `smoke-plan.test.ts` runs it on every system.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** A key the scratch daemon must not inherit: the owner's Paseo settings, and anything that names a credential. */
function isOwnerKey(name: string): boolean {
  return name.startsWith("PASEO_") || /API_KEY|TOKEN|SECRET/.test(name);
}

/**
 * The environment for the scratch daemon and every `paseo` call against it: `env` without any `PASEO_*` key and
 * without any key whose name contains `API_KEY`, `TOKEN` or `SECRET`, then `overrides` (the scratch daemon's own
 * values, applied after the scrub so an owner value never comes back). `removed` holds the names, sorted, never a value.
 */
export function scrubEnv(env: Env, overrides: Readonly<Record<string, string>> = {}): { env: Record<string, string>; removed: string[] } {
  const kept: Record<string, string> = {};
  const removed: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (isOwnerKey(name)) removed.push(name);
    else if (value !== undefined) kept[name] = value;
  }
  return { env: { ...kept, ...overrides }, removed: removed.sort() };
}

/** The launch a probe needs: A sets `MWP_GATE_SHARE=0.01` for the gate cap only, B holds the rest, none needs no daemon. */
export type Launch = "A" | "B" | "none";

export type Probe = { id: string; name: string; launch: Launch };

/** Probes P1 to P12 of `ai-written-tests.md` section 4.4. */
export const PROBES: readonly Probe[] = [
  { id: "P1", name: "load", launch: "A" },
  { id: "P2", name: "relay shapes", launch: "B" },
  { id: "P3", name: "marker and resume", launch: "B" },
  { id: "P4", name: "human-words facts", launch: "B" },
  { id: "P5", name: "permission answer", launch: "B" },
  { id: "P6", name: "cost", launch: "B" },
  { id: "P7", name: "sensor", launch: "B" },
  { id: "P8", name: "gate cap", launch: "A" },
  { id: "P9", name: "state outside repo", launch: "B" },
  { id: "P10", name: "budget", launch: "B" },
  { id: "P11", name: "report card rows", launch: "B" },
  { id: "P12", name: "Claude Code plugin", launch: "none" },
];

/**
 * A section of `test/smoke/README.md`: the probes that back it, or when none does, why: `human` (a person looks at
 * it), `unit` (its logic is unit-tested and no real-host fact is left) or `runner` (the runner's own clean-up).
 */
export type Section = { name: string; probes: readonly string[]; rest: "human" | "unit" | "runner" | null };

export const SECTIONS: readonly Section[] = [
  { name: "Steps", probes: ["P1"], rest: null },
  { name: "Lifecycle relay", probes: ["P2"], rest: null },
  { name: "Waiting pill", probes: [], rest: "human" },
  { name: "Git guard", probes: ["P3"], rest: null },
  { name: "Claude Code plugin", probes: ["P12"], rest: null },
  { name: "Role identity", probes: ["P2"], rest: null },
  { name: "Human words", probes: ["P4"], rest: null },
  { name: "Cheap sensor", probes: ["P7"], rest: null },
  { name: "Gate cap", probes: ["P8"], rest: null },
  { name: "State outside the repository", probes: ["P9"], rest: null },
  { name: "Cost levels", probes: ["P6"], rest: null },
  { name: "Delegated answers", probes: ["P5"], rest: null },
  { name: "Appetite", probes: ["P6"], rest: null },
  { name: "Question budget", probes: ["P10"], rest: null },
  { name: "Report card", probes: ["P11"], rest: null },
  { name: "Clean-up", probes: [], rest: "runner" },
];

/** What only a person can do; printed at the end of a run and written under `## Results`. */
export const HUMAN_STEPS: readonly string[] = [
  "Enable the Claude Code plugin in your own Claude Code (the runner used a scratch configuration directory).",
  "Waiting pill: take three screenshots in Paseo's window, the first view, scrolled and a narrow width (step 9), and read the pill's words against `PLAIN_LABELS` in `client/pill-text.ts`.",
  "Report card: take one screenshot of the card in Paseo's window and check that no button is drawn.",
  "Human words: type one message in a ticket agent's chat in the Paseo app and keep its timeline item (it proves the app sets `clientMessageId`).",
];

export type Status = "pass" | "fail" | "human" | `blocked: ${string}`;

export type Result = {
  section: string;
  status: Status;
  date: string;
  paseo: string;
  os: string;
  node: string;
  /** The command output that decided it, or a path to it. */
  evidence: string;
};

function oneLine(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, " ").replace(/\|/g, "\\|").trim();
}

/** One result as a list line: section, status, date, Paseo version, OS, Node and the evidence, separated by ` | `. */
export function resultLine(result: Result): string {
  const fields = [result.section, result.status, result.date, `Paseo ${result.paseo}`, result.os, `Node ${result.node}`, result.evidence];
  return `- ${fields.map(oneLine).join(" | ")}`;
}

const HEADING = "## Results";

/**
 * `readme` with everything from its `## Results` heading on replaced by one line per result, then the human list as
 * unchecked items. Text above the heading is kept as it was; a README with no heading gets one at its end.
 */
export function withResults(readme: string, results: readonly Result[], human: readonly string[]): string {
  const at = readme.split("\n").findIndex((line) => line === HEADING);
  const above = at === -1 ? `${readme.replace(/\n*$/, "")}\n\n` : readme.split("\n").slice(0, at).join("\n") + "\n";
  const lines = [HEADING, "", ...results.map(resultLine), "", "Only a person can do:", "", ...human.map((step) => `- [ ] ${step}`)];
  return `${above}${lines.join("\n")}\n`;
}

/**
 * `readme` with the `## Results` line of each result's section replaced by that result, and every other line kept:
 * what an `--only` run writes. A section with no line yet goes after the last result line.
 */
export function withSectionResults(readme: string, results: readonly Result[]): string {
  const lines = readme.split("\n");
  const start = lines.findIndex((line) => line === HEADING);
  for (const result of results) {
    const at = lines.findIndex((line, i) => i > start && line.startsWith(`- ${oneLine(result.section)} | `));
    if (at !== -1) {
      lines[at] = resultLine(result);
      continue;
    }
    let last = start;
    lines.forEach((line, i) => {
      if (i > start && line.startsWith("- ") && !line.startsWith("- [ ]")) last = i;
    });
    lines.splice(last === start ? start + 2 : last + 1, 0, resultLine(result));
  }
  return lines.join("\n");
}
