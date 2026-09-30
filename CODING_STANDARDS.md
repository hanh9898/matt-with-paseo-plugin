# Coding standards

The rules every change to this plugin is reviewed against, on the Standards axis of `mattpocock-skills:code-review`. Cite a rule by its ID (W3, T2, J1, C1) in each finding. How a change is proven to work is not here: it is [`docs/agents/evidence-standards.md`](docs/agents/evidence-standards.md).

**Scope.** Part 1 covers every document an agent reads: `AGENTS.md`/`CLAUDE.md`, the agent docs in `docs/agents/`, this file, and every text the plugin sends to an agent at run time (a message to an orchestrator, a situational instruction riding an event). Part 2 covers the plugin's TypeScript, part 3 its JSON files and manifests, part 4 every commit. ADRs, the README, `CHANGELOG.md` and the community files are written for people and stay outside part 1.

## 1. Writing for agents

`mattpocock-skills:writing-for-agents` is the standard. Load that skill for its full text before reviewing a document in scope; the rules below name its levers so a finding can cite one, and the skill's wording wins wherever the two differ.

| ID | Rule | A finding looks like |
|---|---|---|
| W1 | **Context pointers.** A pointer to another document states what the material is and lists each branch that should reach it, leading word first | a line naming a file with no condition for reading it |
| W2 | **Information hierarchy and progressive disclosure.** Steps first, reference on demand; material only some runs need sits behind a pointer | a rare case written inline in a step every run reads |
| W3 | **Completion criterion.** Every step ends on a checkable, exhaustive condition | a step that ends on "understand", "review" or nothing |
| W4 | **Leading words.** One concept, one word, taken from the skills' words blocks ([`docs/agents/domain.md`](docs/agents/domain.md)); restated triads collapse into the word | "operator", "gate" and "approval round" for the same thing in one change |
| W5 | **The positive.** State the target behaviour; a prohibition stays only as a hard guardrail, paired with the positive | "don't do X" where "do Y" would say it |
| W6 | **Single source of truth.** Each meaning lives in one place and others point there; nothing restates what a file, a command or `--help` already shows | the ship rules table copied into `CONTRIBUTING.md` |
| W7 | **No-ops.** Every sentence changes behaviour against the model's default; a sentence that does not is deleted whole | "be careful to check the output" |
| W8 | **Sediment.** Every line still bears on what the document does today; a change removes the lines it makes stale | a note about a hook the change removed |

This repo adds one house rule of its own, not a lever of that skill:

| ID | Rule | A finding looks like |
|---|---|---|
| H1 | **Choices as tables.** A choice between cases is a row in a table, not a new prose branch | an "if the agent is a ticket agent, otherwise…" paragraph beside a table of roles |

## 2. TypeScript

| ID | Rule | A finding looks like |
|---|---|---|
| T1 | **Strict types.** The compiler runs with `strict` on; no `any`, and no `as` cast that hides a mismatch. A value from outside (an event payload, a file, a message) enters as `unknown` and is narrowed before use | `const event = payload as TurnEndedEvent` with no check |
| T2 | **One narrow host port.** Every server-side call to Paseo's plugin SDK goes through one host module, `server/paseo-host.ts`; the rest of the server depends on that module's own interface, `server/host.ts`, so a test replaces the host in one place (#4). On the client side only `index.client.ts` (its context type) and the RPC contract in `shared/` import the SDK | an SDK import in a hook handler |
| T3 | **Marked agents only.** The plugin acts only on an agent it recognises by its labels (`shared/role-labels.ts`), or, in `before('agent.create')` where no label exists yet, by the wave skill's ticket-agent title (ADR 0001's prototype marked its agents the same way); every other agent is left exactly as Paseo made it | a handler that edits the config of every agent it sees |
| T4 | **Fail open.** A handler never throws into the host. A failure is logged with the event and the agent's id, and the agent carries on on Paseo's default path, as it would with the plugin disabled | an unhandled rejection inside `before('agent.create')` |
| T5 | **Answers keyed by header.** An answer to an `AskUserQuestion` is keyed by the question's `header`, as Paseo's own prompt keys it (ADR 0001) | `updatedInput.answers` keyed by the question text |
| T6 | **No credentials.** The plugin never reads, logs, stores or sends a token or a credential, including in an error message | an environment dump in a log line |
| T7 | **Runtime dependencies.** At run time the plugin depends on Paseo's plugin SDK and Node's standard library only; any other runtime package is named, with its reason, in the pull request that adds it | a new entry under `dependencies` with no word on why |

## 3. JSON and manifests

| ID | Rule | A finding looks like |
|---|---|---|
| J1 | **One version token.** The release version lives in `package.json`, and every manifest that carries a version is checked against it (#16); the contract version is its own whole number, checked against `docs/contract.md` (ADR 0003) | `.claude-plugin/plugin.json` at `0.2.0` while `package.json` says `0.1.0` |
| J2 | **Host range declared.** The manifest names the range of Paseo host versions the plugin supports, and nothing outside it is claimed (#3) | a README claiming "any Paseo" |
| J3 | **Plain JSON.** Two-space indent, a trailing newline, no comments, no trailing commas, keys in a stable order that a change does not shuffle | a diff that reorders a manifest's keys |

## 4. Commits

| ID | Rule | A finding looks like |
|---|---|---|
| C1 | **Conventional Commits.** `type(scope): subject`, `type` one of `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`; the subject in the imperative, lowercase, at most 72 characters, no final full stop | `Updated stuff` |
| C2 | **One change per commit.** A commit does one thing its subject names; a ticket's commits reference its issue (`#12`) in the body | a commit that adds a hook and reformats the manifest |
