# ADR-0008: Trusted npm publishing

## Status

Accepted on 2026-07-21.

## Context

Local `npm publish` used a long-lived user token and required an interactive two-factor authentication step. This made releases depend on one workstation, exposed token lifecycle failures, and prevented an auditable end-to-end release path. npm 11 also removed the `synapse` executable from the publish manifest when its `bin` path used the non-canonical `./dist/cli.mjs` form.

## Decision

Synapse publishes from `.github/workflows/publish.yml` when a `v*` tag is pushed.

- GitHub Actions receives only `contents: read` and `id-token: write`.
- npm authenticates the workflow through OpenID Connect Trusted Publishing; no `NPM_TOKEN` is stored in the repository or GitHub secrets.
- The job uses a GitHub-hosted runner, Node.js 24, and the latest npm CLI.
- The dependency lockfile may resolve packages only from `https://registry.npmjs.org`; CI checks this before installation so a developer-local mirror cannot leak into release infrastructure.
- The tag must exactly match `v` plus the version in `package.json` before publishing.
- `prepublishOnly` remains the package-side lint, test, and build gate.
- Public packages receive npm provenance from the trusted-publishing flow.
- The canonical executable path is `dist/cli.mjs`, and release verification must confirm the packed manifest retains `bin.synapse`.

The npm package settings must bind `@bandageok/synapse-cli` to repository `bandageok/synapse-cli` and workflow file `publish.yml`. Creating or changing that trust relationship remains an npm account administration action protected by two-factor authentication.

## Consequences

- Normal releases no longer require a developer workstation, reusable npm credential, or one-time password.
- A compromised repository token cannot publish because npm validates the workflow identity and OIDC claims.
- Tag creation becomes the irreversible release trigger and must happen only after local and pull-request gates pass.
- Failed workflows can be rerun against the same tag without creating another package version, provided npm has not accepted the version.
- Lockfile registry drift fails before `npm ci` with the exact offending package paths and URLs.
