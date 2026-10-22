# OmniRoute OpenClaw v2.4.0

Minor release for `@ekinnee/omniroute-provider`.

## Added

- Web search honors the existing `tools.web.search.maxResults` setting when a
  call omits `count`, and displays the effective default in its parameter
  description. Explicit-count handling is unchanged; without a configured
  default, omitted counts still request `5` results. Requested by
  [sprintberlin](https://github.com/sprintberlin), implemented in
  [PR #90](https://github.com/ekinnee/omniroute-openclaw/pull/90).

## Fixed

- Image, video, music, and speech providers use async readiness checks when the
  public OpenClaw SDK supplies them, avoiding legacy SDK calls and the speech
  readiness deprecation warning on the newer host path.
- Standalone catalog auditing prepares cold runtime configuration through the
  async SDK reader when available. Older supported hosts retain their existing
  synchronous behavior; rejected async calls are never retried synchronously.
  Both changes are in
  [PR #89](https://github.com/ekinnee/omniroute-openclaw/pull/89).

## Compatibility and upgrade behavior

- Minimum OpenClaw version remains `2026.7.1`; peer and plugin API ranges remain
  `>=2026.7.1-0`. No new plugin configuration or credential migration is required.
- Existing `tools.web.search.maxResults` values now take effect for calls that
  omit `count`. Existing explicit counts keep their previous handling.
- SDK contracts that are unavailable on older hosts are detected through public
  exports. The release does not require a beta or development host.
- Direct callers of deprecated synchronous host APIs can still produce their
  own warnings. The plugin's async readiness path avoids those legacy calls.

## Verification scope

The merged feature changes have passing hosted unit and packed compatibility
checks. Adapter evidence covers async credential readiness, cold standalone
config loading and default/named-agent selection, and search-count requests
through the real SDK guarded transport against a synthetic local service.
These checks do not establish deployed Gateway, model, or media-generation
behavior. Release publication and public installation are verified separately.
