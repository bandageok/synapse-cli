# Changelog

All notable changes to Synapse are documented in this file.

## 0.2.1 - 2026-07-19

- Replaced the engine-starting `doctor` command with a side-effect-free readiness report.
- Added `synapse doctor --json` for scripts and `synapse doctor --live` for provider connectivity checks.
- Added validation for provider configuration, API key presence, data files, MCP configuration, and plugin manifests.
- Patched production dependency vulnerabilities in `form-data` and `ws`.
- Added Linux and Windows CI gates for Node.js 18 and 22.

## 0.2.0 - 2026-07-19

- Added provider list, set, and live test commands with custom BaseURL support.
- Added memory inspect, search, prune, and export commands.
- Published the package as `@bandageok/synapse-cli`.
