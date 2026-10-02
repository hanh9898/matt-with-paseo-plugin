import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { stateDir as hostStateDir } from "../server/state-location.ts";
import { main, stateDir } from "../setup/flow.mjs";
import { type Answer, type Call, FakeRunner } from "./support/fake-runner.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(root, name), "utf8"));

const VERSION = String(readJson("package.json")["version"]);
const TAG = String(readJson("setup/paired.json")["skills"]);
const LOW = /^>=(\d+\.\d+\.\d+)/.exec(String((readJson("paseo-plugin.json")["requirements"] as Record<string, unknown>)["paseo"]))?.[1] ?? "";
const REPO = "https://github.com/hanh9898/matt-with-paseo-plugin";
const CLAUDE_PLUGIN = "matt-with-paseo-plugin@matt-with-paseo-plugin";
const SKILL_NAMES = ["matt-with-paseo", "matt-with-paseo-streams"];

/** A command that changes the machine: everything else setup runs only reads. */
function isChange(call: Call): boolean {
  const [a, b, c] = call.args;
  switch (call.command) {
    case "git":
      return call.args.some((arg) => arg === "clone" || arg === "fetch" || arg === "checkout");
    case "npm":
      return a === "ci";
    case "paseo":
      return (a === "plugin" && (b === "install" || b === "update" || b === "reload" || b === "remove")) || (a === "daemon" && b === "config" && c === "set") || a === "reload";
    case "claude":
      return a === "plugin" && (b === "install" || b === "update" || b === "uninstall" || (b === "marketplace" && (c === "add" || c === "update" || c === "remove")));
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
  marketplace: boolean;
  skillsPlugin: boolean;
  /** `gh skill list` shows the two skills as installed from the skills repository, at this tag; null: none listed. */
  skillsTag: string | null;
  /** The skill folders exist in the skills folder (whatever put them there). */
  skillFolders: boolean;
  head: string;
};

type Options = {
  state?: Partial<State>;
  /** Answers over the defaults; a function gets the clone's folder, which each machine makes for itself. */
  answers?: Record<string, Answer> | ((dir: string) => Record<string, Answer>);
  env?: Record<string, string>;
  clone?: boolean;
};

/** A machine on the fake runner with everything installed at the current versions, unless told otherwise. */
function machine(options: Options = {}) {
  const home = mkdtempSync(join(tmpdir(), "mwp-lifecycle-home-"));
  const dir = join(home, ".matt-with-paseo", "plugin");
  const skillsDir = join(home, ".claude", "skills");
  const state: State = {
    pluginsEnabled: true,
    paseoPlugin: true,
    claudePlugin: true,
    marketplace: true,
    skillsPlugin: false,
    skillsTag: TAG,
    skillFolders: true,
    head: "abc123",
    ...options.state,
  };
  if (options.clone !== false) mkdirSync(join(dir, "node_modules"), { recursive: true });
  if (state.skillFolders) for (const name of SKILL_NAMES) mkdirSync(join(skillsDir, name), { recursive: true });

  const events: string[] = [];
  const removed: string[] = [];
  const answers: Record<string, Answer> = {
    "git --version": { stdout: "git version 2.45.0\n" },
    [`git -C ${dir} rev-parse --git-dir`]: { stdout: ".git\n" },
    [`git -C ${dir} remote get-url origin`]: { stdout: `${REPO}.git\n` },
    [`git -C ${dir} status --porcelain`]: { stdout: "" },
    [`git -C ${dir} rev-parse HEAD`]: () => ({ stdout: `${state.head}\n` }),
    [`git -C ${dir} rev-parse --verify --quiet v${VERSION}^{commit}`]: { stdout: "abc123\n" },
    [`git -C ${dir} checkout v${VERSION}`]: () => {
      state.head = "abc123";
      return {};
    },
    "gh skill --help": { stdout: "Install agent skills\n" },
    "gh skill list": () => ({
      stdout: JSON.stringify(
        state.skillsTag === null
          ? []
          : SKILL_NAMES.map((name) => ({
              // As gh 2.100.0 prints it: the skills repository's folder, a slash, the skill.
              skillName: `matt-with-paseo/${name}`,
              pinned: true,
              version: state.skillsTag,
              sourceURL: "https://github.com/hanh9898/matt-with-paseo",
            })),
      ),
    }),
    "gh skill install": () => {
      state.skillsTag = TAG;
      state.skillFolders = true;
      return {};
    },
    "claude --version": { stdout: "2.1.0 (Claude Code)\n" },
    "claude plugin list": () => ({
      stdout: [
        "mattpocock-skills@claude-plugins-official  enabled",
        state.claudePlugin ? `${CLAUDE_PLUGIN}  enabled` : "",
        state.skillsPlugin ? "matt-with-paseo@matt-with-paseo  enabled" : "",
      ].join("\n"),
    }),
    "claude plugin marketplace list": () => ({ stdout: state.marketplace ? "matt-with-paseo-plugin\n" : "" }),
    [`claude plugin uninstall ${CLAUDE_PLUGIN}`]: () => {
      state.claudePlugin = false;
      return {};
    },
    "claude plugin marketplace remove matt-with-paseo-plugin": () => {
      state.marketplace = false;
      state.claudePlugin = false;
      return {};
    },
    "paseo --version": { stdout: `${LOW}\n` },
    "paseo daemon status": { stdout: "Daemon running\n" },
    "paseo daemon config get pluginsEnabled": () => ({ stdout: JSON.stringify({ source: "configured", path: "pluginsEnabled", set: true, value: state.pluginsEnabled }) }),
    "paseo plugin ls --json": () => ({ stdout: JSON.stringify(state.paseoPlugin ? [{ id: "matt-with-paseo" }] : []) }),
    "paseo plugin remove matt-with-paseo": () => {
      state.paseoPlugin = false;
      return {};
    },
    ...(typeof options.answers === "function" ? options.answers(dir) : options.answers),
  };
  const runner = new FakeRunner(answers, events);
  const printed: string[] = [];
  const print = (text: string): void => {
    printed.push(text);
    events.push(`print ${text}`);
  };
  const env = options.env ?? {};
  const go = (argv: string[]): Promise<number> =>
    main(argv, {
      run: runner.run,
      print,
      env,
      removeDir: async (path: string) => {
        events.push(`remove ${path}`);
        removed.push(path);
        rmSync(path, { recursive: true, force: true });
      },
      platform: process.platform,
      homedir: home,
      nodeVersion: "24.19.0",
      packageRoot: root,
    });
  return {
    home,
    dir,
    skillsDir,
    state,
    runner,
    events,
    removed,
    printed,
    env,
    output: (): string => printed.join("\n"),
    changes: (): Call[] => runner.calls.filter(isChange),
    lines: (): string[] => runner.calls.filter(isChange).map((call) => call.line),
    go,
  };
}

/** True when every change command and every removal is printed, with its own text, before it runs. */
function printedBeforeRun(events: string[], changes: Call[], removed: string[]): boolean {
  const said = (index: number, text: string): boolean => events.slice(0, index).some((event) => event.startsWith("print ") && event.replaceAll('"', "").includes(text));
  const commands = changes.every((call) => said(events.indexOf(`run ${call.line}`), call.line));
  return commands && removed.every((path) => said(events.indexOf(`remove ${path}`), path));
}

// Reading the flags

test("setup --update and --remove are flags, never together", async () => {
  for (const argv of [["setup", "--update", "--remove"], ["setup", "--remove", "--update"]]) {
    const m = machine();
    assert.equal(await m.go(argv), 2);
    assert.match(m.output(), /Usage:/);
    assert.deepEqual(m.runner.calls, [], "a refused line runs nothing");
  }
});

test("the usage line names --update and --remove", async () => {
  const m = machine();
  await m.go(["setup", "--bogus"]);
  assert.match(m.output(), /--update/);
  assert.match(m.output(), /--remove/);
});

test("Paseo's JSON answer to config get pluginsEnabled counts as on: setup does not set it again", async () => {
  const m = machine({ state: { paseoPlugin: false, claudePlugin: false, marketplace: false, skillsTag: null, skillFolders: false } });
  await m.go(["setup", "--dry-run"]);
  assert.ok(!m.lines().some((line) => line.includes("pluginsEnabled")), m.lines().join("\n"));
  assert.ok(!m.output().includes("off      Paseo plugins enabled"));
});

// --update

test("--update records fetch, checkout of v<version>, npm ci, the reloads and the updates, in that order", async () => {
  const m = machine({ state: { head: "old000", skillsTag: "v0.0.1" } });
  assert.equal(await m.go(["setup", "--update"]), 0, m.output());
  const skillsInstall = ["gh", "skill", "install", "hanh9898/matt-with-paseo", "--all", "--agent", "claude-code", "--scope", "user", "--pin", TAG, "--force"].join(" ");
  assert.deepEqual(m.lines(), [
    `git -C ${m.dir} fetch --tags`,
    `git -C ${m.dir} checkout v${VERSION}`,
    "npm ci",
    "paseo plugin reload matt-with-paseo",
    "claude plugin marketplace update matt-with-paseo-plugin",
    `claude plugin update ${CLAUDE_PLUGIN}`,
    skillsInstall,
  ]);
  assert.equal(m.changes()[2]?.options.cwd, m.dir, "npm ci runs in the clone");
  assert.ok(m.output().includes("Reload the Paseo app now"), "the reload reminder prints");
  assert.match(m.output(), /pass {2}Paseo plugin/);
});

test("--update re-installs the skills only when the installed tag differs from setup/paired.json", async () => {
  const same = machine({ state: { head: "old000", skillsTag: TAG } });
  await same.go(["setup", "--update"]);
  assert.ok(!same.lines().some((line) => line.startsWith("gh skill install")), "same tag: no install");
  assert.ok(same.output().includes(`already installed: The skills, at ${TAG}`));

  const differ = machine({ state: { head: "old000", skillsTag: "v0.0.1" } });
  await differ.go(["setup", "--update"]);
  assert.equal(differ.lines().filter((line) => line.startsWith("gh skill install")).length, 1);
  assert.ok(differ.lines().find((line) => line.startsWith("gh skill install"))?.endsWith("--pin " + TAG + " --force"));
});

test("--update at the right tag only fetches: no checkout and no npm ci", async () => {
  const m = machine();
  assert.equal(await m.go(["setup", "--update"]), 0, m.output());
  assert.ok(m.lines().includes(`git -C ${m.dir} fetch --tags`));
  assert.ok(!m.lines().some((line) => line.includes("checkout") || line === "npm ci"), m.lines().join("\n"));
});

test("--update leaves skills that came by another route, and says so", async () => {
  const plugin = machine({ state: { head: "old000", skillsPlugin: true, skillFolders: false, skillsTag: null } });
  await plugin.go(["setup", "--update"]);
  assert.ok(!plugin.lines().some((line) => line.startsWith("gh skill install")));
  assert.match(plugin.output(), /left alone: The skills \(Claude Code plugin matt-with-paseo@matt-with-paseo\)/);

  const folder = machine({ state: { head: "old000", skillsTag: null } });
  await folder.go(["setup", "--update"]);
  assert.ok(!folder.lines().some((line) => line.startsWith("gh skill install")));
  assert.ok(folder.output().includes(`left alone: The skills, in ${folder.skillsDir}, installed some other way`));
});

test("--update with no clone records no change command and says to run setup", async () => {
  const m = machine({ clone: false });
  assert.equal(await m.go(["setup", "--update"]), 1);
  assert.deepEqual(m.changes(), []);
  assert.ok(m.output().includes(`no clone at ${m.dir}`));
  assert.match(m.output(), /Run setup first/);
});

test("--update stops on a dirty clone with its path, and on a folder that is not this repository's clone", async () => {
  const dirty = machine({ answers: (dir) => ({ [`git -C ${dir} status --porcelain`]: { stdout: " M README.md\n" } }) });
  assert.equal(await dirty.go(["setup", "--update"]), 1);
  assert.deepEqual(dirty.changes(), []);
  assert.ok(dirty.output().includes(`${dirty.dir} has local changes`));

  const foreign = machine({ answers: (dir) => ({ [`git -C ${dir} remote get-url origin`]: { stdout: "https://github.com/someone/else.git\n" } }) });
  assert.equal(await foreign.go(["setup", "--update"]), 1);
  assert.deepEqual(foreign.changes(), []);
  assert.ok(foreign.output().includes(`${foreign.dir} is not a clone of ${REPO}`));
});

// --remove

test("--remove records one removal per installed part, then the skills and the clone, and none for a prerequisite or the state folder", async () => {
  const m = machine();
  assert.equal(await m.go(["setup", "--remove"]), 0, m.output());
  assert.deepEqual(m.lines(), [
    "paseo plugin remove matt-with-paseo",
    `claude plugin uninstall ${CLAUDE_PLUGIN}`,
    "claude plugin marketplace remove matt-with-paseo-plugin",
  ]);
  assert.deepEqual(m.removed, [...SKILL_NAMES.map((name) => join(m.skillsDir, name)), m.dir]);
  assert.ok(!existsSync(m.dir), "the clone is gone");
  const state = hostStateDir(m.env, m.home, process.platform);
  assert.ok(!m.removed.some((path) => path === state || state.startsWith(path) || path.startsWith(state)), "the state folder is not removed");
  for (const call of m.runner.calls) assert.ok(!/uninstall|remove/.test(call.line) || /matt-with-paseo/.test(call.line), call.line);
  assert.ok(m.output().includes(state), "the state folder's path is printed");
  assert.match(m.output(), /decision log/);
  assert.match(m.output(), /Kept:/);
});

test("a second --remove records no change command and removes nothing", async () => {
  const m = machine();
  await m.go(["setup", "--remove"]);
  const before = m.changes().length;
  const removedBefore = m.removed.length;
  m.printed.length = 0;
  assert.equal(await m.go(["setup", "--remove"]), 0, m.output());
  assert.equal(m.changes().length, before, "no new change command");
  assert.equal(m.removed.length, removedBefore, "nothing more removed");
  for (const part of ["Paseo plugin", "Claude Code plugin", "Claude Code marketplace", "The skills", "the clone"]) {
    assert.ok(m.output().includes(`not installed: ${part}`), `says not installed: ${part}`);
  }
});

test("--remove leaves skills from another route and names them", async () => {
  const plugin = machine({ state: { skillsPlugin: true, skillFolders: false, skillsTag: null } });
  await plugin.go(["setup", "--remove"]);
  assert.ok(!plugin.removed.some((path) => path.startsWith(plugin.skillsDir)));
  assert.match(plugin.output(), /left alone: The skills \(Claude Code plugin matt-with-paseo@matt-with-paseo\)/);

  const folder = machine({ state: { skillsTag: null } });
  await folder.go(["setup", "--remove"]);
  assert.ok(existsSync(join(folder.skillsDir, "matt-with-paseo")), "a folder gh did not install stays");
  assert.ok(folder.output().includes(`left alone: The skills, in ${folder.skillsDir}`));

  const other = machine({ state: { skillsTag: "v0.0.1" } });
  await other.go(["setup", "--remove"]);
  assert.ok(existsSync(join(other.skillsDir, "matt-with-paseo-streams")), "skills at another tag stay");
  assert.ok(other.output().includes(`not at ${TAG}`));
});

test("--remove with the skills in CLAUDE_CONFIG_DIR removes them from that folder", async () => {
  const config = mkdtempSync(join(tmpdir(), "mwp-lifecycle-claude-"));
  const m = machine({ env: { CLAUDE_CONFIG_DIR: config }, state: { skillFolders: false } });
  for (const name of SKILL_NAMES) mkdirSync(join(config, "skills", name), { recursive: true });
  await m.go(["setup", "--remove"]);
  assert.deepEqual(m.removed.slice(0, 2), SKILL_NAMES.map((name) => join(config, "skills", name)));
  assert.ok(m.runner.calls.some((call) => call.line.startsWith("gh skill list --dir " + join(config, "skills"))));
});

test("--remove stops before any change when the clone is not this repository's or has local changes", async () => {
  const dirty = machine({ answers: (dir) => ({ [`git -C ${dir} status --porcelain`]: { stdout: " M README.md\n" } }) });
  assert.equal(await dirty.go(["setup", "--remove"]), 1);
  assert.deepEqual(dirty.changes(), []);
  assert.deepEqual(dirty.removed, []);
  assert.ok(dirty.output().includes(`${dirty.dir} has local changes`));

  const foreign = machine({ answers: (dir) => ({ [`git -C ${dir} remote get-url origin`]: { stdout: "https://github.com/someone/else.git\n" } }) });
  assert.equal(await foreign.go(["setup", "--remove"]), 1);
  assert.deepEqual(foreign.changes(), []);
  assert.deepEqual(foreign.removed, []);
  assert.ok(existsSync(foreign.dir), "a folder that is not our clone is never removed");
});

test("--remove stops before any change when the daemon or Claude Code does not answer", async () => {
  const m = machine({ answers: { "paseo plugin ls --json": { code: 1, stderr: "daemon not running" } } });
  assert.equal(await m.go(["setup", "--remove"]), 1);
  assert.deepEqual(m.changes(), []);
  assert.deepEqual(m.removed, []);
});

// Both flags

test("every change command and every removal is printed before it runs, for both flags", async () => {
  const update = machine({ state: { head: "old000", skillsTag: "v0.0.1" } });
  await update.go(["setup", "--update"]);
  assert.ok(update.changes().length >= 7);
  assert.ok(printedBeforeRun(update.events, update.changes(), update.removed));

  const remove = machine();
  await remove.go(["setup", "--remove"]);
  assert.ok(remove.changes().length >= 3 && remove.removed.length === 3);
  assert.ok(printedBeforeRun(remove.events, remove.changes(), remove.removed));
});

test("--dry-run records no change command and removes nothing, for both flags", async () => {
  const update = machine({ state: { head: "old000", skillsTag: "v0.0.1" } });
  assert.equal(await update.go(["setup", "--update", "--dry-run"]), 0, update.output());
  assert.deepEqual(update.changes(), []);
  assert.match(update.output(), /Would run: git -C .* fetch --tags/);

  const remove = machine();
  assert.equal(await remove.go(["setup", "--remove", "--dry-run"]), 0, remove.output());
  assert.deepEqual(remove.changes(), []);
  assert.deepEqual(remove.removed, []);
  assert.ok(existsSync(remove.dir), "the clone is still there");
  assert.match(remove.output(), /Would run: remove /);
});

test("--paseo-home reaches every paseo call of both flags", async () => {
  for (const flag of ["--update", "--remove"]) {
    const m = machine({ state: { head: "old000" } });
    await m.go(["setup", flag, "--paseo-home", join(m.home, "paseo")]);
    const calls = m.runner.calls.filter((call) => call.command === "paseo");
    assert.ok(calls.length > 0);
    for (const call of calls) assert.deepEqual(call.args.slice(-2), ["--home", join(m.home, "paseo")], call.line);
  }
});

// The state folder

test("setup/'s state folder rule gives what server/state-location.ts gives, on every platform and environment", () => {
  const home = join(tmpdir(), "mwp-lifecycle-state-home");
  const absolute = join(tmpdir(), "mwp-lifecycle-state-set");
  const envs: Record<string, string>[] = [
    {},
    { MWP_STATE_DIR: absolute },
    { MWP_STATE_DIR: "relative/dir" },
    { LOCALAPPDATA: join(home, "local") },
    { XDG_DATA_HOME: join(home, "xdg") },
    { MWP_STATE_DIR: absolute, LOCALAPPDATA: join(home, "local"), XDG_DATA_HOME: join(home, "xdg") },
  ];
  for (const platform of ["win32", "darwin", "linux"]) {
    for (const env of envs) assert.equal(stateDir(env, home, platform), hostStateDir(env, home, platform), `${platform} ${JSON.stringify(env)}`);
  }
});
