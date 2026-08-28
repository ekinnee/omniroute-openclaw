# OmniRoute OpenClaw Plugin Contributor Guide

This repository ships `@ekinnee/omniroute-provider`, an OpenClaw provider plugin for OmniRoute chat, embeddings, image generation, video generation, web search, usage, and catalog auditing.

Use [README.md](README.md) for installation and user-facing configuration. This file explains how to make safe, reviewable repository changes.

## Fast setup

- Use Node.js 24.x. CI currently uses Node 24.15.0.
- Use the package-manager version declared in `package.json` (currently pnpm 9.15.4).
- Install dependencies with:

  ```bash
  pnpm install --frozen-lockfile
  ```

- Ordinary unit work should not require a running OmniRoute gateway or OpenClaw instance. Keep tests deterministic and fixture-based.
- Never commit API keys, private endpoints, request captures, or production data. `.env` is not ignored by this repository; keep secrets in your environment or normal secret mechanism instead.

## Repository map

- `index.ts` is the plugin entrypoint. It registers the provider and modality integrations.
- `models.ts` owns provider identity and shared model metadata constants.
- `auth.ts`, `base-url.ts`, and `http.ts` resolve credentials, configuration, and transport behavior.
- `provider-catalog.ts` owns live model discovery and catalog conversion.
- `embedding-provider.ts`, `image-generation-provider.ts`, `video-generation-provider.ts`, `web-search-provider.ts`, and `usage.ts` implement their respective capabilities.
- `catalog-audit*.ts` implements the read-only catalog-audit command.
- `openclaw.plugin.json` declares public plugin metadata and supported contracts.
- `dist/` is tracked generated output.
- `README.md` is user documentation; `OMNIROUTE_SUPPORT.md` is the public capability roadmap.

## Engineering constraints

- Make the smallest change in the owner module. Reuse existing configuration, authentication, and HTTP helpers instead of bypassing them.
- Preserve the provider identifier `omniroute`.
- The authenticated OmniRoute `GET /v1/models` response is authoritative. Preserve advertised model IDs and capabilities; do not synthesize `auto`, defaults, fallback models, or inferred capabilities.
- Use public `openclaw/plugin-sdk/*` APIs for OpenClaw integration; do not couple the plugin to OpenClaw internals.
- Add or adjust focused Vitest coverage for behavior changes. Update the manifest, package metadata, README, and support roadmap when public ownership, contracts, or compatibility changes.
- Avoid broad refactors mixed with a behavior fix. Keep capability-specific changes scoped to the affected adapter unless shared ownership is genuinely required.

## Source, generated output, and validation

TypeScript source files at the repository root are authoritative. After changing TypeScript, build and commit the resulting `dist/` changes; do not hand-edit emitted files.

Run the checks relevant to the change before opening a pull request:

```bash
pnpm test
pnpm build
git diff --exit-code -- dist/
git diff --check
```

The repository has no `pnpm lint` script. CI installs with a frozen lockfile, builds the project, rejects stale `dist/`, and runs the test suite.

For documentation-only changes, still run `git diff --check`. For this pair of instruction files, also verify the link rather than copying content:

```bash
test -f AGENTS.md
test -L CLAUDE.md
test "$(readlink CLAUDE.md)" = "AGENTS.md"
```

## Pull requests and releases

Follow the pull-request template. State the user-visible effect, list the checks actually run, and explain any manifest or capability ownership change. Do not include credentials, private endpoints, or production-only data.

Version changes, tags, GitHub Releases, and ClawHub publication are maintainer work. The normal publication path is a published GitHub release whose tag is `v<package version>`; contributors should not manually publish.

## Instruction-file convention

`AGENTS.md` is the canonical contributor guide. `CLAUDE.md` is a relative symlink to it so both agent conventions read the same instructions. Update `AGENTS.md`, not a copied `CLAUDE.md`, and preserve the symlink.