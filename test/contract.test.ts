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
  for (const type of ["created", "humanWords", "stallSuspected", "gateCapPassed"]) {
    assert.deepEqual(cases(type).filter((name) => name.startsWith("stream")), [], `${type} has no stream row`);
  }
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
  for (const type of ["created", "humanWords", "stallSuspected", "gateCapPassed"]) assert.deepEqual(cases(type), ["bundle"], `${type} has a bundle row`);
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
