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

## Results

None yet.
