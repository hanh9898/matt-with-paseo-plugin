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
    MESSAGES.stallSuspected(subject, ["the turn ended in failure"]),
    MESSAGES.gateCapPassed(subject, 4, 5),
  ];
  for (const text of texts) {
    for (const fact of ["tkt-7", "1", "07"]) assert.ok(text.includes(fact), `"${text}" names ${fact}`);
  }
  assert.equal(new Set(texts.map((text) => text.split(/[:.]/)[0])).size, 7, "each type opens with its own words");
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
  humanWords: { one: MESSAGES.humanWords(subject, ["c-1"]) },
  stallSuspected: { one: MESSAGES.stallSuspected(subject, ["the turn ended in failure"]) },
  gateCapPassed: { one: MESSAGES.gateCapPassed(subject, 4, 5) },
  questionBudgetSpent: { one: MESSAGES.questionBudgetSpent(4, 4) },
  // The partial case differs from this one in its body only, and no two cases share a `Next:` line.
  appetitePassed: { passed: MESSAGES.appetitePassed("demo", 6, 5, false) },
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
      // The budget is the machine's and the appetite the stream's, not one ticket's: their moves name no ticket.
      assert.ok(type === "questionBudgetSpent" || type === "appetitePassed" || next.includes("07"), `${type} (${name}) names the ticket its moves are about`);
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
  assert.equal(both.split("\n").filter((line) => line.startsWith("Next:")).length, 1);
  assert.ok(both.indexOf("Human words") < both.indexOf("Turn ended"));
});

const stream = { agentId: "strm-3", stream: "demo" };

/** The stream agent's cases: the same types as the ticket agent's, `stream <stream>` in place of the ticket-and-wave clause. */
const STREAM_SAMPLES = {
  turnEnded: {
    completed: MESSAGES.turnEnded(stream, { kind: "completed" }),
    failed: MESSAGES.turnEnded(stream, { kind: "failed", error: { message: "out of quota", code: "quota" } }),
    canceled: MESSAGES.turnEnded(stream, { kind: "canceled", reason: "user" }),
  },
  permissionRequested: {
    question: MESSAGES.permissionRequested(stream, { id: "req-4", name: "AskUserQuestion", kind: "question" }),
    tool: MESSAGES.permissionRequested(stream, { id: "req-4", name: "Bash", kind: "tool" }),
  },
  archived: { archived: MESSAGES.archived(stream) },
  stallSuspected: { running: MESSAGES.stallSuspected(stream, ["its turn has run 30 minutes with no new activity"]) },
};

test("a stream agent's text names the stream and the agent in place of the ticket and the wave", () => {
  for (const [type, cases] of Object.entries(STREAM_SAMPLES)) {
    for (const [name, text] of Object.entries(cases)) {
      assert.match(text, /: stream demo, agent strm-3[,.]/, `${type} (${name}) names the stream and the agent`);
      assert.doesNotMatch(text, /ticket|wave/i, `${type} (${name}) has no ticket-and-wave clause`);
    }
  }
  assert.match(STREAM_SAMPLES.turnEnded.completed, /^Turn ended: stream demo, agent strm-3, outcome completed\./);
  assert.match(STREAM_SAMPLES.turnEnded.failed, /outcome failed \(quota\)\./);
  assert.match(STREAM_SAMPLES.turnEnded.canceled, /outcome canceled \(user\)\./);
  assert.match(STREAM_SAMPLES.permissionRequested.question, /request req-4, AskUserQuestion \(question\)\./);
  assert.match(STREAM_SAMPLES.archived.archived, /^Agent archived: stream demo, agent strm-3\./);
});

test("a stream agent's text is one body line, then a `Next:` line of moves closed by a full stop, each move naming the stream or the agent", () => {
  const lines: (string | null)[] = [];
  for (const cases of Object.values(STREAM_SAMPLES)) {
    for (const text of Object.values(cases)) {
      assert.equal(text.split("\n").length, 2);
      const next = nextLineOf(text);
      assert.ok(next !== null && next.endsWith("."), text);
      lines.push(next);
      for (const move of movesOf(text)) assert.match(move, /stream demo|strm-3/, `"${move}" names the stream or the agent`);
    }
  }
  assert.equal(new Set(lines).size, lines.length, "no two cases share a `Next:` line");
});

test("a stream agent's moves fit the streams orchestrator: read its report, answer under the delegation, finish the clean-up", () => {
  assert.match(nextLineOf(STREAM_SAMPLES.turnEnded.completed) ?? "", /stream demo's report with get_agent_activity/);
  assert.match(nextLineOf(STREAM_SAMPLES.turnEnded.failed) ?? "", /record stream demo as failed/);
  assert.match(nextLineOf(STREAM_SAMPLES.turnEnded.canceled) ?? "", /stream demo stopped/);
  const question = nextLineOf(STREAM_SAMPLES.permissionRequested.question) ?? "";
  assert.match(question, /list_pending_permissions/);
  assert.match(question, /no longer listed/);
  assert.match(question, /delegation table/);
  assert.match(question, /strm-3's chat/);
  assert.match(nextLineOf(STREAM_SAMPLES.permissionRequested.tool) ?? "", /respond_to_permission/);
  assert.match(nextLineOf(STREAM_SAMPLES.archived.archived) ?? "", /clean-up of stream demo/);
});

test("a stream agent's text carries no part of a request's input or an error's message (T6)", () => {
  assert.doesNotMatch(MESSAGES.turnEnded(stream, { kind: "failed", error: { message: "token=hunter2" } }), /hunter2/);
  assert.doesNotMatch(MESSAGES.permissionRequested(stream, { id: "r", name: "Bash", kind: "tool", input: { secret: "hunter2" } }), /hunter2/);
});

test("combine joins a stream agent's message with a ticket agent's, one `Next:` line holding both sets of moves", () => {
  const streamText = MESSAGES.turnEnded(stream, { kind: "completed" });
  const ticketText = MESSAGES.turnEnded(subject, { kind: "completed" });
  const both = combine([streamText, ticketText]);
  const lines = both.split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines.filter((line) => line.startsWith("Next:")).length, 1);
  for (const text of [streamText, ticketText]) {
    for (const move of movesOf(text)) assert.ok(movesOf(both).includes(move), `the combined line holds "${move}"`);
  }
});

const bundle = { agentId: "bnd-7", wave: "1", bundle: "70", tickets: "70,71" };

/** Every message type a bundle agent gets, with each case whose moves differ. */
const BUNDLE_SAMPLES: Record<string, Record<string, string>> = {
  turnEnded: {
    completed: MESSAGES.turnEnded(bundle, { kind: "completed" }),
    failed: MESSAGES.turnEnded(bundle, { kind: "failed", error: { message: "out of quota", code: "quota" } }),
    canceled: MESSAGES.turnEnded(bundle, { kind: "canceled", reason: "user" }),
  },
  permissionRequested: {
    question: MESSAGES.permissionRequested(bundle, { id: "req-9", name: "AskUserQuestion", kind: "question" }),
    tool: MESSAGES.permissionRequested(bundle, { id: "req-9", name: "Bash", kind: "tool" }),
  },
  created: { created: MESSAGES.created(bundle) },
  archived: { archived: MESSAGES.archived(bundle) },
  humanWords: { humanWords: MESSAGES.humanWords(bundle, ["c-1"]) },
  stallSuspected: { stallSuspected: MESSAGES.stallSuspected(bundle, ["the turn ended in failure"]) },
  gateCapPassed: { gateCapPassed: MESSAGES.gateCapPassed(bundle, 4, 5) },
};

test("a bundle agent's text names the bundle, its tickets, the wave and the agent, and no single ticket", () => {
  for (const [type, cases] of Object.entries(BUNDLE_SAMPLES)) {
    for (const [name, text] of Object.entries(cases)) {
      assert.match(text, /: bundle 70 \(tickets 70,71\) of wave 1, agent bnd-7[,.]/, `${type} (${name}) has the bundle clause`);
      assert.doesNotMatch(text, /ticket 7[01]/, `${type} (${name}) names no single ticket`);
      assert.doesNotMatch(text, /stream/i, `${type} (${name}) is no stream text`);
      const moves = text.split("\n").at(-1) ?? "";
      assert.ok(moves.startsWith("Next: ") && moves.endsWith("."), `${type} (${name}) ends with a Next line`);
      assert.match(moves, /bundle 70/, `${type} (${name}) names the bundle in its moves`);
    }
  }
  assert.match(BUNDLE_SAMPLES.turnEnded.completed, /^Turn ended: bundle 70 \(tickets 70,71\) of wave 1, agent bnd-7, outcome completed\./);
  assert.match(BUNDLE_SAMPLES.permissionRequested.question, /request req-9, AskUserQuestion \(question\)\./);
  assert.match(BUNDLE_SAMPLES.archived.archived, /^Agent archived: bundle 70 \(tickets 70,71\) of wave 1, agent bnd-7\./);
  assert.match(BUNDLE_SAMPLES.gateCapPassed.gateCapPassed, /, 5 ticket agents run against a cap of 4 concurrent gates\./);
});

test("a ticket agent's text is unchanged by the bundle case", () => {
  assert.equal(
    MESSAGES.turnEnded(subject, { kind: "completed" }),
    "Turn ended: ticket 07 of wave 1, agent tkt-7, outcome completed.\nNext: check ticket 07's report with get_agent_activity and its artifacts (commits on its branch, ticket status); prompt agent tkt-7 when the report is incomplete.",
  );
  assert.equal(
    MESSAGES.created(subject),
    "Agent created: ticket 07 of wave 1, agent tkt-7.\nNext: carry on with the wave while ticket 07's turn end and any pending permission reach you as messages.",
  );
});

test("combine joins a bundle agent's message with a ticket agent's, one `Next:` line holding both sets of moves", () => {
  const text = combine([MESSAGES.turnEnded(bundle, { kind: "completed" }), MESSAGES.turnEnded(subject, { kind: "completed" })]);
  assert.equal(text.split("\nNext: ").length, 2);
  assert.match(text, /bundle 70's report/);
  assert.match(text, /ticket 07's report/);
});

const QUIET = "its turn has run 30 minutes with no new activity";

test("a stream agent's Stall suspected names the stream and its agent, and reads the running case's words (#48)", () => {
  assert.equal(
    MESSAGES.stallSuspected(stream, [QUIET]),
    "Stall suspected: stream demo, agent strm-3, the sensor flagged: its turn has run 30 minutes with no new activity.\n" +
      "Next: judge whether stream demo is stalled: read agent strm-3's recent activity with get_agent_activity; " +
      "when agent strm-3 is hung on a shell command or on no tool call, replace it under the stream skill's restart budget, and never prompt it, since a prompt queues behind the stuck call; " +
      "leave stream demo alone when agent strm-3 runs a subagent or another long tool.",
  );
});

test("the turn-end Stall suspected line names the hung-agent table for a ticket and for a bundle (#48)", () => {
  assert.equal(
    MESSAGES.stallSuspected(subject, ["the turn ended in failure"]),
    "Stall suspected: ticket 07 of wave 1, agent tkt-7, the sensor flagged: the turn ended in failure.\n" +
      "Next: judge whether ticket 07 is stalled: read agent tkt-7's recent activity with get_agent_activity; " +
      "decide by the wave skill's hung-agent table, which says whether agent tkt-7 is replaced within the restart budget or prompted to resume, or record ticket 07 as stalled with the reason; " +
      "leave ticket 07 alone when its agent is working.",
  );
  assert.equal(
    MESSAGES.stallSuspected(bundle, ["the turn ended in failure"]),
    "Stall suspected: bundle 70 (tickets 70,71) of wave 1, agent bnd-7, the sensor flagged: the turn ended in failure.\n" +
      "Next: judge whether bundle 70 is stalled: read agent bnd-7's recent activity with get_agent_activity; " +
      "decide by the wave skill's hung-agent table, which says whether agent bnd-7 is replaced within the restart budget or prompted to resume, or record bundle 70 as stalled with the reason; " +
      "leave bundle 70 alone when its agent is working.",
  );
});

test("no Stall suspected line tells the orchestrator to prompt an agent that may still be in a call (#48)", () => {
  for (const text of [MESSAGES.stallSuspected(subject, ["x"]), MESSAGES.stallSuspected(bundle, ["x"]), MESSAGES.stallSuspected(stream, ["x"])]) {
    assert.doesNotMatch(nextLineOf(text) ?? "", /prompt agent/, text);
  }
});
