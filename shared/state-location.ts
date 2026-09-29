import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** The directory's name under the platform's per-user data folder. */
export const STATE_DIR_NAME = "matt-with-paseo";

/** Setting it to an absolute path moves the plugin's state there; any other value is ignored. */
export const STATE_DIR_ENV = "MWP_STATE_DIR";

/**
 * The one block the plugin may write inside a target repository: the text between these two lines, in this
 * file. Everything the plugin keeps besides it lives under the state directory.
 */
export const MARKED_BLOCK = {
  file: "AGENTS.md",
  begin: "<!-- matt-with-paseo:begin -->",
  end: "<!-- matt-with-paseo:end -->",
} as const;

type Env = Readonly<Record<string, string | undefined>>;

/** Where the plugin keeps what must outlive a process: a per-user directory, never a target repository. */
export function stateDir(env: Env, home: string, platform: string): string {
  const set = env[STATE_DIR_ENV];
  if (set !== undefined && isAbsolute(set)) return set;
  if (platform === "win32") return join(env.LOCALAPPDATA || join(home, "AppData", "Local"), STATE_DIR_NAME);
  if (platform === "darwin") return join(home, "Library", "Application Support", STATE_DIR_NAME);
  return join(env.XDG_DATA_HOME || join(home, ".local", "share"), STATE_DIR_NAME);
}

/** `stateDir` for this process: its environment, its user's home and its platform. */
export function defaultStateDir(): string {
  return stateDir(process.env, homedir(), process.platform);
}

/**
 * `text` with the marked block holding `body`: replaced in place when there is one, appended when there is
 * none, and everything outside it left as it was. Markers that do not make exactly one block (one alone,
 * reversed, or repeated) throw, so the plugin never guesses which text is its own.
 */
export function withMarkedBlock(text: string, body: string): string {
  const { begin, end } = MARKED_BLOCK;
  const block = `${begin}\n${body}\n${end}\n`;
  const starts = text.split(begin).length - 1;
  const stops = text.split(end).length - 1;
  if (starts === 0 && stops === 0) return text === "" ? block : `${text}${text.endsWith("\n") ? "" : "\n"}\n${block}`;
  const first = text.indexOf(begin);
  const last = text.indexOf(end);
  if (starts !== 1 || stops !== 1 || last < first) {
    throw new Error(`${MARKED_BLOCK.file} does not hold exactly one marked block: fix or remove its markers`);
  }
  const after = text.slice(last + end.length).replace(/^\n/, "");
  return `${text.slice(0, first)}${block}${after}`;
}
