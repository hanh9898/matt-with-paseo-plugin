# Smoke test: the plugin loads on a real Paseo host

Run by the milestone run, scripted where a script can (`## The scripted run`), by hand for the rest (`docs/agents/evidence-standards.md`). A section headed "Written, not run" is the hand version of what the script runs.

| Manifest range (`requirements.paseo`) | Paseo version this smoke test targets |
|---|---|
| `>=0.10.1 <0.11.0` | `0.10.1` (daemon, CLI and plugin SDK), Windows |

The two cells are one claim: `0.10.1` is the version the range was tested on, and the range stops before the next minor release. Move them together, and record the result of a new run under Results.

Installing the plugin touches every session on the machine's daemon. Run it only on a daemon whose owner agreed to that, and remove the plugin at the end so the daemon's plugin set is as it was.

## The scripted run

`node test/smoke/run-smoke.ts` runs every section a script can on a scratch Paseo daemon (its own home in the system temp folder, its own free port, the plugin installed from a `git archive HEAD` copy with `test/smoke/conditions.json` over `server/data/conditions.json`) and writes one line per section under `## Results`. It takes about 30 minutes, spends a few cents of the machine's own Claude Code login on `claude-haiku-4-5` turns, and needs `paseo` 0.10.1 and `claude` on the machine. `--only P1,P8` runs the named probes and rewrites only the `## Results` lines of the sections whose every probe it ran; every other line stays. The plugin it installs is the last commit, not the working tree: commit a fix before the run that proves it. It scrubs `PASEO_*` and every name holding `API_KEY`, `TOKEN` or `SECRET` from the environment of every child, passes `--home <scratch>` to every `paseo` call, and on exit, also after a failure or interrupt, removes `mwp-smoke`, stops the scratch daemon and deletes the scratch folder. The decisions it takes without a daemon are in `test/smoke/smoke-plan.ts`. The batches and sections below are the hand version of the same run.

## Daemon batches

The run starts the daemon twice, each time with every setting it needs, so no section restarts the daemon on its own.

| Batch | The daemon is started with | Sections (Claude Code plugin needs no daemon and fits in the Cheap sensor's wait) |
|---|---|---|
| A | `MWP_STATE_DIR` set to an empty absolute directory outside any repository, `MWP_GATE_SHARE=0.01`, `MWP_QUESTION_BUDGET=2` | Steps 1 to 4, Lifecycle relay, Waiting pill, Git guard (parts A and B, part C steps 1 to 3), Claude Code plugin, Role identity, Human words, Cheap sensor, Gate cap (steps 1 to 3, 5 and 6), State outside the repository (steps 1 to 3), Cost levels, Delegated answers, Appetite, Question budget (steps 1 to 5, 7 and 8), Report card |
| B | `MWP_QUESTION_BUDGET=many`, and `MWP_STATE_DIR` and `MWP_GATE_SHARE` unset | Git guard part C steps 4 to 6, Gate cap step 4, State outside the repository steps 4 and 5, Question budget step 6, then Steps step 5 |

Install once, at Steps step 3, and remove once, at Steps step 5, the last step of batch B. A section's own last step then archives its `[mwp-smoke]` agents and skips its `paseo plugin remove mwp-smoke`. A section that deletes a state file still deletes it.

In batch A the gate cap is one: a section that runs two ticket agents of one orchestrator at once also gets a `Gate cap passed:` message, which is expected and not a finding.

**The smoke copy.** `test/smoke/conditions.json` is `sensor/conditions.json` with the `quiet-running` threshold at 1 minute instead of 30; the release default stays 30. Before step 3 below, copy this checkout to a scratch folder and copy `test/smoke/conditions.json` over the scratch folder's `server/data/conditions.json`, the copy the daemon builds into the plugin at install (overwriting `sensor/conditions.json` changes nothing the loaded plugin reads). The clock ticks every 5 minutes, so a quiet running agent is flagged 1 to 6 minutes after it goes quiet.

## Steps

`<plugin>` is the absolute path of the scratch folder of the smoke copy, in every section.

1. `paseo --version` prints `0.10.1`. Any other version: stop, the run does not count for this range.
2. `paseo daemon status --json` shows `pluginsEnabled` as `true` in the daemon's `config.json`. Otherwise stop: enabling plugins needs the daemon owner's consent.
3. `paseo plugin install <plugin> --id mwp-smoke` reports success.
4. `paseo plugin ls` lists `mwp-smoke` as `running` with no error. Any other status: `paseo plugin logs mwp-smoke` holds the reason, and an error resolving `./server/paseo-host.ts` there means the daemon rejects the `.ts` extension in relative imports.
5. `paseo plugin remove mwp-smoke`, then `paseo plugin ls` no longer lists `mwp-smoke`.

## Lifecycle relay

Written, not run. Targets Paseo `0.10.1`. Run it after the steps above, with `mwp-smoke` still installed. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone.

1. Start an orchestrator agent titled `[mwp-smoke] orchestrator`, and set no heartbeat.
2. From it, create a ticket agent titled `[mwp-smoke] ticket` with the labels `wave=1` and `ticket=99` and a prompt that answers in one line and stops. The orchestrator ends its turn.
3. The orchestrator's timeline gains a message starting `Turn ended:`, from the `agent.turn_ended` hook, naming the ticket `99`, the wave `1` and the outcome `completed`. It arrives with no heartbeat set and no `notifyOnFinish`. The orchestrator's own turn end adds no message.
4. Create a second ticket agent with the same labels whose prompt asks a question with `AskUserQuestion`. The orchestrator's timeline gains a message starting `Permission pending:` with the request id and `AskUserQuestion`, and not the question's text.
5. Prompt the orchestrator with a long turn (a shell command that sleeps 60 seconds) and, while it runs, prompt a ticket agent so that its turn ends. Nothing arrives until the orchestrator's turn ends; then one message arrives.
6. Create a third agent with no labels and one with only `wave=1`. Neither one's turn end or permission produces a message.
7. Archive the ticket agents; each archive produces an `Agent archived:` message.
8. Read every relay message from the steps above: its last line is a `Next:` line, it names the ticket `99`, and the tools in it (`get_agent_activity`, `list_pending_permissions`, `respond_to_permission`) exist on this daemon. A message held in step 5 has exactly one `Next:` line, at its end, with the moves of every message it joins.
9. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`.

Read the plugin's own output with `paseo plugin logs mwp-smoke`: a line starting `[matt-with-paseo]` is a handler that failed and was kept out of Paseo.

## Waiting pill

Written, not run. Targets Paseo `0.10.1`. Run it after the relay steps, with `mwp-smoke` still installed and the app open on the same daemon. Reload the app after installing the plugin (F1 of `v0.1.0`'s smoke): an app that was open during the install shows no pill until it reloads. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone. The pill's words are the ones in `client/pill-text.ts`: read them there. While the pill shows, read its words against the plain labels in `client/pill-text.ts` (`PLAIN_LABELS`): a precise term of the skills' words blocks on the pill, alone, is a finding.

1. Start an agent titled `[mwp-smoke] stream` with the label `stream=mwp-smoke`. Its composer track bar shows no pill.
2. From it, create a ticket agent titled `[mwp-smoke] ticket` with the labels `wave=1` and `ticket=99` and a prompt that asks one question with `AskUserQuestion`. Within 30 seconds the stream agent's composer shows the pill with the count 1. The ticket agent's own composer shows no pill.
3. Create a second such ticket agent. The pill shows the count 2.
4. Answer the first question in that ticket agent's chat, with Paseo's own prompt. The pill shows the count 1; answer the second and the pill disappears.
5. Prompt the stream agent to ask one question with `AskUserQuestion` itself. Its pill shows the count 1; answer it and the pill disappears.
6. Ask a question from an agent with no labels and from one with only `wave=1`. No pill appears in any composer.
7. Ask a question from a ticket agent, then cancel its turn without answering. The pill disappears.
8. Reload the plugin (`paseo plugin reload mwp-smoke`) with the stream agent idle, then have a new ticket agent ask a question. The stream agent's pill shows the count 1 though the stream agent did nothing since the reload.
9. Screenshots of the stream agent's chat with the pill at the count 1, in Paseo's own window, saved as `pill-first-view.png`, `pill-scrolled.png` and `pill-narrow.png`:
   - first view: the chat as it opens, the composer with the pill in view;
   - scrolled: the chat scrolled up past its first view, so the pill's place in the composer is shown with the chat above it;
   - narrow width: the window narrowed until the layout turns compact (mobile width), the pill still readable.
   Attach them to the stream's pull request under Evidence.
10. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`.

Read the plugin's own output with `paseo plugin logs mwp-smoke`; a line starting `[matt-with-paseo]` is a handler that failed and was kept out of Paseo. A pill read that failed is logged in the app's console with the same prefix.

## Git guard

Written, not run. Targets Paseo `0.10.1`. Parts A and B need Node only and run on each of Windows, macOS and Linux; part C runs on the daemon after the steps above, with `mwp-smoke` still installed. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone. Install nothing into the machine's own Claude Code settings: part B uses a scratch configuration directory.

**A. The script, on each system.** `<plugin>` is the smoke copy's scratch folder, or any checkout of this repository.

1. Windows (PowerShell): `$env:MWP_ROLE = "ticket"; '{"tool_name":"Bash","tool_input":{"command":"git push"}}' | node <plugin>\guard\git-guard.mjs; $LASTEXITCODE`. macOS and Linux: `printf '{"tool_name":"Bash","tool_input":{"command":"git push"}}' | MWP_ROLE=ticket node <plugin>/guard/git-guard.mjs; echo $?`. The output is a line starting `Refused: git push`, a last `Next:` line that says to commit, carry on and name the command in the report, and then `2`.
2. Repeat with `git checkout main`, `git switch main` and `git reset --hard`: each is refused with its own name in the line.
3. Repeat with `git commit -m x` and `git status`: no output, exit 0.
4. Repeat step 1 with `MWP_ROLE` unset (`Remove-Item Env:MWP_ROLE`, `env -u MWP_ROLE`): no output, exit 0.

**B. The hook file, in a scratch Claude Code configuration.** Make a scratch clone with a bare remote, and a scratch configuration directory (`CLAUDE_CONFIG_DIR` set to a new folder for this terminal only).

1. In the clone, `MWP_ROLE=ticket claude --plugin-dir <plugin> -p "Run git push origin HEAD and git checkout -b other, then say what each printed."` (Windows: set `$env:MWP_ROLE` first). Both are refused with a `Refused:` message, and the remote holds no new commit.
2. The same command with `MWP_ROLE` unset: the push succeeds and the branch is created.
3. With `MWP_ROLE=ticket`, ask for `git add` and `git commit -m x` on a new file: the commit succeeds on the current branch.

**C. The marker, on the daemon.**

1. From an orchestrator titled `[mwp-smoke] orchestrator`, create an agent titled `[Wave 1] 99 [mwp-smoke] guard` with the labels `wave=1` and `ticket=99` and this prompt: print the value of `MWP_ROLE` (PowerShell: `$env:MWP_ROLE`), run `git push` and `git checkout main` and report each message, then create `guard-smoke.txt` and commit it. It prints `ticket`, both commands are refused with a message starting `Refused:`, and the commit succeeds. This needs the repository enabled as a Claude Code plugin for that agent (ticket 16's `.claude-plugin/plugin.json`); before that, only the value `ticket` can be read.
2. Create a second agent titled `[mwp-smoke] plain` with the same labels and a prompt that prints `MWP_ROLE`: it prints nothing, because its title is not `[Wave N] <NN> ...`.
3. In the orchestrator's own shell, `git push --dry-run` in a checkout with a remote succeeds: the orchestrator is not guarded.
4. Restart the daemon, the switch to batch B (leave the step 1 agent unarchived until then), then prompt the first agent again to print `MWP_ROLE`: the resumed agent prints `ticket`. If it prints nothing, `agent.session_open` could not read the title or labels before the agent was registered: `paseo plugin logs mwp-smoke` holds one line starting `[matt-with-paseo] agent.session_open could not read`, and criterion 1 of #35 fails.
5. `paseo plugin logs mwp-smoke` holds no line starting `[matt-with-paseo] agent.create handler failed`.
6. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`.

## Claude Code plugin

Written, not run. Targets Paseo `0.10.1`; the steps need Claude Code, not the daemon. Run them in a scratch Claude Code configuration: set `CLAUDE_CONFIG_DIR` to a new folder for this terminal only, so the machine's own Claude Code settings and plugins stay as they are. `<plugin>` is the absolute path of this repository's checkout.

1. `claude plugin validate <plugin>` ends with `Validation passed`. It may warn that `CLAUDE.md` at the plugin root is not loaded as context: expected, that file is for this repository's agents.
2. `claude plugin validate <plugin>/.claude-plugin/marketplace.json` ends with `Validation passed` and no warning that the entry's version differs from `plugin.json`'s.
3. `claude plugin marketplace add <plugin>`, then `claude plugin install matt-with-paseo-plugin@matt-with-paseo-plugin`: both succeed.
4. `claude plugin list` shows `matt-with-paseo-plugin@matt-with-paseo-plugin` as enabled, at the `version` of `package.json`.
5. `claude plugin details matt-with-paseo-plugin` lists the `PreToolUse` hook of `hooks/hooks.json` in its component inventory.
6. `claude plugin marketplace remove matt-with-paseo-plugin` removes the marketplace and the plugin, then `claude plugin list` no longer shows it.

## Role identity

Written, not run. Targets Paseo `0.10.1`. Run it after the steps above, with `mwp-smoke` installed. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone.

1. Keep the output of `paseo provider ls --json` taken before step 3 of the steps above (the install). With `mwp-smoke` installed and running, run it again: the list is the same, so the plugin added no provider, per role or otherwise.
2. From an orchestrator titled `[mwp-smoke] orchestrator`, create a ticket agent with the labels `wave=1` and `ticket=99` on a provider from that list. The agent is created and its turn end reaches the orchestrator (the lifecycle relay), so the role rode on the labels and no provider was picked for it.
3. The marker on a ticket agent and its absence on the orchestrator are the "Git guard" section's part C, steps 1 to 3.
4. `paseo plugin logs mwp-smoke` holds no line starting `[matt-with-paseo]`. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`.

## Human words

Written, not run. Targets Paseo `0.10.1`. Run it after "Lifecycle relay", with `mwp-smoke` still installed. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone. This section settles how `server/human-words.ts` tells a message a person typed from a prompt the orchestrator sent; the code rests on a reading of the `0.10.1` daemon's source, and these steps are where it is proven.

1. Start an orchestrator titled `[mwp-smoke] orchestrator`. From it, create a ticket agent titled `[mwp-smoke] ticket` with the labels `wave=1` and `ticket=99`, with `create_agent` and a first prompt that answers in one line. When its turn ends, the orchestrator gets a `Turn ended:` message and no `Human words:` text: the first prompt is the orchestrator's.
2. From the orchestrator, send the ticket agent a second prompt with `send_agent_prompt`. Its turn end reaches the orchestrator as `Turn ended:` alone, again with no `Human words:` text.
3. Read the ticket agent's timeline through `get_agent_activity` (or the plugin's own log) and record, for the first prompt and the second, the fields of each `user_message` item: `messageId`, `clientMessageId` and any other. Expected: both carry `messageId` and neither carries `clientMessageId`. If either carries a `clientMessageId`, `server/human-words.ts` would pass the orchestrator's prompt on as a person's: stop and record it as a finding.
4. Type a message in the ticket agent's own chat in the Paseo app, such as `use the other table`, and let its turn end. Record the same fields for this item. Expected: `clientMessageId` is present. The orchestrator then gets one message, `Human words:` ahead of `Turn ended:`, with one `Next:` line at its end; it names ticket `99`, the agent and the message id, and not the words typed. If `clientMessageId` is absent for a message typed in the app, the person's words are missed: record it as a finding.
5. Type a second message and let the turn end. The orchestrator's message names only the new id: the timeline that `agent.turn_ended` carries is the agent's whole history (expected from the source, confirm it), and the relay tells each id once.
6. While the ticket agent's turn runs, type a message in its chat. Record when the orchestrator's message arrives: at that turn's end, since the port has no per-item event. If the orchestrator's turn is running then, the message waits and goes out with the held ones as one message with one `Next:` line.
7. Send a message with `paseo` CLI to the ticket agent (`paseo agent send`, or the CLI's equivalent on this version) and record whether it carries a `clientMessageId`. It decides whether a CLI message counts as a person's.
8. Type in the chat of an agent with no labels and one with only `wave=1`: no `Human words:` message.
9. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`.

## Cheap sensor

Written, not run. Targets Paseo `0.10.1`. Run it after "Lifecycle relay", with `mwp-smoke` still installed. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone.

1. From an orchestrator titled `[mwp-smoke] orchestrator`, create a ticket agent titled `[mwp-smoke] ticket` with the labels `wave=1` and `ticket=99`, and a first prompt that runs one shell command and answers in one line. When its turn ends the orchestrator gets `Turn ended:` and no `Stall suspected:` message.
2. Read the ticket agent's timeline through `get_agent_activity` and record the `type` of each item and, for the tool call and the assistant message, the fields the sensor reads (`type`, `name`, `text`). Expected: the shell command is a `tool_call` item. If it is not, `newToolCalls` counts wrong: record it as a finding.
3. Send the ticket agent a prompt that asks for a one-line answer with no tool, twice in a row. Expected: no `Stall suspected:` after the first; after the second, one that quotes "two turns in a row ran no tool", ending with a `Next:` line.
4. Cancel a turn of the ticket agent. Expected: one `Stall suspected:` that quotes "the turn was canceled".
5. With the orchestrator mid-turn, repeat step 4. Expected: the message waits and goes out when the orchestrator's turn ends.
6. An agent with no labels, and one with only `wave=1`, gets a failed or canceled turn: no `Stall suspected:` message.
7. A running stream agent that goes quiet. Start a stream agent titled `[mwp-smoke] stream` with the label `stream=smoke` from the orchestrator (so it has a `parentAgentId`), and give it a prompt that runs `i=0; while [ $i -lt 540 ]; do sleep 1; i=$((i+1)); done` in one foreground shell command with a 600000 ms timeout (Claude Code refuses a standalone foreground `sleep`, and the agent's shell may find no `node`). Fire one hook for it first (its creation does), so the plugin has a `context.paseo` to keep. Start steps 7 and 8 together: their sleeps run side by side. Expected, with the smoke copy's `quiet-running` threshold of 1 minute: within 6 minutes the orchestrator gets one `Stall suspected: stream smoke, agent <id>, the sensor flagged: its turn has run 1 minute with no new activity.` ending with the `Next:` line that says never to prompt it, and no second one while the command runs (at least two more ticks). Two facts are read from the SDK, not run; record each:
   - A `context.paseo` kept from a hook call stays usable after that call returns: the message above arrives 1 to 6 minutes after the agent went quiet, with no hook call in between. If `paseo plugin logs mwp-smoke` shows a `[matt-with-paseo] tick handler failed` line about the session instead, the kept session died: record it as a finding.
   - `refresh()`'s agent carries `lastActivityAt`, and it does not move while the tool call is stuck. Read the agent's `lastActivityAt` twice, five minutes apart, during the sleep: expected equal. If the field is missing, the fallback is `updatedAt`: record which field the run used.
8. A running ticket agent that goes quiet. From the orchestrator, create a ticket agent titled `[mwp-smoke] ticket` with the labels `wave=1` and `ticket=98` (so it has a `parentAgentId`), and give it a prompt that runs `i=0; while [ $i -lt 540 ]; do sleep 1; i=$((i+1)); done` in one foreground shell command with a 600000 ms timeout (Claude Code refuses a standalone foreground `sleep`, and the agent's shell may find no `node`). Expected: within 6 minutes the orchestrator gets one `Stall suspected: ticket 98 of wave 1, agent <id>, the sensor flagged: its turn has run 1 minute with no new activity.` ending with the `Next:` line that says never to prompt it, and no second one while the command runs (once per idle stretch). At the same time, run a bundle agent (labels `wave=1`, `bundle=97`, `tickets=97,98`): the body reads `bundle 97 (tickets 97,98) of wave 1`. With the orchestrator mid-turn, the message waits and goes out when its turn ends.
9. Let the sleep end and the agent go idle. Expected: no further `Stall suspected:` message, since a tick flags only an agent Paseo reports running.
10. `paseo plugin logs mwp-smoke` holds no line starting `[matt-with-paseo]` that names the sensor or its conditions. A line about the conditions means the copy embedded from `server/data/conditions.json` broke the shape: record it as a finding.
11. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`. Removing the plugin runs its cleanup: no tick runs after it.

## Gate cap

Written, not run. Targets Paseo `0.10.1`. Run it after "Lifecycle relay", with `mwp-smoke` still installed. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone.

1. In batch A (`MWP_GATE_SHARE=0.01`), the cap is one whatever the machine's processors. From an orchestrator titled `[mwp-smoke] orchestrator`, create one ticket agent titled `[mwp-smoke] ticket A` with the labels `wave=1` and `ticket=98`, and a first prompt that sleeps thirty seconds in a shell command. The orchestrator gets `Agent created:` and no `Gate cap passed:` message.
2. While A runs, create a second, `[mwp-smoke] ticket B` with `ticket=99`. Expected: one `Gate cap passed:` message that names ticket 99, says `2 ticket agents run against a cap of 1`, and ends with a `Next:` line. If none arrives, `isRunning` did not report A as running: record it as a finding.
3. Let A finish and archive it, then create a `[mwp-smoke] ticket C` (`ticket=97`) while B is idle. Expected: no `Gate cap passed:` message.
4. In batch B (`MWP_GATE_SHARE` unset), create ticket agents one after another, each with a prompt that sleeps thirty seconds, until a `Gate cap passed:` message arrives. Expected: its `cap of N` is half of `node -p "os.availableParallelism()"`, rounded down, at least one, and it arrives with the agent that makes `N + 1` run.
5. With the orchestrator mid-turn, repeat step 2. Expected: the message waits and goes out when the orchestrator's turn ends.
6. An agent with no labels, and one with only `wave=1`, is created under the orchestrator: no `Gate cap passed:` message.
7. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`.

## State outside the repository

Written, not run. Targets Paseo `0.10.1`. Run it after "Gate cap". Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone.

1. In batch A, `MWP_STATE_DIR` is an empty absolute directory outside any repository and `mwp-smoke` is installed. In a scratch git repository, note `git status --porcelain` (empty) and `git rev-parse HEAD`.
2. Run the relay, sensor and gate cap steps against agents whose working directory is that repository. Expected: `git status --porcelain` is still empty and `HEAD` is unchanged: the plugin wrote nothing in the repository.
3. List the state directory. Expected: empty, or only files a change after this ticket added; today nothing persists. Record what is there.
4. In batch B (`MWP_STATE_DIR` unset), end one ticket agent's turn in the scratch repository. Expected: no directory `matt-with-paseo` appears in the repository, and none appears under the platform's data folder until something persists.
5. `paseo plugin remove mwp-smoke`, and archive every `[mwp-smoke]` agent.

## Cost levels

Written, not run. Targets Paseo `0.10.1`. Run it with `mwp-smoke` installed. It reads the profiles and creates none. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone.

1. Record `list_profiles` (ids, names, provider, model, mode, thinking). Run steps 2 to 4, then `list_profiles` again. Expected: the two lists are identical: the plugin created, edited and deleted no profile.
2. In the installed plugin's folder, `presets/cost-levels.json` exists (`paseo plugin` lists the install path). If it is missing, `files` in `package.json` did not ship it: record it as a finding.
3. In a shell of its own, with `MWP_COST_LEVEL=cheap` and `MWP_COST_TICKET=claude/claude-sonnet-5-5` set in that shell only (the daemon needs neither), run `node --experimental-strip-types -e "import('./server/cost-levels.ts').then(async (a) => { const b = await import('./shared/cost-levels.ts'); const l = a.loadCostLevels(); for (const r of b.ROLES) console.log(r, JSON.stringify(b.choiceFor(l, r, process.env))); })"` in the plugin's folder. Expected: the stream and wave roles print the cheap level's model with `"from":"level"`, and the ticket role prints `claude-sonnet-5-5` with `"from":"override"`.
4. Repeat step 3 with `MWP_COST_LEVEL=nope` and `MWP_COST_TICKET=big`. Expected: every role prints the balanced level's choice with `"from":"level"`, and nothing throws.
5. From an orchestrator titled `[mwp-smoke] orchestrator`, create a ticket agent titled `[mwp-smoke] ticket` with the provider and model step 3 printed for the ticket role. Expected: the agent starts on that model; the chosen `modeId` and `thinkingOptionId` come from the profile the orchestrator copied, not from the preset. Archive every `[mwp-smoke]` agent.

## Delegated answers

Written, not run. Targets Paseo `0.10.1`. Run it after "Waiting pill", with `mwp-smoke` installed, in a scratch repository whose `AGENTS.md` holds a `## Delegation` table with the rows `Level | 2` and `Questions the orchestrator may decide | two-way, costly`. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone.

1. Create a ticket agent titled `[mwp-smoke] ticket` (labels `wave=1`, `ticket=99`) in that repository whose prompt asks one `AskUserQuestion`, header `Colour`, text ending in a line `Door: two-way`, first option `Red (Recommended)`. Expected: within 30 seconds the question is answered with `Red (Recommended)` and the agent carries on with it; the plugin's log shows no question text.
2. Repeat with `Door: costly` and then with the table row reduced to `two-way`. Expected: answered in the first run, left to the user in the second (the pill counts it).
3. Repeat with a text that also holds `Yours: spend`. Expected: left to the user, with `one of the user's five (level 2)` in the decision log.
4. Repeat with `Door: one-way`, with the table row listing `one-way`. Expected: left to the user, at level 2 still.
5. Repeat with the first option `Red` (no mark). Expected: left to the user.
6. Set the row `Switch | off` in place of `Level | 2`, then delete the table. Expected: the step 1 question is left to the user both times.
7. Set the rows `Level | 3` and `Questions the orchestrator may decide | two-way, costly, one-way`. Ask one question, header `Merge`, text with the lines `Door: one-way` and `Yours: merge`, first option `Merge (Recommended)`. Expected: answered with `Merge (Recommended)`, the decision log's grounds read `level 3 (the Level row)` and `Yours: merge answered at level 3`, and nothing is merged: the repository's branches and `git log` are unchanged until the orchestrator merges. With `one-way` removed from the row, the same question is left to the user.
8. Ask two questions in one call, one answerable and one with `Yours: merge` (at `Level | 2`). Expected: neither is answered.
9. Ask the step 1 question from an agent with no labels. Expected: left to the user, and the daemon log names no read of `AGENTS.md`.
10. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`.

## Appetite

Written, not run. Targets Paseo `0.10.1`. Run it after "Delegated answers", with `mwp-smoke` installed, in a scratch repository whose `AGENTS.md` holds a `## Delegation` table with the rows `Questions the orchestrator may decide | two-way` and `Appetite | 0.05 USD`. Use a stream agent titled `[mwp-smoke] stream` (label `stream=mwp-smoke`) as the orchestrator. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone. Delete `stream-spend.json` in the plugin's state directory first.

1. Create a ticket agent titled `[mwp-smoke] ticket` (labels `stream=mwp-smoke`, `wave=1`, `ticket=99`, parent the stream agent) and give it a prompt that asks for one short answer. Expected: after its turn ends, `stream-spend.json` holds `mwp-smoke` with `totalUsd` equal to the agent's `lastUsage.totalCostUsd` and `partial` false, and the repository's tree is unchanged.
2. Ask the step 1 question `AskUserQuestion` (`Door: two-way`, first option `Red (Recommended)`) from the ticket agent while the total is under 0.05 USD. Expected: answered with `Red (Recommended)`.
3. Prompt the ticket agent until the total passes 0.05 USD. Expected: the stream agent receives one message starting `Appetite passed: stream mwp-smoke` with a `Next:` line; further turns send no second one; no agent is cancelled or stopped.
4. Ask the step 2 question again from the ticket agent and from the stream agent. Expected: both are left to the user (the pill counts them), and the plugin's log shows no question text.
5. Raise the row to `Appetite | 50 USD` and end one more turn. Expected: the next question is answered again; the message is not repeated.
6. Delete `stream-spend.json`, reduce the row to `Appetite | 0.01 USD`, then run a turn of an agent whose provider reports no cost. Expected: `partial` is true, the total is unchanged by that turn, and a later message reads `a partial total`.
7. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`.

## Question budget

Written, not run. Targets Paseo `0.10.1`. Run it after "Delegated answers", with `mwp-smoke` installed, in batch A (`MWP_QUESTION_BUDGET=2`), in the scratch repository of "Delegated answers" with the table row reduced to `Questions the orchestrator may decide | two-way`. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone. Note `question-budget.json` under the state directory (`MWP_STATE_DIR` moves it) before you start, and delete it so the day starts at zero.

1. Create a ticket agent titled `[mwp-smoke] ticket` (labels `wave=1`, `ticket=99`) under a stream agent titled `[mwp-smoke] stream` (label `stream=demo`), whose prompt asks one `AskUserQuestion` with `Door: one-way`. Expected: the question waits for the user, the pill of the stream agent reads "1 waiting" without the limit, the file holds today's date and `"count":1`, and the stream agent received no `Question budget spent:` message.
2. Ask a second question the same way. Expected: within 30 seconds the stream agent receives one `Question budget spent: 2 questions reached the user today against a budget of 2.` message ending in a `Next:` line (held until its turn ends if it is mid-turn), the pill reads "2 waiting, daily question limit reached", and the file holds `"count":2` and `"notified":true`.
3. Ask a third question with `Door: one-way`, then one with `Door: two-way`. Expected: the third still reaches the user and is counted (`"count":3`), no second message arrives, and the two-way question is answered with its recommendation as in "Delegated answers", not counted: the budget answers nothing and stops nothing, so questions still reach the user.
4. Reload the plugin (`paseo plugin reload mwp-smoke`), with the same setting. Expected: the pill still reads the limit while a question waits, and asking one more question raises the count to 4 with no new message.
5. Change the machine's date past local midnight, or edit the file's `day` to yesterday, and ask one question. Expected: the count starts again at 1 and no message is sent until the budget is reached again.
6. In batch B (`MWP_QUESTION_BUDGET=many`), ask two questions. Expected: both reach the user and are counted, no message is sent, the pill never reads the limit. A daemon with no setting at all is the same case, and `test/hooks/question-budget.test.ts` covers it.
7. Ask a question from an agent with no labels. Expected: it is not counted.
8. Archive every `[mwp-smoke]` agent, delete `question-budget.json`, then `paseo plugin remove mwp-smoke`.

## Report card

Written, not run. Targets Paseo `0.10.1`. Run it after "Question budget", with `mwp-smoke` installed, in batch A (`MWP_QUESTION_BUDGET=2`), in the scratch repository of "Appetite" (`Questions the orchestrator may decide | two-way`, `Appetite | 0.05 USD`). Use a stream agent titled `[mwp-smoke] stream` (label `stream=mwp-smoke`) as the orchestrator and a ticket agent titled `[mwp-smoke] ticket` (labels `stream=mwp-smoke`, `wave=1`, `ticket=99`, parent the stream agent). Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone. Delete `delegated-answers.jsonl`, `stream-spend.json` and `question-budget.json` in the plugin's state directory first.

1. Let the ticket agent's turn end. Expected: the stream agent's chat holds one report card with an empty `decided` list, the spend as `totalUsd` against 0.05 USD, and `Questions today: 0 of 2`, and the line `All decisions: <path>` with the absolute path of `decision-log.md` under `MWP_STATE_DIR` (text, not a link). It is drawn as a card, not as an unavailable placeholder: a "Plugin timeline item unavailable" row means the client renderer did not register or the schema rejected the data, and the step fails. The ticket agent's own chat holds no card.
2. Ask a `Door: two-way` question from the ticket agent (header `Colour`, first option `Red (Recommended)`). Expected: it is answered, and the card in the stream agent's chat now lists `Colour` with `Red (Recommended)` and its time. It is the same row (one card, not two), and the plugin's log shows no question text.
3. Ask a `Door: one-way` question. Expected: it waits for the user, the same row now reads `Questions today: 1 of 2`, and it lists no new decision.
4. Prompt the ticket agent until the total passes 0.05 USD. Expected: the same row shows the higher spend past the appetite.
5. Run a turn of an agent whose provider reports no cost. Expected: the spend on the card says it is partial.
6. Look at the card in Paseo's window. Expected: it has no button of any kind, and it shows the `All decisions:` line. Take a screenshot of the card in Paseo's window and keep it with the milestone run's results.
7. Reload the plugin and end a turn. Expected: the card comes back with the decisions and the question count as before (the records survive), and the daemon restart drops the old row without harm.
8. Archive every `[mwp-smoke]` agent, delete the three files, then `paseo plugin remove mwp-smoke`.

## Setup

Written, run by hand. Targets Paseo `0.10.1`. It proves `setup`, `setup --update` and `setup --remove` (`setup/`, the `npx github:hanh9898/matt-with-paseo-plugin setup` command) on a scratch home, never on the machine's own. The ticket agent runs it once on Windows and writes the line under `## Results`; the macOS and Linux runs are the human list of the milestone run.

The scratch resources, all under one folder in the system temp folder:

- a scratch `HOME` and `USERPROFILE`, and `LOCALAPPDATA` inside it;
- `MWP_SETUP_DIR`, the clone's folder, and `CLAUDE_CONFIG_DIR`, the scratch Claude Code configuration, both new;
- a scratch Paseo home passed as `--paseo-home <home>`, whose daemon has its own free port (`paseo daemon config set daemon.listen 127.0.0.1:<port> --home <home>`, then `paseo daemon start --home <home>`; the port is not the machine's daemon's). Every `paseo` call of the run carries `--home <home>`, and the daemon is stopped with the same `--home` at the end.

The child environment of every step is the machine's, without `PASEO_HOME`, `PASEO_AGENT_ID`, `PASEO_AGENT_CWD`, `PASEO_CLI` and every name holding `API_KEY`, `TOKEN` or `SECRET` (`scrubEnv` in `test/smoke/smoke-plan.ts`), then the scratch values over it. `APPDATA` stays, so `gh` keeps its login there (its files are never read, and `gh auth status` is only run by setup, its exit code the only thing read). No value of the scratch environment or of a credential is printed. `mattpocock-skills` goes into the scratch `CLAUDE_CONFIG_DIR` with the two commands setup prints for it (`claude plugin marketplace add mattpocock/skills`, then `claude plugin install mattpocock-skills@mattpocock`); on a fresh configuration `claude plugin install mattpocock-skills` alone fails with `not found in any configured marketplace`.

Before step 1 of a run before ship, `<setup>` is `node <checkout>/setup/cli.mjs`; `npm pack` in the checkout, then `npx <the tarball's absolute path> setup --dry-run`, shows the same command starts from `node_modules`. After ship, `<setup>` is `npx github:hanh9898/matt-with-paseo-plugin#<ref>`.

1. Record the machine's own `paseo daemon status` (pid and version only) and `claude plugin list`, without `--home` or `CLAUDE_CONFIG_DIR`, to compare at step 8.
2. `<setup> setup --paseo-home <home>` ends with every row `pass` and exit 0: the clone at `v<version>`, the Paseo plugin, the Claude Code plugin and the skills at the tag of `setup/paired.json`, with every change command printed before it ran.
3. `<setup> setup --paseo-home <home>` again records no change command: each part says `already installed`.
4. `<setup> setup --update --paseo-home <home>` fetches, checks out `v<version>` (nothing to do at the same tag), reloads the Paseo plugin, updates the marketplace and the Claude Code plugin, and re-installs the skills only when their tag differs; every row passes. `paseo plugin update` on a plugin installed from a folder answers `local directory; use Reload after editing` and changes nothing, so the reload is the update (read on Paseo `0.10.1`).
5. `<setup> setup --remove --paseo-home <home>` removes the Paseo plugin, the Claude Code plugin and its marketplace, the skills and the clone, prints the path of the plugin's state folder and says it holds the decision log, kept; then `paseo plugin ls` and `claude plugin list` no longer show the plugin, and the state folder is as it was.
6. `<setup> setup --remove --paseo-home <home>` again changes nothing: every part says `not installed`.
7. After ship, once: `npx github:hanh9898/matt-with-paseo-plugin#<branch> setup --dry-run --paseo-home <home>` prints the prerequisite rows and every command it would run, and changes nothing (the `npx` path from GitHub; the ticket agent cannot run it, since no branch is pushed under `stream`).
8. Stop the scratch daemon with `paseo daemon stop --home <home>`. The machine's own `paseo daemon status` (pid and version) and `claude plugin list` equal step 1's.

What the first run found (2026-10-02, Paseo `0.10.1`, Windows):

- `paseo daemon config get pluginsEnabled` prints JSON (`"value": true`), not `true`: `setup` read it as off and set it again on every run. Fixed in `setup/flow.mjs`.
- `paseo plugin install <folder>` does not ask with stdin closed; `paseo plugin update <id>` on it exits 0 with `local directory; use Reload after editing`; `paseo plugin reload <id>`, `claude plugin marketplace update` and `claude plugin update` run without a terminal.
- `gh skill list --json` names a skill `<repository folder>/<skill>` (`matt-with-paseo/matt-with-paseo`), so setup reads the last segment; read whole, `--update` took skills `gh` had installed for another route.
- `gh skill` has no remove command: `--remove` deletes the two skill folders itself, and only when `gh skill list --dir <skills folder> --json` shows them from the skills repository at the pinned tag.

## Results

- Steps | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P1: ok install exits 0; ok ls shows mwp-smoke running; ok logs hold no [matt-with-paseo] line; ok logs hold Plugin ready; ok provider ids the same with the plugin installed; ok remove exits 0 and ls no longer lists it; ok a second install runs; ok running again
- Lifecycle relay | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P2: ok Agent created: arrives; ok Turn ended: names ticket 99, wave 1, completed, with no heartbeat; ok the orchestrator's own turn end adds none (1); ok a Next: line names get_agent_activity; Next: tools named: get_agent_activity (their existence on the daemon is not checked: the CLI lists no MCP tools); ok Permission pending: names AskUserQuestion and a request id; ok the question text is not in the message; ok unlabelled and wave-only agents add no message; ok their ids appear in no relay message; ok Agent archived: arrives; orchestrator timeline saved as test/smoke/fixtures/paseo-0.10.1/P2-relay-orchestrator-timeline.txt // owner, 2026-10-02, in the app: Agent created:, Permission pending: ... AskUserQuestion (question) with the level-1 Next: line, Turn ended: from ticket to stream and from stream to orchestrator; a stream agent is woken twice per ticket turn end (Paseo's notifyOnFinish default and the plugin's relay), and the first two relays repeated their Turn ended: line (F3)
- Waiting pill | pass | 2026-10-02 | Paseo 0.10.1 | Windows 11 Home 10.0.26200 | Node v24.19.0 | owner, on the owner's daemon with the app: the stream agent's composer showed "⌛ 1 waiting" while ticket 99's AskUserQuestion waited, and the pill was gone after the answer; it appeared only once the app was reloaded, the plugin having been installed while the app was open (F1, now in the steps); screenshots pill-first-view.png, pill-scrolled.png, pill-narrow.png, pill-gone-after-answer.png, kept by the owner with the milestone run's results (D:\matt-with-paseo-streams\research\smoke-v0.1.0\); at narrow width Paseo's own chips overlap the next line (F5)
- Git guard | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P3: ok the ticket agent sees MWP_ROLE=ticket; ok the plain agent sees no MWP_ROLE; restarted by paseo restart; ok the resumed ticket agent still prints ticket; ok no agent.session_open could not read line for the resumed ticket agent; ok no agent.create handler failed line // owner, 2026-10-02, part B with the owner's Claude Code: MWP_ROLE=ticket and claude -p "Run git push origin HEAD..." printed "Refused: git push is the orchestrator's to run...", the remote untouched; with MWP_ROLE unset the push succeeded (* [new branch] HEAD -> master), so the hook finds node; an agent.session_open could not read line is logged for every new agent, not only resumed ones (F2)
- Claude Code plugin | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P12: ok validate of the plugin passes; ok validate of the marketplace passes; ok marketplace add; ok install; ok list shows it; ok details lists the PreToolUse hook; ok marketplace remove // owner, 2026-10-02, the owner's own Claude Code: claude plugin validate passed (one author warning, since fixed); marketplace add and install of matt-with-paseo-plugin@matt-with-paseo-plugin: enabled, scope user, version 0.0.0
- Role identity | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P2: ok Agent created: arrives; ok Turn ended: names ticket 99, wave 1, completed, with no heartbeat; ok the orchestrator's own turn end adds none (1); ok a Next: line names get_agent_activity; Next: tools named: get_agent_activity (their existence on the daemon is not checked: the CLI lists no MCP tools); ok Permission pending: names AskUserQuestion and a request id; ok the question text is not in the message; ok unlabelled and wave-only agents add no message; ok their ids appear in no relay message; ok Agent archived: arrives; orchestrator timeline saved as test/smoke/fixtures/paseo-0.10.1/P2-relay-orchestrator-timeline.txt
- Human words | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P4: ok create path (CLI run with the orchestrator as parent): a Turn ended: and no Human words:; ok CLI send exits 0; CLI send (also with PASEO_AGENT_ID set to the orchestrator): carries a clientMessageId, counted as a person's (Human words: arrived); the CLI timeline text shows no messageId or clientMessageId fields; both timelines saved under fixtures/paseo-0.10.1/; not covered: an agent could not create a child or send a prompt through its MCP tools on this daemon // owner, 2026-10-02, in the app: typed "use the other table" in ticket 99's chat; the stream agent got "Human words: ticket 99 of wave 1, agent 595e0559..., 1 message typed in its chat (message msg_1790910983470_smh1679d6)." ahead of Turn ended:, the id and not the words, so the app sets clientMessageId
- Cheap sensor | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P7: ok the three agents are still running at minute 2 (a stuck call, not a finished turn) (running,running,running); ok the three agents are still running at minute 7 (a stuck call, not a finished turn) (running,running,running); ok UpdatedAt read at minute 2 and minute 7 is equal while the call is stuck ("2026-10-01T11:39:23.669Z" \| "2026-10-01T11:39:23.669Z"); ok stream agent flagged exactly once during the sleep (1); ok ticket agent flagged exactly once during the sleep (1); ok bundle agent flagged exactly once during the sleep (1); ok the body says its turn has run with no new activity, with the never-prompt Next: line; ok no Stall suspected: after the sleep ends (5 -> 5); ok no tick handler failure in the plugin log; lastActivityAt is not shown by the CLI; UpdatedAt stood in for it
- Gate cap | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P8: ok A runs (running); ok one Gate cap passed names ticket 99 and a cap of 1; ok a Next: line ends it; ok the idle third adds no Gate cap passed (1 -> 1); MWP_GATE_SHARE=0.01 reached plugin code through daemon start
- State outside the repository | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P9: ok plugin-real-host-repo-p5: git status --porcelain is empty; ok plugin-real-host-repo-p5: HEAD unchanged (88897a24801f30d6d98603c9626281e01647e017); ok plugin-real-host-repo-spend: git status --porcelain is empty; ok plugin-real-host-repo-spend: HEAD unchanged (69f65b32c84e839cb038cce35cef80ce944ea37f); ok MWP_STATE_DIR holds the plugin's files (delegated-answers.jsonl,question-budget.json,stream-spend.json); state dir: delegated-answers.jsonl,question-budget.json,stream-spend.json
- Cost levels | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P6: ok stream-spend.json totalUsd equals lastUsage cost (0.0143611 vs 0.0143611); ok Appetite passed: once (1); ok still once after a second turn; ok presets/cost-levels.json is in the smoke copy; list_profiles is an MCP tool the CLI cannot call: compared provider ids instead (P1)
- Delegated answers | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P5: ok the two-way question is answered with the recommendation; ok delegated-answers.jsonl holds the Colour answer, no question text; ok the one-way question waits as a pending permission; ok the one-way agent has not been answered; ok the plugin log holds no question text
- Appetite | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P6: ok stream-spend.json totalUsd equals lastUsage cost (0.0143611 vs 0.0143611); ok Appetite passed: once (1); ok still once after a second turn; ok presets/cost-levels.json is in the smoke copy; list_profiles is an MCP tool the CLI cannot call: compared provider ids instead (P1)
- Question budget | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | P10: ok after one question the file holds count 1 ({"day":"2026-10-01","count":1,"notified":false}); ok no Question budget spent yet; ok one Question budget spent: 2 ... budget of 2; ok the file holds count 2 and notified ({"day":"2026-10-01","count":2,"notified":true})
- Report card | pass | 2026-10-02 | Paseo 0.10.1 | Windows 11 Home 10.0.26200 | Node v24.19.0 | owner, in the app (level 1, no ## Delegation table): drawn as a card with no button, "Decided for you (0) / Nothing decided for you yet / All decisions: C:\Users\HBLAB_OPMS\AppData\Local\matt-with-paseo\decision-log.md / Spend $1.35 (no limit set) / Questions today: 1 (no limit set)"; screenshot report-card.png kept by the owner with the pill's; the card stays at its first row, mid-timeline (F4) // P11: ok the plugin logged no report card failure; the CLI timeline of the stream agent shows no plugin rows in text, json or yaml, so the row's kind and version are not read: human step; ok after a reload the next turn refreshes the card without a failure; the card's drawing and its lack of a button are a human step
- Setup | pass | 2026-10-02 | Paseo 0.10.1 | Windows 11 Home 10.0.26200 | Node v24.19.0 | scratch home, scratch daemon on port 57251, the machine's environment minus the PASEO_* names and every API_KEY, TOKEN and SECRET name (7 names, never printed), APPDATA kept; mattpocock-skills installed on the scratch CLAUDE_CONFIG_DIR with the two printed commands; step 2: every row pass, exit 0 (clone at v0.1.0, the Paseo plugin after setup turned pluginsEnabled on, the Claude Code plugin, the skills at v0.8.0); step 3: no change command; step 4: fetch, plugin reload, marketplace update, plugin update, skills left at v0.8.0, every row pass, and with the skills at v0.7.0 one gh skill install ... --pin v0.8.0 --force, then v0.8.0; step 5: three removal commands, two skill folders and the clone removed, state folder path printed and kept, exit 0; step 6: every part not installed, exit 0; not run: the first-run checkout and npm ci of --update (fake runner only), and step 7 (no pushed branch; the npm pack tarball ran by npx setup --dry-run on the same home, exit 0); the machine's own daemon (pid 8268, 0.10.1) and claude plugin list equal before and after; scratch daemon pid 23640 stopped with its own --home
- Clean-up | pass | 2026-10-01 | Paseo 0.10.1 | Windows_NT 10.0.26200 | Node v24.19.0 | plugin remove exit 0; daemon stop: stopped: C:\Users\HBLAB_OPMS\AppData\Local\Temp\plugin-real-host-53\plugin-real-...; status: stopped; scratch folder deleted

Only a person can do:

- [x] Enable the Claude Code plugin in your own Claude Code (the runner used a scratch configuration directory).
- [x] Waiting pill: take three screenshots in Paseo's window, the first view, scrolled and a narrow width (step 9), and read the pill's words against `PLAIN_LABELS` in `client/pill-text.ts`.
- [x] Report card: take one screenshot of the card in Paseo's window and check that no button is drawn.
- [x] Human words: type one message in a ticket agent's chat in the Paseo app and keep its timeline item (it proves the app sets `clientMessageId`).
