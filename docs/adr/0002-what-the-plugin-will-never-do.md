# What the plugin will never do

Status: accepted, 2026-09-30

## Context

Every "plugin or skill?" question has been argued again from scratch, because nothing written says where the plugin stops. The vision ([#22](https://github.com/hanh9898/matt-with-paseo-plugin/issues/22#issuecomment-5893877776)) already draws the line: the plugin does only what prose cannot do reliably (receive daemon events, answer permission requests, modify an agent at creation), and every judgement stays in the skills. Six non-goals came out of that line ([#23](https://github.com/hanh9898/matt-with-paseo-plugin/issues/23#issuecomment-5893915591)). Two things make them an ADR: they are hard to reverse once tickets are placed against them, and they settle questions across many tickets.

## Decision

The plugin will never do the six things below. Each has its reason and its evidence.

### 1. Judge acceptance

The plugin decides mechanics only: agent lifecycle, transport, routing, notification, durable state and provenance. Whether a ticket is done, whether a branch merges and whether a review passes stay in the skills. A cheap sensor ([#7](https://github.com/hanh9898/matt-with-paseo-plugin/issues/7)) only flags cases for the skills' judgement and hands them over.

- Reason: a plugin that judges acceptance hides a rule of the skills in code the skills' prose cannot show or correct, and the skills are the core.
- Evidence: [lesson 4, plugin decides mechanics, never acceptance](https://github.com/hanh9898/matt-with-paseo/blob/main/docs/lessons/sting9k-seatworks.md#4-plugin-decides-mechanics-never-acceptance) (hanh9898/matt-with-paseo#72); the vision's "why a plugin" answer on [#22](https://github.com/hanh9898/matt-with-paseo-plugin/issues/22#issuecomment-5893877776).

### 2. Be required

The skills always run without the plugin, on the heartbeat path with prose questions, and a plugin failure never breaks a stream.

- Reason: the plugin is optional by design, so an absent or broken plugin must leave the skills exactly where they were before it existed.
- Evidence: [Decisions that shaped the tickets](https://github.com/hanh9898/matt-with-paseo/blob/main/docs/lessons/sting9k-seatworks.md#decisions-that-shaped-the-tickets) ("the plugin is optional", and the fifth "solid" check); the vision on #22.

### 3. Answer what is always the user's

Five items stay the user's, even with delegation on: a change to the concept (spec, words, ADRs), adding or dropping tickets, spend past the appetite, irreversible actions, and merging the PR. Even then, a question with no recommendation is never answered for the user.

- Reason: delegation lets the plugin take a recommendation the owner already wrote a rule for; it never lets the plugin decide what the owner keeps for themselves.
- Evidence: [Decisions that shaped the tickets](https://github.com/hanh9898/matt-with-paseo/blob/main/docs/lessons/sting9k-seatworks.md#decisions-that-shaped-the-tickets) (five items stay the user's); [ADR 0001](0001-checkpoints-use-paseo-native-questions-answered-by-the-plugin.md).

### 4. Litter the target repository

The plugin writes nothing outside one marked block in the target repository, and keeps its state outside the repo. This bounds the plugin only: where the skills' wave files live stays [#12](https://github.com/hanh9898/matt-with-paseo-plugin/issues/12)'s own decision.

- Reason: a repository a stranger reads or clones should not carry the plugin's bookkeeping.
- Evidence: [#12, state outside the repo, one marked block inside](https://github.com/hanh9898/matt-with-paseo-plugin/issues/12).

### 5. Duplicate a Paseo surface or take over the user's config

The plugin has no custom UI where Paseo has a native form, no sidebar settings page and no provider per role, and it does not rewrite the user's Claude config; it only adds env and MCP servers through `before('agent.create')`.

- Reason: Paseo already draws the question form and owns the user's settings; a copy of either drifts from the original and leaves the user two places to look.
- Evidence: [ADR 0001](0001-checkpoints-use-paseo-native-questions-answered-by-the-plugin.md) (Paseo's native question); [Decisions that shaped the tickets](https://github.com/hanh9898/matt-with-paseo/blob/main/docs/lessons/sting9k-seatworks.md#decisions-that-shaped-the-tickets) (Claude agents keep the user's own config, no sidebar settings page); [#14, role identity on labels, not one provider per role](https://github.com/hanh9898/matt-with-paseo-plugin/issues/14).

### 6. Write to git itself

The plugin never commits, pushes or merges. It only guards ticket agents' git ([#2](https://github.com/hanh9898/matt-with-paseo-plugin/issues/2)). Push stays with the orchestrator, and merge stays with a human.

- Reason: merging the PR is always the user's, and a git write from the plugin would be an irreversible action taken outside the skills.
- Evidence: [#2, git guard for ticket agents](https://github.com/hanh9898/matt-with-paseo-plugin/issues/2), and the fifth item of non-goal 3. This rests on thinner evidence than the other five: it was taken as the option that is easier to relax.

## Consequences

- Placement questions ("plugin or skill?") are decided against this ADR: a request that crosses a non-goal goes to the skills, or is declined.
- In [`docs/roadmap.md`](../roadmap.md), the parity table's "out" rows are decided against this ADR: each names the non-goal behind it.
- Relaxing a non-goal takes a new ADR that supersedes this one. The sixth is the likeliest to be relaxed, since its evidence is the thinnest.
