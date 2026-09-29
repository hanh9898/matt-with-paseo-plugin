# The contract between the plugin and the skills

Status: accepted, 2026-09-30

## Context

The plugin and the skills ship from two repositories, and they read each other's words: the plugin's messages carry a `Next:` line the wave skill acts on, the skills' checkpoints carry marks the plugin reads, and the `## Delegation` table is written by one and read by the other. Seven plugin issues need those words fixed, and neither repository owned them ([#29](https://github.com/hanh9898/matt-with-paseo-plugin/issues/29)). The plugin is optional by design ([ADR 0002](0002-what-the-plugin-will-never-do.md), non-goal 2), so the pairing must let the skills fall back to the heartbeat path when it does not hold.

## Decision

- **The contract lives in this repository**, in [`docs/contract.md`](../contract.md). The plugin builds the messages and the card, so the document sits next to the code and a check compares them (`test/contract.test.ts`).
- **The skills declare the version they require**, as a whole number. They use the plugin only when it equals the plugin's contract version, and take the heartbeat path otherwise.
- **The two repositories pair by contract version only.** Their release numbers are independent; the contract version is not the plugin's version token, and `docs/contract.md` states which contract each plugin release carries.
- **What v1 holds:** the message types and their `Next:` lines; plugin detection; the labels `wave`, `ticket` and `stream`; the ticket-agent title; the checkpoint marks; answers keyed by `header`; what the plugin reads from the `## Delegation` table; the report card's shape; what the skills declare; the version. The relay covers stream agents as well as `wave`/`ticket` agents ([Decision on #34](https://github.com/hanh9898/matt-with-paseo-plugin/issues/34#issuecomment-5895102916)), and the daily question budget is a per-machine setting, not a row of the table ([Decision on #34](https://github.com/hanh9898/matt-with-paseo-plugin/issues/34#issuecomment-5895102916)).
- **What v1 leaves out:** the format of the `## Delegation` table (a skills-side dependency), buttons on the report card (the button round trip is unproven, ADR 0001), a custom checkpoint card, and the message rows of the delegation tickets and of the stream agent, which arrive with the tickets that build them.
- **The versioning rule.** Until `v0.1.0` is tagged, the contract is v1 in draft, and any `v0.1.0` ticket that adds or changes a message, a mark or a card field edits it in the same change. From the tag on, removing or changing a message, label, mark or field raises the version; adding a message type or an optional field does not.

## Consequences

- A ticket that changes a text in `server/messages.ts` edits `docs/contract.md` in the same change, or the agreement check fails at the milestone run.
- `shared/contract.ts` spells the version once more, and the version-token check (#16) reads both spellings as its fourth identifier.
- The skills side records the required version in its own repository; that work is listed in [`docs/roadmap.md`](../roadmap.md) as a skills-side dependency, not filed here.
- Relaxing the pairing (for example, a range of versions) takes a new ADR that supersedes this one.
