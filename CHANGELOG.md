# Changelog

All notable changes to `@ekinnee/omniroute-provider` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Replaced the unsupported top-level manifest `tags` field with package
  keywords and controlled ClawHub categories (`models`, `media`, and `web`).

## [2.2.0] - 2026-09-17

### Added

- Added image editing through OmniRoute `POST /v1/images/edits` for OmniRoute
  v3.8.11 and newer.

### Fixed

- Excluded chat catalog rows that omit required context or output limits.
- Preserved an explicit `capabilities.tool_calling: false` declaration.
- Bounded provider-usage response bodies to 32 KiB and normalized read failures.
- Rejected target TLS overrides combined with explicit-proxy mode before sending
  a plugin-owned request.

### Changed

- Hardened release publication, test gating, and pull-request labeling.
- Updated Vitest to 4.1.11.

## [2.1.4] - 2026-08-28

### Fixed

- Preserved OmniRoute web-search freshness and result content.
- Rejected malformed embedding responses with invalid vector indices.
- Bounded upstream JSON response bodies.
- Accepted inline OmniRoute video artifacts as valid generation results.
- Marked OmniRoute as an external provider in registration metadata.

## [2.1.3] - 2026-08-26

### Fixed

- Hardened base URL resolution and live model-discovery transport.
- Reused host-owned authentication and cancellation for web search.
- Corrected the remote-provider quickstart documentation.
- Made the OpenClaw build identity and prerelease-aware peer/API contract
  explicit and continuously verified.

### Added

- Added floor, latest, and beta packed-artifact compatibility coverage.

## [2.1.2] - 2026-08-24

### Fixed

- Preserved each discovered model's advertised reasoning-effort subset.
- Kept unsupported thinking levels disabled when `effort_tiers` is present.
- Normalized and deduplicated valid effort tiers while ignoring malformed or
  unknown values.

## [2.1.1] - 2026-08-20

### Added

- Added OmniRoute provider usage reporting.
- Added the provider capability roadmap and GitHub issue/PR intake automation.

### Fixed

- Used the configured API key for catalog discovery.
- Hardened the plugin test workflow and corrected plugin entrypoint guidance.

## [2.1.0] - 2026-08-18

### Added

- Added the read-only `omniroute-catalog-audit` executable.
- Added catalog diagnostics for invalid rows, duplicate IDs, and metadata gaps.
- Added redaction for sensitive connection details in audit output.
- Added packed-artifact compatibility checks against `openclaw@beta`.

### Fixed

- Made profile-backed discovery and runtime credential resolution honor the
  configured authentication profile order.

## [2.0.0] - 2026-08-18

### Changed

- Made the authenticated OmniRoute `GET /v1/models` response the sole source of
  truth for model and combo discovery.
- Preserved advertised IDs and thinking capabilities without synthesizing
  defaults or fallback catalog entries.
- Scoped discovery caching to the gateway URL, authentication profile, and a
  non-reversible credential fingerprint.

### Removed

- Removed the synthetic `omniroute/auto` catalog entry and automatic default
  model selection. Users must select a model advertised by their gateway.

## [1.0.2] - 2026-08-03

### Fixed

- Preserved configured onboarding model primaries.
- Rejected insecure TLS overrides and honored explicit private-network denial.
- Avoided caching empty live catalogs.
- Preserved resolved embedding credentials over remote authorization headers.

## [1.0.1] - 2026-07-22

### Fixed

- Corrected the provider count and restored video generation details in the
  ClawHub README.

## [1.0.0] - 2026-07-18

### Added

- Added OmniRoute web search with freshness, country, and language controls.
- Added text-to-video generation through `POST /v1/videos/generations`.
- Switched release publication to a built ClawPack artifact.

### Changed

- Logged live discovery failures through OpenClaw's subsystem logger.
- Consolidated model discovery in a shared `fetchOmniRouteModels` helper.

## [0.1.5] - 2026-07-18

### Changed

- Added logged live-discovery failures and shared model-fetching infrastructure.
- Switched the publisher from a legacy ZIP to a built ClawPack artifact.
- Tightened `auto` reasoning detection and preserved configured content types.

### Fixed

- Corrected the publisher's artifact-upload permission.

## [0.1.4] - 2026-07-18

### Added

- Added image generation through `POST /v1/images/generations`.
- Added live image-model filtering helpers and tests.

### Changed

- Raised the OpenClaw compatibility floor to 2026.5.22.

## [0.1.2] - 2026-07-18

### Fixed

- Removed a false-positive secret scan from a test assertion.

## [0.1.1] - 2026-07-17

### Added

- Added live chat-model discovery through `GET /v1/models`.
- Added compiled TypeScript output for ClawHub packaging.
- Added `OMNIROUTE_BASE_URL` support for custom gateways.

### Changed

- Retained `omniroute/auto` as the static fallback.
- Refreshed the README, ClawHub listing copy, and support roadmap.

## [0.1.0] - 2026-07-17

### Added

- Initial OpenClaw provider plugin for OmniRoute text inference.
- Added environment and onboarding-based API-key configuration.
- Added custom gateway configuration and the initial `omniroute/auto` model.

[Unreleased]: https://github.com/ekinnee/omniroute-openclaw/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/ekinnee/omniroute-openclaw/compare/v2.1.4...v2.2.0
[2.1.4]: https://github.com/ekinnee/omniroute-openclaw/compare/v2.1.3...v2.1.4
[2.1.3]: https://github.com/ekinnee/omniroute-openclaw/compare/v2.1.2...v2.1.3
[2.1.2]: https://github.com/ekinnee/omniroute-openclaw/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/ekinnee/omniroute-openclaw/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/ekinnee/omniroute-openclaw/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/ekinnee/omniroute-openclaw/compare/v1.0.2...v2.0.0
[1.0.2]: https://github.com/ekinnee/omniroute-openclaw/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/ekinnee/omniroute-openclaw/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ekinnee/omniroute-openclaw/compare/v0.1.5...v1.0.0
[0.1.5]: https://github.com/ekinnee/omniroute-openclaw/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/ekinnee/omniroute-openclaw/compare/v0.1.2...v0.1.4
[0.1.2]: https://github.com/ekinnee/omniroute-openclaw/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ekinnee/omniroute-openclaw/releases/tag/v0.1.1
[0.1.0]: https://github.com/ekinnee/omniroute-openclaw/commit/10f3cafb7f906ddd8c4fb1a217967b094349a46e
