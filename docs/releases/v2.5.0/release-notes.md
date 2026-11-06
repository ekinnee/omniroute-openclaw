# OmniRoute OpenClaw v2.5.0

This release leads with two user-reported fixes: missing catalog metadata for
Responses-backed text models and shared-credential cooldown after requesting an
unconfigured upstream provider. Thanks to
[Aaron Echols (@dasunsrule32)](https://github.com/dasunsrule32) for both reports.

## User-reported fixes

- [#94](https://github.com/ekinnee/omniroute-openclaw/issues/94): text models
  advertising the `responses` endpoint now reach discovery and catalog auditing
  with their actual context/output limits and capabilities. Requests still use
  OmniRoute's translating `/v1/chat/completions` endpoint; this does not add a
  native Responses transport. Implemented in
  [PR #97](https://github.com/ekinnee/omniroute-openclaw/pull/97).
- [#95](https://github.com/ekinnee/omniroute-openclaw/issues/95): a direct-route
  401 carrying exact structured code `provider_not_configured` now fails the
  selected route without marking an otherwise healthy shared key as failed on
  supported host classification paths. Healthy sibling routes remain usable;
  invalid-key, expired-credential and policy failures retain normal handling.
  Implemented in [PR #98](https://github.com/ekinnee/omniroute-openclaw/pull/98).

## Additional improvements

- Failed chat discovery reports an `unavailable` outcome so newer OpenClaw hosts
  can retain and retry their last good listing. Missing credentials and valid
  empty results remain distinct. The plugin adds no independent retry/cache
  lifecycle ([#96](https://github.com/ekinnee/omniroute-openclaw/issues/96), PR #97).
- Usage reporting requests `GET /api/usage/om-usage?format=json` and projects
  raw consumption from the gateway-selected `provider.quotas`, without combining
  unrelated connections or recomputing cutoff policy. Valid reset times and
  labels are retained; malformed/unlimited rows are omitted and over-quota
  percentages are capped at 100 for display. Recognizable legacy text remains
  supported on the same successful response. HTTP errors, structured refusals
  and malformed JSON do not trigger a second request
  ([#79](https://github.com/ekinnee/omniroute-openclaw/issues/79),
  [PR #99](https://github.com/ekinnee/omniroute-openclaw/pull/99)).
- Video responses containing both inline `b64_json` data and a URL now return
  nonempty decoded inline bytes with MIME type and filename preserved. Unusable
  inline data retains the existing usable-URL path. URL-only materialization
  and cleanup remain tracked in
  [#50](https://github.com/ekinnee/omniroute-openclaw/issues/50)
  ([PR #100](https://github.com/ekinnee/omniroute-openclaw/pull/100)).

## Upgrade and compatibility

- Minimum OpenClaw version remains `2026.7.1`, with peer/plugin API ranges
  `>=2026.7.1-0`. No new configuration or credential migration is required.
- The packaged `2026.7.1` host has a pre-existing provider-hook loader limitation:
  package/SDK compatibility remains, but the #95 behavioral fix is ineffective
  there. The host-policy fix was verified on `2026.10.10`, `2026.11.1` and
  `2026.11.5-beta.1`; genuine authentication failures still use host policy.
- Retention/retry after discovery failure remains a newer-host feature. The floor
  safely reads the empty-provider projection without receiving a rejecting hook.
- Usage percentages intentionally change where cutoffs apply. For example,
  JSON reports 60% raw usage even with a 25% cutoff, while legacy `20% left`
  remains 80% used. JSON reporting does not reproduce the legacy allowance view.

## Jev remains deferred

[PR #92](https://github.com/ekinnee/omniroute-openclaw/pull/92) adds only a pure,
unregistered System One codec. **This release does not enable Jev or native
OpenAI Decisions.** Provider registration, authenticated decision discovery and
transport activation remain open in
[#93](https://github.com/ekinnee/omniroute-openclaw/issues/93), pending the required
released upstream contracts and integration proof.

## Verification scope

The merged runtime tree passed 284 tests across 20 files, build/generated-output
checks, independent review and the floor/stable/beta compatibility checks.
Behavior evidence includes isolated Gateway discovery/auth controls, packed
usage-callback HTTP controls and ordinary video CLI mixed/URL-only cases. These
synthetic checks prove the documented integration behavior, not vendor access,
paid generation quality or resolution of #50's remaining URL-only work.

This release packet changes version metadata and documentation only; the
runtime and compatibility floor match the merged, reviewed fixes. GitHub and
ClawHub publication and public installation are verified separately.
