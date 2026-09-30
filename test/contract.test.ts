import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MESSAGES } from "../server/messages.ts";
import { CONTRACT_VERSION } from "../shared/contract.ts";
import { contractProblems, DELEGATION_READS, parseContract, SAMPLES, SECTIONS } from "./support/contract-doc.ts";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

const contract = read("docs/contract.md");

/** The contract with `from` replaced by `to`; the edit must land, or the mutation proves nothing. */
function changed(from: string | RegExp, to: string): string {
  const text = contract.replace(from, to);
  assert.notEqual(text, contract, `the contract holds ${String(from)}`);
  return text;
}

function only(problems: string[], part: string): void {
  assert.ok(problems.length > 0, "the check fails");
  assert.ok(
    problems.some((problem) => problem.includes(part)),
    `a problem names ${part}: ${problems.join(" | ")}`,
  );
}

test("the contract and the messages module agree, both ways", () => {
  assert.deepEqual(contractProblems(contract), []);
});

test("the contract carries the field `Contract version: 1`, which the constant repeats", () => {
  assert.match(contract, /^Contract version: 1$/m);
  assert.equal(parseContract(contract).version, "1");
  assert.equal(CONTRACT_VERSION, "1");
});

test("the check samples every message type the module builds, so none is skipped", () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(MESSAGES).sort());
  assert.deepEqual(
    parseContract(contract).messages.map((message) => message.type).sort(),
    Object.keys(MESSAGES).sort(),
  );
});

test("the contract holds every section the ticket lists, and the delegation table names no budget", () => {
  const doc = parseContract(contract);
  for (const section of SECTIONS) assert.ok(doc.sections.includes(section), `section ${section}`);
  assert.deepEqual([...doc.delegationReads].sort(), [...DELEGATION_READS].sort());
  assert.match(contract, /per-machine setting/);
  assert.match(contract, /stream agent/, "the relay covers the stream agent (Decision on #34)");
  assert.match(contract, /`paseo plugin ls`/, "detection reads the plugin list");
  assert.match(contract, /heartbeat/i, "absence means the heartbeat path");
});

test("a message type the module builds and the contract lacks fails the check", () => {
  const text = changed(/^### Gate cap passed[\s\S]*?(?=^### |^## )/m, "");
  only(contractProblems(text), "gateCapPassed");
});

test("a message type the contract lists and the module does not build fails the check", () => {
  const text = changed(/^## Labels the plugin reads/m, "### Invented\nType: `invented`\nLead: `Invented`\nFields: `ticket`\n\n| Case | Body | Next line |\n|---|---|---|\n| invented | `Invented: ticket <ticket>.` | `Next: do it.` |\n\n## Labels the plugin reads");
  only(contractProblems(text), "invented");
});

test("a Next line the contract words differently fails the check", () => {
  const text = changed(/(Next: carry on with the wave)/, "Next: carry on differently with the wave");
  only(contractProblems(text), "created");
});

test("a body the contract words differently fails the check", () => {
  const text = changed("`Agent archived: ticket <ticket> of wave <wave>, agent <agent>.`", "`Agent archived: ticket <ticket>.`");
  only(contractProblems(text), "archived");
});

test("a case the contract drops fails the check", () => {
  const text = changed(/^\| canceled \|.*\n/m, "");
  only(contractProblems(text), "turnEnded");
});

test("a field the contract omits fails the check", () => {
  const text = changed(/^Fields: `ticket`, `wave`, `agent`, `cap`, `running`, `bundle`, `tickets`$/m, "Fields: `ticket`, `wave`, `agent`");
  only(contractProblems(text), "gateCapPassed");
});

test("a missing version field fails the check", () => {
  only(contractProblems(changed(/^Contract version: 1$/m, "Contract release: 1")), "Contract version");
});

test("a version that is not a whole number fails the check", () => {
  only(contractProblems(changed(/^Contract version: 1$/m, "Contract version: one")), "whole number");
});

test("a report card that differs from the row the plugin builds fails the check", () => {
  only(contractProblems(changed(/^Kind: `report-card`$/m, "Kind: `summary`")), "kind");
  only(contractProblems(changed(/^Version: 1$/m, "Version: 2")), "version");
  only(contractProblems(changed(/^Buttons: none$/m, "Buttons: approve")), "buttons");
});

test("the report card's row id, entry fields and no-buttons rule are fixed by the contract", () => {
  assert.equal(parseContract(contract).card?.id, "report-card");
  only(contractProblems(changed(/^Row id: `report-card`$/m, "Row id: `card`")), "row id");
  only(contractProblems(changed(/^Decided entry: `header`, `answer`, `at`$/m, "Decided entry: `header`, `answer`")), "decided");
  only(contractProblems(changed(/^Spend: `totalUsd`, `appetiteUsd`, `partial`$/m, "Spend: `totalUsd`, `appetiteUsd`")), "spend");
  only(contractProblems(changed(/^Questions: `count`, `budget`$/m, "Questions: `count`")), "questions");
  only(contractProblems(changed(/^Fields: `decided`, `spend`, `questions`$/m, "Fields: `decided`, `spend`")), "fields");
});

test("the contract says the card is one row kept current under one row id, and says when the total is partial", () => {
  const card = contract.slice(contract.indexOf("## The report card"), contract.indexOf("## What the skills declare"));
  assert.match(card, /one row id/);
  assert.match(card, /partial/);
  assert.match(card, /`null`/, "a missing appetite or budget is null");
});

test("a daily question budget in the delegation table fails the check", () => {
  const text = changed(/^\| Appetite \|/m, "| Daily question budget | how many a day |\n| Appetite |");
  only(contractProblems(text), "delegation table");
});

test("the ticket-agent title, a label and a checkpoint mark are fixed", () => {
  only(contractProblems(changed("`[Wave N] <NN> <ticket name>`", "`Wave N: <ticket name>`")), "title");
  only(contractProblems(changed(/^\| `stream` \|.*\n/m, "")), "labels");
  only(contractProblems(changed(/^\| Door class \|.*\n/m, "")), "marks");
});

test("the contract holds the stream agent's row of each of the three types, with the `stream` field", () => {
  const doc = parseContract(contract);
  const cases = (type: string) => [...(doc.messages.find((message) => message.type === type)?.cases.keys() ?? [])];
  assert.deepEqual(cases("turnEnded").filter((name) => name.startsWith("stream")).sort(), ["stream canceled", "stream completed", "stream failed"]);
  assert.deepEqual(cases("permissionRequested").filter((name) => name.startsWith("stream")).sort(), ["stream question", "stream tool"]);
  assert.deepEqual(cases("archived").filter((name) => name.startsWith("stream")), ["stream archived"]);
  for (const type of ["turnEnded", "permissionRequested", "archived"]) {
    assert.ok(doc.messages.find((message) => message.type === type)?.fields.includes("stream"), `${type} lists the stream field`);
  }
  for (const type of ["created", "humanWords", "gateCapPassed"]) {
    assert.deepEqual(cases(type).filter((name) => name.startsWith("stream")), [], `${type} has no stream row`);
  }
});

test("the contract holds the stream agent's running Stall suspected row, with the `stream` field (#48)", () => {
  const stall = parseContract(contract).messages.find((message) => message.type === "stallSuspected");
  assert.deepEqual([...(stall?.cases.keys() ?? [])].filter((name) => name.startsWith("stream")), ["stream running"]);
  assert.ok(stall?.fields.includes("stream"), "stallSuspected lists the stream field");
  assert.equal(stall?.cases.get("stream running")?.body, "Stall suspected: stream <stream>, agent <agent>, the sensor flagged: <says>.");
  assert.doesNotMatch(stall?.cases.get("stream running")?.next ?? "", /prompt agent/);
});

test("the contract holds the ticket and bundle running Stall suspected rows, named in the stream row's style (#49)", () => {
  const stall = parseContract(contract).messages.find((message) => message.type === "stallSuspected");
  assert.deepEqual([...(stall?.cases.keys() ?? [])].sort(), ["bundle", "bundle running", "stallSuspected", "stream running", "ticket running"]);
  assert.equal(stall?.cases.get("ticket running")?.body, "Stall suspected: ticket <ticket> of wave <wave>, agent <agent>, the sensor flagged: <says>.");
  assert.equal(
    stall?.cases.get("bundle running")?.body,
    "Stall suspected: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>, the sensor flagged: <says>.",
  );
  for (const name of ["ticket running", "bundle running"]) {
    const next = stall?.cases.get(name)?.next ?? "";
    assert.match(next, /never prompt it, since a prompt queues behind the stuck call/, name);
    assert.match(next, /within the restart budget under the wave skill's hung-agent table/, name);
    assert.doesNotMatch(next, /prompt agent/, name);
  }
  assert.match(contract, /^Contract version: 1$/m);
});

test("the contract's relay paragraph says a ticket agent's stall comes from its turn end or from the tick (#49)", () => {
  const relay = /^The relay covers .*$/m.exec(contract)?.[0] ?? "";
  assert.match(relay, /ticket agent's stall[^.]*turn end[^.]*tick|ticket agent's stall[^.]*tick[^.]*turn end/i);
  assert.match(/^The ticket and bundle rows come from .*$/m.exec(contract)?.[0] ?? "", /tick/);
});

test("ADR 0003 holds the running ticket-agent stall under what v1 holds, and cites #49 (#49)", () => {
  const adr = read("docs/adr/0003-the-contract-between-the-plugin-and-the-skills.md");
  const holds = /^- \*\*What v1 holds:\*\*.*$/m.exec(adr)?.[0] ?? "";
  assert.match(holds, /ticket agent's running[^.]*Stall suspected|running ticket agent/i);
  assert.match(holds, /#49/);
});

test("no Stall suspected row of the contract tells the orchestrator to prompt an agent (#48)", () => {
  const stall = parseContract(contract).messages.find((message) => message.type === "stallSuspected");
  assert.ok((stall?.cases.size ?? 0) >= 3, "the ticket, bundle and stream rows");
  for (const [name, row] of stall?.cases ?? []) assert.doesNotMatch(row.next, /prompt agent/, `row ${name}`);
});

test("the contract's relay paragraph and its v1 leaves-out no longer keep stall suspected ticket-agent only (#48)", () => {
  const relay = /^The relay covers .*$/m.exec(contract)?.[0] ?? "";
  assert.ok(relay !== "", "the relay paragraph is there");
  assert.doesNotMatch(relay, /stall suspected and gate cap passed stay/i);
  assert.match(relay, /stall/i, "it says where the stream agent's stall comes from");
  assert.match(relay, /tick/, "the stream agent's stall comes from the tick, not a turn end");
  const leavesOut = /^- What v1 leaves out:.*$/m.exec(contract)?.[0] ?? "";
  assert.ok(leavesOut !== "", "the versioning list names what v1 leaves out");
  assert.doesNotMatch(leavesOut, /stall suspected/i);
  assert.match(contract, /^Contract version: 1$/m);
});

test("ADR 0003 holds the stream agent's running stall and the reworded Next lines under what v1 holds, and cites #48 (#48)", () => {
  const adr = read("docs/adr/0003-the-contract-between-the-plugin-and-the-skills.md");
  const holds = /^- \*\*What v1 holds:\*\*.*$/m.exec(adr)?.[0] ?? "";
  assert.match(holds, /Stall suspected/);
  assert.match(holds, /tick/);
  assert.match(holds, /hung-agent table/);
  assert.match(holds, /#48/);
});

test("the contract no longer says the module builds no stream-agent message", () => {
  assert.doesNotMatch(contract, /the module builds none yet/);
  assert.doesNotMatch(contract, /What v1 leaves out:[^\n]*stream agent/);
});

test("a stream row the contract words differently, drops, or the module does not build fails the check", () => {
  only(contractProblems(changed("`Turn ended: stream <stream>, agent <agent>, outcome completed.`", "`Turn ended: stream <stream>.`")), "stream completed");
  only(contractProblems(changed(/^\| stream canceled \|.*\n/m, "")), "turnEnded");
  only(contractProblems(changed(/^\| stream archived \|.*\n/m, "")), "archived");
  only(contractProblems(changed(/^Fields: `ticket`, `wave`, `agent`, `request`, `name`, `stream`, `bundle`, `tickets`$/m, "Fields: `ticket`, `wave`, `agent`, `request`, `name`, `bundle`, `tickets`")), "permissionRequested");
  const invented = "| stream plan | `Permission pending: stream <stream>.` | `Next: wait.` |\n";
  only(contractProblems(changed(/^(\| stream tool \|.*\n)/m, "$1" + invented)), "stream plan");
});

test("the contract holds the bundle agent's rows of each of the seven ticket-agent types, with the `bundle` and `tickets` fields", () => {
  const doc = parseContract(contract);
  const cases = (type: string) => [...(doc.messages.find((message) => message.type === type)?.cases.keys() ?? [])].filter((name) => name.startsWith("bundle")).sort();
  assert.deepEqual(cases("turnEnded"), ["bundle canceled", "bundle completed", "bundle failed"]);
  assert.deepEqual(cases("permissionRequested"), ["bundle question", "bundle tool"]);
  assert.deepEqual(cases("archived"), ["bundle archived"]);
  for (const type of ["created", "humanWords", "gateCapPassed"]) assert.deepEqual(cases(type), ["bundle"], `${type} has a bundle row`);
  assert.deepEqual(cases("stallSuspected"), ["bundle", "bundle running"], "stallSuspected has a bundle row and a bundle running row (#49)");
  for (const type of ["turnEnded", "permissionRequested", "created", "archived", "humanWords", "stallSuspected", "gateCapPassed"]) {
    const fields = doc.messages.find((message) => message.type === type)?.fields ?? [];
    assert.ok(fields.includes("bundle") && fields.includes("tickets"), `${type} lists the bundle and tickets fields`);
  }
  assert.equal(parseContract(contract).version, "1");
});

test("the contract names the bundle labels, the bundle title and the two placeholders, and says bundle agents are relayed as ticket agents", () => {
  assert.deepEqual(parseContract(contract).labels.sort(), ["bundle", "stream", "ticket", "tickets", "wave"]);
  assert.equal(parseContract(contract).bundleTitle, "[Wave N] [<NN>+<NN>] <first ticket name>");
  assert.match(contract, /`<bundle>`/);
  assert.match(contract, /`<tickets>`/);
  assert.match(contract, /bundle agent[^.]*relayed as a ticket agent/i);
});

test("a bundle row the contract words differently, drops, or the module does not build fails the check", () => {
  only(contractProblems(changed("`Agent archived: bundle <bundle> (tickets <tickets>) of wave <wave>, agent <agent>.`", "`Agent archived: bundle <bundle>.`")), "bundle archived");
  only(contractProblems(changed(/^\| bundle completed \|.*
/m, "")), "turnEnded");
  only(contractProblems(changed(/^\| `bundle` \|.*
/m, "")), "labels");
  only(contractProblems(changed(/^Bundle title: .*$/m, "Bundle title: `[Wave N] <NN>+<NN>`")), "bundle-agent title");
  const invented = "| bundle plan | `Permission pending: bundle <bundle>.` | `Next: wait.` |
";
  only(contractProblems(changed(/^(\| bundle tool \|.*
)/m, "$1" + invented)), "bundle plan");
});

test("ADR 0003 holds the bundle labels and the bundle title under what v1 holds, and cites #45", () => {
  const adr = read("docs/adr/0003-the-contract-between-the-plugin-and-the-skills.md");
  const holds = /^- \*\*What v1 holds:\*\*.*$/m.exec(adr)?.[0] ?? "";
  assert.match(holds, /`bundle`/);
  assert.match(holds, /`tickets`/);
  assert.match(holds, /\[Wave N\] \[<NN>\+<NN>\]/);
  assert.match(holds, /#45/);
});
