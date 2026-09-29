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

## Results

None yet.
