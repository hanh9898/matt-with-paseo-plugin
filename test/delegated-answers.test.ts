import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAnswers, doorOf } from "../server/delegated-answers.ts";
import type { Delegation } from "../shared/delegation.ts";

const level2: Delegation = { level: 2, levelFrom: "Level", decide: ["two-way", "costly"], appetite: null };
const level1: Delegation = { ...level2, level: 1 };
const level3: Delegation = { level: 3, levelFrom: "Level", decide: ["two-way", "costly", "one-way"], appetite: null };

type Option = { label: string; description?: string };
const opts = (...labels: string[]): Option[] => labels.map((label) => ({ label, description: "" }));

function ask(header: string, lines: string[], options: Option[] = opts("Red (Recommended)", "Blue"), extra: object = {}) {
  return { header, question: ["Which colour?", ...lines].join("\n"), options, multiSelect: false, ...extra };
}
const input = (...questions: object[]) => ({ questions });

const NOTHING = "level 1: nothing is delegated";
const FIVE = "one of the user's five (level 2)";
const NO_RECOMMENDATION = "no recommendation on the first option";

/** Each case is a delegation, an `AskUserQuestion` input and the decision: answers keyed by header, or the reason it is left. */
const CASES: { name: string; delegation: Delegation | null; input: unknown; answers?: Record<string, string>; leave?: string }[] = [
  { name: "a two-way question with a recommendation is answered with it", delegation: level2, input: input(ask("Colour", ["Door: two-way"])), answers: { Colour: "Red (Recommended)" } },
  { name: "a costly door in the table is answered", delegation: level2, input: input(ask("Colour", ["Door: costly"])), answers: { Colour: "Red (Recommended)" } },
  { name: "a door the table does not list is left", delegation: { ...level2, decide: ["two-way"] }, input: input(ask("Colour", ["Door: costly"])), leave: "the table does not let the orchestrator decide this door" },
  { name: "a one-way door is left at level 2 even when the row lists it", delegation: { ...level2, decide: ["two-way", "costly"] }, input: input(ask("Colour", ["Door: one-way"])), leave: "the table does not let the orchestrator decide this door" },
  { name: "a question with no Door line is left", delegation: level2, input: input(ask("Colour", [])), leave: "no Door line" },
  { name: "a Yours line is left at level 2, whatever the door", delegation: level2, input: input(ask("Colour", ["Door: two-way", "Yours: spend"])), leave: FIVE },
  { name: "a Yours line with an item outside the five is still left at level 2", delegation: level2, input: input(ask("Colour", ["Door: two-way", "Yours: taste"])), leave: FIVE },
  { name: "a first option without the Recommended mark is left", delegation: level2, input: input(ask("Colour", ["Door: two-way"], opts("Red", "Blue (Recommended)"))), leave: NO_RECOMMENDATION },
  { name: "no option marked is left", delegation: level2, input: input(ask("Colour", ["Door: two-way"], opts("Red", "Blue"))), leave: NO_RECOMMENDATION },
  { name: "a multi-select question is left", delegation: level2, input: input(ask("Colour", ["Door: two-way"], undefined, { multiSelect: true })), leave: "a multi-select question has no single recommendation" },
  { name: "a question with no options is left", delegation: level2, input: input(ask("Colour", ["Door: two-way"], [])), leave: NO_RECOMMENDATION },
  { name: "Default while silent alone does not make a question answerable", delegation: level2, input: input(ask("Colour", ["Default while silent: red goes ahead"])), leave: "no Door line" },
  { name: "Default while silent beside a listed door is still answered", delegation: level2, input: input(ask("Colour", ["Default while silent: red goes ahead", "Door: two-way"])), answers: { Colour: "Red (Recommended)" } },
  { name: "the marks are read at the start of a line only", delegation: level2, input: input(ask("Colour", ["I think Door: two-way applies"])), leave: "no Door line" },
  { name: "no table means nothing is answered", delegation: null, input: input(ask("Colour", ["Door: two-way"])), leave: "no delegation table" },
  { name: "level 1 leaves a two-way question with a recommendation", delegation: level1, input: input(ask("Colour", ["Door: two-way"])), leave: NOTHING },
  { name: "level 1 leaves a question whatever its marks", delegation: level1, input: input(ask("Colour", ["Door: costly", "Yours: spend"])), leave: NOTHING },
  { name: "an empty decide list means nothing is answered", delegation: { ...level2, decide: [] }, input: input(ask("Colour", ["Door: two-way"])), leave: "the table does not let the orchestrator decide this door" },
  {
    name: "two answerable questions are both answered, keyed by their headers",
    delegation: level2,
    input: input(ask("Colour", ["Door: two-way"]), ask("Size", ["Door: costly"], opts("Large (Recommended)", "Small"))),
    answers: { Colour: "Red (Recommended)", Size: "Large (Recommended)" },
  },
  {
    name: "one unanswerable question leaves the whole request to the user",
    delegation: level2,
    input: input(ask("Colour", ["Door: two-way"]), ask("Size", ["Door: two-way", "Yours: merge"], opts("Large (Recommended)", "Small"))),
    leave: FIVE,
  },
  { name: "a repeated header is ambiguous and left", delegation: level2, input: input(ask("Colour", ["Door: two-way"]), ask("Colour", ["Door: two-way"])), leave: "two questions share a header" },
  { name: "a question with no header is left", delegation: level2, input: input({ question: "Which?\nDoor: two-way", options: opts("A (Recommended)", "B") }), leave: "a question has no header" },
  { name: "no questions is left", delegation: level2, input: input(), leave: "no questions in the request" },
  { name: "an input that is not an object is left", delegation: level2, input: "AskUserQuestion", leave: "no questions in the request" },
  { name: "an input with no questions array is left", delegation: level2, input: { question: "x" }, leave: "no questions in the request" },
  { name: "an option that is not an object is left", delegation: level2, input: input(ask("Colour", ["Door: two-way"], ["Red (Recommended)"] as unknown as Option[])), leave: NO_RECOMMENDATION },
  { name: "an undefined input is left", delegation: level2, input: undefined, leave: "no questions in the request" },

  { name: "level 3 answers a two-way question like level 2", delegation: level3, input: input(ask("Colour", ["Door: two-way"])), answers: { Colour: "Red (Recommended)" } },
  { name: "level 3 answers a Yours question with a recommendation", delegation: level3, input: input(ask("Colour", ["Door: two-way", "Yours: spend"])), answers: { Colour: "Red (Recommended)" } },
  { name: "level 3 answers a Yours: merge question on a one-way door when the row lists one-way", delegation: level3, input: input(ask("Merge", ["Door: one-way", "Yours: merge"], opts("Merge (Recommended)", "Hold"))), answers: { Merge: "Merge (Recommended)" } },
  { name: "level 3 leaves a one-way door the row does not list", delegation: { ...level3, decide: ["two-way", "costly"] }, input: input(ask("Merge", ["Door: one-way", "Yours: merge"], opts("Merge (Recommended)", "Hold"))), leave: "the table does not let the orchestrator decide this door" },
  { name: "level 3 leaves a Yours question with no recommendation", delegation: level3, input: input(ask("Merge", ["Door: one-way", "Yours: merge"], opts("Merge", "Hold (Recommended)"))), leave: NO_RECOMMENDATION },
  { name: "level 3 leaves a question with no recommended first option", delegation: level3, input: input(ask("Colour", ["Door: two-way"], opts("Red", "Blue"))), leave: NO_RECOMMENDATION },
  { name: "level 3 leaves a question with no Door line", delegation: level3, input: input(ask("Colour", ["Yours: spend"])), leave: "no Door line" },
  { name: "level 3 leaves a multi-select question", delegation: level3, input: input(ask("Colour", ["Door: two-way", "Yours: spend"], undefined, { multiSelect: true })), leave: "a multi-select question has no single recommendation" },
  { name: "level 3 leaves two questions that share a header", delegation: level3, input: input(ask("Colour", ["Door: two-way"]), ask("Colour", ["Door: two-way"])), leave: "two questions share a header" },
];

for (const { name, delegation, input: given, answers, leave } of CASES) {
  test(`decideAnswers: ${name}`, () => {
    const decision = decideAnswers(delegation, given);
    if (answers === undefined) {
      assert.deepEqual(decision, { leave });
    } else {
      assert.deepEqual(decision, { answers });
    }
  });
}

for (const [name, delegation] of [["level 2", level2], ["level 3", level3]] as const) {
  test(`decideAnswers: a stream past its appetite is left at ${name}, whatever the table lets it decide`, () => {
    const decision = decideAnswers(delegation, input(ask("Colour", ["Door: two-way"])), { pastAppetite: true });
    assert.deepEqual(decision, { leave: "the stream is past its appetite" });
  });
}

test("decideAnswers: a stream past its appetite is left at level 3 even for a Yours: spend question", () => {
  const decision = decideAnswers(level3, input(ask("Spend", ["Door: costly", "Yours: spend"])), { pastAppetite: true });
  assert.deepEqual(decision, { leave: "the stream is past its appetite" });
});

test("decideAnswers: a Yours: spend question asked within the appetite is answered at level 3", () => {
  const decision = decideAnswers(level3, input(ask("Spend", ["Door: costly", "Yours: spend"])), { pastAppetite: false });
  assert.deepEqual(decision, { answers: { Spend: "Red (Recommended)" } });
});

test("decideAnswers: level 1 is left before the appetite is read", () => {
  const decision = decideAnswers(level1, input(ask("Colour", ["Door: two-way"])), { pastAppetite: true });
  assert.deepEqual(decision, { leave: NOTHING });
});

test("decideAnswers: a stream within its appetite is answered", () => {
  const decision = decideAnswers(level2, input(ask("Colour", ["Door: two-way"])), { pastAppetite: false });
  assert.deepEqual(decision, { answers: { Colour: "Red (Recommended)" } });
});

test("doorOf: reads the first line that starts with the mark, and nothing from a mark inside a line", () => {
  assert.equal(doorOf("Which?\nDoor: two-way\nDoor: costly"), "two-way");
  assert.equal(doorOf("Which?\r\nDoor:  costly "), "costly");
  assert.equal(doorOf("I think Door: two-way applies"), undefined);
  assert.equal(doorOf(""), undefined);
});
