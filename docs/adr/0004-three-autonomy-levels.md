# Three autonomy levels

Status: accepted, 2026-10-01

Supersedes non-goal 3 of [ADR 0002](0002-what-the-plugin-will-never-do.md) and amends its non-goal 6.

## Context

[ADR 0002](0002-what-the-plugin-will-never-do.md) non-goal 3 says five items stay the user's even with delegation on: a change to the concept, adding or dropping tickets, spend past the appetite, irreversible actions, and merging the PR. Contract v1 has one switch, `Switch | on`, and it means exactly that. An owner who wants a stream to run with no checkpoint at all has no way to say so, and ADR 0002's Consequences say relaxing a non-goal takes a new ADR that supersedes it. Level 3 relaxes non-goal 3, and its merge part touches non-goal 6: if this ADR left non-goal 6 as written, the two ADRs would contradict each other.

[ADR 0003](0003-the-contract-between-the-plugin-and-the-skills.md) lets contract v1 change in place until `v0.1.0` is tagged. It is not tagged, so this is an amendment of the v1 draft, and the contract and the code change in the plugin ticket that follows this one, in the same change as the code. No repository in the control folder has a `## Delegation` table yet, so moving the default of a table with no `Switch` row from "on" to level 1 changes no running stream.

### Context and evidence

The owner, on 2026-09-30: "Để việc tự động gồm 3 cấp: cấp 1 là như ban đầu, cấp 2 là loại trừ 5 câu trên. Cấp 3 là thả cửa" (make automation three levels: level 1 as at the start, level 2 excluding the five items above, level 3 wide open).

- Reading "như ban đầu" (as at the start) as "nothing delegated" is the orchestrator's reading (D120), not the owner's words. The owner may have meant contract v1 as it stands, which is level 2 here.
- Keeping the appetite stop at level 3 was decided without clear evidence. It was taken as the option that is easier to undo: a stopped answer can be reversed, spending cannot.

## Decision

### The three levels

The level is chosen per target repository, in a `Level` row of the `## Delegation` table of its `AGENTS.md`.

- **Level 1**: nothing is delegated. Every checkpoint reaches the owner, as before delegation existed.
- **Level 2**: every checkpoint the table lets the orchestrator decide is delegated, except the five owner items of non-goal 3: a change to the concept, adding or dropping tickets, spend past the appetite, irreversible actions, and merging the PR. Those still reach the owner. This is what delegation means in contract v1 today.
- **Level 3**: everything the table lets the orchestrator decide is delegated, the five items included. A question marked `Yours: <item>` can be answered, and the `one-way` door class can be listed as decidable.

### What stays at every level

- A question with no recommendation is never answered by the plugin (the last sentence of non-goal 3, kept as is). Picking an option with no recommendation is judgement, and the plugin decides mechanics only (non-goal 1). The orchestrator may still answer such a question under the skills' own rules, at a level that lets it.
- The plugin never writes git (non-goal 6). At level 3 it may answer a merge question with the recommendation, through the host's permission answer and nothing else; the orchestrator carries out the merge. The plugin never commits, pushes or merges.
- The appetite stop: once a stream is past its appetite, the plugin answers none of its questions, at level 3 too. Level 3 delegates a `Yours: spend` question asked before the stop, not the stop itself.
- The daily question budget only informs, at every level. It never widens delegation.
- Every decision is recorded in the decision log (#54), a question `left to the user` included, with the level and where it was read.

### The default

The default is level 1. It applies to a repository with no `## Delegation` table, a table with no `Level` row and no `Switch` row, and a `Level` value other than `1`, `2` or `3`.

The contract v1 row `Switch` stays readable as a mapping: `on` is level 2, anything else is level 1. A `Level` row wins over `Switch`.

### Non-goal 6, amended

"Merge stays with a human" becomes "merge stays with a human below level 3; at level 3 the orchestrator carries it out when the owner's table lets it answer the merge question". Its reason, "merging the PR is always the user's", is amended to match. The plugin's part of a merge at level 3 is one answer to a question; the git write stays the orchestrator's.

## Consequences

- The skills side changes its `## Delegation` table and its checkpoints: the skills' ADR 0011 ([hanh9898/matt-with-paseo#110](https://github.com/hanh9898/matt-with-paseo/issues/110)). It is a skills-side dependency, listed here and not filed. Whether that ADR words the levels the same way is not known yet.
- `Requires plugin contract: 1` stays, since this amends the v1 draft.
- The plugin ticket that reads the `Level` row changes `docs/contract.md`, the code and their tests together; this ADR changes docs only.
- Raising a repository to level 3 is the owner's act, in the repository's own table. The plugin never raises a level.
- The appetite stop at level 3 is the likeliest line to move: it rests on no clear evidence, and a later ADR that supersedes this one may widen or narrow it.
