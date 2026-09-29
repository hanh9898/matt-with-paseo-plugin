# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository setup: agent documents (`AGENTS.md`, `docs/agents/`), coding standards, evidence standards, ship rules, pull request and issue templates, and community files.
- Plugin skeleton: `paseo-plugin.json` declaring `requirements.paseo` as `>=0.10.1 <0.11.0`, the Paseo version the smoke test targets (`0.10.1`), a strict TypeScript package, one entry module, and a test folder with a smoke test.
- One narrow host port: `server/host.ts` is the interface hook handlers use to reach Paseo, `server/paseo-host.ts` is the only module that imports the Paseo SDK, and `test/support/fake-host.ts` is the fake adapter that lets handlers be tested without a daemon.
- Harness descriptors: `harness/claude.json` holds every agent-specific fact (config directory variable, skills directory and mode, MCP delivery), `shared/harness.ts` is the field table, `server/harness.ts` loads the folder, and two checks fail when a descriptor breaks the contract or source code names an agent id.
