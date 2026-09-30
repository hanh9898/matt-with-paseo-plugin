import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { MARKED_BLOCK, STATE_DIR_ENV, STATE_DIR_NAME } from "../shared/state-location.ts";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function developmentSection(): string {
  const readme = read("README.md");
  const start = readme.indexOf("\n## Development");
  assert.ok(start !== -1, "README has a ## Development heading");
  const rest = readme.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

function stateSubsection(): string {
  const section = developmentSection();
  const start = section.indexOf("### State outside the repository");
  assert.ok(start !== -1, "the Development section has a 'State outside the repository' subsection");
  return section.slice(start).split("\n### ", 2)[0] ?? "";
}

test("the layout table lists the state location and the state module", () => {
  const rows = developmentSection().split("\n").filter((line) => line.startsWith("| `"));
  for (const path of ["shared/state-location.ts", "server/state.ts"]) {
    assert.ok(rows.some((row) => row.startsWith(`| \`${path}\``)), `layout table has a row for ${path}`);
  }
});

test("the README names where state lives, the one marked block and the check (criterion 1)", () => {
  const words = stateSubsection();
  for (const needle of [STATE_DIR_ENV, STATE_DIR_NAME, MARKED_BLOCK.file, MARKED_BLOCK.begin, MARKED_BLOCK.end, "test/state-outside-repo.test.ts", "0.10.1"]) {
    assert.ok(words.includes(needle), `the subsection names ${needle}`);
  }
});

test("the README inventories every holder of state, so a new one is a row to add", () => {
  const words = stateSubsection();
  for (const holder of ["server/hooks/gate-cap.ts", "server/hooks/lifecycle-relay.ts", "server/hooks/stall-sensor.ts", "server/hooks/waiting-count.ts", "client/waiting-pill.ts", "server/harness.ts", "server/sensor.ts", "server/decision-log.ts"]) {
    assert.ok(words.includes(holder), `the inventory names ${holder}`);
  }
  assert.ok(words.includes("in memory"), "the inventory says what is held in memory");
});

test("the README says the state rule covers the plugin's own writes and the wave files stay in the checkout", () => {
  const words = stateSubsection();
  assert.ok(words.includes("wave<N>-common-rules.md"), "the subsection names the wave file");
  assert.ok(words.includes("covers the plugin's own writes"), "the subsection limits the state rule to the plugin's own writes");
  assert.ok(words.includes("integration branch's checkout"), "the subsection says where the wave file stays");
  assert.ok(words.includes("#12"), "the subsection names the decision's ticket");
  assert.ok(!/decided separately/i.test(words), "the subsection no longer calls the place undecided");
});

test("the changelog and the smoke test carry the state location", () => {
  assert.match(read("CHANGELOG.md"), /State outside the repository:/);
  assert.ok(!/decided separately/i.test(read("CHANGELOG.md")), "the changelog no longer calls the wave files' place undecided");
  const smoke = read("test/smoke/README.md");
  assert.ok(smoke.includes("## State outside the repository"), "the smoke test has a State outside the repository section");
  assert.ok(smoke.includes(STATE_DIR_ENV));
});
