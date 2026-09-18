# OmniRoute Support Roadmap

This plugin should eventually expose every OmniRoute capability that has a stable OpenClaw plugin integration point. OmniRoute publishes one OpenAI-compatible gateway at `http://localhost:20128/v1`, plus additional compatibility endpoints for Anthropic, Gemini, Ollama, search, media, files, batches, and provider-specific routes.

OpenClaw's provider plugin guidance says provider plugins own model catalogs, auth, dynamic model resolution, transport/config normalization, tool-schema cleanup, usage reporting, and related provider behavior. The SDK also exposes registration points for modality-specific model catalogs, embeddings, speech, media understanding, realtime transcription, image generation, music generation, video generation, web fetch, and web search.

## Current Scope

- Provider id: `omniroute`
- Default base URL: `http://localhost:20128/v1`
- Base URL precedence: an embedding `remote.baseUrl` override wins for that memory integration; otherwise an explicit non-default `models.providers.omniroute.baseUrl` wins, followed by `OMNIROUTE_BASE_URL`, then the localhost default. The same provider-wide rule applies to discovery, chat, image/video/music generation, speech, web search, usage, and the catalog audit.
- Auth: API key through `OMNIROUTE_API_KEY`
- Text model API: `openai-completions`
- Live chat model discovery: `GET /v1/models`
- Read-only catalog metadata audit: `omniroute-catalog-audit`
- Provider quota usage: `GET /api/usage/om-usage`, scoped to the configured API key and its permitted connections
- Embedding provider: `omniroute`, backed by `POST /v1/embeddings`
- Image generation and editing provider: `omniroute`, backed by `POST /v1/images/generations` and `POST /v1/images/edits`
- Video generation provider: `omniroute`, backed by `POST /v1/videos/generations`
- Music generation provider: `omniroute`, backed by `POST /v1/music/generations` for prompt-only generation with inline or hosted audio materialization
- Speech provider: `omniroute`, backed by `POST /v1/audio/speech`
- Web search provider: `omniroute`, backed by `GET/POST /v1/search`
- Current plugin version: `2.2.0`
- Current catalog capability: authenticated image, video, and music model rows

The text provider uses OmniRoute's authenticated live model catalog and filters the response to chat-capable rows. The same authenticated response now publishes image, video, and music rows through `registerModelCatalogProvider`. `GET /v1/models` is authoritative: preserve its IDs and advertised capability objects exactly, do not hardcode `auto` or any other combo/default, and do not synthesize a static fallback when discovery is unavailable. Classification uses explicit type, endpoint, and output-modality metadata rather than model names. Chat rows lacking positive context and output limits are excluded from discovery until OmniRoute advertises both. No guessed windows such as 128k/16k are substituted. The catalog can differ by gateway upstream-provider configuration and API-key permissions. Audio/voice rows remain deferred until metadata supports reliable classification and an owning OpenClaw audio provider contract exists.

Reasoning controls are projected only from returned capability metadata. A thinking selector requires explicit `effort_tiers`; `supportsThinking` alone does not invent canonical effort levels. OpenClaw's off state maps to `reasoning_effort: "none"`; supported non-off levels pass through using the returned effort metadata. OpenClaw continues to own the configured/session default when no level is explicitly selected. Temperature suppression and arbitrary provider-specific flags remain future transport-level work, rather than catalog metadata passed through by this plugin.

The packaged catalog audit reads the same OpenClaw config, agent-scoped credentials, base URL, and request transport overrides as the plugin. It reports relevant metadata omissions without inventing replacements and never mutates configuration. The audit retains incomplete rows and their missing-field diagnostics even when discovery excludes them. This provides a plugin-owned way to distinguish an OmniRoute catalog gap from a downstream OpenClaw projection gap.

## Target Capability Map

| OmniRoute endpoint | OpenClaw capability | Status |
| --- | --- | --- |
| `GET /v1/models` | Live chat model/combo catalog | ✅ Initial support |
| `GET /v1/models` | Authenticated image/video/music catalog rows (`registerModelCatalogProvider`) | ✅ Initial support — audio/voice catalog rows deferred |
| `POST /v1/chat/completions` | OpenAI-compatible chat provider | ✅ Initial support |
| `POST /v1/embeddings` | Embedding provider | ✅ Initial support |
| `/v1/files`, `/v1/batches` | Async embedding batch runtime (`EmbeddingProviderBatchRuntime`) | ⏳ Merged upstream in [OpenClaw #129625](https://github.com/openclaw/openclaw/pull/129625); pending a stable release and compatibility-floor decision ([tracking issue #58](https://github.com/ekinnee/omniroute-openclaw/issues/58)) |
| `POST /v1/images/generations` | Image generation provider | ✅ Initial support |
| `GET /api/usage/om-usage` | Provider usage snapshot (`usageProviders`) | ✅ Initial support when API-key usage visibility is enabled |
| `POST /v1/images/edits` | Image editing | ✅ Supported with OmniRoute v3.8.11+ — one reference image with an edit-capable model; no masks or multiple references |
| `GET/POST /v1/search` | Web search provider (`registerWebSearchProvider`) | ✅ Initial support |
| `POST /v1/web/fetch` | Web fetch provider (`registerWebFetchProvider`) | 🔜 Planned |
| `POST /v1/audio/speech` | Speech provider (`registerSpeechProvider`) | ✅ Initial support — explicit model, supported voice, and bounded standard output formats |
| `POST /v1/audio/transcriptions` | Batch audio transcription (`registerMediaUnderstandingProvider`) | 🔜 Planned — not a realtime endpoint |
| `POST /v1/videos/generations` | Video generation provider (`registerVideoGenerationProvider`) | ✅ Initial support |
| `POST /v1/music/generations` | Music generation provider (`registerMusicGenerationProvider`) | ✅ Initial support — prompt-only generation; edits and image-conditioned modes deferred |
| `POST /v1/responses` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `POST /v1/completions` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `POST /v1/messages` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `POST /v1/rerank` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `POST /v1/moderations` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `/v1/providers/{provider}/...` | Provider-specific routing | Consider after live catalog |

## Implementation Order

### Plugin-side (OpenClaw SDK surface exists)

1. Keep live catalog handling aligned with OmniRoute's authenticated `GET /v1/models` response: preserve IDs exactly, include untyped chat/combo/provider rows, honor `supported_endpoints`, avoid synthesizing models, and scope cached discovery to the effective credential and auth profile.
2. Keep the packaged catalog audit aligned with discovery semantics so it exposes advertised fields, invalid rows, duplicate IDs, and relevant metadata gaps without defaults or credentials.
3. Project reasoning controls only from returned capability metadata. Normalize supported effort tiers conservatively; map an explicit off selection to `reasoning_effort: "none"`; do not infer temperature support or arbitrary provider-specific flags.
4. ~~Add authenticated modality-specific catalog rows through `registerModelCatalogProvider`~~ ✅ Done for image/video/music: reuse one authenticated raw catalog fetch across chat and media projections, preserve model IDs and provider-reported capability data, and do not create fallback media models. Audio/voice remains a future owner-bounded addition.
5. Keep embedding model handling explicit: filter `GET /v1/models` to embedding-capable rows, preserve ids exactly, include dimensionality in runtime/cache identity when OpenClaw provides it, and fail clearly when no embedding model is configured.
6. After the public async embedding-batch contract ships in a stable OpenClaw release, add provider-owned `runtime.batchEmbed` handling for OmniRoute's `/v1/files` and `/v1/batches`. Preserve input order, honor host polling and timeout controls, and return `null` only when the host should use its existing inline fallback. Treat this as embedding-specific support, not a generic file/batch API.
7. Keep image generation explicit: filter `GET /v1/models` to image-capable rows, preserve ids exactly, and pass size/count through to `/v1/images/generations`.
8. ~~Add image edits~~ ✅ Done for OmniRoute v3.8.11 and newer: send one reference image as a JSON data URL to `/v1/images/edits`. Require an explicitly selected edit-capable OmniRoute model; masks and multiple reference images remain unsupported.
9. ~~Add web search support~~ ✅ Done: map OpenClaw's `registerWebSearchProvider` contract to OmniRoute's `GET/POST /v1/search`, preserve auth/base URL behavior, and keep response projection inside this plugin.
10. Add batch transcription (STT): register via `registerMediaUnderstandingProvider`, mapping to OmniRoute's multipart `POST /v1/audio/transcriptions`. Do not label or implement it as realtime transcription without a supported streaming endpoint.
11. ~~Add speech (TTS): register via `registerSpeechProvider`, mapping to OmniRoute's `POST /v1/audio/speech`.~~ ✅ Done: explicit model selection, supported OpenAI-compatible voices/formats, guarded transport, and bounded response validation.
12. Add web fetch: register via `registerWebFetchProvider`, mapping to OmniRoute's `POST /v1/web/fetch`.
13. ~~Add video generation~~ ✅ Done: register via `registerVideoGenerationProvider`, mapping to OmniRoute's `POST /v1/videos/generations`.
14. ~~Add music generation~~ ✅ Done: register via `registerMusicGenerationProvider`, mapping prompt-only requests to OmniRoute's `POST /v1/music/generations`; materialize inline base64 and hosted URL results with bounded, SSRF-guarded transport. Edits and image-conditioned modes remain disabled until OmniRoute exposes a uniform contract.

### Upstream OpenClaw PRs needed (no plugin surface yet)

1. Propose `registerRerankProvider` SDK surface for `/v1/rerank`.
2. Propose `registerModerationProvider` SDK surface for `/v1/moderations`.
3. Propose generic file/batch provider surfaces for non-embedding uses of `/v1/files` and `/v1/batches`; asynchronous embedding batches are covered by the merged embedding runtime contract.
4. Propose Responses API, completions, and messages provider surfaces for `/v1/responses`, `/v1/completions`, `/v1/messages`.

## Compatibility Notes

- The asynchronous embedding-batch contract is present on OpenClaw `main` after 2026.9.4 and is not part of the current stable compatibility matrix. Do not import it or raise the plugin's OpenClaw floor until the first containing stable release is identified and packed-artifact compatibility is proven.
- Plugin-owned guarded requests reject target `request.tls` overrides combined with `request.proxy.mode: "explicit-proxy"`, rather than silently dropping them. The guarded explicit-proxy policy in both OpenClaw 2026.7.1 and 2026.9.3 lacks an independent target TLS field; full support needs a public SDK contract. Direct and environment-proxy target TLS behavior is unchanged. This limitation applies to discovery, catalog audit, embeddings, image/video/music generation, speech, and web search, not the separately owned chat or usage transports.
- OmniRoute accepts standard bearer API keys and also URL token compatibility modes, but this plugin should prefer bearer auth through OpenClaw's provider credential handling.
- `auto` is not special to this plugin. It is available only when the authenticated OmniRoute catalog advertises it, just like every other model or combo.
- Embeddings deliberately do not default to `auto`. The selected model and requested dimensionality are part of vector index identity; routing an embedding request to a model with different dimensions can invalidate existing indexes or fail at query time.
- Image generation and editing deliberately do not default to `auto`. The selected model must support the requested operation. Editing requires OmniRoute v3.8.11 or newer, accepts exactly one reference image, sends it as a JSON data URL to `/v1/images/edits`, and does not currently support masks or multiple references. This version requirement applies to image editing, not to the plugin's other capabilities.
- OmniRoute's `/v1/models` includes chat, embedding, image, rerank, audio, moderation, video, music, and combo rows. The current text provider filters that source to chat-capable rows, the embedding provider filters it to embedding-capable rows, and the image generation provider filters it to image-capable rows; future catalog capability providers must filter the same source by their own endpoint capability. Speech synthesis currently requires an explicitly configured model rather than a synthetic audio catalog projection.
- Base URL precedence should remain consistent for local, remote, Docker, and cloud-hosted OmniRoute instances.
- Live discovery should be auth-gated and cached by normalized base URL, auth profile, and a non-reversible fingerprint of the effective discovery credential. There is no static model fallback for offline picker surfaces.
- The plugin composes its companion capability providers (embeddings, image generation, speech, web search, video generation, and music generation) through the `register` hook of `definePluginEntry`; future capabilities with existing SDK registration points can register the same way, and a different entry helper is only worth revisiting if a future capability requires custom registration flow.
