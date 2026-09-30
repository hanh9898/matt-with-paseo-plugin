# Roadmap

Where matt-with-paseo-plugin is going: five milestones, `v0.1.0` to `v0.5.0`, in order. The last one planned is `v0.5.0`. `v0.1.0` is the first release that runs a stream unattended, supervision and delegation together. The plan is the owner's cut of 2026-09-30 ([Decision on #28](https://github.com/hanh9898/matt-with-paseo-plugin/issues/28#issuecomment-5894688816)). What the plugin will never do bounds every milestone: [ADR 0002](adr/0002-what-the-plugin-will-never-do.md).

## Rules for every milestone

- Each milestone is one release. Several streams may deliver it. The user tags it after its `release/v0.x.0` pull request merges.
- Every milestone's exit criteria end with the milestone run, on `release/v0.x.0` cut from `main` once every stream of the milestone has merged ([evidence standards](agents/evidence-standards.md)). The run is:
  1. one full test run, plus the smoke steps on a real Paseo daemon;
  2. one milestone-wide code review, on both axes;
  3. one fix pass;
  4. the eval, when there is a plugin to eval.
- Every new ticket's `Resolved:` reads `Tests: deferred to the milestone` and `Code review: deferred to the milestone`.
- The plugin pairs with the skills repo by contract version only. The release numbers of the two repos are independent.
- The stream that ships a milestone updates this file in its pull request.

## v0.1.0: Supervision and Delegation, the first unattended stream

Status: in progress (the milestone run, on `release/v0.1.0`)

### Carried by existing issues

#1, #2, #3, #4, #5, #6, #7, #9 (pill only), #10, #11, #12, #13, #14, #15, #16, #17, #18 and #19 (the stream `matt-with-paseo-plugin`).

### New tickets

1. Contract v1 and its ADR: #34
2. This docs set: #33
3. Release checklist and `NOTICE`: #37
4. Re-set the ticket marker on session open: #35
5. One check command: #36
6. Answer delegated checkpoints from the `## Delegation` table: #38
7. Question budget per day: #39
8. Appetite from turn costs: #40
9. Report card from the record: #41
10. Relay stream agents: #43
11. Relay and mark bundle agents: #45
12. Stall suspected for a running stream agent: #48
13. Stall suspected for a running ticket agent: #49

### Exit criteria

In the order they are met:

1. CI is green on Windows, macOS and Linux (#17).
2. A smoke test passes on a real daemon.
3. One version token, `0.1.0`, across the manifests (#16), and `CHANGELOG.md` has its entry.
4. The `requirements.paseo` range is recorded next to the smoke test's Paseo version, and the checklist has the widening step (#3, #15).
5. MIT, with a `NOTICE` crediting sting9k/seatworks.
6. The skills run with the plugin absent (skills side).
7. Contract v1 exists and a skills release reads it.
8. A delegated question is answered within the `## Delegation` table's rules and never outside them. The user's five items and any question with no recommendation still reach the user.
9. The question budget and the appetite are counted: a stream past its appetite sends its questions to the user, and a spent budget tells the user and widens no delegation (#39).
10. The report card shows what was decided on the user's behalf.
11. An unattended stream runs end to end with no heartbeat and with delegation on.
12. The README carries the vision, and ADR 0002 and `docs/roadmap.md` exist.
13. The README documents installing from git and says it was tested on Node 22, with no `engines` field.
14. The `v0.1.0` milestone run.

### Skills-side dependencies

These are listed, not filed: filing them in `hanh9898/matt-with-paseo` stays with the owner.

- #1 criteria 3 and 4;
- the skills halves of #5 and #17;
- plugin detection and the required contract version;
- the `## Delegation` table format;
- hanh9898/matt-with-paseo#78 (recommendation, default while silent, door class);
- hanh9898/matt-with-paseo#91 (report card from the record);
- criterion 6 above.

### Named fallback

If the skills side is late, `v0.1.0` ships the plugin alone, with its delegation halves proven against the contract on the fake host. Criteria 6, 7, 8, 10 and 11 then move to `v0.2.0`. Contract v1 ships in `v0.1.0` either way.

## v0.2.0: The watch

Status: planned

### New tickets

- Code facts from the watch (S4).
- A pattern catalog, one condition at a time (S5). It extends #7.
- Incidents marked useful or noise (S6).
- The watch log (S7).
- A hold cuts the turn short (S8).
- The watch eval (X5).
- The bundle-stop condition, below.

### The bundle-stop condition

The skills' coming ADR 0010 (stream `ticket-sizing` in hanh9898/matt-with-paseo) relies on this condition. It runs at each ticket agent's turn end: Jev, the watch's sensor, picks one of `progressing`, `looping`, `losing-earlier-constraints`, `slice-done`, `unsure`. The verdict is never acted on by the plugin: anything other than `progressing` or `slice-done` is passed to the stream agent as a flag, and the stream agent decides. It is one more entry of the pattern catalog (#7), not a new capability. The user added it, relayed by the orchestrator on 2026-09-30.

### Exit criteria

- Every catalog condition lives as data.
- Only flagged cases reach the skills' judgement.
- The watch eval passes.
- The bundle-stop verdicts are a catalog entry, and a flag reaches the stream agent and is never acted on.
- The fallback criteria from `v0.1.0`, if the fallback was taken.
- The `v0.2.0` milestone run.

## v0.3.0: Team panel

Status: planned

### New tickets

- Status panel in the workspace (U1).
- A Health section in that panel (U2).
- Optional MCP servers per role (W5).

### Exit criteria

- The panel shows every running stream's tickets, with a screenshot in Paseo's window.
- Health reports the plugin's own state.
- An optional server reaches only the roles it names.
- The `v0.3.0` milestone run.

## v0.4.0: Our strengths made real

Status: planned

What matt-with-paseo does better than seatworks becomes a capability the user drives from Paseo's own surfaces: the panel, the pill and cards, with no sidebar settings page (non-goal 5). Every judgement stays in the skills (non-goal 1).

### New tickets

- Cross-repo streams board: one control folder, many repos, the agent cap and the quotas.
- Dependency graph and waves of a stream, with the next wave's approval.
- Overlap and need warnings between streams, as cards.
- The ship question with the PR preview: ship branch, left-out paths, merge danger. The answer stays the user's, and the plugin writes no git itself (non-goal 6).
- Intake launch from the board: triage, wayfinder, to-spec, to-tickets.
- The decisions log per stream, beside the report card.

### Exit criteria

- Each surface shows, with a screenshot in Paseo's window, what the skills' record holds.
- Each action (a wave approval, a warning's choice, the ship answer, an intake launch) reaches the skill that decides it. The plugin decides none of them.
- A card with buttons follows an RPC round-trip proof ([ADR 0001](adr/0001-checkpoints-use-paseo-native-questions-answered-by-the-plugin.md), Consequences).
- The `v0.4.0` milestone run.

## v0.5.0: Self-tuning orchestration

Status: proposed by the orchestrator; open to the owner's change.

### New tickets

From what the record already counts, propose changes to quotas, delegation defaults and review depth. The counts are: reviews and checkpoints that changed the work (hanh9898/matt-with-paseo#92), orchestrator overhead (hanh9898/matt-with-paseo#98), restarts, respawns, stalls, and conflicts at merge. Each proposal is a recommendation the owner accepts, and none is applied silently.

### Exit criteria

- Each proposal names the counts it rests on.
- Nothing changes until the owner accepts it, and an accepted change is recorded.
- The `v0.5.0` milestone run.

## Outside every milestone

- #8 Dynamically narrowed MCP tool schemas: its premise is false under ADR 0001, which answers through `respondToPermission` and no MCP tool ([#24](https://github.com/hanh9898/matt-with-paseo-plugin/issues/24)). It returns only if delegation becomes an MCP tool, and then it pulls in hanh9898/matt-with-paseo#78.
- The checkpoint card: ADR 0001 draws no custom checkpoint card, and non-goal 5 rules out a copy of Paseo's question form. It returns only if ADR 0001 is reopened.
- A second harness: none is in this plan (owner, 2026-09-30). #6 and #19 keep their scope, and other agents stay prepared through descriptors, not promised.

## Placement of issues #1 to #19

Every plugin issue is in one milestone or outside all of them. Their scope, labels and comments are as their tickets say.

| Issue | Milestone | Reason |
|---|---|---|
| #1 | `v0.1.0` | Lifecycle events reach the orchestrator as messages instead of heartbeats: the core of supervision (S1, S9). |
| #2 | `v0.1.0` | The git guard wires each ticket agent at creation; the marker re-set (#35) completes it (W3). |
| #3 | `v0.1.0` | The host range in the manifest, widened per Paseo minor (X1). |
| #4 | `v0.1.0` | The one narrow host port every other plugin issue builds on. |
| #5 | `v0.1.0` | A message ends with its ask and is held until the turn ends (S2); its skills half is a skills-side dependency. |
| #6 | `v0.1.0` | Roles and harnesses as data, scope unchanged: the descriptors are how other agents are prepared, not promised. |
| #7 | `v0.1.0` | The cheap sensor: conditions as data, stall flags only; the pattern catalog that extends it is `v0.2.0`. |
| #8 | outside every milestone | Its premise is false under ADR 0001 (#24). |
| #9 | `v0.1.0` | The pill only, as built: ADR 0001 draws no checkpoint card (#24). |
| #10 | `v0.1.0` | Gates capped to a share of the machine (W9). |
| #11 | `v0.1.0` | Human words to a worker reach the orchestrator (S3). |
| #12 | `v0.1.0` | State outside the repo, one marked block inside (non-goal 4, R1). |
| #13 | `v0.1.0` | Cost levels per role (W2). |
| #14 | `v0.1.0` | Role identity on labels, no provider per role (non-goal 5, W1, W6). |
| #15 | `v0.1.0` | The host-range widening step of every release; the release checklist (#37) extends it. |
| #16 | `v0.1.0` | One version token across the manifests: exit criterion 3. |
| #17 | `v0.1.0` | CI green on the three systems: exit criterion 1; its skills half is a skills-side dependency. |
| #18 | `v0.1.0` | Plain words on screen: with #9, the pill's words are the only on-screen text of `v0.1.0` (#24). |
| #19 | `v0.1.0` | The explicit sandbox field per harness, scope unchanged; no second harness is planned. |

## Seatworks parity table

What sting9k/seatworks offers at `6d316b0`, mapped to a milestone or to "out", with its carrying issue. Each "out" row names the non-goal of [ADR 0002](adr/0002-what-the-plugin-will-never-do.md), the "Doesn't transfer" entry, the vision point or the owner's decision behind it. `v0.4.0` and `v0.5.0` go past seatworks, so they have no row.

| Seatworks capability | Milestone, or out and why | Carried by |
|---|---|---|
| S1 Lifecycle events as mail, no heartbeat | `v0.1.0` | #1 |
| S2 A letter ends with its ask, held until the turn ends | `v0.1.0` | #5 |
| S3 Human words to a worker reach the orchestrator | `v0.1.0` | #11 |
| S4 Code facts from the watch | `v0.2.0` | new `v0.2.0` ticket: code facts |
| S5 Pattern catalog, one condition at a time | `v0.2.0` | #7 and a new `v0.2.0` ticket: the catalog |
| S6 Incidents marked useful or noise | `v0.2.0` | new `v0.2.0` ticket: incidents |
| S7 Watch log | `v0.2.0` | new `v0.2.0` ticket: the watch log |
| S8 A hold cuts the turn short | `v0.2.0` | new `v0.2.0` ticket: the hold |
| S9 An irreversible command reaches the orchestrator at once | `v0.1.0` | #1 |
| D1 Loop switch and standing orders | `v0.1.0` | skills side: the `## Delegation` table format |
| D2 Delegated answers with the recommendation | `v0.1.0` | #38, hanh9898/matt-with-paseo#78 |
| D3 Question budget per day | `v0.1.0` | #39, hanh9898/matt-with-paseo#78 |
| D4 Appetite and spend | `v0.1.0` | #40 |
| D5 Report card from the record | `v0.1.0` | #41, hanh9898/matt-with-paseo#91 |
| D6 Waiting pill | `v0.1.0` | #9 |
| D7 Custom question cards | out: non-goal 5 (Paseo's native question, ADR 0001) | – |
| D8 Landing held for approval | out: non-goals 1 and 6 (merging is the skills' and the user's) | – |
| U1 Team tab | `v0.3.0` | new `v0.3.0` ticket: status panel |
| U2 Health | `v0.3.0` | new `v0.3.0` ticket: Health section |
| U3 Sidebar settings page | out: non-goal 5 (no sidebar settings page) | – |
| U4 Plain words on screen | `v0.1.0` | #18 |
| U5 In-app Update when no seat runs | out: § Doesn't transfer (the skills are re-read each turn) | – |
| U6 Clean up | skills side | hanh9898/matt-with-paseo#107 |
| W1 Roles as data | `v0.1.0` | #6, #14 |
| W2 Cost levels | `v0.1.0` | #13 |
| W3 Git guard for agents | `v0.1.0` | #2, #35 |
| W4 Claude Code, the one supported harness | `v0.1.0` | #6, #19 |
| W4 Codex | out: no second harness in this plan (owner, 2026-09-30) | – |
| W4 Pi, Oh My Pi, OpenCode | out: no second harness in this plan (owner, 2026-09-30) | – |
| W5 Optional MCP servers per role | `v0.3.0` | new `v0.3.0` ticket: MCP servers per role |
| W6 A provider per role | out: non-goal 5 (and #14) | – |
| W7 Team MCP tools (accept, land, push) | out: non-goals 1 and 6; #8's premise is false | – |
| W8 Skills shipped per seat | out: the vision (#22: the skills own the prose) | – |
| W9 Gates capped to the machine | `v0.1.0` | #10 |
| W10 Human's language at one door | skills side | hanh9898/matt-with-paseo#95 |
| R1 State outside the repo, one block | `v0.1.0` | #12 |
| R2 Typed ledger | out: § Doesn't transfer (the wave file is the record) | – |
| R3 `CONTEXT.md` and notebook | out: the owner's decision in § Decisions that shaped the tickets (memory follows Matt's `retro`) | – |
| X1 Host range, widened per minor | `v0.1.0` | #3, #15 |
| X2 Install from a clone | `v0.1.0` | #37 |
| X3 One check command | `v0.1.0` | #36 |
| X4 NOTICE | `v0.1.0` | #37 |
| X5 Watch eval | `v0.2.0` | new `v0.2.0` ticket: the watch eval |
| npm distribution | out: the owner's decision that milestones stop at `v0.5.0` (#30); seatworks itself installs from a clone | – |
