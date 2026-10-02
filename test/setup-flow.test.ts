import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { readDelegation } from "../shared/delegation.ts";
import { delegationSample } from "../setup/delegation-sample.mjs";
import { main } from "../setup/flow.mjs";
import { inRange } from "../setup/range.mjs";
import { type Answer, type Call, FakeRunner } from "./support/fake-runner.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(root, name), "utf8"));

const VERSION = String(readJson("package.json")["version"]);
const TAG = String(readJson("setup/paired.json")["skills"]);
const RANGE = String((readJson("paseo-plugin.json")["requirements"] as Record<string, unknown>)["paseo"]);
const LOW = /^>=(\d+\.\d+\.\d+)/.exec(RANGE)?.[1] ?? "";
const HIGH = /<(\d+\.\d+\.\d+)$/.exec(RANGE)?.[1] ?? "";
const REPO = "https://github.com/hanh9898/matt-with-paseo-plugin";
const SECRET = "gho_FAKE-TOKEN-THAT-MUST-NOT-PRINT";

const PREREQUISITES = ["Node", "git", "gh logged in", "gh skill", "Claude Code", "Paseo CLI", "Paseo daemon", "Paseo plugins enabled", "Matt's skills"];
const PARTS = ["Paseo plugin", "Claude Code plugin", "The skills"];

/** A command that changes the machine: everything else setup runs only reads. */
function isChange(call: Call): boolean {
  const [a, b, c] = call.args;
  switch (call.command) {
    case "git":
      return call.args.some((arg) => arg === "clone" || arg === "fetch" || arg === "checkout");
    case "npm":
      return a === "ci";
    case "paseo":
      return (a === "plugin" && b === "install") || (a === "daemon" && b === "config" && c === "set") || a === "reload";
    case "claude":
      return a === "plugin" && (b === "install" || (b === "marketplace" && c === "add"));
    case "gh":
      return a === "skill" && b === "install";
    default:
      return true;
  }
}

type State = {
  pluginsEnabled: boolean;
  paseoPlugin: boolean;
  claudePlugin: boolean;
  skillsPlugin: boolean;
  mattpocock: boolean;
};

type Options = {
  state?: Partial<State>;
  answers?: Record<string, Answer>;
  env?: Record<string, string>;
  nodeVersion?: string;
  packageRoot?: string;
};

/** A machine on the fake runner: every prerequisite present and nothing installed, unless told otherwise. */
function machine(options: Options = {}) {
  const home = mkdtempSync(join(tmpdir(), "mwp-setup-home-"));
  const state: State = { pluginsEnabled: true, paseoPlugin: false, claudePlugin: false, skillsPlugin: false, mattpocock: true, ...options.state };
  const events: string[] = [];
  const list = (): string =>
    [
      state.mattpocock ? "mattpocock-skills@claude-plugins-official  enabled" : "",
      state.claudePlugin ? "matt-with-paseo-plugin@matt-with-paseo-plugin  enabled" : "",
      state.skillsPlugin ? "matt-with-paseo@matt-with-paseo  enabled" : "",
    ].join("\n");
  const answers: Record<string, Answer> = {
    "git --version": { stdout: "git version 2.45.0\n" },
    "git clone": (call) => {
      mkdirSync(call.args[call.args.length - 1] ?? "", { recursive: true });
      return {};
    },
    "npm ci": (call) => {
      mkdirSync(join(call.options.cwd ?? "", "node_modules"), { recursive: true });
      return {};
    },
    "gh auth status": { stdout: SECRET, stderr: SECRET },
    "gh skill --help": { stdout: "Install agent skills\n" },
    "gh skill install": (call) => {
      const at = call.args.indexOf("--dir");
      const dir = at === -1 ? join(home, ".claude", "skills") : (call.args[at + 1] ?? "");
      for (const name of ["matt-with-paseo", "matt-with-paseo-streams"]) mkdirSync(join(dir, name), { recursive: true });
      return {};
    },
    "claude --version": { stdout: "2.1.0 (Claude Code)\n" },
    "claude plugin list": () => ({ stdout: list() }),
    "claude plugin install matt-with-paseo-plugin@matt-with-paseo-plugin": () => {
      state.claudePlugin = true;
      return {};
    },
    "paseo --version": { stdout: `${LOW}\n` },
    "paseo daemon status": { stdout: "Daemon running\n" },
    "paseo daemon config get pluginsEnabled": () => ({ stdout: `${state.pluginsEnabled}\n` }),
    "paseo daemon config set pluginsEnabled true": () => {
      state.pluginsEnabled = true;
      return {};
    },
    "paseo reload": { stdout: '{"appliedPaths":["pluginsEnabled"]}\n' },
    "paseo plugin ls --json": () => ({ stdout: JSON.stringify(state.paseoPlugin ? [{ id: "matt-with-paseo" }] : []) }),
    "paseo plugin install": () => {
      state.paseoPlugin = true;
      return {};
    },
    ...options.answers,
  };
  const runner = new FakeRunner(answers, events);
  const printed: string[] = [];
  const print = (text: string): void => {
    printed.push(text);
    events.push(`print ${text}`);
  };
  const go = (argv: string[] = ["setup"]): Promise<number> =>
    main(argv, {
      run: runner.run,
      print,
      env: options.env ?? {},
      platform: process.platform,
      homedir: home,
      nodeVersion: options.nodeVersion ?? "24.19.0",
      packageRoot: options.packageRoot ?? root,
    });
  const output = (): string => printed.join("\n");
  const changes = (): Call[] => runner.calls.filter(isChange);
  return { home, dir: join(home, ".matt-with-paseo", "plugin"), state, runner, events, printed, output, changes, go };
}

/** A clone already in place on disk, with its `node_modules`. */
function present(dir: string): string {
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  return dir;
}

/** The answers for a clone in place: this repository's, clean, at `v<version>` unless told otherwise. */
function clone(dir: string, over: Record<string, Answer> = {}): Record<string, Answer> {
  return {
    [`git -C ${dir} rev-parse --git-dir`]: { stdout: ".git\n" },
    [`git -C ${dir} remote get-url origin`]: { stdout: `${REPO}.git\n` },
    [`git -C ${dir} status --porcelain`]: { stdout: "" },
    [`git -C ${dir} rev-parse HEAD`]: { stdout: "abc123\n" },
    [`git -C ${dir} rev-parse --verify --quiet v${VERSION}^{commit}`]: { stdout: "abc123\n" },
    ...over,
  };
}

function dirFor(): string {
  return join(mkdtempSync(join(tmpdir(), "mwp-setup-dir-")), "plugin");
}

test("the pinned values are read from the repository, not copied into the test", () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.match(TAG, /^v\d+\.\d+\.\d+$/);
  assert.notEqual(LOW, "");
  assert.notEqual(HIGH, "");
});

test("a fresh machine records the clone at v<version>, npm ci, then the four installs with the pinned skills tag, in that order", async () => {
  const m = machine();
  assert.equal(await m.go(), 0, m.output());
  assert.deepEqual(
    m.changes().map((call) => call.line),
    [
      `git clone --branch v${VERSION} ${REPO} ${m.dir}`,
      "npm ci",
      `paseo plugin install ${m.dir}`,
      `claude plugin marketplace add ${m.dir}`,
      "claude plugin install matt-with-paseo-plugin@matt-with-paseo-plugin",
      `gh skill install hanh9898/matt-with-paseo --all --agent claude-code --scope user --pin ${TAG}`,
    ],
  );
  assert.equal(m.changes()[1]?.options.cwd, m.dir, "npm ci runs in the clone");
  assert.equal(m.changes()[2]?.options.interactive, true, "paseo plugin install may ask for trust, so it gets the terminal");
});

test("a second run with everything installed records no change command", async () => {
  const dir = present(dirFor());
  const m = machine({ env: { MWP_SETUP_DIR: dir }, state: { paseoPlugin: true, claudePlugin: true, skillsPlugin: true }, answers: clone(dir) });
  assert.equal(await m.go(), 0, m.output());
  assert.deepEqual(m.changes(), []);
  assert.match(m.output(), /already installed/);
});

test("the same machine run twice installs once", async () => {
  const dir = dirFor();
  const m = machine({ env: { MWP_SETUP_DIR: dir }, answers: clone(dir) });
  assert.equal(await m.go(), 0, m.output());
  const first = m.changes().length;
  assert.equal(first, 6);
  assert.equal(await m.go(), 0, m.output());
  assert.equal(m.changes().length, first, "the second run adds no change command");
});

test("a clone at another tag is fetched, checked out at v<version> and npm ci runs again", async () => {
  const dir = present(dirFor());
  const m = machine({
    env: { MWP_SETUP_DIR: dir },
    state: { paseoPlugin: true, claudePlugin: true, skillsPlugin: true },
    answers: clone(dir, { [`git -C ${dir} rev-parse --verify --quiet v${VERSION}^{commit}`]: { stdout: "def456\n" } }),
  });
  assert.equal(await m.go(), 0, m.output());
  assert.deepEqual(
    m.changes().map((call) => call.line),
    [`git -C ${dir} fetch --tags`, `git -C ${dir} checkout v${VERSION}`, "npm ci"],
  );
});

const MISSING: { item: string; hint: RegExp; options: Options }[] = [
  { item: "Node", hint: /nodejs\.org/, options: { nodeVersion: "22.17.0" } },
  { item: "git", hint: /git/, options: { answers: { "git --version": { code: 127 } } } },
  { item: "gh logged in", hint: /gh auth login/, options: { answers: { "gh auth status": { code: 1, stdout: SECRET, stderr: SECRET } } } },
  { item: "gh skill", hint: /update gh/i, options: { answers: { "gh skill --help": { code: 1 } } } },
  { item: "Claude Code", hint: /claude/i, options: { answers: { "claude --version": { code: 127 } } } },
  { item: "Paseo CLI", hint: /paseo\.sh/, options: { answers: { "paseo --version": { code: 127 } } } },
  { item: "Paseo CLI", hint: new RegExp(RANGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), options: { answers: { "paseo --version": { stdout: `${HIGH}\n` } } } },
  { item: "Paseo daemon", hint: /paseo daemon start/, options: { answers: { "paseo daemon status": { code: 1 } } } },
  { item: "Matt's skills", hint: /claude plugin marketplace add mattpocock\/skills.*claude plugin install mattpocock-skills@mattpocock/, options: { state: { mattpocock: false } } },
];

for (const { item, hint, options } of MISSING) {
  test(`a missing ${item} (${hint.source}) prints its row with an install hint and stops before any change`, async () => {
    const m = machine(options);
    assert.notEqual(await m.go(), 0);
    const row = m.printed.find((line) => line.startsWith("missing") && line.includes(item));
    assert.ok(row, `a missing row for ${item} in:\n${m.output()}`);
    assert.match(row, hint);
    assert.deepEqual(m.changes(), []);
  });
}

test("every prerequisite present yields a found row for each and no stop", async () => {
  const m = machine();
  assert.equal(await m.go(["setup", "--dry-run"]), 0, m.output());
  for (const item of PREREQUISITES.filter((name) => name !== "Paseo plugins enabled")) {
    assert.ok(m.printed.some((line) => line.startsWith("found") && line.includes(item)), `a found row for ${item}`);
  }
  assert.ok(!m.printed.some((line) => line.startsWith("missing")));
});

test("every missing item is listed at once", async () => {
  const m = machine({ nodeVersion: "20.0.0", answers: { "git --version": { code: 127 } } });
  assert.notEqual(await m.go(), 0);
  assert.ok(m.printed.some((line) => line.startsWith("missing") && line.includes("Node")));
  assert.ok(m.printed.some((line) => line.startsWith("missing") && line.includes("git")));
  assert.deepEqual(m.changes(), []);
});

test("gh auth status is called with its output discarded, and nothing it gave back is printed", async () => {
  for (const code of [0, 1]) {
    const m = machine({ answers: { "gh auth status": { code, stdout: SECRET, stderr: SECRET } } });
    await m.go();
    const call = m.runner.calls.find((c) => c.line === "gh auth status");
    assert.ok(call, "gh auth status is called");
    assert.equal(call.options.discard, true);
    assert.ok(!m.output().includes(SECRET), "its output appears nowhere in what setup prints");
  }
});

test("no recorded call prints the environment", async () => {
  const m = machine({ state: { pluginsEnabled: false } });
  await m.go();
  for (const call of m.runner.calls) {
    assert.doesNotMatch(call.command, /^(env|printenv|set|export|declare)$/i, call.line);
    assert.ok(!call.args.some((arg) => /^(env:?|printenv)$/i.test(arg)), call.line);
  }
});

test("the Paseo range is read from paseo-plugin.json: a version outside it fails the row", async () => {
  const other = mkdtempSync(join(tmpdir(), "mwp-setup-root-"));
  mkdirSync(join(other, "setup"));
  copyFileSync(join(root, "package.json"), join(other, "package.json"));
  copyFileSync(join(root, "setup", "paired.json"), join(other, "setup", "paired.json"));
  writeFileSync(join(other, "paseo-plugin.json"), `${JSON.stringify({ id: "matt-with-paseo", requirements: { paseo: ">=9.0.0 <10.0.0" } }, null, 2)}\n`);
  const m = machine({ packageRoot: other });
  assert.notEqual(await m.go(), 0);
  const row = m.printed.find((line) => line.startsWith("missing") && line.includes("Paseo CLI"));
  assert.ok(row, m.output());
  assert.match(row, />=9\.0\.0 <10\.0\.0/);
  assert.deepEqual(m.changes(), []);
});

test("the range check holds both bounds of the forms paseo-plugin.json uses", () => {
  assert.equal(inRange("0.10.1", ">=0.10.1 <0.11.0"), true);
  assert.equal(inRange("0.10.9", ">=0.10.1 <0.11.0"), true);
  assert.equal(inRange("0.10.0", ">=0.10.1 <0.11.0"), false);
  assert.equal(inRange("0.11.0", ">=0.10.1 <0.11.0"), false);
  assert.equal(inRange("1.0.0", ">=0.10.1 <0.11.0"), false);
  assert.equal(inRange("22.18.0", ">=22.18.0"), true);
  assert.equal(inRange("22.17.9", ">=22.18.0"), false);
  assert.equal(inRange("not a version", ">=0.10.1 <0.11.0"), false);
  assert.equal(inRange(LOW, RANGE), true);
  assert.equal(inRange(HIGH, RANGE), false);
});

test("skills installed by the Claude Code plugin route are not installed again", async () => {
  const m = machine({ state: { skillsPlugin: true } });
  assert.equal(await m.go(), 0, m.output());
  assert.ok(!m.changes().some((call) => call.command === "gh"));
});

test("skills already in the skills folder are not installed again, and setup names the folder", async () => {
  const m = machine();
  const skills = join(m.home, ".claude", "skills");
  for (const name of ["matt-with-paseo", "matt-with-paseo-streams"]) mkdirSync(join(skills, name), { recursive: true });
  assert.equal(await m.go(), 0, m.output());
  assert.ok(!m.changes().some((call) => call.command === "gh"));
  assert.ok(m.printed.some((line) => line.includes(skills)), "the folder is named");
});

test("the Claude Code plugin of this repository alone does not count as the skills", async () => {
  const m = machine({ state: { claudePlugin: true } });
  assert.equal(await m.go(), 0, m.output());
  assert.ok(m.changes().some((call) => call.command === "gh" && call.args[1] === "install"));
  assert.ok(!m.changes().some((call) => call.line.startsWith("claude plugin install")));
});

for (const [name, over] of [
  ["not a git clone", (dir: string) => ({ [`git -C ${dir} rev-parse --git-dir`]: { code: 128 } })],
  ["a clone of another repository", (dir: string) => ({ [`git -C ${dir} remote get-url origin`]: { stdout: "https://github.com/someone/else.git\n" } })],
  ["dirty", (dir: string) => ({ [`git -C ${dir} status --porcelain`]: { stdout: " M README.md\n" } })],
] as const) {
  test(`an install folder that is ${name} stops setup with its path and no change command`, async () => {
    const dir = present(dirFor());
    const m = machine({ env: { MWP_SETUP_DIR: dir }, answers: clone(dir, over(dir)) });
    assert.notEqual(await m.go(), 0);
    assert.ok(m.printed.some((line) => line.includes(dir)), m.output());
    assert.deepEqual(m.changes(), []);
  });
}

test("the SSH and .git-less forms of this repository's origin count as its clone", async () => {
  for (const origin of [REPO, "git@github.com:hanh9898/matt-with-paseo-plugin.git"]) {
    const dir = present(dirFor());
    const m = machine({
      env: { MWP_SETUP_DIR: dir },
      state: { paseoPlugin: true, claudePlugin: true, skillsPlugin: true },
      answers: clone(dir, { [`git -C ${dir} remote get-url origin`]: { stdout: `${origin}\n` } }),
    });
    assert.equal(await m.go(), 0, m.output());
  }
});

test("every change command is printed before it runs", async () => {
  const m = machine({ state: { pluginsEnabled: false } });
  assert.equal(await m.go(), 0, m.output());
  assert.ok(m.changes().length > 0);
  for (const call of m.changes()) {
    const at = m.events.indexOf(`run ${call.line}`);
    const before = m.events.slice(0, at).reverse();
    const lastPrint = before.find((event) => event.startsWith("print "));
    assert.ok(lastPrint?.includes(call.line), `printed before it runs: ${call.line}\nlast print: ${lastPrint}`);
  }
});

test("--dry-run records no change command and prints every command it would run", async () => {
  const m = machine({ state: { pluginsEnabled: false } });
  assert.equal(await m.go(["setup", "--dry-run"]), 0, m.output());
  assert.deepEqual(m.changes(), []);
  for (const line of [
    `git clone --branch v${VERSION} ${REPO} ${m.dir}`,
    "npm ci",
    "paseo daemon config set pluginsEnabled true",
    "paseo reload --json",
    `paseo plugin install ${m.dir}`,
    `claude plugin marketplace add ${m.dir}`,
    "claude plugin install matt-with-paseo-plugin@matt-with-paseo-plugin",
    `gh skill install hanh9898/matt-with-paseo --all --agent claude-code --scope user --pin ${TAG}`,
  ]) {
    assert.ok(m.printed.some((printed) => printed.includes(line)), `prints ${line}`);
  }
});

test("plugins off: setup says plugins run unsandboxed, then sets pluginsEnabled and reloads, never restarting the daemon", async () => {
  const m = machine({ state: { pluginsEnabled: false } });
  assert.equal(await m.go(), 0, m.output());
  const lines = m.changes().map((call) => call.line);
  assert.deepEqual(lines.slice(2, 4), ["paseo daemon config set pluginsEnabled true", "paseo reload --json"]);
  const warn = m.events.findIndex((event) => event.startsWith("print") && /unsandboxed/i.test(event));
  assert.ok(warn !== -1 && warn < m.events.indexOf("run paseo daemon config set pluginsEnabled true"));
  assert.ok(!m.runner.calls.some((call) => call.args.includes("restart")));
});

test("plugins off and the reload not applying it: a fresh read of pluginsEnabled decides", async () => {
  const m = machine({ state: { pluginsEnabled: false }, answers: { "paseo reload": { stdout: '{"appliedPaths":[]}\n' } } });
  assert.equal(await m.go(), 0, m.output());
  const stuck = machine({
    state: { pluginsEnabled: false },
    answers: { "paseo reload": { stdout: '{"appliedPaths":[]}\n' }, "paseo daemon config set pluginsEnabled true": {} },
  });
  assert.notEqual(await stuck.go(), 0);
  assert.ok(!stuck.changes().some((call) => call.line.startsWith("paseo plugin install")));
});

test("the verify table has one row per prerequisite and part, then the reload reminder", async () => {
  const m = machine();
  assert.equal(await m.go(), 0, m.output());
  const verify = m.printed.slice(m.printed.findIndex((line) => line === "Verify"));
  for (const item of [...PREREQUISITES, ...PARTS]) {
    assert.equal(verify.filter((line) => /^(pass|fail) /.test(line) && line.endsWith(` ${item}`)).length, 1, `one row for ${item}`);
    assert.ok(verify.some((line) => line === `pass  ${item}`), `${item} passes`);
  }
  assert.ok(m.printed.some((line) => line.startsWith("Reload the Paseo app")));
});

test("a part that still fails its check after the install fails its row and the exit code", async () => {
  const m = machine({ answers: { "paseo plugin install": {} } });
  assert.notEqual(await m.go(), 0);
  assert.ok(m.printed.includes("fail  Paseo plugin"), m.output());
  assert.ok(m.printed.some((line) => line.startsWith("Reload the Paseo app")));
});

test("a change command that fails stops setup with its command and exit code", async () => {
  const m = machine({ answers: { "git clone": { code: 128, stderr: "fatal: no route" } } });
  assert.notEqual(await m.go(), 0);
  assert.deepEqual(m.changes().map((call) => call.command), ["git"]);
  assert.ok(m.printed.some((line) => line.includes("git clone") && line.includes("128")), m.output());
});

test("the printed ## Delegation sample parses with shared/delegation.ts and reads as level 1", async () => {
  const sample = delegationSample();
  const read = readDelegation(sample);
  assert.ok(read);
  assert.equal(read.level, 1);
  assert.equal(read.levelFrom, "Level");
  for (const row of ["| Level | 1 |", "| Questions the orchestrator may decide |", "| Appetite |"]) {
    assert.ok(sample.split("\n").some((line) => line.startsWith(row)), `the sample has the row ${row}`);
  }
  assert.match(sample, /0004-three-autonomy-levels/);
  const m = machine();
  await m.go();
  assert.ok(m.output().includes(sample), "setup prints the sample");
  assert.equal(readDelegation(m.output())?.level, 1);
});

test("--paseo-home reaches every paseo call, MWP_SETUP_DIR the clone and CLAUDE_CONFIG_DIR the skills install", async () => {
  const paseoHome = join(mkdtempSync(join(tmpdir(), "mwp-setup-paseo-")), "home");
  const dir = dirFor();
  const config = mkdtempSync(join(tmpdir(), "mwp-setup-claude-"));
  const m = machine({ env: { MWP_SETUP_DIR: dir, CLAUDE_CONFIG_DIR: config }, state: { pluginsEnabled: false } });
  assert.equal(await m.go(["setup", "--paseo-home", paseoHome]), 0, m.output());
  const paseo = m.runner.calls.filter((call) => call.command === "paseo");
  assert.ok(paseo.length > 0);
  for (const call of paseo) assert.deepEqual(call.args.slice(-2), ["--home", paseoHome], call.line);
  const cloned = m.changes().find((call) => call.args.includes("clone"));
  assert.equal(cloned?.args[cloned.args.length - 1], dir);
  const skills = m.changes().find((call) => call.command === "gh");
  assert.deepEqual(skills?.args.slice(-2), ["--dir", join(config, "skills")]);
});

test("CLAUDE_CONFIG_DIR moves the skills folder setup reads", async () => {
  const config = mkdtempSync(join(tmpdir(), "mwp-setup-claude-"));
  for (const name of ["matt-with-paseo", "matt-with-paseo-streams"]) mkdirSync(join(config, "skills", name), { recursive: true });
  const m = machine({ env: { CLAUDE_CONFIG_DIR: config } });
  assert.equal(await m.go(), 0, m.output());
  assert.ok(!m.changes().some((call) => call.command === "gh"));
});

test("a relative MWP_SETUP_DIR stops setup before it runs anything", async () => {
  const m = machine({ env: { MWP_SETUP_DIR: join("relative", "dir") } });
  assert.notEqual(await m.go(), 0);
  assert.deepEqual(m.runner.calls, []);
  assert.ok(m.printed.some((line) => line.includes("MWP_SETUP_DIR")));
});

test("anything but setup, or an unknown flag, prints the usage and exits non-zero", async () => {
  for (const argv of [[], ["install"], ["setup", "--bogus"], ["setup", "--paseo-home"]]) {
    const m = machine();
    assert.notEqual(await m.go(argv), 0, argv.join(" "));
    assert.ok(m.printed.some((line) => line.startsWith("Usage")), argv.join(" "));
    assert.deepEqual(m.runner.calls, []);
  }
});
