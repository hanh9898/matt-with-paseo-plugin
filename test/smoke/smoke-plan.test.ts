import assert from "node:assert/strict";
import { test } from "node:test";
import { HUMAN_STEPS, PROBES, resultLine, scrubEnv, SECTIONS, withResults, type Result } from "./smoke-plan.ts";

const OWNER = {
  PATH: "/bin",
  PASEO_HOME: "owner-home-value",
  PASEO_AGENT_ID: "owner-agent-value",
  PASEO_CLI: "owner-cli-value",
  PASEO_HUB_API_KEY: "owner-key-value",
  SOME_API_KEY: "k1",
  GITLAB_WEBHOOK_SECRET: "s1",
  CLAUDE_CODE_MESSAGING_TOKEN: "t1",
  MWP_ROLE: "keep",
};

test("scrubEnv removes every PASEO_ key and every key naming API_KEY, TOKEN or SECRET", () => {
  const { env, removed } = scrubEnv(OWNER);
  assert.deepEqual(Object.keys(env).sort(), ["MWP_ROLE", "PATH"]);
  assert.deepEqual(removed, [
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "GITLAB_WEBHOOK_SECRET",
    "PASEO_AGENT_ID",
    "PASEO_CLI",
    "PASEO_HOME",
    "PASEO_HUB_API_KEY",
    "SOME_API_KEY",
  ]);
});

test("scrubEnv returns names only: no owner value is in the removed list", () => {
  const { removed } = scrubEnv(OWNER);
  const values = new Set(Object.values(OWNER));
  assert.equal(removed.some((name) => values.has(name)), false);
});

test("scrubEnv applies scratch overrides after the scrub, and never lets an owner value through", () => {
  const { env } = scrubEnv(OWNER, { PASEO_AGENT_ID: "scratch-orchestrator", PASEO_NODE_ENV: "production" });
  assert.equal(env["PASEO_AGENT_ID"], "scratch-orchestrator");
  assert.equal(env["PASEO_NODE_ENV"], "production");
  assert.equal(Object.values(env).includes("owner-agent-value"), false);
  assert.equal(Object.values(env).includes("owner-home-value"), false);
});

test("scrubEnv leaves its input untouched", () => {
  const before = { ...OWNER };
  scrubEnv(OWNER);
  assert.deepEqual(OWNER, before);
});

test("scrubEnv skips keys whose value is undefined", () => {
  const { env } = scrubEnv({ A: undefined, B: "1" });
  assert.deepEqual(env, { B: "1" });
});

test("every probe P1 to P12 is in the table once, with the launch that runs it", () => {
  assert.deepEqual(
    PROBES.map((probe) => probe.id),
    Array.from({ length: 12 }, (_, i) => `P${i + 1}`),
  );
  for (const probe of PROBES) assert.match(probe.launch, /^(A|B|none)$/);
  assert.equal(PROBES.find((probe) => probe.id === "P8")?.launch, "A");
  assert.equal(PROBES.find((probe) => probe.id === "P12")?.launch, "none");
});

test("the section table names the 16 sections of the README once each, every probe it lists exists", () => {
  assert.equal(SECTIONS.length, 16);
  assert.equal(new Set(SECTIONS.map((section) => section.name)).size, 16);
  const ids = new Set(PROBES.map((probe) => probe.id));
  for (const section of SECTIONS) for (const id of section.probes) assert.ok(ids.has(id), `${section.name}: ${id}`);
});

test("every probe backs at least one section", () => {
  const used = new Set(SECTIONS.flatMap((section) => section.probes));
  for (const probe of PROBES) assert.ok(used.has(probe.id), probe.id);
});

test("a section with no probe is a human or a unit-tested one, and says which", () => {
  for (const section of SECTIONS) {
    if (section.probes.length === 0) assert.match(String(section.rest),/^(human|unit|runner)$/, section.name);
  }
});

const RESULT: Result = {
  section: "Gate cap",
  status: "pass",
  date: "2026-09-30",
  paseo: "0.10.1",
  os: "win32 10.0.26200",
  node: "v24.19.0",
  evidence: "Gate cap passed: ... cap of 1",
};

test("resultLine holds section, status, date, Paseo version, OS, Node and evidence, in that order", () => {
  const fields = resultLine(RESULT).replace(/^- /, "").split(" | ");
  assert.deepEqual(fields, ["Gate cap", "pass", "2026-09-30", "Paseo 0.10.1", "win32 10.0.26200", "Node v24.19.0", "Gate cap passed: ... cap of 1"]);
});

test("resultLine keeps one line: a newline in the evidence becomes a space, and a pipe is escaped", () => {
  const line = resultLine({ ...RESULT, evidence: "a\nb | c" });
  assert.equal(line.includes("\n"), false);
  assert.ok(line.endsWith("a b \\| c"));
});

test("resultLine accepts fail, human and blocked statuses", () => {
  for (const status of ["fail", "human", "blocked: provider login"] as const) {
    assert.ok(resultLine({ ...RESULT, status }).includes(` | ${status} | `));
  }
});

const README = ["# Smoke", "", "Intro line.", "", "## Results", "", "None yet.", ""].join("\n");

test("withResults replaces what follows the Results heading and keeps everything above it", () => {
  const next = withResults(README, [RESULT], ["Type one message"]);
  assert.ok(next.startsWith("# Smoke\n\nIntro line.\n\n## Results\n"));
  assert.equal(next.includes("None yet."), false);
  assert.ok(next.includes(resultLine(RESULT)));
  assert.ok(next.includes("- [ ] Type one message"));
  assert.ok(next.endsWith("\n"));
});

test("withResults twice gives the text of once with the second run's lines", () => {
  const once = withResults(README, [RESULT], []);
  const twice = withResults(once, [{ ...RESULT, status: "fail" }], []);
  assert.equal(twice.split("## Results").length, 2);
  assert.equal(twice.includes(resultLine(RESULT)), false);
  assert.ok(twice.includes(resultLine({ ...RESULT, status: "fail" })));
});

test("withResults appends the heading when the README has none", () => {
  const next = withResults("# Smoke\n", [RESULT], []);
  assert.ok(next.includes("\n## Results\n"));
});

test("HUMAN_STEPS lists the four things a script cannot do", () => {
  assert.equal(HUMAN_STEPS.length, 4);
  const text = HUMAN_STEPS.join("\n");
  for (const word of ["Claude Code", "screenshot", "message", "narrow"]) assert.ok(text.includes(word), word);
});
