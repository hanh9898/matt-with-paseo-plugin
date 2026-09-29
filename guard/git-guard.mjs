#!/usr/bin/env node
// The git guard: a PreToolUse hook that refuses the git a ticket agent must leave to the orchestrator.
//
// It follows the shape of Matt's `git-guardrails` hook (read the tool call as JSON on stdin, exit 2 with a
// message on stderr to refuse) and differs in three ways: it is Node, so one file runs on Windows, macOS and
// Linux with no shell or `jq`; it acts only when the plugin's marker is in the environment, so the
// orchestrator keeps its git; and it refuses `git checkout` and the other branch-moving commands, not only
// the destructive ones.
//
// The marker's name and value are `ROLE_ENV` and `TICKET_ROLE` in `shared/role-marker.ts`; this file is
// standalone (an agent's Node need not read TypeScript), and `test/guard-wiring.test.ts` fails when the two
// drift apart.
//
// It is a guardrail against a ticket agent's habits, not a sandbox: it reads the command as a shell would
// split it, sees through `&&`, `;`, `|`, `$( )`, `bash -c`, `eval`, `env`, `sudo` and `git -C dir`, and does
// not follow a git alias, a script it cannot read or a program that runs git for it. It fails open (T4):
// input it cannot read passes, and it reads no file and runs no program.

const ROLE_ENV = "MWP_ROLE";
const TICKET_ROLE = "ticket";

/** The tools whose `command` is a line of shell. */
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

/** Words that stand before a command without being it. */
const KEYWORDS = new Set(["if", "then", "else", "elif", "while", "until", "do", "!", "{", "}"]);

/** Programs that run the command that follows them, after options of their own. */
const WRAPPERS = new Set(["env", "command", "exec", "builtin", "sudo", "doas", "time", "nohup", "nice", "xargs"]);

/** Shells that run the script their `-c` option names. */
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);

/** `git` options that take the next word as their value. */
const OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"]);

/** Subcommands a ticket agent never runs. */
const ALWAYS = new Set(["push", "checkout", "switch", "rebase", "merge", "pull"]);

const MAX_DEPTH = 4;

/**
 * The commands of a line of shell, each as its words: quotes joined into their word, `;`, `&`, `|`, a
 * newline, parentheses, `$(` and backticks ending a command. The bodies of a `$( )` or backtick inside double
 * quotes are commands too.
 * @param {string} text
 * @returns {string[][]}
 */
function commandsOf(text) {
  /** @type {string[][]} */
  const commands = [];
  /** @type {string[]} */
  let words = [];
  /** @type {string | null} */
  let word = null;
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charAt(i);
    if (c === "'") {
      const close = text.indexOf("'", i + 1);
      const end = close === -1 ? text.length : close;
      word = (word ?? "") + text.slice(i + 1, end);
      i = end;
    } else if (c === '"') {
      let content = "";
      i += 1;
      while (i < text.length && text.charAt(i) !== '"') {
        const inner = text.charAt(i);
        const next = text.charAt(i + 1);
        if (inner === "\\" && '"\\$`'.includes(next) && next !== "") {
          content += next;
          i += 2;
        } else {
          content += inner;
          i += 1;
        }
      }
      word = (word ?? "") + content;
      for (const body of substitutionsIn(content)) commands.push(...commandsOf(body));
    } else if (c === "\\") {
      const next = text.charAt(i + 1);
      if (next !== "" && " \t\"'\\;&|()$`".includes(next)) {
        word = (word ?? "") + next;
        i += 1;
      } else {
        word = (word ?? "") + c;
      }
    } else if (c === " " || c === "\t" || c === "\r") {
      endWord();
    } else if (c === "\n" || c === ";" || c === "&" || c === "|" || c === "(" || c === ")" || c === "`") {
      endCommand();
    } else if (c === "$" && text.charAt(i + 1) === "(") {
      endCommand();
      i += 1;
    } else {
      word = (word ?? "") + c;
    }
  }
  endCommand();
  return commands;
}

/**
 * The scripts inside `$( )` and backticks in a piece of double-quoted text.
 * @param {string} content
 * @returns {string[]}
 */
function substitutionsIn(content) {
  return [...content.matchAll(/\$\(([^)]*)\)|`([^`]*)`/g)].map((match) => match[1] ?? match[2] ?? "");
}

/**
 * A program's name as a person means it: no directory, no `.exe`, lower case.
 * @param {string} word
 * @returns {string}
 */
function programOf(word) {
  const last = word.split(/[\\/]/).pop() ?? "";
  return last.replace(/\.exe$/i, "").toLowerCase();
}

/** @param {string} word */
function isAssignment(word) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

/**
 * The refused git in one command, as the words that name it; null when there is none.
 * @param {string[]} words
 * @param {number} depth
 * @returns {string | null}
 */
function refusalIn(words, depth) {
  let at = 0;
  while (at < words.length) {
    const word = words[at] ?? "";
    if (isAssignment(word) || KEYWORDS.has(word)) {
      at += 1;
    } else if (WRAPPERS.has(programOf(word))) {
      at += 1;
      while (at < words.length && ((words[at] ?? "").startsWith("-") || isAssignment(words[at] ?? ""))) at += 1;
    } else {
      break;
    }
  }
  const head = programOf(words[at] ?? "");
  const rest = words.slice(at + 1);
  if (head === "git") return refusedGit(rest);
  if (depth >= MAX_DEPTH) return null;
  if (SHELLS.has(head)) {
    const flag = rest.findIndex((word) => /^-[A-Za-z]*c[A-Za-z]*$/.test(word));
    return flag === -1 ? null : refusalInScript(rest[flag + 1] ?? "", depth + 1);
  }
  if (head === "eval") return refusalInScript(rest.join(" "), depth + 1);
  if (head === "cmd") {
    const flag = rest.findIndex((word) => /^\/[ck]$/i.test(word));
    return flag === -1 ? null : refusalInScript(rest.slice(flag + 1).join(" "), depth + 1);
  }
  if (head === "powershell" || head === "pwsh") {
    const flag = rest.findIndex((word) => /^-c(?:ommand)?$/i.test(word));
    return flag === -1 ? null : refusalInScript(rest.slice(flag + 1).join(" "), depth + 1);
  }
  return null;
}

/**
 * @param {string} script
 * @param {number} depth
 * @returns {string | null}
 */
function refusalInScript(script, depth) {
  for (const words of commandsOf(script)) {
    const found = refusalIn(words, depth);
    if (found !== null) return found;
  }
  return null;
}

/**
 * The refused git for the words after `git`: its subcommand's name and the option that makes it refused.
 * @param {string[]} args
 * @returns {string | null}
 */
function refusedGit(args) {
  let at = 0;
  while (at < args.length && (args[at] ?? "").startsWith("-")) at += OPTIONS_WITH_VALUE.has(args[at] ?? "") ? 2 : 1;
  const subcommand = args[at] ?? "";
  const rest = args.slice(at + 1);
  const shortFlags = rest.filter((word) => /^-[A-Za-z]+$/.test(word));
  if (ALWAYS.has(subcommand)) return `git ${subcommand}`;
  if (subcommand === "reset" && rest.includes("--hard")) return "git reset --hard";
  if (subcommand === "clean" && (rest.includes("--force") || shortFlags.some((word) => word.includes("f")))) return "git clean -f";
  if (subcommand === "branch" && (rest.includes("--delete") || shortFlags.some((word) => /[dD]/.test(word)))) return "git branch -D";
  if (subcommand === "restore" && rest.includes(".")) return "git restore .";
  return null;
}

/**
 * The refused git in a tool call as the hook runner sends it; null when it is not a shell command or holds none.
 * @param {unknown} call
 * @returns {string | null}
 */
function refusalOf(call) {
  if (typeof call !== "object" || call === null) return null;
  const { tool_name: tool, tool_input: input } = /** @type {Record<string, unknown>} */ (call);
  if (typeof tool !== "string" || !SHELL_TOOLS.has(tool)) return null;
  if (typeof input !== "object" || input === null) return null;
  const command = /** @type {Record<string, unknown>} */ (input)["command"];
  return typeof command === "string" ? refusalInScript(command, 0) : null;
}

/** @param {string} raw */
function decide(raw) {
  if (process.env[ROLE_ENV] !== TICKET_ROLE) return;
  let refused = null;
  try {
    refused = refusalOf(JSON.parse(raw));
  } catch {
    return;
  }
  if (refused === null) return;
  process.stderr.write(
    `Refused: ${refused} is the orchestrator's to run. A ticket agent commits on its own branch; leave pushing, branch switches, rebase, merge and history rewrites to the orchestrator, and say in your report what it should do.\n`,
  );
  process.exitCode = 2;
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => decide(raw));
process.stdin.on("error", () => {});
