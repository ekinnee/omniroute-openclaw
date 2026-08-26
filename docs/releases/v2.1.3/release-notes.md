# OmniRoute OpenClaw v2.1.3

Patch release for `@ekinnee/omniroute-provider`.

## Included

- Hardened base URL resolution and live model-discovery transport.
- Reused host-owned authentication and cancellation behavior for web search,
  including compatibility with the current OpenClaw beta exports.
- Corrected the remote-provider quickstart documentation.
- Corrected the declared OpenClaw build identity and prerelease-aware peer/API
  contract, with continuous packed-artifact compatibility coverage.
- Added floor/latest/beta compatibility coverage with durable probe summaries.

## Compatibility

- Stable compatibility floor remains OpenClaw `2026.7.1`.
- `peerDependencies.openclaw` and `openclaw.compat.pluginApi` are
  `>=2026.7.1-0` so same-floor prereleases resolve correctly.
- No configuration migration is required.
- No production runtime behavior or provider lifecycle owner was changed by
  the compatibility repair.

## Verification

The release candidate passed the disposable packaged-host canary and the
floor/latest/beta packed-artifact matrix. The exact evidence is recorded in
the adjacent [compatibility proof](compatibility-proof.md) and [host canary
proof](host-canary-proof.md).

Included merged changes: [#27](https://github.com/ekinnee/omniroute-openclaw/pull/27),
[#31](https://github.com/ekinnee/omniroute-openclaw/pull/31),
[#32](https://github.com/ekinnee/omniroute-openclaw/pull/32),
[#33](https://github.com/ekinnee/omniroute-openclaw/pull/33),
[#35](https://github.com/ekinnee/omniroute-openclaw/pull/35), and
[#36](https://github.com/ekinnee/omniroute-openclaw/pull/36).
