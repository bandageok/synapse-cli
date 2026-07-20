## Problem

Describe the observed behavior and why it matters.

## Root cause

Explain the code path or design condition that caused the problem.

## Change

Describe the smallest change that fixes the root cause.

## Verification

- [ ] `npm run lint`
- [ ] Relevant focused tests
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm pack --dry-run` when packaging or public files changed
- [ ] Documentation updated when user-visible behavior changed

## Security and compatibility

List any effect on providers, permissions, local data, network access, shell isolation, Node.js 18, Windows, Linux, or existing configuration. Write `None` when there is no effect.
