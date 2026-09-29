import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isStreamAgent, isTicketAgent, ticketOf } from "../shared/role-labels.ts";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("a ticket agent carries the labels wave and ticket", () => {
  assert.deepEqual(ticketOf({ wave: "1", ticket: "14" }), { wave: "1", ticket: "14" });
  assert.deepEqual(ticketOf({ wave: "1", ticket: "14", stream: "s", other: "x" }), { wave: "1", ticket: "14" });
  assert.equal(isTicketAgent({ wave: "1", ticket: "14" }), true);
});

test("an agent with only one of the two labels, or neither, is not a ticket agent", () => {
  for (const labels of [{}, { wave: "1" }, { ticket: "14" }, { stream: "s" }, { Wave: "1", Ticket: "14" }, { wave: undefined, ticket: "14" }]) {
    assert.equal(ticketOf(labels), null, JSON.stringify(labels));
    assert.equal(isTicketAgent(labels), false, JSON.stringify(labels));
  }
});

test("the stream agent carries the label stream and no wave", () => {
  assert.equal(isStreamAgent({ stream: "matt-with-paseo-plugin" }), true);
  assert.equal(isStreamAgent({ stream: "s", other: "x" }), true);
  for (const labels of [{}, { wave: "1" }, { stream: "s", wave: "1" }, { stream: "s", wave: "1", ticket: "14" }, { Stream: "s" }]) {
    assert.equal(isStreamAgent(labels), false, JSON.stringify(labels));
  }
});

test("no agent is both a ticket agent and the stream agent", () => {
  const samples = [{}, { wave: "1" }, { ticket: "1" }, { stream: "s" }, { wave: "1", ticket: "1" }, { wave: "1", stream: "s" }, { wave: "1", ticket: "1", stream: "s" }];
  for (const labels of samples) assert.ok(!(isTicketAgent(labels) && isStreamAgent(labels)), JSON.stringify(labels));
});

test("the relay and the waiting count read an agent's role from shared/role-labels.ts, and spell no label of their own", () => {
  for (const path of ["server/hooks/lifecycle-relay.ts", "server/hooks/waiting-count.ts"]) {
    const source = read(path);
    assert.match(source, /shared\/role-labels\.ts"/, `${path} imports the helper`);
    assert.doesNotMatch(source, /\[\s*["'](?:wave|ticket|stream)["']\s*\]/, `${path} indexes no role label`);
    assert.doesNotMatch(source, /\.(?:wave|ticket|stream)\b/, `${path} reads no role label as a property`);
  }
});

test("the helper is a pure module: it imports nothing", () => {
  assert.doesNotMatch(read("shared/role-labels.ts"), /^\s*import\b/m);
});
