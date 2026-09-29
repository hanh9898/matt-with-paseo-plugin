import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { disagreements, problemsIn, readIdentifiers } from "./support/version-token.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const FILES = [
  "package.json",
  "paseo-plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  "shared/contract.ts",
];

/** Copies the files the check reads into a scratch folder, lets `edit` break one, and returns what the check says. */
function inScratchRoot(edit: (dir: string) => void): string[] {
  const dir = mkdtempSync(join(tmpdir(), "mwp-version-"));
  try {
    for (const file of FILES) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      copyFileSync(join(repoRoot, file), join(dir, file));
    }
    edit(dir);
    return problemsIn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function child(node: unknown, key: string | number): unknown {
  assert.ok(typeof node === "object" && node !== null, `cannot step into ${String(key)}`);
  return Reflect.get(node, key);
}

/** Sets one string in a JSON file of the scratch folder, at a path of keys and indexes. */
function setJson(dir: string, file: string, path: readonly (string | number)[], value: string): void {
  const json: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
  let node: unknown = json;
  for (const key of path.slice(0, -1)) node = child(node, key);
  assert.ok(typeof node === "object" && node !== null);
  const last = path[path.length - 1];
  assert.ok(last !== undefined);
  Reflect.set(node, last, value);
  writeFileSync(join(dir, file), `${JSON.stringify(json, null, 2)}\n`);
}

function setContract(dir: string, value: string): void {
  const file = join(dir, "shared/contract.ts");
  const text = readFileSync(file, "utf8");
  const changed = text.replace(/(export const CONTRACT_VERSION = )"[^"]*"/, `$1"${value}"`);
  assert.notEqual(changed, text, "the scratch contract module was edited");
  writeFileSync(file, changed);
}

test("the repository holds one version token and one plugin id", () => {
  assert.deepEqual(problemsIn(repoRoot), []);
});

test("the check reads every place the version and the id are spelled, so none is skipped", () => {
  const read = readIdentifiers(repoRoot);
  assert.deepEqual(
    read.version.map((r) => `${r.file} ${r.field}`),
    [
      "package.json version",
      ".claude-plugin/plugin.json version",
      ".claude-plugin/marketplace.json plugins[0].version",
      "shared/contract.ts CONTRACT_VERSION",
    ],
  );
  assert.deepEqual(
    read.id.map((r) => `${r.file} ${r.field}`),
    [
      "paseo-plugin.json id",
      "package.json name",
      ".claude-plugin/plugin.json name",
      ".claude-plugin/marketplace.json plugins[0].name",
    ],
  );
});

test("the token lives in package.json, and paseo-plugin.json carries no version (its schema takes none)", () => {
  const read = readIdentifiers(repoRoot);
  assert.equal(read.version[0]?.file, "package.json");
  assert.ok(!read.version.some((r) => r.file === "paseo-plugin.json"));
  const manifest: unknown = JSON.parse(readFileSync(join(repoRoot, "paseo-plugin.json"), "utf8"));
  assert.equal(child(manifest, "version"), undefined);
});

const DISAGREEMENTS: { name: string; edit: (dir: string) => void; offender: string; home: string }[] = [
  {
    name: "plugin.json version against package.json",
    edit: (dir) => setJson(dir, ".claude-plugin/plugin.json", ["version"], "9.9.9"),
    offender: ".claude-plugin/plugin.json",
    home: "package.json",
  },
  {
    name: "marketplace.json version against package.json",
    edit: (dir) => setJson(dir, ".claude-plugin/marketplace.json", ["plugins", 0, "version"], "9.9.9"),
    offender: ".claude-plugin/marketplace.json",
    home: "package.json",
  },
  {
    name: "the contract version against package.json",
    edit: (dir) => setContract(dir, "9.9.9"),
    offender: "shared/contract.ts",
    home: "package.json",
  },
  {
    name: "plugin.json name against paseo-plugin.json",
    edit: (dir) => setJson(dir, ".claude-plugin/plugin.json", ["name"], "other-id"),
    offender: ".claude-plugin/plugin.json",
    home: "paseo-plugin.json",
  },
  {
    name: "marketplace.json entry name against paseo-plugin.json",
    edit: (dir) => setJson(dir, ".claude-plugin/marketplace.json", ["plugins", 0, "name"], "other-id"),
    offender: ".claude-plugin/marketplace.json",
    home: "paseo-plugin.json",
  },
  {
    name: "package.json name against paseo-plugin.json",
    edit: (dir) => setJson(dir, "package.json", ["name"], "other-id"),
    offender: "package.json",
    home: "paseo-plugin.json",
  },
];

for (const { name, edit, offender, home } of DISAGREEMENTS) {
  test(`the check fails, naming both files, when ${name} disagree`, () => {
    const problems = inScratchRoot(edit);
    assert.equal(problems.length, 1, problems.join("\n"));
    const [problem] = problems;
    assert.ok(problem?.includes(offender), `${problem} names ${offender}`);
    assert.ok(problem?.includes(home), `${problem} names ${home}`);
  });
}

test("a message carries both values, so the reader sees which to change", () => {
  const [problem] = inScratchRoot((dir) => setJson(dir, ".claude-plugin/plugin.json", ["version"], "9.9.9"));
  assert.ok(problem?.includes('"9.9.9"'));
  assert.ok(problem?.includes('"0.0.0"'));
});

test("a change to the token alone leaves every other spelling naming package.json", () => {
  const problems = inScratchRoot((dir) => setJson(dir, "package.json", ["version"], "1.2.3"));
  assert.equal(problems.length, 3, problems.join("\n"));
  for (const offender of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "shared/contract.ts"]) {
    assert.ok(
      problems.some((p) => p.includes(offender) && p.includes("package.json")),
      `a problem names ${offender} and package.json`,
    );
  }
});

test("two spellings that differ from each other and from the token give two messages, each naming its two files", () => {
  const problems = inScratchRoot((dir) => {
    setJson(dir, ".claude-plugin/plugin.json", ["version"], "9.9.9");
    setJson(dir, ".claude-plugin/marketplace.json", ["plugins", 0, "version"], "8.8.8");
  });
  assert.equal(problems.length, 2, problems.join("\n"));
  assert.ok(problems.some((p) => p.includes(".claude-plugin/plugin.json") && p.includes("package.json")));
  assert.ok(problems.some((p) => p.includes(".claude-plugin/marketplace.json") && p.includes("package.json")));
});

test("a token that is not a version is refused, even when every spelling matches it", () => {
  const problems = inScratchRoot((dir) => {
    setJson(dir, "package.json", ["version"], "latest");
    setJson(dir, ".claude-plugin/plugin.json", ["version"], "latest");
    setJson(dir, ".claude-plugin/marketplace.json", ["plugins", 0, "version"], "latest");
    setContract(dir, "latest");
  });
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.ok(problems[0]?.includes("package.json"));
});

test("a missing file stops the check and names that file", () => {
  assert.throws(
    () => inScratchRoot((dir) => rmSync(join(dir, ".claude-plugin/marketplace.json"))),
    /\.claude-plugin\/marketplace\.json/,
  );
});

test("a missing field stops the check and names the file and the field", () => {
  assert.throws(
    () =>
      inScratchRoot((dir) => {
        const file = join(dir, ".claude-plugin/plugin.json");
        const json: unknown = JSON.parse(readFileSync(file, "utf8"));
        assert.ok(typeof json === "object" && json !== null);
        Reflect.deleteProperty(json, "version");
        writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
      }),
    /\.claude-plugin\/plugin\.json.*version/,
  );
});

test("a contract module without the constant stops the check and names the module", () => {
  assert.throws(
    () => inScratchRoot((dir) => writeFileSync(join(dir, "shared/contract.ts"), "export {};\n")),
    /shared\/contract\.ts/,
  );
});

test("a marketplace that lists another plugin stops the check: this repository is one plugin", () => {
  assert.throws(
    () =>
      inScratchRoot((dir) => {
        const file = join(dir, ".claude-plugin/marketplace.json");
        const json: unknown = JSON.parse(readFileSync(file, "utf8"));
        const plugins = child(json, "plugins");
        assert.ok(Array.isArray(plugins));
        plugins.push(plugins[0]);
        writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
      }),
    /\.claude-plugin\/marketplace\.json/,
  );
});

test("disagreements compares each reading with the first and names both files", () => {
  const home = { file: "a.json", field: "version", value: "1.0.0" };
  assert.deepEqual(disagreements([home, { file: "b.json", field: "version", value: "1.0.0" }]), []);
  const [problem] = disagreements([home, { file: "b.json", field: "meta.version", value: "2.0.0" }]);
  assert.ok(problem?.includes("a.json") && problem.includes("b.json"));
  assert.ok(problem?.includes("meta.version"));
  assert.deepEqual(disagreements([]), []);
});
