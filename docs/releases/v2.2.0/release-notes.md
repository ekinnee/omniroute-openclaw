# OmniRoute OpenClaw v2.2.0

Minor release for `@ekinnee/omniroute-provider`.

## Added

- Add image editing through OmniRoute `POST /v1/images/edits` for OmniRoute
  v3.8.11 and newer. Edits accept one reference image, send it as a JSON data
  URL, and require an explicitly selected edit-capable model.

## Fixed

- Exclude chat catalog rows that omit required context or output limits instead
  of allowing OpenClaw to fill the gaps with synthetic sizing metadata.
- Preserve an explicit `capabilities.tool_calling: false` so OpenClaw does not
  send tools to models that advertise no tool support.
- Bound provider-usage response bodies to 32 KiB, cancel oversized streams, and
  normalize body-read failures to unavailable usage snapshots.
- Reject target TLS overrides combined with explicit-proxy mode before a
  plugin-owned request because the supported OpenClaw transport cannot preserve
  those target settings through an explicit proxy.

## Maintenance

- Harden release publication, test gating, and pull-request labeling.
- Add contributor guidance and update the roadmap for OpenClaw's pending
  asynchronous embedding-batch contract.
- Update Vitest to 4.1.11.

## Compatibility

- Stable compatibility floor remains OpenClaw `2026.7.1`.
- `peerDependencies.openclaw` and `openclaw.compat.pluginApi` remain
  `>=2026.7.1-0`.
- No configuration migration is required.
- Image editing requires OmniRoute v3.8.11 or newer. Image generation and the
  plugin's other capabilities retain their existing OmniRoute requirements.

## Known limitations

- URL-only video results retain the existing host-compatibility limitation
  tracked in [#50](https://github.com/ekinnee/omniroute-openclaw/issues/50).
  Its safe repair remains blocked on the upstream media lifecycle contract.
- Asynchronous embedding batches remain deferred until the merged OpenClaw SDK
  contract ships in a stable release, as tracked in
  [#58](https://github.com/ekinnee/omniroute-openclaw/issues/58).

## Verification

The exact release candidate is validated by the repository Test and Upstream
Compatibility workflows, plus local package and Plugin Inspector validation
before publication.

Included merged changes: [#45](https://github.com/ekinnee/omniroute-openclaw/pull/45),
[#46](https://github.com/ekinnee/omniroute-openclaw/pull/46),
[#47](https://github.com/ekinnee/omniroute-openclaw/pull/47),
[#51](https://github.com/ekinnee/omniroute-openclaw/pull/51),
[#52](https://github.com/ekinnee/omniroute-openclaw/pull/52),
[#55](https://github.com/ekinnee/omniroute-openclaw/pull/55),
[#56](https://github.com/ekinnee/omniroute-openclaw/pull/56),
[#57](https://github.com/ekinnee/omniroute-openclaw/pull/57),
[#59](https://github.com/ekinnee/omniroute-openclaw/pull/59), and
[#60](https://github.com/ekinnee/omniroute-openclaw/pull/60).
