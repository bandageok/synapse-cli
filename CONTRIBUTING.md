# Contributing to Synapse

Synapse is an early-stage coding agent. Small, testable changes are easier to review and safer to release than broad rewrites.

## Before opening a pull request

- Use an issue or Discussion to describe large behavior changes before implementing them.
- Keep each pull request focused on one problem.
- Add or update tests for behavior changes.
- Do not include API keys, local `.synapse` data, session transcripts, or generated credentials.
- Report security problems privately as described in [SECURITY.md](./SECURITY.md).

Documentation fixes and provider compatibility reports can go directly to a pull request when the scope is clear.

## Local setup

Synapse supports Node.js 18 and 22 in CI.

```bash
git clone https://github.com/bandageok/synapse-cli.git
cd synapse-cli
npm ci
npm run build
node dist/cli.mjs --help
```

Run the full local checks before opening a pull request:

```bash
npm run lint
npm test
npm run build
npm pack --dry-run
npm audit
```

The strict sandbox test needs Bubblewrap and an explicit environment variable:

```bash
SYNAPSE_E2E_SANDBOX=1 npm test -- tests/sandbox-e2e.test.ts
```

CI runs the strict sandbox test on Linux. A skipped local sandbox test is expected when its prerequisites are not available.

## Test expectations

- Unit tests belong next to the relevant behavior under `tests/`.
- CLI changes need an integration test that runs the actual entry point.
- Provider changes need request and response fixture coverage for tool calls.
- Permission, path, network, MCP trust, and instruction changes need adversarial regression tests.
- Tests must not depend on credentials from the host environment.

Start with the narrowest test while working, then run the complete suite before submission.

## Coding style

- Keep TypeScript strict and avoid `any` when a useful type can be expressed.
- Prefer existing helpers and ownership boundaries over new abstractions.
- Use structured parsers for JSON and protocol messages.
- Keep security decisions in the safety kernel or permission layer, not in prompt text alone.
- Add comments only where the reason is not clear from the code.

## Commit and pull request notes

Use a short imperative subject such as `fix: preserve tool call ids`. The pull request body should explain the observed problem, the root cause, the chosen fix, and the commands used to verify it.

Do not bump the package version in a contributor pull request. Release versions and npm publication are maintained separately.
