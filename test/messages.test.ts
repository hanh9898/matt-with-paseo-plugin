import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { combine, MESSAGES } from "../server/messages.ts";

const subject = { agentId: "tkt-7", wave: "1", ticket: "07" };

test("each message type has one text, and it names the agent, the wave and the ticket", () => {
  const texts = [
    MESSAGES.turnEnded(subject, { kind: "completed" }),
    MESSAGES.permissionRequested(subject, { id: "req-9", name: "Bash", kind: "tool" }),
    MESSAGES.created(subject),
    MESSAGES.archived(subject),
    MESSAGES.humanWords(subject, ["c-1"]),
  ];
  for (const text of texts) {
    for (const fact of ["tkt-7", "1", "07"]) assert.ok(text.includes(fact), `"${text}" names ${fact}`);
  }
  assert.equal(new Set(texts.map((text) => text.split(/[:.]/)[0])).size, 5, "each type opens with its own words");
});

/** Every message type with each case whose moves differ: the key is the type's name in `MESSAGES`. */
const SAMPLES: Record<keyof typeof MESSAGES, Record<string, string>> = {
  turnEnded: {
    completed: MESSAGES.turnEnded(subject, { kind: "completed" }),
    failed: MESSAGES.turnEnded(subject, { kind: "failed", error: { message: "out of quota", code: "quota" } }),
    canceled: MESSAGES.turnEnded(subject, { kind: "canceled", reason: "user" }),
  },
  permissionRequested: {
    question: MESSAGES.permissionRequested(subject, { id: "req-9", name: "AskUserQuestion", kind: "question" }),
    tool: MESSAGES.permissionRequested(subject, { id: "req-9", name: "Bash", kind: "tool" }),
  },
  created: { created: MESSAGES.created(subject) },
  archived: { archived: MESSAGES.archived(subject) },
  humanWords: {
    one: MESSAGES.humanWords(subject, ["c-1"]),
    several: MESSAGES.humanWords(subject, ["c-1", "c-2", "c-3", "c-4", "c-5", "c-6", "c-7"]),
  },
};

/** The `Next:` line of a text: its last line, or null when the last line is anything else. */
function nextLineOf(text: string): string | null {
  const last = text.split("\n").at(-1) ?? "";
  return last.startsWith("Next: ") ? last : null;
}

/** The moves on a `Next:` line, each as the words between its `; ` separators, without the closing full stop. */
function movesOf(text: string): string[] {
  return (nextLineOf(text) ?? "").slice("Next: ".length, -1).split("; ");
}

test("every message type ends with one `Next:` line that names the moves open to its reader", () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(MESSAGES).sort(), "SAMPLES lists every message type");
  for (const [type, cases] of Object.entries(SAMPLES)) {
    for (const [name, text] of Object.entries(cases)) {
      const next = nextLineOf(text);
      assert.ok(next !== null, `${type} (${name}) ends with a line starting "Next: ": ${JSON.stringify(text)}`);
      assert.equal(text.split("\n").filter((line) => line.startsWith("Next:")).length, 1, `${type} (${name}) has one`);
      assert.ok(next.length > "Next: .".length, `${type} (${name}) names a move`);
      assert.ok(next.endsWith("."), `${type} (${name}) ends its line with a full stop`);
      assert.ok(next.includes("07"), `${type} (${name}) names the ticket its moves are about`);
    }
  }
});

test("a message is its body on one line, then its `Next:` line", () => {
  for (const cases of Object.values(SAMPLES)) {
    for (const text of Object.values(cases)) assert.equal(text.split("\n").length, 2);
  }
});

test("the moves use the tools and words of the skills, one set per case", () => {
  const next = (type: keyof typeof SAMPLES, name: string) => nextLineOf(SAMPLES[type]?.[name] ?? "") ?? "";
  assert.match(next("turnEnded", "completed"), /get_agent_activity/);
  assert.match(next("turnEnded", "failed"), /get_agent_activity/);
  assert.match(next("turnEnded", "failed"), /record ticket 07 as failed/);
  assert.match(next("turnEnded", "canceled"), /stopped/);
  assert.match(next("permissionRequested", "question"), /list_pending_permissions/);
  assert.match(next("permissionRequested", "question"), /checkpoint/);
  assert.match(next("permissionRequested", "question"), /respond_to_permission/);
  assert.match(next("permissionRequested", "question"), /no longer listed/, "a request that is gone is settled (ADR 0001)");
  assert.match(next("permissionRequested", "question"), /delegation table/, "the plugin may answer under delegation (ADR 0001)");
  assert.match(next("permissionRequested", "question"), /tkt-7's chat/, "the user answers where the agent asked (ADR 0001)");
  assert.match(next("permissionRequested", "tool"), /respond_to_permission/);
  assert.match(next("created", "created"), /turn end/);
  assert.match(next("archived", "archived"), /step 8/);
  assert.match(next("humanWords", "one"), /get_agent_activity/, "the words are read where they are, not carried");
  assert.match(next("humanWords", "one"), /changed the plan/, "the orchestrator records whether they changed it");
  assert.match(next("humanWords", "one"), /report/, "and the report lists it");
  const lines = Object.values(SAMPLES).flatMap((cases) => Object.values(cases).map((text) => nextLineOf(text)));
  assert.equal(new Set(lines).size, lines.length, "no two cases share a `Next:` line");
});

test("a text carries no part of a request's input or an error's message (T6)", () => {
  const failed = MESSAGES.turnEnded(subject, { kind: "failed", error: { message: "token=hunter2" } });
  assert.doesNotMatch(failed, /hunter2/);
  const asked = MESSAGES.permissionRequested(subject, { id: "req-9", name: "Bash", kind: "tool", input: { secret: "hunter2" } });
  assert.doesNotMatch(asked, /hunter2/);
});

test("combine joins the bodies in order and ends with one `Next:` line that holds every message's moves", () => {
  const done = MESSAGES.turnEnded(subject, { kind: "completed" });
  const asked = MESSAGES.permissionRequested(subject, { id: "req-9", name: "Bash", kind: "tool" });
  const both = combine([done, asked]);
  const lines = both.split("\n");
  assert.equal(lines.filter((line) => line.startsWith("Next:")).length, 1, "one `Next:` line");
  assert.ok(lines.at(-1)?.startsWith("Next: "), "and it is the last line");
  assert.equal(lines.length, 3, "two bodies, then it");
  assert.ok(both.indexOf("Turn ended") < both.indexOf("Permission pending"), "the bodies keep their order");
  for (const text of [done, asked]) {
    for (const move of movesOf(text)) assert.ok(movesOf(both).includes(move), `the combined line holds "${move}"`);
  }
});

test("combine puts a move that two messages share on the line once", () => {
  const first = MESSAGES.created(subject);
  const both = combine([first, first]);
  assert.equal(both.split("\n").filter((line) => line.startsWith("Next:")).length, 1);
  assert.equal(nextLineOf(both), nextLineOf(first), "the line is the message's own");
});

test("combine of one message returns it whole", () => {
  const only = MESSAGES.archived(subject);
  assert.equal(combine([only]), only);
});

test("combine keeps a text with no `Next:` line whole and adds none", () => {
  assert.equal(combine(["a", "b"]), "a\nb");
});

test("no hook module writes a message text of its own", () => {
  const dir = new URL("../server/hooks/", import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
    const text = readFileSync(new URL(file, dir), "utf8");
    assert.match(text, /\.\.\/messages\.ts/, `${file} takes its texts from server/messages.ts`);
    assert.doesNotMatch(text, /host\.send\([^)]*[`"']/, `${file} sends a text it did not take from server/messages.ts`);
  }
});

test("the human words message names the user's messages by id and count, and never carries their text (T6)", () => {
  const text = MESSAGES.humanWords(subject, ["c-1", "c-2"]);
  assert.match(text, /^Human words/);
  assert.ok(text.includes("c-1") && text.includes("c-2"), "each message id is named");
  assert.match(text, /2 messages/);
  assert.match(MESSAGES.humanWords(subject, ["c-1"]), /1 message(?!s)/);
});

test("a long run of ids is cut to a few, and the rest are counted", () => {
  const ids = Array.from({ length: 40 }, (_, index) => `c-${index}`);
  const text = MESSAGES.humanWords(subject, ids);
  assert.ok(text.includes("c-0") && !text.includes("c-39"), "the first ids are named, the last are not");
  assert.match(text, /40 messages/);
  assert.match(text, /more/);
});

test("the human words message combines with a turn end into one `Next:` line", () => {
  const both = combine([MESSAGES.humanWords(subject, ["c-1"]), MESSAGES.turnEnded(subject, { kind: "completed" })]);
  assert.equal(both.split("
").filter((line) => line.startsWith("Next:")).length, 1);
  assert.ok(both.indexOf("Human words") < both.indexOf("Turn ended"));
});
