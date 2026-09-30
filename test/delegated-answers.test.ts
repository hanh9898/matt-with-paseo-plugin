import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAnswers } from "../server/delegated-answers.ts";
import type { Delegation } from "../shared/delegation.ts";

const on: Delegation = { on: true, decide: ["two-way", "costly"], appetite: null };

type Option = { label: string; description?: string };
const opts = (...labels: string[]): Option[] => labels.map((label) => ({ label, description: "" }));

function ask(header: string, lines: string[], options: Option[] = opts("Red (Recommended)", "Blue"), extra: object = {}) {
  return { header, question: ["Which colour?", ...lines].join("\n"), options, multiSelect: false, ...extra };
}
const input = (...questions: object[]) => ({ questions });

/** Each case is a delegation, an `AskUserQuestion` input and the decision: answers keyed by header, or a reason to leave it. */
const CASES: { name: string; delegation: Delegation | null; input: unknown; answers?: Record<string, string> }[] = [
  { name: "a two-way question with a recommendation is answered with it", delegation: on, input: input(ask("Colour", ["Door: two-way"])), answers: { Colour: "Red (Recommended)" } },
  { name: "a costly door in the table is answered", delegation: on, input: input(ask("Colour", ["Door: costly"])), answers: { Colour: "Red (Recommended)" } },
  { name: "a door the table does not list is left", delegation: { ...on, decide: ["two-way"] }, input: input(ask("Colour", ["Door: costly"])) },
  { name: "a one-way door is left even when the table lists it", delegation: { ...on, decide: ["two-way", "costly"] }, input: input(ask("Colour", ["Door: one-way"])) },
  { name: "a question with no Door line is left", delegation: on, input: input(ask("Colour", [])) },
  { name: "a Yours line is left, whatever the door", delegation: on, input: input(ask("Colour", ["Door: two-way", "Yours: spend"])) },
  { name: "a Yours line with an item outside the five is still left", delegation: on, input: input(ask("Colour", ["Door: two-way", "Yours: taste"])) },
  { name: "a first option without the Recommended mark is left", delegation: on, input: input(ask("Colour", ["Door: two-way"], opts("Red", "Blue (Recommended)"))) },
  { name: "no option marked is left", delegation: on, input: input(ask("Colour", ["Door: two-way"], opts("Red", "Blue"))) },
  { name: "a multi-select question is left", delegation: on, input: input(ask("Colour", ["Door: two-way"], undefined, { multiSelect: true })) },
  { name: "a question with no options is left", delegation: on, input: input(ask("Colour", ["Door: two-way"], [])) },
  { name: "Default while silent alone does not make a question answerable", delegation: on, input: input(ask("Colour", ["Default while silent: red goes ahead"])) },
  { name: "Default while silent beside a listed door is still answered", delegation: on, input: input(ask("Colour", ["Default while silent: red goes ahead", "Door: two-way"])), answers: { Colour: "Red (Recommended)" } },
  { name: "the marks are read at the start of a line only", delegation: on, input: input(ask("Colour", ["I think Door: two-way applies"])) },
  { name: "no table means nothing is answered", delegation: null, input: input(ask("Colour", ["Door: two-way"])) },
  { name: "the switch off means nothing is answered", delegation: { ...on, on: false }, input: input(ask("Colour", ["Door: two-way"])) },
  { name: "an empty decide list means nothing is answered", delegation: { ...on, decide: [] }, input: input(ask("Colour", ["Door: two-way"])) },
  {
    name: "two answerable questions are both answered, keyed by their headers",
    delegation: on,
    input: input(ask("Colour", ["Door: two-way"]), ask("Size", ["Door: costly"], opts("Large (Recommended)", "Small"))),
    answers: { Colour: "Red (Recommended)", Size: "Large (Recommended)" },
  },
  {
    name: "one unanswerable question leaves the whole request to the user",
    delegation: on,
    input: input(ask("Colour", ["Door: two-way"]), ask("Size", ["Door: two-way", "Yours: merge"], opts("Large (Recommended)", "Small"))),
  },
  { name: "a repeated header is ambiguous and left", delegation: on, input: input(ask("Colour", ["Door: two-way"]), ask("Colour", ["Door: two-way"])) },
  { name: "a question with no header is left", delegation: on, input: input({ question: "Which?\nDoor: two-way", options: opts("A (Recommended)", "B") }) },
  { name: "no questions is left", delegation: on, input: input() },
  { name: "an input that is not an object is left", delegation: on, input: "AskUserQuestion" },
  { name: "an input with no questions array is left", delegation: on, input: { question: "x" } },
  { name: "an option that is not an object is left", delegation: on, input: input(ask("Colour", ["Door: two-way"], ["Red (Recommended)"] as unknown as Option[])) },
  { name: "an undefined input is left", delegation: on, input: undefined },
];

for (const { name, delegation, input: given, answers } of CASES) {
  test(`decideAnswers: ${name}`, () => {
    const decision = decideAnswers(delegation, given);
    if (answers === undefined) {
      assert.ok("leave" in decision, "the request is left to the user");
      assert.equal(typeof decision.leave, "string");
    } else {
      assert.ok("answers" in decision, "the request is answered");
      assert.deepEqual(decision.answers, answers);
    }
  });
}

test("decideAnswers: a stream past its appetite is left, whatever the table lets it decide", () => {
  const decision = decideAnswers(on, input(ask("Colour", ["Door: two-way"])), { pastAppetite: true });
  assert.ok("leave" in decision);
});

test("decideAnswers: a stream within its appetite is answered", () => {
  const decision = decideAnswers(on, input(ask("Colour", ["Door: two-way"])), { pastAppetite: false });
  assert.deepEqual("answers" in decision && decision.answers, { Colour: "Red (Recommended)" });
});
