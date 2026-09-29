import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

function posix(path: string): string {
  return path.split(sep).join("/");
}

/** The agent ids are the file names in harness/: an agent is data, so its id lives there and nowhere in code. */
function agentIds(): string[] {
  return readdirSync(new URL("../harness/", import.meta.url))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}

/** The plugin's code: every module the daemon or the app runs. Tests, and the data itself, are outside it. */
function product(): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map(posix)
    .filter((path) => /\.tsx?$/.test(path))
    .filter((path) => !path.split("/").some((part) => part === "node_modules" || part === ".git"))
    .filter((path) => !path.startsWith("test/"));
}

/** Lower-case words: a run of letters, split at case changes (`isClaude`, `HTMLClaude`), digits, `_` and `-`, joined by single spaces and fenced by spaces. */
function wordsOf(text: string): string {
  const words = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z]+/)
    .filter((word) => word !== "");
  return ` ${words.join(" ").toLowerCase()} `;
}

/** The ids `text` names as a word, in any case: in an identifier (`isClaude`, `CLAUDE_CONFIG_DIR`), a string or a comment. */
function named(text: string, ids: string[]): string[] {
  const words = wordsOf(text);
  return ids.filter((id) => words.includes(wordsOf(id)));
}

test("the check sees an agent id named as a word, in any case", () => {
  assert.deepEqual(named('const provider = "claude";', ["claude"]), ["claude"]);
  assert.deepEqual(named("// Claude writes it", ["claude"]), ["claude"]);
  assert.deepEqual(named("if (agent === 'codex') {}", ["claude", "codex"]), ["codex"]);
  assert.deepEqual(named("const x = 1;", ["claude"]), []);
  assert.deepEqual(named("const clauded = 1;", ["claude"]), []);
});

test("the check sees an agent id inside an identifier", () => {
  assert.deepEqual(named("process.env.CLAUDE_CONFIG_DIR", ["claude"]), ["claude"]);
  assert.deepEqual(named("const isClaude = true;", ["claude"]), ["claude"]);
  assert.deepEqual(named("const claudeLike = 1;", ["claude"]), ["claude"]);
  assert.deepEqual(named("const HTMLClaude2 = 1;", ["claude"]), ["claude"]);
  assert.deepEqual(named("run gemini-cli now", ["gemini-cli"]), ["gemini-cli"]);
});

test("harness/ holds at least one agent id, so the check below is not vacuous", () => {
  assert.ok(agentIds().length > 0);
});

test("the plugin's code names no agent id: an agent is a harness descriptor (#6)", () => {
  const ids = agentIds();
  const problems = product()
    .flatMap((path) =>
      named(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ids).map(
        (id) => `${path} names "${id}": say what the code needs of an agent in harness/${id}.json instead`,
      ),
    );
  assert.deepEqual(problems, []);
});
