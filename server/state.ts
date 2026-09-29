import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { defaultStateDir, MARKED_BLOCK, withMarkedBlock } from "../shared/state-location.ts";

/**
 * The one module that writes a file. It writes under the state directory, or into the one marked block of a
 * target repository, and nowhere else: `test/state-outside-repo.test.ts` fails when another module of the
 * plugin imports a file-writing API. A caller inside a hook handler catches what these throw (T4).
 */

/** The path of `name` inside `dir`; throws when the name is empty, absolute, or climbs out of it. */
function insideState(dir: string, name: string): string {
  const path = join(dir, name);
  const from = relative(dir, path);
  if (name === "" || /[\\:]/.test(name) || isAbsolute(name) || from === "" || from.startsWith("..") || isAbsolute(from)) {
    throw new Error(`${JSON.stringify(name)} is not a name inside the state directory`);
  }
  return path;
}

/** Writes `text` to `name` under the state directory, creating folders on the way; returns the path written. */
export function writeStateFile(name: string, text: string, dir: string = defaultStateDir()): string {
  const path = insideState(dir, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}

/** What `writeStateFile` wrote under `name`, or null when there is none. */
export function readStateFile(name: string, dir: string = defaultStateDir()): string | null {
  try {
    return readFileSync(insideState(dir, name), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Sets the plugin's one marked block in the repository's `AGENTS.md` to `body`, leaving the rest of the file
 * as it was; returns the path. A file whose markers do not make exactly one block is left untouched.
 */
export function writeMarkedBlock(repoRoot: string, body: string): string {
  const path = join(repoRoot, MARKED_BLOCK.file);
  let current = "";
  try {
    current = readFileSync(path, "utf8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const next = withMarkedBlock(current, body);
  writeFileSync(path, next);
  return path;
}
