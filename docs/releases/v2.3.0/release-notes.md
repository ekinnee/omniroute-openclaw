# OmniRoute OpenClaw v2.3.0

Minor release for `@ekinnee/omniroute-provider`.

## Added

- Publish authenticated image, video, and music model catalogs from one shared
  `GET /v1/models` response, scoped by gateway URL, credentials, and request
  policy.
- Add prompt-only music generation through `POST /v1/music/generations`, with
  bounded inline and hosted audio materialization.
- Add text-to-speech through `POST /v1/audio/speech`, with explicit model
  selection and MP3, Opus, and WAV response validation.
- Add web fetch through `POST /v1/web/fetch`, using OpenClaw's public web-fetch
  contract and host-owned result normalization.
- Add batch REST audio transcription through `POST /v1/audio/transcriptions`.
- Package a Keep a Changelog history with the plugin.

## Fixed

- Align catalog-audit classification with runtime discovery for canonical chat
  endpoint aliases and unknown model types.
- Centralize JSON request content-type defaults in the shared transport owner
  while preserving explicit overrides and existing auth and network policy.
- Replace unsupported top-level ClawHub manifest tags with package keywords and
  controlled `models`, `media`, and `web` categories.

## Compatibility

- Stable compatibility floor remains OpenClaw `2026.7.1`.
- `peerDependencies.openclaw` and `openclaw.compat.pluginApi` remain
  `>=2026.7.1-0`.
- No configuration migration is required.
- Music, speech, web fetch, and batch transcription depend on their matching
  OmniRoute gateway routes and configured upstream credentials. Speech and
  transcription require explicit models; the plugin does not synthesize audio
  catalog defaults.

## Known limitations

- Audio/voice model catalog projection remains deferred until OmniRoute
  metadata supports reliable classification.
- URL-only video results retain the host-compatibility limitation tracked in
  [#50](https://github.com/ekinnee/omniroute-openclaw/issues/50).
- Asynchronous embedding batches remain deferred pending a stable OpenClaw SDK
  release and compatibility-floor decision, as tracked in
  [#58](https://github.com/ekinnee/omniroute-openclaw/issues/58).
- Structured JSON usage parsing remains a follow-up enhancement tracked in
  [#79](https://github.com/ekinnee/omniroute-openclaw/issues/79); this release
  retains the bounded legacy text parser.

## Verification

The exact release candidate is validated by the repository Test and Upstream
Compatibility workflows, plus local tests, build and generated-output checks,
package-content inspection, and Plugin Inspector validation before publication.

Included merged changes: [#64](https://github.com/ekinnee/omniroute-openclaw/pull/64),
[#68](https://github.com/ekinnee/omniroute-openclaw/pull/68),
[#70](https://github.com/ekinnee/omniroute-openclaw/pull/70),
[#71](https://github.com/ekinnee/omniroute-openclaw/pull/71),
[#72](https://github.com/ekinnee/omniroute-openclaw/pull/72),
[#74](https://github.com/ekinnee/omniroute-openclaw/pull/74),
[#75](https://github.com/ekinnee/omniroute-openclaw/pull/75),
[#76](https://github.com/ekinnee/omniroute-openclaw/pull/76),
[#77](https://github.com/ekinnee/omniroute-openclaw/pull/77), and
[#78](https://github.com/ekinnee/omniroute-openclaw/pull/78).
