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
  const text = changed(/^Fields: `ticket`, `wave`, `agent`, `cap`, `running`$/m, "Fields: `ticket`, `wave`, `agent`");
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

test("a daily question budget in the delegation table fails the check", () => {
  const text = changed(/^\| Appetite \|/m, "| Daily question budget | how many a day |\n| Appetite |");
  only(contractProblems(text), "delegation table");
});

test("the ticket-agent title, a label and a checkpoint mark are fixed", () => {
  only(contractProblems(changed("`[Wave N] <NN> <ticket name>`", "`Wave N: <ticket name>`")), "title");
  only(contractProblems(changed(/^\| `stream` \|.*\n/m, "")), "labels");
  only(contractProblems(changed(/^\| Door class \|.*\n/m, "")), "marks");
});
