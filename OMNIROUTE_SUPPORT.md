# OmniRoute Support Roadmap

This plugin should eventually expose every OmniRoute capability that has a stable OpenClaw plugin integration point. OmniRoute publishes one OpenAI-compatible gateway at `http://localhost:20128/v1`, plus additional compatibility endpoints for Anthropic, Gemini, Ollama, search, media, files, batches, and provider-specific routes.

OpenClaw's provider plugin guidance says provider plugins own model catalogs, auth, dynamic model resolution, transport/config normalization, tool-schema cleanup, usage reporting, and related provider behavior. The SDK also exposes registration points for modality-specific model catalogs, embeddings, speech, media understanding, realtime transcription, image generation, music generation, video generation, web fetch, and web search.

## Current Scope

- Provider id: `omniroute`
- Default base URL: `http://localhost:20128/v1`
- Base URL precedence: an embedding `remote.baseUrl` override wins for that memory integration; otherwise an explicit non-default `models.providers.omniroute.baseUrl` wins, followed by `OMNIROUTE_BASE_URL`, then the localhost default. The same provider-wide rule applies to discovery, chat, image/video generation, web search, usage, and the catalog audit.
- Auth: API key through `OMNIROUTE_API_KEY`
- Text model API: `openai-completions`
- Live chat model discovery: `GET /v1/models`
- Read-only catalog metadata audit: `omniroute-catalog-audit`
- Provider quota usage: `GET /api/usage/om-usage`, scoped to the configured API key and its permitted connections
- Embedding provider: `omniroute`, backed by `POST /v1/embeddings`
- Image generation provider: `omniroute`, backed by `POST /v1/images/generations`
- Video generation provider: `omniroute`, backed by `POST /v1/videos/generations`
- Web search provider: `omniroute`, backed by `GET/POST /v1/search`
- Current plugin version: `2.1.3`
- Next planned capabilities: authenticated modality-specific model catalogs and image edits

The text provider uses OmniRoute's authenticated live model catalog and filters the response to chat-capable rows. `GET /v1/models` is authoritative: preserve its IDs exactly, do not hardcode `auto` or any other combo/default, and do not synthesize a static fallback when discovery is unavailable. The catalog can differ by gateway upstream-provider configuration and API-key permissions. Embeddings and image generation require explicit models and likewise never synthesize `auto`. The current picker catalog is text-only; modality-specific catalog rows for image, video, music, and audio are planned.

Reasoning controls are projected only from returned capability metadata. OpenClaw's off state maps to `reasoning_effort: "none"`; supported non-off levels pass through using the returned effort metadata. OpenClaw continues to own the configured/session default when no level is explicitly selected. Temperature suppression and arbitrary provider-specific flags remain future transport-level work, rather than catalog metadata passed through by this plugin.

The packaged catalog audit reads the same OpenClaw config, agent-scoped credentials, base URL, and request transport overrides as the plugin. It reports relevant metadata omissions without inventing replacements and never mutates configuration. This provides a plugin-owned way to distinguish an OmniRoute catalog gap from a downstream OpenClaw projection gap.

## Target Capability Map

| OmniRoute endpoint | OpenClaw capability | Status |
| --- | --- | --- |
| `GET /v1/models` | Live chat model/combo catalog | ✅ Initial support |
| `GET /v1/models` | Authenticated image/video/music/audio catalog rows (`registerModelCatalogProvider`) | 🔜 Planned |
| `POST /v1/chat/completions` | OpenAI-compatible chat provider | ✅ Initial support |
| `POST /v1/embeddings` | Embedding provider | ✅ Initial support |
| `POST /v1/images/generations` | Image generation provider | ✅ Initial support |
| `GET /api/usage/om-usage` | Provider usage snapshot (`usageProviders`) | ✅ Initial support when API-key usage visibility is enabled |
| `POST /v1/images/edits` | Image generation/edit provider | 🔜 Next (part of ImageGenerationProvider edit capability) |
| `GET/POST /v1/search` | Web search provider (`registerWebSearchProvider`) | ✅ Initial support |
| `POST /v1/web/fetch` | Web fetch provider (`registerWebFetchProvider`) | 🔜 Planned |
| `POST /v1/audio/speech` | Speech provider (`registerSpeechProvider`) | 🔜 Planned |
| `POST /v1/audio/transcriptions` | Batch audio transcription (`registerMediaUnderstandingProvider`) | 🔜 Planned — not a realtime endpoint |
| `POST /v1/videos/generations` | Video generation provider (`registerVideoGenerationProvider`) | ✅ Initial support |
| `POST /v1/music/generations` | Music generation provider (`registerMusicGenerationProvider`) | 🔜 Planned |
| `POST /v1/responses` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `POST /v1/completions` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `POST /v1/messages` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `POST /v1/rerank` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `POST /v1/moderations` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `/v1/files`, `/v1/batches` | No OpenClaw plugin surface — needs SDK PR | ⏳ Needs upstream PR |
| `/v1/providers/{provider}/...` | Provider-specific routing | Consider after live catalog |

## Implementation Order

### Plugin-side (OpenClaw SDK surface exists)

1. Keep live catalog handling aligned with OmniRoute's authenticated `GET /v1/models` response: preserve IDs exactly, include untyped chat/combo/provider rows, honor `supported_endpoints`, avoid synthesizing models, and scope cached discovery to the effective credential and auth profile.
2. Keep the packaged catalog audit aligned with discovery semantics so it exposes advertised fields, invalid rows, duplicate IDs, and relevant metadata gaps without defaults or credentials.
3. Project reasoning controls only from returned capability metadata. Normalize supported effort tiers conservatively; map an explicit off selection to `reasoning_effort: "none"`; do not infer temperature support or arbitrary provider-specific flags.
4. Add authenticated modality-specific catalog rows through `registerModelCatalogProvider`, beginning with image/video/music and adding audio when the model metadata supports reliable classification. Preserve model IDs and provider-reported capability data; do not create fallback media models.
5. Keep embedding model handling explicit: filter `GET /v1/models` to embedding-capable rows, preserve ids exactly, include dimensionality in runtime/cache identity when OpenClaw provides it, and fail clearly when no embedding model is configured.
6. Keep image generation explicit and generation-only for the first cut: filter `GET /v1/models` to image-capable rows, preserve ids exactly, pass size/count through to `/v1/images/generations`, and reject reference images until edits are implemented.
7. Add image edits: extend the existing `ImageGenerationProvider` to support the `edit` capability, mapping to OmniRoute's `/v1/images/edits`.
8. ~~Add web search support~~ ✅ Done: map OpenClaw's `registerWebSearchProvider` contract to OmniRoute's `GET/POST /v1/search`, preserve auth/base URL behavior, and keep response projection inside this plugin.
9. Add batch transcription (STT): register via `registerMediaUnderstandingProvider`, mapping to OmniRoute's multipart `POST /v1/audio/transcriptions`. Do not label or implement it as realtime transcription without a supported streaming endpoint.
10. Add speech (TTS): register via `registerSpeechProvider`, mapping to OmniRoute's `POST /v1/audio/speech`.
11. Add web fetch: register via `registerWebFetchProvider`, mapping to OmniRoute's `POST /v1/web/fetch`.
12. ~~Add video generation~~ ✅ Done: register via `registerVideoGenerationProvider`, mapping to OmniRoute's `POST /v1/videos/generations`.
13. Add music generation: register via `registerMusicGenerationProvider`, mapping to OmniRoute's `POST /v1/music/generations`.

### Upstream OpenClaw PRs needed (no plugin surface yet)

1. Propose `registerRerankProvider` SDK surface for `/v1/rerank`.
2. Propose `registerModerationProvider` SDK surface for `/v1/moderations`.
3. Propose file/batch provider surfaces for `/v1/files` and `/v1/batches`.
4. Propose Responses API, completions, and messages provider surfaces for `/v1/responses`, `/v1/completions`, `/v1/messages`.

## Compatibility Notes

- OmniRoute accepts standard bearer API keys and also URL token compatibility modes, but this plugin should prefer bearer auth through OpenClaw's provider credential handling.
- `auto` is not special to this plugin. It is available only when the authenticated OmniRoute catalog advertises it, just like every other model or combo.
- Embeddings deliberately do not default to `auto`. The selected model and requested dimensionality are part of vector index identity; routing an embedding request to a model with different dimensions can invalidate existing indexes or fail at query time.
- Image generation deliberately does not default to `auto`. The selected model must be image-capable, and the first implementation supports text-to-image only.
- OmniRoute's `/v1/models` includes chat, embedding, image, rerank, audio, moderation, video, music, and combo rows. The current text provider filters that source to chat-capable rows, the embedding provider filters it to embedding-capable rows, and the image generation provider filters it to image-capable rows; future capability providers must filter the same source by their own endpoint capability.
- Base URL precedence should remain consistent for local, remote, Docker, and cloud-hosted OmniRoute instances.
- Live discovery should be auth-gated and cached by normalized base URL, auth profile, and a non-reversible fingerprint of the effective discovery credential. There is no static model fallback for offline picker surfaces.
- The plugin composes its companion capability providers (embeddings, image generation, web search, video generation) through the `register` hook of `definePluginEntry`. Future capabilities with existing SDK registration points (speech, transcription, music generation) can register the same way; a different entry helper is only worth revisiting if a future capability requires custom registration flow.
