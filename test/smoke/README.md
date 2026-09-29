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
2. From it, create a ticket agent titled `[mwp-smoke] ticket` with the labels `wave=1` and `ticket=99` and a prompt that asks one question with `AskUserQuestion`. Within 30 seconds the stream agent's composer shows the pill reading `1 waiting`. The ticket agent's own composer shows no pill.
3. Create a second such ticket agent. The pill reads `2 waiting`.
4. Answer the first question in that ticket agent's chat, with Paseo's own prompt. The pill reads `1 waiting`; answer the second and the pill disappears.
5. Prompt the stream agent to ask one question with `AskUserQuestion` itself. Its pill reads `1 waiting`; answer it and the pill disappears.
6. Ask a question from an agent with no labels and from one with only `wave=1`. No pill appears in any composer.
7. Ask a question from a ticket agent, then cancel its turn without answering. The pill disappears.
8. Screenshots of the stream agent's chat with the pill at `1 waiting`, in Paseo's own window, saved as `pill-first-view.png`, `pill-scrolled.png` and `pill-narrow.png`:
   - first view: the chat as it opens, the composer with the pill in view;
   - scrolled: the chat scrolled up past its first view, so the pill's place in the composer is shown with the chat above it;
   - narrow width: the window narrowed until the layout turns compact (mobile width), the pill still readable.
   Attach them to the stream's pull request under Evidence.
9. Archive every `[mwp-smoke]` agent, then `paseo plugin remove mwp-smoke`.

Read the plugin's own output with `paseo plugin logs mwp-smoke`; a line starting `[matt-with-paseo]` is a handler that failed and was kept out of Paseo. A pill read that failed is logged in the app's console with the same prefix.

## Results

None yet.
