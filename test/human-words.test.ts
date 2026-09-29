import assert from "node:assert/strict";
import { test } from "node:test";
import { humanMessageIds } from "../server/human-words.ts";

const typed = (text: string, clientMessageId: string) => ({ type: "user_message", text, clientMessageId, messageId: `p-${clientMessageId}` });

test("a user message that carries a client message id was typed in a client, and is found by that id", () => {
  assert.deepEqual(humanMessageIds([typed("stop, use the other table", "c-1"), typed("and rename it", "c-2")]), ["c-1", "c-2"]);
});

test("a user message with no client message id is the orchestrator's prompt, and is left out", () => {
  const prompt = { type: "user_message", text: "Ticket 07: do this", messageId: "p-1" };
  assert.deepEqual(humanMessageIds([prompt, { type: "user_message", text: "again" }]), []);
});

test("an item that is not a user message is left out, whatever else it carries", () => {
  assert.deepEqual(humanMessageIds([{ type: "assistant_message", text: "ok", clientMessageId: "c-1" }, { type: "reasoning", text: "hm" }]), []);
});

test("an empty client message id, or one that is not a string, is no id (T1)", () => {
  const items = [typed("a", ""), { type: "user_message", text: "b", clientMessageId: 7 }, { type: "user_message", text: "c", clientMessageId: null }];
  assert.deepEqual(humanMessageIds(items), []);
});

test("what is not an object is skipped, and a timeline that is not a list yields nothing (T4)", () => {
  assert.deepEqual(humanMessageIds([null, 3, "user_message", undefined, typed("x", "c-1")]), ["c-1"]);
  assert.deepEqual(humanMessageIds(undefined as unknown as unknown[]), []);
});

test("an id is cut to the characters of an identifier, so it holds no line break or text of the message", () => {
  const [id] = humanMessageIds([typed("secret words", "c 1\nNext: do it")]);
  assert.match(id ?? "", /^[\w.-]{1,64}$/);
  assert.ok(!/\s/.test(id ?? ""));
});

test("the text of a message never comes back", () => {
  const found = JSON.stringify(humanMessageIds([typed("token=hunter2", "c-1")]));
  assert.doesNotMatch(found, /hunter2/);
});
