# Security policy

## Supported versions

Security fixes target the latest published minor version.

| Version | Supported |
| --- | --- |
| 0.3.x | Yes |
| 0.2.x and older | No |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use [GitHub private vulnerability reporting](https://github.com/bandageok/synapse-cli/security/advisories/new) and include:

- The affected version and operating system
- Required configuration and permission mode
- A minimal reproduction or proof of concept
- Expected and observed behavior
- The security impact and any known workaround

The maintainer will acknowledge a complete report within three business days when possible. Updates will be posted in the private advisory until a fix or documented resolution is available.

## Scope

Security reports are especially useful for:

- Workspace path, symlink, or junction escapes
- Permission bypasses or approval reuse
- Shell isolation failures
- MCP trust or executable identity bypasses
- Network allowlist, redirect, DNS, or private-address bypasses
- Secret exposure in output, logs, exports, or provider requests
- Instruction precedence that can override the immutable safety kernel

Provider availability, model output quality, and prompt injection that remains contained by the documented permission boundary are normal bugs unless they cross a security boundary.
