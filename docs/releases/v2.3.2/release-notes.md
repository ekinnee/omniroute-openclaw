# OmniRoute OpenClaw v2.3.2

Patch release for `@ekinnee/omniroute-provider`.

## Fixed

- Restore catalog-audit CLI loading on OpenClaw beta by reading configuration
  through the public `openclaw/plugin-sdk/runtime-config-snapshot` SDK's
  `getRuntimeConfig`, in
  [#83](https://github.com/ekinnee/omniroute-openclaw/pull/83).
  The runtime plugin itself was not affected by the CLI loading failure.
- Add regression coverage and a compatibility fixture that verify actual
  OpenClaw configuration loading and default/named-agent selection.

## Compatibility

- Stable compatibility floor remains OpenClaw `2026.7.1`.
- `peerDependencies.openclaw` and `openclaw.compat.pluginApi` remain
  `>=2026.7.1-0`, retaining prerelease-aware peer and API compatibility.
- No configuration migration is required.

## Publication note

The [v2.3.2 GitHub release](https://github.com/ekinnee/omniroute-openclaw/releases/tag/v2.3.2)
is published from release merge
[`5a1e7164ed823f312e42167fb80679a83b4f2aa8`](https://github.com/ekinnee/omniroute-openclaw/commit/5a1e7164ed823f312e42167fb80679a83b4f2aa8),
which merged [#84](https://github.com/ekinnee/omniroute-openclaw/pull/84).
ClawHub verification is pending at the time of writing (2026-10-05).

## Verification

The recorded release validation includes:

- Local tests: 159 tests across 14 files passed with a sanitized environment
  and serialized execution.
- Local build, generated `dist/` freshness, source-contract checks, and
  `git diff --check` passed.
- PR #84's Test workflow and floor/latest/beta packed-artifact compatibility
  checks passed after GitHub queue delays/timeouts and owner-initiated reruns.
- The config fixture verifies the SDK loads the actual configuration and
  selects the expected default or named agent.

The artifact checks provide narrow ABI and configuration evidence; they do
not establish full OpenClaw beta runtime safety. No host canary, Plugin
Inspector validation, or ClawHub dry run was performed for this release.
