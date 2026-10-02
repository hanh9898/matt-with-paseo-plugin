import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { delegationSample } from "./delegation-sample.mjs";
import { hint } from "./hints.mjs";
import { inRange, parseVersion } from "./range.mjs";

/**
 * `setup`: checks the prerequisites, clones this repository at the running package's version, installs the
 * Paseo plugin, the Claude Code plugin and the skills, verifies them, and prints a `## Delegation` sample.
 * Every external command goes through `ctx.run` (the runner seam, `run.mjs`), and every change is printed
 * before it runs. It reads no environment variable but `MWP_SETUP_DIR` and `CLAUDE_CONFIG_DIR` (from
 * `ctx.env`) and never prints what `gh auth status` gives back (T6).
 *
 * `ctx`: `{ run, print, env, removeDir, platform, homedir, nodeVersion, packageRoot }`; `packageRoot` is the
 * folder that holds the running package's `package.json`, `paseo-plugin.json` and `setup/paired.json`;
 * `removeDir(path)` deletes a folder, for `--remove` (the one change that is not a command). `--update` and
 * `--remove` read `MWP_STATE_DIR`, `LOCALAPPDATA` and `XDG_DATA_HOME` from `ctx.env` too, only to name the
 * plugin's state folder.
 */

const REPO = "https://github.com/hanh9898/matt-with-paseo-plugin";
const THIS_REPO = /^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)hanh9898\/matt-with-paseo-plugin(\.git)?\/?$/i;
const SKILLS_REPO = "hanh9898/matt-with-paseo";
const PASEO_ID = /"id"\s*:\s*"matt-with-paseo"/;
const CLAUDE_PLUGIN = "matt-with-paseo-plugin@matt-with-paseo-plugin";
const SKILLS_PLUGIN = "matt-with-paseo@matt-with-paseo";
const SKILL_NAMES = ["matt-with-paseo", "matt-with-paseo-streams"];
const MATTPOCOCK = "mattpocock-skills";
const NODE_RANGE = ">=22.18.0";
const APPLIED = /"appliedPaths"\s*:\s*\[[^\]]*"pluginsEnabled"/;

const USAGE = [
  "Usage: npx github:hanh9898/matt-with-paseo-plugin setup [--update | --remove] [--dry-run] [--paseo-home <path>]",
  "  --update            check out this version in the clone and update the three parts",
  "  --remove            remove what setup installed (never a prerequisite, never the plugin's state folder)",
  "  --dry-run           check the prerequisites and print every command setup would run, changing nothing",
  "  --paseo-home <path> pass --home <path> to every paseo command",
  "  MWP_SETUP_DIR       an absolute path for the clone (default ~/.matt-with-paseo/plugin)",
  "  CLAUDE_CONFIG_DIR   the Claude Code config folder the skills go to",
];

/**
 * Where the plugin keeps its state: the rule of `server/state-location.ts`, reproduced here because `setup/`
 * cannot import a `.ts` file under npx. `test/setup-lifecycle.test.ts` compares the two.
 */
export function stateDir(env, home, platform) {
  const set = env.MWP_STATE_DIR;
  if (set !== undefined && isAbsolute(set)) return set;
  if (platform === "win32") return join(env.LOCALAPPDATA || join(home, "AppData", "Local"), "matt-with-paseo");
  if (platform === "darwin") return join(home, "Library", "Application Support", "matt-with-paseo");
  return join(env.XDG_DATA_HOME || join(home, ".local", "share"), "matt-with-paseo");
}

/** The flags after `setup`, or null for anything setup does not take. */
function parseArgs(argv) {
  if (argv[0] !== "setup") return null;
  const options = { dryRun: false, paseoHome: null, mode: "setup" };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if ((arg === "--update" || arg === "--remove") && options.mode === "setup") options.mode = arg.slice(2);
    else if (arg === "--paseo-home" && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      options.paseoHome = argv[i + 1];
      i += 1;
    } else return null;
  }
  return options;
}

/** A command as the owner would type it. */
function show(command, args) {
  return [command, ...args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))].join(" ");
}

/** The words of a command's output, split at spaces and punctuation that never sits inside an id. */
function tokens(text) {
  return text.split(/[\s,;()[\]{}"'`|]+/).filter((token) => token !== "");
}

function readJson(root, ...path) {
  return JSON.parse(readFileSync(join(root, ...path), "utf8"));
}

export async function main(argv, ctx) {
  const options = parseArgs(argv);
  if (options === null) {
    for (const line of USAGE) ctx.print(line);
    return 2;
  }
  const set = ctx.env.MWP_SETUP_DIR;
  if (set !== undefined && set !== "" && !isAbsolute(set)) {
    ctx.print(`Stopped: MWP_SETUP_DIR must be an absolute path, not ${set}.`);
    return 2;
  }
  const dir = set !== undefined && set !== "" ? set : join(ctx.homedir, ".matt-with-paseo", "plugin");
  return setup({ ...options, dir }, ctx);
}

async function setup({ dryRun, paseoHome, dir, mode }, ctx) {
  const { print, platform } = ctx;
  const version = String(readJson(ctx.packageRoot, "package.json").version);
  const range = String(readJson(ctx.packageRoot, "paseo-plugin.json").requirements.paseo);
  const tag = String(readJson(ctx.packageRoot, "setup", "paired.json").skills);
  const configDir = ctx.env.CLAUDE_CONFIG_DIR;
  const skillsDir = configDir ? join(configDir, "skills") : join(ctx.homedir, ".claude", "skills");

  const paseo = (args) => (paseoHome === null ? args : [...args, "--home", paseoHome]);

  /** Runs a change, printed first; in a dry run, prints it only. Null when it failed. */
  async function change(command, args, options = {}) {
    const line = `${show(command, args)}${options.cwd ? ` (in ${options.cwd})` : ""}`;
    if (dryRun) {
      print(`Would run: ${line}`);
      return { code: 0, stdout: "", stderr: "" };
    }
    print(`Running: ${line}`);
    const result = await ctx.run(command, args, options);
    if (result.code !== 0) {
      print(`Failed: ${show(command, args)} exited ${result.code}`);
      if (!options.interactive && result.stderr.trim() !== "") print(result.stderr.trim());
      return null;
    }
    return result;
  }

  // Paseo 0.10.1 prints `{"source": ..., "set": true, "value": true}`; a bare `true` is read too.
  const pluginsEnabled = async () => {
    const text = (await ctx.run("paseo", paseo(["daemon", "config", "get", "pluginsEnabled"]))).stdout.trim();
    if (text === "true") return true;
    try {
      return JSON.parse(text).value === true;
    } catch {
      return false;
    }
  };
  const claudeList = async () => tokens((await ctx.run("claude", ["plugin", "list"])).stdout);

  /** The prerequisite rows: `ok`, or `off` for plugins not enabled yet, else missing with its hint. */
  async function prerequisites() {
    const rows = [];
    const row = (item, ok, detail, missing) => rows.push({ item, ok, detail, missing });

    row("Node", inRange(ctx.nodeVersion, NODE_RANGE), ctx.nodeVersion, hint("node", platform));

    const git = await ctx.run("git", ["--version"]);
    row("git", git.code === 0, (parseVersion(git.stdout) ?? []).join("."), hint("git", platform));

    // Exit code only: its output carries a masked token and is never read (T6).
    const login = await ctx.run("gh", ["auth", "status"], { discard: true });
    row("gh logged in", login.code === 0, "logged in", login.code === 127 ? hint("gh", platform) : hint("ghLogin", platform));

    const skill = await ctx.run("gh", ["skill", "--help"]);
    row("gh skill", skill.code === 0, "available", hint("ghSkill", platform));

    const claude = await ctx.run("claude", ["--version"]);
    row("Claude Code", claude.code === 0, (parseVersion(claude.stdout) ?? []).join("."), hint("claude", platform));

    const cli = await ctx.run("paseo", paseo(["--version"]));
    const paseoVersion = (parseVersion(cli.stdout) ?? []).join(".");
    const inside = cli.code === 0 && inRange(paseoVersion, range);
    row(
      "Paseo CLI",
      inside,
      `${paseoVersion}, inside ${range}`,
      cli.code === 0 ? `found ${paseoVersion || "an unknown version"}, needs ${range} (requirements.paseo); ${hint("paseo", platform)}` : hint("paseo", platform),
    );

    const daemon = await ctx.run("paseo", paseo(["daemon", "status"]));
    row("Paseo daemon", daemon.code === 0 && !/not running|stopped/i.test(daemon.stdout), "running", hint("daemon", platform));

    const enabled = await pluginsEnabled();
    rows.push({ item: "Paseo plugins enabled", ok: enabled, off: !enabled, detail: "true" });

    const list = await claudeList();
    row("Matt's skills", list.some((t) => t === MATTPOCOCK || t.startsWith(`${MATTPOCOCK}@`)), MATTPOCOCK, hint("mattpocock", platform));
    return rows;
  }

  async function paseoPluginInstalled() {
    return PASEO_ID.test((await ctx.run("paseo", paseo(["plugin", "ls", "--json"]))).stdout);
  }

  const skillsInFolder = () => SKILL_NAMES.every((name) => existsSync(join(skillsDir, name)));

  /** Prints the prerequisite rows; null, after saying so, when one is missing. */
  async function checkPrerequisites() {
    print("Prerequisites");
    const rows = await prerequisites();
    for (const r of rows) {
      if (r.ok) print(`found    ${r.item}: ${r.detail}`);
      else if (r.off) print(`off      ${r.item}: setup turns it on in step 3`);
      else print(`missing  ${r.item}: ${r.missing}`);
    }
    const missing = rows.filter((r) => !r.ok && !r.off).map((r) => r.item);
    if (missing.length > 0) {
      print(`Stopped before any change: missing ${missing.join(", ")}. Install them, then run setup again.`);
      return null;
    }
    return rows;
  }

  /** True when `dir` is a clean clone of this repository; otherwise says why not, and false. */
  async function cloneIsUsable() {
    const gitDir = await ctx.run("git", ["-C", dir, "rev-parse", "--git-dir"]);
    const origin = await ctx.run("git", ["-C", dir, "remote", "get-url", "origin"]);
    if (gitDir.code !== 0 || gitDir.stdout.trim() !== ".git" || origin.code !== 0 || !THIS_REPO.test(origin.stdout.trim())) {
      print(`Stopped: ${dir} is not a clone of ${REPO}. Move it away, or set MWP_SETUP_DIR to another folder.`);
      return false;
    }
    const status = await ctx.run("git", ["-C", dir, "status", "--porcelain"]);
    if (status.code !== 0 || status.stdout.trim() !== "") {
      print(`Stopped: ${dir} has local changes. Commit, stash or discard them, then run setup again.`);
      return false;
    }
    return true;
  }

  /** The verify table and the reload reminder; true when a row failed. */
  async function verify() {
    print("Verify");
    const again = await prerequisites();
    const after = await claudeList();
    const parts = [
      { item: "Paseo plugin", ok: await paseoPluginInstalled() },
      { item: "Claude Code plugin", ok: after.includes(CLAUDE_PLUGIN) },
      { item: "The skills", ok: after.includes(SKILLS_PLUGIN) || skillsInFolder() },
    ];
    for (const r of [...again, ...parts]) print(`${r.ok ? "pass" : "fail"}  ${r.item}`);
    print("Reload the Paseo app now: an app that was open during the install shows no pill until it reloads.");
    return [...again, ...parts].some((r) => !r.ok);
  }

  /** What `gh skill list` reports for the skills folder, as `{ name, tag }` of each skill from the skills repository. */
  async function listedSkills() {
    const listed = await ctx.run("gh", ["skill", "list", "--dir", skillsDir, "--json", "skillName,pinned,version,sourceURL"]);
    if (listed.code !== 0) return [];
    try {
      return JSON.parse(listed.stdout)
        .filter((skill) => String(skill.sourceURL).includes(SKILLS_REPO) && SKILL_NAMES.includes(skill.skillName))
        .map((skill) => ({ name: skill.skillName, tag: skill.pinned === true ? String(skill.version) : "" }));
    } catch {
      return [];
    }
  }

  /** The skills as `gh skill install` put them in `skillsDir`: both there, each from the skills repository. */
  async function skillsFromGh() {
    const listed = await listedSkills();
    return SKILL_NAMES.every((name) => listed.some((skill) => skill.name === name)) ? listed : null;
  }

  const installSkills = (force) => {
    const args = ["skill", "install", SKILLS_REPO, "--all", "--agent", "claude-code", "--scope", "user", "--pin", tag];
    if (force) args.push("--force");
    if (configDir) args.push("--dir", skillsDir);
    return change("gh", args);
  };

  /** A folder removed, printed first; in a dry run, printed only. False when it failed. */
  async function removeFolder(path) {
    if (dryRun) {
      print(`Would run: remove ${path}`);
      return true;
    }
    print(`Running: remove ${path}`);
    try {
      await ctx.removeDir(path);
      return true;
    } catch (error) {
      print(`Failed: remove ${path}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async function update() {
    if ((await checkPrerequisites()) === null) return 1;
    if (!(await pluginsEnabled())) {
      print("Stopped: Paseo plugins are not enabled, so setup has not run on this machine. Run setup first.");
      return 1;
    }

    print("The clone");
    if (!existsSync(dir)) {
      print(`Stopped: no clone at ${dir}. Run setup first; --update changed nothing.`);
      return 1;
    }
    if (!(await cloneIsUsable())) return 1;
    if ((await change("git", ["-C", dir, "fetch", "--tags"])) === null) return 1;
    const head = await ctx.run("git", ["-C", dir, "rev-parse", "HEAD"]);
    const wanted = await ctx.run("git", ["-C", dir, "rev-parse", "--verify", "--quiet", `v${version}^{commit}`]);
    if (!dryRun && wanted.code !== 0) {
      print(`Stopped: ${dir} has no tag v${version} after the fetch.`);
      return 1;
    }
    let needCi = false;
    if (head.code === 0 && wanted.code === 0 && head.stdout.trim() === wanted.stdout.trim()) print(`already at v${version}: ${dir}`);
    else {
      if ((await change("git", ["-C", dir, "checkout", `v${version}`])) === null) return 1;
      needCi = true;
    }
    if (needCi || !existsSync(join(dir, "node_modules"))) {
      if ((await change("npm", ["ci"], { cwd: dir })) === null) return 1;
    } else print("already installed: the clone's node_modules");

    print("The three parts");
    // `paseo plugin update` on a plugin installed from a folder only says "local directory; use Reload after
    // editing" (read on Paseo 0.10.1), so the reload is the update.
    if (await paseoPluginInstalled()) {
      if ((await change("paseo", paseo(["plugin", "reload", "matt-with-paseo"]))) === null) return 1;
    } else print("not installed: Paseo plugin (matt-with-paseo); run setup");

    const list = await claudeList();
    if (list.includes(CLAUDE_PLUGIN)) {
      if ((await change("claude", ["plugin", "marketplace", "update", "matt-with-paseo-plugin"])) === null) return 1;
      if ((await change("claude", ["plugin", "update", CLAUDE_PLUGIN])) === null) return 1;
    } else print(`not installed: Claude Code plugin (${CLAUDE_PLUGIN}); run setup`);

    if (list.includes(SKILLS_PLUGIN)) print(`left alone: The skills (Claude Code plugin ${SKILLS_PLUGIN}), installed some other way`);
    else if (skillsInFolder()) {
      const fromGh = await skillsFromGh();
      if (fromGh === null) print(`left alone: The skills, in ${skillsDir}, installed some other way`);
      else if (fromGh.every((skill) => skill.tag === tag)) print(`already installed: The skills, at ${tag}`);
      else if ((await installSkills(true)) === null) return 1;
    } else print("not installed: The skills; run setup");

    if (dryRun) {
      print("Verify: skipped in a dry run, which changed nothing");
      return 0;
    }
    return (await verify()) ? 1 : 0;
  }

  async function remove() {
    // Everything that can stop the run is read before the first change.
    const paseoList = await ctx.run("paseo", paseo(["plugin", "ls", "--json"]));
    const claude = await ctx.run("claude", ["plugin", "list"]);
    const marketplaces = await ctx.run("claude", ["plugin", "marketplace", "list"]);
    if (paseoList.code !== 0 || claude.code !== 0 || marketplaces.code !== 0) {
      print("Stopped before any change: paseo or claude does not answer. Start the daemon or install the CLI, then run it again.");
      return 1;
    }
    const hasClone = existsSync(dir);
    if (hasClone && !(await cloneIsUsable())) return 1;
    const list = tokens(claude.stdout);
    const fromGh = skillsInFolder() ? await skillsFromGh() : null;

    print("Removing what setup installed");
    if (PASEO_ID.test(paseoList.stdout)) {
      if ((await change("paseo", paseo(["plugin", "remove", "matt-with-paseo"]))) === null) return 1;
    } else print("not installed: Paseo plugin (matt-with-paseo)");

    if (list.includes(CLAUDE_PLUGIN)) {
      if ((await change("claude", ["plugin", "uninstall", CLAUDE_PLUGIN])) === null) return 1;
    } else print(`not installed: Claude Code plugin (${CLAUDE_PLUGIN})`);
    if (tokens(marketplaces.stdout).includes("matt-with-paseo-plugin")) {
      if ((await change("claude", ["plugin", "marketplace", "remove", "matt-with-paseo-plugin"])) === null) return 1;
    } else print("not installed: Claude Code marketplace (matt-with-paseo-plugin)");

    if (list.includes(SKILLS_PLUGIN)) print(`left alone: The skills (Claude Code plugin ${SKILLS_PLUGIN}), installed some other way`);
    else if (!skillsInFolder()) print("not installed: The skills");
    else if (fromGh === null || !fromGh.every((skill) => skill.tag === tag)) {
      print(`left alone: The skills, in ${skillsDir}, installed some other way or not at ${tag}`);
    } else {
      for (const name of SKILL_NAMES) if (!(await removeFolder(join(skillsDir, name)))) return 1;
    }

    if (hasClone) {
      if (!(await removeFolder(dir))) return 1;
    } else print(`not installed: the clone (${dir})`);

    print(`Kept: the plugin's state folder ${stateDir(ctx.env, ctx.homedir, platform)} holds the decision log; --remove never touches it.`);
    print("Not removed: the prerequisites (Node, git, gh, Claude Code, Paseo, mattpocock-skills).");
    return 0;
  }

  if (mode === "update") return update();
  if (mode === "remove") return remove();

  // 1. Prerequisites
  const rows = await checkPrerequisites();
  if (rows === null) return 1;

  // 2. The clone
  print("The clone");
  let needCi = false;
  if (!existsSync(dir)) {
    if ((await change("git", ["clone", "--branch", `v${version}`, REPO, dir])) === null) return 1;
    needCi = true;
  } else {
    if (!(await cloneIsUsable())) return 1;
    const head = await ctx.run("git", ["-C", dir, "rev-parse", "HEAD"]);
    const wanted = await ctx.run("git", ["-C", dir, "rev-parse", "--verify", "--quiet", `v${version}^{commit}`]);
    if (head.code === 0 && wanted.code === 0 && head.stdout.trim() === wanted.stdout.trim()) {
      print(`already installed: the clone at v${version}, ${dir}`);
    } else {
      if ((await change("git", ["-C", dir, "fetch", "--tags"])) === null) return 1;
      if ((await change("git", ["-C", dir, "checkout", `v${version}`])) === null) return 1;
      needCi = true;
    }
  }
  if (needCi || !existsSync(join(dir, "node_modules"))) {
    if ((await change("npm", ["ci"], { cwd: dir })) === null) return 1;
  } else print("already installed: the clone's node_modules");

  // 3. The three parts
  print("The three parts");
  if (rows.some((r) => r.off)) {
    print("Plugins are trusted code and run unsandboxed on the daemon machine. Setup now turns on pluginsEnabled:");
    if ((await change("paseo", paseo(["daemon", "config", "set", "pluginsEnabled", "true"]))) === null) return 1;
    const reload = await change("paseo", paseo(["reload", "--json"]));
    if (reload === null) return 1;
    if (!dryRun && !APPLIED.test(reload.stdout) && !(await pluginsEnabled())) {
      print("Stopped: pluginsEnabled still reads false after the reload. Check the daemon, then run setup again.");
      return 1;
    }
  }

  if (await paseoPluginInstalled()) print("already installed: Paseo plugin (matt-with-paseo)");
  else if ((await change("paseo", paseo(["plugin", "install", dir]), { interactive: true })) === null) return 1;

  const list = await claudeList();
  if (list.includes(CLAUDE_PLUGIN)) print(`already installed: Claude Code plugin (${CLAUDE_PLUGIN})`);
  else {
    if ((await change("claude", ["plugin", "marketplace", "add", dir])) === null) return 1;
    if ((await change("claude", ["plugin", "install", CLAUDE_PLUGIN])) === null) return 1;
  }

  if (list.includes(SKILLS_PLUGIN)) print(`already installed: The skills (Claude Code plugin ${SKILLS_PLUGIN}); skipped`);
  else if (skillsInFolder()) print(`already installed: The skills, in ${skillsDir} (installed some other way); skipped`);
  else if ((await installSkills(false)) === null) return 1;

  // 4. Verify
  let failed = false;
  if (dryRun) print("Verify: skipped in a dry run, which changed nothing");
  else failed = await verify();

  // 5. The ## Delegation sample
  print("Paste this into a repository's AGENTS.md to choose what the orchestrator may decide (setup writes it nowhere):");
  print(delegationSample());
  return failed ? 1 : 0;
}
