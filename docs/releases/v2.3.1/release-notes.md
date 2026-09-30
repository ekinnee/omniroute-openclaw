# OmniRoute OpenClaw v2.3.1

Corrective patch release for `@ekinnee/omniroute-provider`.

## Fixed

- Declare `models` as the single ClawHub taxonomy category required for plugin
  publication.
- Retain media and web discovery through the package keywords without changing
  any runtime capability or OpenClaw registration.

## Compatibility

- Runtime behavior and capabilities are unchanged from v2.3.0.
- Stable compatibility floor remains OpenClaw `2026.7.1`.
- `peerDependencies.openclaw` and `openclaw.compat.pluginApi` remain
  `>=2026.7.1-0`.
- No configuration migration is required.

## Publication note

The v2.3.0 GitHub release remains available, but its ClawHub publication was
rejected before registry mutation because the manifest declared multiple
categories. v2.3.1 is its corrective registry successor.

## Verification

The exact release candidate is validated by the repository Test and Upstream
Compatibility workflows, local tests, build and generated-output checks,
package-content inspection, Plugin Inspector validation, and a ClawHub dry run
before publication.
