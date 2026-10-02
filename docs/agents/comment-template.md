# Ticket comments

Every comment an agent posts on a ticket takes one of the three shapes below. Pick the row, copy its block, fill each `<…>`. Post it with `gh issue comment <number> --body-file <file>`.

| The comment reports | Shape |
|---|---|
| Work under way, or a stop that needs the orchestrator | Progress |
| The ticket is done | `Resolved:` |
| A choice made, or a choice the user made | Decision |

Every shape links evidence rather than pasting it: a commit, a file on the ticket's branch, a command with the few lines of output that prove the point. A log longer than ten lines goes in a file, linked.

## Progress

```markdown
Progress: <one line: where the ticket stands>

- Done: <what is committed, with commit hashes>
- Next: <the next step>
- Blocked on: <what, and who can unblock it; "nothing" when nothing>
```

## Resolved

The comment starts with `Resolved:`. Leave the issue open: the orchestrator closes it once the ticket's branch is merged. A part a human must do moves the ticket to `ready-for-human` instead, and the comment says which part.

```markdown
Resolved: <one line: what the ticket now delivers>

Branch: `<ticket branch>` at `<commit>`, base `<base commit>`

Acceptance criteria:
- [x] <criterion, as the ticket words it>: <the check that proves it: file and line>
- [ ] <criterion not met>: <why, and what remains>

Checks written: <each check the ticket added or changed, with its file>
Test run: <for each new or changed test file: `node --test <file>`, red on `<base commit>` (<summary line>), green on `<commit>` (<summary line>)>
Code review: deferred to the milestone (docs/agents/evidence-standards.md)
Open: <what remains open or in doubt; "nothing" when nothing>
Outside the file zone: <each change outside the ticket's files or outside git; "none" when none>
```

For a symptom ticket, `Checks written` names the check that goes red on exactly that symptom.

## Decision

```markdown
Decision: <one line: what was decided>

- Options: <each option weighed, one line each>
- Chosen: <the option>, because <the reason>
- Decided by: <the user, quoted, or the agent, within its ticket's scope>
- Affects: <the tickets, files or ADRs it touches>
```

A decision that settles a design question for more than one ticket also becomes an ADR in `docs/adr/`; the comment links it.
