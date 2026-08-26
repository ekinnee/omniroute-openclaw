# v2.1.3 Compatibility Proof

This document is the sanitized, repository-hosted proof for the release
candidate. It contains no credentials, local filesystem paths, or production
endpoints.

## Exact inputs

- Release artifact source commit: `8f0113d5905b856abdbf7cbae9275912010389cd`
- Release candidate base: `b4f6cb47b3a4aacdaf3bd852ea415e1851e66073`
- Package: `@ekinnee/omniroute-provider@2.1.3`
- Stable compatibility floor: OpenClaw `2026.7.1`
- Peer/API range: `>=2026.7.1-0`
- Release-candidate packed tarball SHA-256:
  `119922eb5b66547c91d88369e45986ff80571fdd6822abb685ef166cdc54da1d`

## Local validation

The frozen release candidate passed:

- `pnpm install --frozen-lockfile`;
- `pnpm test` — 87 tests passed;
- `pnpm exec tsc --noEmit`;
- `pnpm build` with generated `dist/` unchanged;
- `actionlint`;
- the source-contract probe;
- `clawhub package validate . --json` with zero findings; and
- `git diff --check`.

The release candidate was packed and installed into three disposable npm
projects. Each installation ran `omniroute-catalog-audit --help` and the
installed-artifact probe. Every probe reported package `2.1.3`, exactly one
registration for each provider contract, provider ID `omniroute`, and a
callable catalog function.

| Selector | Resolved OpenClaw | Peer mode | Result |
| --- | --- | --- | --- |
| `2026.7.1` | `2026.7.1` | strict | pass |
| `latest` | `2026.7.1-2` | strict | pass |
| `beta` | `2026.8.1-beta.3` | legacy prerelease smoke | pass |

## Remote exact-head evidence

- The packed-artifact matrix passed all three rows on the package-bearing
  release candidate `8f0113d…`: [run 32991287214](https://github.com/ekinnee/omniroute-openclaw/actions/runs/32991287214).
- The subsequent release-proof, README, and roadmap commits changed only
  documentation. The packed package allowlist and tarball digest remained
  unchanged. The release PR's exact-head matrix run is the final authority for
  the documentation-complete candidate and was independently dispatched after
  these updates.
- After the compatibility repair merged, the exact `main` matrix passed on
  `b4f6cb4…`: [run 32990697504](https://github.com/ekinnee/omniroute-openclaw/actions/runs/32990697504).
- The merged repair was [PR #36](https://github.com/ekinnee/omniroute-openclaw/pull/36);
  the original stale-lockfile failure is preserved in [run
  32990136773](https://github.com/ekinnee/omniroute-openclaw/actions/runs/32990136773).

## Independent review

The final local ClawSweeper review of the compatibility work found no
actionable comments, marked the real-behavior proof sufficient, and cleared
security. It did not post GitHub comments or mutate repository state.

## Scope limits

This proof covers package metadata, packed-artifact loading, public
registration/catalog contracts, and the release candidate's local/remote
validation. It does not claim a live OmniRoute upstream request, production
installation, or real provider credentials.
