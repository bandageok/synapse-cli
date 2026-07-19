# Changelog

All notable changes to Synapse are documented in this file.

## 0.2.2 - 2026-07-19

- Reworked onboarding into a predictable provider, model, key, connection test, and security flow.
- Added numeric provider selection, editable model IDs, masked API keys, back navigation, retry, and explicit save-anyway behavior.
- Improved provider connectivity errors with BaseURL, timeout, authentication, rate-limit, and endpoint hints.
- Added end-to-end tests for the interactive onboarding UI and a real OpenAI-compatible streaming conversation.
- Kept Ctrl+C responsive while a provider request is in progress.

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
