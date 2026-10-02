#!/usr/bin/env node
import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { main } from "./flow.mjs";
import { run } from "./run.mjs";

// The bin `matt-with-paseo`: `npx github:hanh9898/matt-with-paseo-plugin setup`. It always runs: npm's
// `.bin` link makes an "is this the main module" check false on macOS and Linux.
process.exitCode = await main(process.argv.slice(2), {
  run,
  print: (text) => console.log(text),
  // The last three only name the plugin's state folder, which `--remove` prints and keeps.
  env: {
    MWP_SETUP_DIR: process.env.MWP_SETUP_DIR,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    MWP_STATE_DIR: process.env.MWP_STATE_DIR,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  },
  removeDir: (path) => rmSync(path, { recursive: true, force: true }),
  platform: process.platform,
  homedir: homedir(),
  nodeVersion: process.versions.node,
  packageRoot: fileURLToPath(new URL("../", import.meta.url)),
});
