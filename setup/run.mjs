import { spawn } from "node:child_process";

/**
 * The runner seam: every command setup runs goes through `run`, and nothing else under `setup/` imports
 * `node:child_process`. Tests pass a fake runner of the same shape (`test/support/fake-runner.ts`).
 *
 * On Windows `npm`, `npx`, `claude`, `paseo` and `gh` are `.cmd` shims that Node refuses to spawn without a
 * shell, so there the runner builds one command line for `cmd.exe`, quoting every argument; no caller knows
 * the platform.
 */

const CMD_SPECIALS = /([()\][%!^"`<>&|;, *?])/g;

/** One argument for `cmd.exe` and the program's own parser: its quotes escaped, then wrapped, then cmd's specials escaped. */
export function quoteForCmd(arg) {
  let text = String(arg);
  text = text.replace(/(\\*)"/g, '$1$1\\"');
  text = text.replace(/(\\*)$/, "$1$1");
  return `"${text}"`.replace(CMD_SPECIALS, "^$1");
}

/** What to hand `spawn` for `command` and `args` on `platform`. */
export function spawnPlan(command, args, platform) {
  if (platform === "win32") {
    return { file: [command.replace(CMD_SPECIALS, "^$1"), ...args.map(quoteForCmd)].join(" "), args: [], shell: true };
  }
  return { file: command, args: [...args], shell: false };
}

/**
 * Runs `command` with `args` and resolves to `{ code, stdout, stderr }`; it never rejects.
 * `options.cwd` sets the folder; `options.interactive` hands the command the terminal (its stdin, stdout and
 * stderr), for a command that may ask; `options.discard` drops the output unread. Otherwise stdin is closed
 * and the output is collected. A command that cannot start answers code 127 with the error's message.
 */
export function run(command, args, options = {}) {
  const plan = spawnPlan(command, args, process.platform);
  const stdio = options.interactive ? "inherit" : options.discard ? "ignore" : ["ignore", "pipe", "pipe"];
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawn(plan.file, plan.args, { cwd: options.cwd, shell: plan.shell, stdio, windowsHide: true });
    } catch (error) {
      resolve({ code: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) });
      return;
    }
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ code: 127, stdout, stderr: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
