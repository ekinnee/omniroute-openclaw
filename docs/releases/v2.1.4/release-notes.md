# OmniRoute OpenClaw v2.1.4

Patch release for `@ekinnee/omniroute-provider`.

## Included

- Preserve OmniRoute web-search freshness and result content when projecting
  responses through OpenClaw.
- Reject malformed embedding responses with invalid vector indices before they
  can create inconsistent vector indexes.
- Bound upstream JSON response bodies to prevent unbounded plugin memory use.
- Accept inline OmniRoute video artifacts as valid generation results.
- Mark OmniRoute as an external provider in the plugin registration metadata.

## Compatibility

- Stable compatibility floor remains OpenClaw `2026.7.1`.
- `peerDependencies.openclaw` and `openclaw.compat.pluginApi` remain
  `>=2026.7.1-0`.
- No configuration migration is required.

## Verification

The exact release candidate is validated by the repository Test and Upstream
Compatibility workflows, plus local package validation before publication.

Included merged changes: [#39](https://github.com/ekinnee/omniroute-openclaw/pull/39),
[#40](https://github.com/ekinnee/omniroute-openclaw/pull/40),
[#41](https://github.com/ekinnee/omniroute-openclaw/pull/41),
[#42](https://github.com/ekinnee/omniroute-openclaw/pull/42), and
[#43](https://github.com/ekinnee/omniroute-openclaw/pull/43).
