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
  ];
  for (const text of texts) {
    for (const fact of ["tkt-7", "1", "07"]) assert.ok(text.includes(fact), `"${text}" names ${fact}`);
  }
  assert.equal(new Set(texts.map((text) => text.split(/[:.]/)[0])).size, 4, "each type opens with its own words");
});

test("a message is one line, so a later `Next:` line has one place to go", () => {
  for (const text of [MESSAGES.created(subject), MESSAGES.turnEnded(subject, { kind: "canceled", reason: "user" })]) {
    assert.ok(!text.includes("\n"));
  }
});

test("combine keeps each text whole and puts them on separate lines", () => {
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
