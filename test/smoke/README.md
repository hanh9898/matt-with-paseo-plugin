# Smoke test: the plugin loads on a real Paseo host

Written, not run by the ticket that added it. The stream runs it once, at its end (`docs/agents/evidence-standards.md`).

| Manifest range (`requirements.paseo`) | Paseo version this smoke test targets |
|---|---|
| `>=0.10.1 <0.11.0` | `0.10.1` (daemon, CLI and plugin SDK), Windows |

The two cells are one claim: `0.10.1` is the version the range was tested on, and the range stops before the next minor release. Move them together, and record the result of a new run under Results.

Installing the plugin touches every session on the machine's daemon. Run it only on a daemon whose owner agreed to that, and remove the plugin at the end so the daemon's plugin set is as it was.

## Steps

`<plugin>` is the absolute path of this repository's checkout.

1. `paseo --version` prints `0.10.1`. Any other version: stop, the run does not count for this range.
2. `paseo daemon status --json` shows `pluginsEnabled` as `true` in the daemon's `config.json`. Otherwise stop: enabling plugins needs the daemon owner's consent.
3. `paseo plugin install <plugin> --id mwp-smoke` reports success.
4. `paseo plugin ls` lists `mwp-smoke` as `running` with no error. Any other status: `paseo plugin logs mwp-smoke` holds the reason, and an error resolving `./server/paseo-host.ts` there means the daemon rejects the `.ts` extension in relative imports.
5. `paseo plugin remove mwp-smoke`, then `paseo plugin ls` no longer lists `mwp-smoke`.

## Lifecycle relay

Written, not run. Targets Paseo `0.10.1`. Run it after the steps above, with `mwp-smoke` still installed. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone.

1. Start an orchestrator agent titled `[mwp-smoke] orchestrator`, and set no heartbeat.
2. From it, create a ticket agent titled `[mwp-smoke] ticket` with the labels `wave=1` and `ticket=99` and a prompt that answers in one line and stops. The orchestrator ends its turn.
3. The orchestrator's timeline gains a message starting `Turn ended:` naming the ticket `99`, the wave `1` and the outcome `completed`. It arrives with no heartbeat set and no `notifyOnFinish`. The orchestrator's own turn end adds no message.
4. Create a second ticket agent with the same labels whose prompt asks a question with `AskUserQuestion`. The orchestrator's timeline gains a message starting `Permission pending:` with the request id and `AskUserQuestion`, and not the question's text.
5. Prompt the orchestrator with a long turn (a shell command that sleeps 60 seconds) and, while it runs, prompt a ticket agent so that its turn ends. Nothing arrives until the orchestrator's turn ends; then one message arrives.
6. Create a third agent with no labels and one with only `wave=1`. Neither one's turn end or permission produces a message.
7. Archive the ticket agents; each archive produces an `Agent archived:` message. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`.

Read the plugin's own output with `paseo plugin logs mwp-smoke`: a line starting `[matt-with-paseo]` is a handler that failed and was kept out of Paseo.

## Waiting pill

Written, not run. Targets Paseo `0.10.1`. Run it after the relay steps, with `mwp-smoke` still installed and the app open on the same daemon. Mark every agent the run creates with the title prefix `[mwp-smoke]` and leave every other agent alone. The pill's words are the ones in `client/pill-text.ts`: read them there.

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

**A. The script, on each system.** `<plugin>` is the absolute path of this repository's checkout.

1. Windows (PowerShell): `$env:MWP_ROLE = "ticket"; '{"tool_name":"Bash","tool_input":{"command":"git push"}}' | node <plugin>guardgit-guard.mjs; $LASTEXITCODE`. macOS and Linux: `printf '{"tool_name":"Bash","tool_input":{"command":"git push"}}' | MWP_ROLE=ticket node <plugin>/guard/git-guard.mjs; echo $?`. The output is a line starting `Refused: git push` and then `2`.
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
4. Read what happens after a resume: restart the daemon, prompt the first agent again to print `MWP_ROLE`. It prints nothing (a known gap, see the README's "The git guard"); record what is seen.
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

## Results

None yet.
