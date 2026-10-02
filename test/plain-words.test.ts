import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { PILL, PLAIN_LABELS } from "../client/pill-text.ts";

/**
 * The words blocks of the skills repository, at the top of `matt-with-paseo/SKILL.md` and
 * `matt-with-paseo-streams/SKILL.md` (docs/agents/domain.md): the precise terms a screen must not show alone.
 */
const TERMS = [
  "wave",
  "integration branch",
  "base commit",
  "common rules",
  "ticket agent",
  "checkpoint",
  "brief",
  "hold",
  "stream",
  "intake agent",
  "pause",
  "ship branch",
  "ship rules",
];

const COUNTS = [0, 1, 2, 10];

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function mentions(text: string, term: string): boolean {
  return new RegExp(`\\b${term.replace(/ /g, "\\s+")}(?:s|es)?\\b`, "i").test(text);
}

/** The precise terms a shown text uses without the term's plain label beside it. */
function unpairedTerms(text: string): string[] {
  return TERMS.filter((term) => mentions(text, term) && !text.toLowerCase().includes((PLAIN_LABELS[term] ?? "\0").toLowerCase()));
}

/** Every text the pill can show: each string of `PILL`, and each function of it called with sample counts. */
function shownTexts(): string[] {
  return Object.values(PILL).flatMap((value) => {
    if (typeof value === "string") return [value];
    if (typeof value === "function") return COUNTS.map((count) => String(value(count)));
    return [];
  });
}

/** The contents of the double-quoted and template literals of a source file, comments left out. */
function literalsOf(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return [...code.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((match) => match[1] ?? match[2] ?? "");
}

test("every term of the words blocks has a plain label that is itself free of the precise terms", () => {
  assert.deepEqual(Object.keys(PLAIN_LABELS).sort(), [...TERMS].sort());
  for (const term of TERMS) {
    const label = PLAIN_LABELS[term] ?? "";
    assert.ok(label.trim() !== "", `${term} has a label`);
    assert.notEqual(label.toLowerCase(), term, `${term}'s label differs from the term`);
    for (const other of TERMS) {
      assert.ok(!mentions(label, other), `the label of ${term} ("${label}") uses the precise term ${other}`);
    }
  }
});

test("no two terms share a plain label", () => {
  const labels = Object.values(PLAIN_LABELS).map((label) => label.toLowerCase());
  assert.equal(new Set(labels).size, labels.length);
});

test("the check tells a shown precise term with its label from one without", () => {
  const label = PLAIN_LABELS["checkpoint"] ?? "";
  assert.ok(label !== "");
  assert.deepEqual(unpairedTerms("2 checkpoints waiting"), ["checkpoint"]);
  assert.deepEqual(unpairedTerms(`${label} (checkpoint)`), []);
  assert.deepEqual(unpairedTerms("Waiting for the next wave"), ["wave"]);
  assert.deepEqual(unpairedTerms("Waiting for you"), []);
});

test("a text the pill shows uses no precise term without its plain label", () => {
  const texts = shownTexts();
  assert.ok(texts.length >= 2, "the pill shows at least its title and its label");
  assert.ok(texts.includes(PILL.title));
  for (const text of texts) {
    assert.deepEqual(unpairedTerms(text), [], `"${text}" uses a precise term without its plain label`);
  }
});

test("a text any other client file writes uses no precise term without its plain label", () => {
  const files = [
    ...readdirSync(new URL("../client/", import.meta.url))
      .filter((name) => name.endsWith(".ts") && name !== "pill-text.ts")
      .map((name) => `client/${name}`),
    "index.client.ts",
  ];
  assert.ok(files.includes("client/waiting-pill.ts"));
  for (const path of files) {
    for (const literal of literalsOf(read(path))) {
      assert.deepEqual(unpairedTerms(literal), [], `${path} writes "${literal}", a precise term without its plain label`);
    }
  }
});

test("the precise terms stay where agents read them: no server or shared module reaches the plain labels", () => {
  const messages = read("server/messages.ts");
  for (const term of ["wave", "ticket agent", "checkpoint"]) {
    assert.ok(mentions(messages, term), `server/messages.ts keeps the precise term ${term}`);
  }
  const folders = ["server", "shared"];
  const files = folders.flatMap((folder) =>
    readdirSync(new URL(`../${folder}/`, import.meta.url), { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `${folder}/${name.replace(/\\/g, "/")}`),
  );
  assert.ok(files.includes("server/messages.ts"));
  for (const path of files) {
    assert.doesNotMatch(read(path), /pill-text/, `${path} imports the pill's words`);
  }
});

test("the README says where the plain labels live and what the check covers, and keeps the precise terms", () => {
  const readme = read("README.md");
  const start = readme.indexOf("### Plain words on screen");
  assert.ok(start !== -1, "the README has a 'Plain words on screen' subsection");
  const section = readme.slice(start).split("\n### ", 2)[0]?.split("\n## ", 1)[0] ?? "";
  for (const needle of [
    "client/pill-text.ts",
    "PLAIN_LABELS",
    "test/plain-words.test.ts",
    "server/messages.ts",
    "ADR 0001",
    "report card",
    "hanh9898/matt-with-paseo",
  ]) {
    assert.ok(section.includes(needle), `the subsection names ${needle}`);
  }
  assert.match(section, /no (?:custom )?(?:checkpoint )?card/i, "the subsection says no card exists yet");
});

test("the README and the smoke steps leave the plain labels to client/pill-text.ts", () => {
  for (const name of ["README.md", "test/smoke/README.md"]) {
    const text = read(name);
    for (const [term, label] of Object.entries(PLAIN_LABELS)) {
      assert.ok(!text.includes(`\`${label}\``), `${name} writes the plain label of ${term}`);
    }
  }
});

test("CHANGELOG.md lists the plain words under Unreleased", () => {
  const changelog = read("CHANGELOG.md");
  const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"));
  assert.match(unreleased, /plain (?:words|labels)/i);
  assert.match(unreleased, /client\/pill-text\.ts/);
});

test("the smoke test reads the pill's words against the plain labels", () => {
  const smoke = read("test/smoke/README.md");
  const start = smoke.indexOf("## Waiting pill");
  assert.ok(start !== -1, "the smoke test has a 'Waiting pill' section");
  const steps = smoke.slice(start).split("\n## ", 2)[0] ?? "";
  assert.match(steps, /plain label/i, "the pill steps read the shown words against the plain labels");
});
