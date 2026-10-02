// Checks for ticket #33, the docs set: one test per acceptance criterion, each reading only what a
// reader sees in a document. Written to fail on `98d50ea`, where README, ADR 0002, the roadmap and
// the glossary do not say any of this. Plain Node, no dependency: `node --test test/docs/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const flat = (text) => text.replace(/\s+/g, " ").trim();
const has = (text, needle) => assert.ok(flat(text).includes(flat(needle)), `missing: ${needle}`);
const hasNot = (text, needle) => assert.ok(!flat(text).includes(flat(needle)), `still there: ${needle}`);

// The text from the heading line that starts with `prefix` to the next heading of the same or a higher level.
function section(text, prefix) {
  const level = prefix.match(/^#+/)[0].length;
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(prefix));
  assert.notEqual(start, -1, `no heading: ${prefix}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const heading = lines[i].match(/^(#+)\s/);
    if (heading && heading[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

// The items of a numbered or bulleted list, an indented continuation line joined to its item.
function listItems(text) {
  const items = [];
  for (const line of text.split("\n")) {
    if (/^(\d+\.|-)\s/.test(line)) items.push(line.replace(/^(\d+\.|-)\s+/, ""));
    else if (items.length > 0 && /^\s+\S/.test(line)) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items;
}

// The cells of every table row, the header and the separator row included.
function tableRows(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^[-: ]*$/.test(cell)));
}

const linkTargets = (text) => [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);

const ADR = "docs/adr/0002-what-the-plugin-will-never-do.md";
const VISION =
  "matt-with-paseo-plugin is an optional Paseo plugin for people who run the `matt-with-paseo` skills, above all people who run streams unattended. It lets the orchestrator see what its agents do without polling, answers the checkpoints the owner has delegated, and wires each ticket agent when it is created. The skills stay the core and still run without the plugin.";

// README

test("the README no longer says \"Pre-release. Nothing is built yet\"", () => {
  const readme = read("README.md");
  hasNot(readme, "Nothing is built yet");
  hasNot(readme, "**Pre-release.**");
});

test("the README's \"What it is for\" section carries the vision, the design case, a single wave, the skills without the plugin and the three systems", () => {
  const what = section(read("README.md"), "## What it is for");
  has(what, VISION);
  has(what, "The design case is the unattended stream");
  has(what, "a single wave is helped too");
  has(what, "still run without the plugin");
  for (const system of ["Windows", "macOS", "Linux"]) has(what, system);
});

test("that section says \"Claude Code only\" and links to ADR 0002 and docs/roadmap.md", () => {
  const what = section(read("README.md"), "## What it is for");
  has(what, "Claude Code only; other agents prepared through descriptors, not promised");
  const targets = linkTargets(what);
  assert.ok(targets.includes(ADR), "no link to ADR 0002");
  assert.ok(targets.includes("docs/roadmap.md"), "no link to docs/roadmap.md");
});

// ADR 0002

test("ADR 0002 is accepted and lists the six non-goals, each with a reason and evidence", () => {
  const adr = read(ADR);
  assert.ok(adr.startsWith("# What the plugin will never do\n"));
  has(adr, "Status: accepted, 2026-09-30");
  const titles = [
    "Judge acceptance",
    "Be required",
    "Answer what is always the user's",
    "Litter the target repository",
    "Duplicate a Paseo surface or take over the user's config",
    "Write to git itself",
  ];
  titles.forEach((title, i) => {
    const nonGoal = section(adr, `### ${i + 1}. ${title}`);
    has(nonGoal, "Reason:");
    has(nonGoal, "Evidence:");
  });
  assert.equal(adr.split("\n").filter((line) => /^### \d+\. /.test(line)).length, 6);
});

test("ADR 0002 non-goal 1 says the plugin only flags cases for the skills' judgement", () => {
  has(section(read(ADR), "### 1. "), "only flags cases for the skills' judgement");
});

test("ADR 0002 non-goal 2 says a plugin failure never breaks a stream", () => {
  has(section(read(ADR), "### 2. "), "a plugin failure never breaks a stream");
});

test("ADR 0002 non-goal 3 names the five items and the question with no recommendation", () => {
  const nonGoal = section(read(ADR), "### 3. ");
  for (const item of [
    "a change to the concept (spec, words, ADRs)",
    "adding or dropping tickets",
    "spend past the appetite",
    "irreversible actions",
    "merging the PR",
    "a question with no recommendation is never answered for the user",
  ]) {
    has(nonGoal, item);
  }
});

test("ADR 0002 non-goal 4 says one marked block and state outside the repo", () => {
  const nonGoal = section(read(ADR), "### 4. ");
  has(nonGoal, "writes nothing outside one marked block");
  has(nonGoal, "keeps its state outside the repo");
});

test("ADR 0002 non-goal 5 names no custom UI, no settings page, no provider per role and the user's Claude config", () => {
  const nonGoal = section(read(ADR), "### 5. ");
  for (const item of [
    "no custom UI where Paseo has a native form",
    "no sidebar settings page",
    "no provider per role",
    "does not rewrite the user's Claude config",
  ]) {
    has(nonGoal, item);
  }
});

test("ADR 0002 non-goal 6 says never commits, pushes or merges, guards ticket agents' git, and notes thinner evidence", () => {
  const nonGoal = section(read(ADR), "### 6. ");
  for (const item of [
    "never commits, pushes or merges",
    "only guards ticket agents' git",
    "thinner evidence",
    "easier to relax",
  ]) {
    has(nonGoal, item);
  }
});

test("ADR 0002 Consequences say placement questions and the parity table's \"out\" rows are decided against it", () => {
  const consequences = section(read(ADR), "## Consequences");
  has(consequences, "Placement questions");
  has(consequences, "the parity table's \"out\" rows are decided against this ADR");
});

// ADR 0004 (ticket #57): three autonomy levels, superseding non-goal 3 of ADR 0002 and amending non-goal 6

const ADR4_FILE = "docs/adr/0004-three-autonomy-levels.md";
const ADR4_LINK = "0004-three-autonomy-levels.md";

test("ADR 0004 is accepted and holds the sections of an ADR, the three levels and what stays at every level", () => {
  const adr = read(ADR4_FILE);
  assert.ok(adr.startsWith("# Three autonomy levels\n"));
  assert.match(adr, /^Status: accepted, 2026-10-01/m);
  for (const heading of ["## Context", "## Decision", "## Consequences"]) section(adr, heading);
  const levels = section(adr, "### The three levels");
  for (const level of ["Level 1", "Level 2", "Level 3"]) has(levels, `**${level}**`);
  has(adr, "`Level`");
  has(adr, "`Switch`");
  const stays = listItems(section(adr, "### What stays at every level"));
  assert.equal(stays.length, 5);
  has(stays[0], "no recommendation");
  has(stays[1], "git");
  has(stays[2], "appetite");
  has(stays[3], "budget");
  has(stays[4], "decision log");
});

test("ADR 0004 names the default, the Switch mapping, the owner's words, D120's reading and the appetite choice", () => {
  const adr = read(ADR4_FILE);
  has(section(adr, "### The default"), "level 1");
  has(section(adr, "### The default"), "A `Level` row wins over `Switch`");
  has(section(adr, "### The default"), "`on` is level 2");
  const evidence = section(adr, "### Context and evidence");
  has(evidence, "Cấp 3 là thả cửa");
  has(evidence, "D120");
  has(evidence, "without clear evidence");
  has(adr, "hanh9898/matt-with-paseo#110");
  has(adr, "Requires plugin contract: 1");
});

test("ADR 0002 points to ADR 0004 from its status line and from non-goals 3 and 6, and non-goal 6 reads \"below level 3\"", () => {
  const adr = read(ADR);
  assert.match(adr, /^Status: accepted, 2026-09-30; non-goal 3 superseded and non-goal 6 amended by ADR 0004$/m);
  assert.ok(linkTargets(section(adr, "### 3. ")).includes(ADR4_LINK), "non-goal 3 has no link to ADR 0004");
  const sixth = section(adr, "### 6. ");
  assert.ok(linkTargets(sixth).includes(ADR4_LINK), "non-goal 6 has no link to ADR 0004");
  has(sixth, "merge stays with a human below level 3");
  hasNot(sixth, "merge stays with a human, and");
});

// That the plugin runs no git is proven on the code (`test/state-outside-repo.test.ts` refuses `node:child_process`);
// here only the structure: ADR 0004 links back to ADR 0002, whose non-goal 6 it amends.
test("ADR 0004 links ADR 0002, and ADR 0002 keeps its non-goal 6 heading", () => {
  assert.ok(linkTargets(read(ADR4_FILE)).some((target) => target.endsWith("0002-what-the-plugin-will-never-do.md")), "no link to ADR 0002");
  assert.ok(read(ADR).split("\n").some((line) => line.startsWith("### 6. ")), "ADR 0002 has no non-goal 6 heading");
});

test("the README links ADR 0004 next to ADR 0002 and says the five items reach the owner below level 3", () => {
  const readme = read("README.md");
  assert.ok(linkTargets(readme).includes(`docs/adr/${ADR4_LINK}`), "no link to ADR 0004");
  has(readme, "below level 3");
});

// The roadmap

const ROADMAP = "docs/roadmap.md";
const MILESTONES = [
  [1, "Supervision and Delegation"],
  [2, "The watch"],
  [3, "Team panel"],
  [4, "Our strengths made real"],
  [5, "Self-tuning orchestration"],
];
const milestone = (roadmap, n) => section(roadmap, `## v0.${n}.0: `);

test("the roadmap states the rules for every milestone", () => {
  const rules = section(read(ROADMAP), "## Rules for every milestone");
  has(rules, "Each milestone is one release");
  has(rules, "The user tags it after its `release/v0.x.0` pull request merges");
  has(rules, "`Test run:`");
  has(rules, "Code review: deferred to the milestone");
  has(rules, "contract version only");
  has(rules, "updates this file in its pull request");
});

// The patch release `v0.1.1` (the stream `plugin-setup`) sits between `v0.1.0` and `v0.2.0`.
const RELEASES = [
  ["v0.1.0", "Supervision and Delegation"],
  ["v0.1.1", "One-command setup"],
  ...MILESTONES.slice(1).map(([n, theme]) => [`v0.${n}.0`, theme]),
];

test("the roadmap lists v0.1.0 to v0.5.0 in order with the patch release v0.1.1 after v0.1.0, each with its theme, and its exit criteria end with its milestone run", () => {
  const roadmap = read(ROADMAP);
  const headings = roadmap.split("\n").filter((line) => /^## v0\./.test(line));
  assert.equal(headings.length, 6);
  RELEASES.forEach(([version, theme], i) => {
    assert.ok(headings[i].startsWith(`## ${version}: `), `release ${i + 1} is out of order`);
    has(headings[i], theme);
    const criteria = listItems(section(section(roadmap, `## ${version}: `), "### Exit criteria"));
    assert.ok(criteria.length >= 2, `${version} lists no exit criteria`);
    has(criteria[criteria.length - 1], `The \`${version}\` milestone run`);
  });
  has(roadmap.split("\n## ")[0], "`v0.1.1`");
});

test("v0.1.0 lists the issues it carries, the new tickets by number, the fifteen exit criteria in order, the skills-side dependencies and the named fallback", () => {
  const v1 = milestone(read(ROADMAP), 1);
  const carried = section(v1, "### Carried by existing issues");
  for (let n = 1; n <= 19; n++) {
    if (n === 8) assert.ok(!/#8\b/.test(carried), "#8 is outside every milestone");
    else assert.ok(new RegExp(`#${n}\\b`).test(carried), `#${n} not carried`);
  }

  const tickets = listItems(section(v1, "### New tickets"));
  assert.deepEqual(
    tickets.map((item) => Number(item.match(/#(\d+)\s*$/)?.[1])),
    [34, 33, 37, 35, 36, 38, 39, 40, 41, 43, 45, 48, 49, 57, 58, 51, 52, 53, 54, 55, 56],
  );

  const criteria = listItems(section(v1, "### Exit criteria"));
  assert.equal(criteria.length, 15);
  [
    "CI is green on Windows, macOS and Linux (#17)",
    "A smoke test passes on a real daemon",
    "One version token, `0.1.0`, across the manifests (#16)",
    "The `requirements.paseo` range is recorded next to the smoke test's Paseo version",
    "MIT, with a `NOTICE` crediting sting9k/seatworks",
    "The skills run with the plugin absent (skills side)",
    "Contract v1 exists and a skills release reads it",
    "A delegated question is answered within the `## Delegation` table's level and rules and never outside them",
    "The question budget and the appetite are counted",
    "The report card shows what was decided on the user's behalf",
    "`decision-log.md`",
    "An unattended stream runs end to end with no heartbeat and with delegation on",
    "The README carries the vision, and ADR 0002 and `docs/roadmap.md` exist",
    "The README documents installing from git and says it was tested on Node 22, with no `engines` field",
    "The `v0.1.0` milestone run",
  ].forEach((snippet, i) => has(criteria[i], snippet));

  const dependencies = section(v1, "### Skills-side dependencies");
  has(dependencies, "listed, not filed");
  assert.equal(listItems(dependencies).length, 8);
  has(dependencies, "`decisions.md`");
  has(dependencies, "hanh9898/matt-with-paseo#78");
  has(dependencies, "hanh9898/matt-with-paseo#91");
  has(dependencies, "the `## Delegation` table format");

  const fallback = section(v1, "### Named fallback");
  has(fallback, "ships the plugin alone");
  has(fallback, "proven against the contract on the fake host");
  has(fallback, "Criteria 6, 7, 8, 10 and 12 then move to `v0.2.0`");
});

test("v0.2.0's watch carries the bundle-stop condition", () => {
  const v2 = milestone(read(ROADMAP), 2);
  const bundleStop = section(v2, "### The bundle-stop condition");
  has(bundleStop, "at each ticket agent's turn end");
  for (const verdict of ["progressing", "looping", "losing-earlier-constraints", "slice-done", "unsure"]) {
    has(bundleStop, `\`${verdict}\``);
  }
  has(bundleStop, "anything other than `progressing` or `slice-done` is passed to the stream agent as a flag");
  has(bundleStop, "never acted on");
  has(bundleStop, "one more entry of the pattern catalog (#7), not a new capability");
});

test("v0.5.0 is marked as proposed by the orchestrator and open to the owner's change", () => {
  const v5 = milestone(read(ROADMAP), 5);
  has(v5, "proposed by the orchestrator");
  has(v5, "open to the owner's change");
});

test("every issue #1-#19 is placed in a milestone or outside every milestone, with a reason", () => {
  const rows = tableRows(section(read(ROADMAP), "## Placement of issues #1 to #19"));
  for (let n = 1; n <= 19; n++) {
    const row = rows.find((cells) => cells[0] === `#${n}`);
    assert.ok(row, `#${n} has no row`);
    assert.match(row[1], /^(`v0\.[1-5]\.0`|outside every milestone)$/, `#${n}: no milestone`);
    assert.ok(row[2] && row[2].length > 10, `#${n}: no reason`);
  }
  assert.equal(rows.find((cells) => cells[0] === "#8")[1], "outside every milestone");
});

test("#8, the checkpoint card and a second harness are outside every milestone, each with its reason", () => {
  const outside = listItems(section(read(ROADMAP), "## Outside every milestone"));
  assert.equal(outside.length, 3);
  has(outside[0], "#8");
  has(outside[1], "The checkpoint card");
  has(outside[2], "A second harness");
  outside.forEach((item) => assert.ok(item.length > 40, `no reason: ${item}`));
});

test("the parity table maps each seatworks capability at 6d316b0 to a milestone or to \"out\", with its carrying issue and the ground of each \"out\"", () => {
  const roadmap = read(ROADMAP);
  const parity = section(roadmap, "## Seatworks parity table");
  has(parity, "6d316b0");
  const rows = tableRows(parity).slice(1);
  const ids = [
    ...["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"],
    ...["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"],
    ...["U1", "U2", "U3", "U4", "U5", "U6"],
    ...["W1", "W2", "W3", "W4 Claude Code", "W4 Codex", "W4 Pi", "W5", "W6", "W7", "W8", "W9", "W10"],
    ...["R1", "R2", "R3"],
    ...["X1", "X2", "X3", "X4", "X5", "npm distribution"],
  ];
  const rowOf = (id) => {
    const row = rows.find((cells) => new RegExp(`^${id}\\b`).test(cells[0]));
    assert.ok(row, `no parity row for ${id}`);
    return row;
  };
  for (const id of ids) {
    const [, where, carried] = rowOf(id);
    assert.match(where, /^(`v0\.[1-4]\.0`|skills side|out\b)/, `${id}: no milestone or "out"`);
    assert.ok(carried.length > 0, `${id}: no carrying issue`);
  }
  for (const id of ["D7", "D8", "U3", "U5", "W4 Codex", "W4 Pi", "W6", "W7", "W8", "R2", "R3", "npm distribution"]) {
    const [, where] = rowOf(id);
    assert.match(where, /^out\b/, `${id} is not out`);
    assert.match(where, /non-goals? \d|Doesn't transfer|vision|owner/, `${id}: no ground for "out"`);
  }
  // The changes of the Decision on #28 of 2026-09-30, applied.
  assert.match(rowOf("D1")[1], /^`v0\.1\.0`/);
  [["D2", "#38"], ["D3", "#39"], ["D4", "#40"], ["D5", "#41"], ["X3", "#36"], ["X4", "#37"]].forEach(([id, issue]) => {
    assert.match(rowOf(id)[1], /^`v0\.1\.0`/, `${id} is not in v0.1.0`);
    has(rowOf(id)[2], issue);
  });
  for (const id of ["U1", "U2", "W5"]) assert.match(rowOf(id)[1], /^`v0\.3\.0`/, `${id} is not in v0.3.0`);
  for (const id of ["S4", "S5", "S6", "S7", "S8", "X5"]) assert.match(rowOf(id)[1], /^`v0\.2\.0`/, `${id} is not in v0.2.0`);
  assert.doesNotMatch(roadmap, /skills ?#\d+/, "write a skills issue as hanh9898/matt-with-paseo#<n>");
});

// The glossary and the pointers to it

test("GLOSSARY.md defines \"the skills\" and \"the plugin\" with the \"avoid\" note, and redefines none of the skills' words", () => {
  const glossary = read("GLOSSARY.md");
  has(glossary, "the Claude Code plugin `matt-with-paseo`");
  has(glossary, "only this Paseo plugin, `matt-with-paseo-plugin`");
  has(glossary, "Never call the skills \"the plugin\"");
  const defined = glossary.split("\n").filter((line) => /^\*\*/.test(line)).map((line) => line.match(/^\*\*([^*]+)\*\*/)[1]);
  assert.deepEqual(defined, ["The skills", "The plugin"]);
});

test("AGENTS.md and the domain doc point to GLOSSARY.md and no longer say there is none", () => {
  for (const path of ["AGENTS.md", "docs/agents/domain.md"]) {
    const text = read(path);
    assert.doesNotMatch(flat(text), /no `?GLOSSARY\.md`? yet/i, `${path} still says there is no glossary`);
    has(text, "`GLOSSARY.md` at the repo root");
  }
});

// The upkeep line

test("the PR template carries the \"the roadmap is updated\" line for a pull request that ships a milestone", () => {
  const line = read(".github/pull_request_template.md")
    .split("\n")
    .find((text) => /^- \[ \]/.test(text) && text.includes("the roadmap is updated"));
  assert.ok(line, "no checklist line");
  has(line, "ships a milestone");
});

test("the evidence standards carry the upkeep line", () => {
  has(read("docs/agents/evidence-standards.md"), "The stream that ships a milestone updates the roadmap in its pull request");
});

// Passes on `98d50ea` by design: it guards a file this ticket must leave alone (#25).
test("the ship rules are unchanged: they say nothing of the roadmap", () => {
  hasNot(read("docs/agents/ship-rules.md"), "roadmap");
});

// Every relative link of the files this ticket edits resolves.

test("every relative link of the edited documents resolves", () => {
  const files = [
    "README.md",
    "AGENTS.md",
    "GLOSSARY.md",
    ADR,
    ADR4_FILE,
    ROADMAP,
    "docs/agents/domain.md",
    "docs/agents/evidence-standards.md",
    ".github/pull_request_template.md",
  ];
  for (const file of files) {
    for (const target of linkTargets(read(file))) {
      if (/^([a-z]+:|#)/i.test(target)) continue;
      const path = target.split("#")[0];
      assert.ok(existsSync(resolve(root, dirname(file), path)), `${file}: broken link ${target}`);
    }
  }
});
