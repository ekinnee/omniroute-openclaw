# OmniRoute Support Roadmap

This plugin should eventually expose every OmniRoute capability that has a stable OpenClaw plugin integration point. OmniRoute publishes one OpenAI-compatible gateway at `http://localhost:20128/v1`, plus additional compatibility endpoints for Anthropic, Gemini, Ollama, search, media, files, batches, and provider-specific routes.

OpenClaw's provider plugin guidance says provider plugins own model catalogs, auth, dynamic model resolution, transport/config normalization, tool-schema cleanup, usage reporting, and related provider behavior. The SDK also exposes registration points for embeddings, speech, realtime transcription, image generation, music generation, video generation, web fetch, and web search.

## Current Scope

- Provider id: `omniroute`
- Default base URL: `http://localhost:20128/v1`
- Auth: API key through `OMNIROUTE_API_KEY`
- Text model API: `openai-completions`
- Live chat model discovery: `GET /v1/models`
- Embedding provider: `omniroute`, backed by `POST /v1/embeddings`
- Image generation provider: `omniroute`, backed by `POST /v1/images/generations`
- Current plugin version: `2.0.0`
- Next planned capability: speech (TTS) through `POST /v1/audio/speech`

The text provider uses OmniRoute's authenticated live model catalog and filters the response to chat-capable rows. `GET /v1/models` is authoritative: preserve its IDs exactly, do not hardcode `auto` or any other combo/default, and do not synthesize a static fallback when discovery is unavailable. The catalog can differ by gateway upstream-provider configuration and API-key permissions. Embeddings and image generation require explicit models from OmniRoute's catalog and likewise never synthesize `auto`.

Reasoning controls are projected only from returned capability metadata. OpenClaw's off state maps to `reasoning_effort: "none"`; supported non-off levels pass through using the returned effort metadata. OpenClaw continues to own the configured/session default when no level is explicitly selected. Temperature suppression and arbitrary provider-specific flags remain future transport-level work, rather than catalog metadata passed through by this plugin.

## Target Capability Map

| OmniRoute endpoint | OpenClaw capability | Status |
| --- | --- | --- |
| `GET /v1/models` | Live chat model/combo catalog | ✅ Initial support |
| `POST /v1/chat/completions` | OpenAI-compatible chat provider | ✅ Initial support |
| `POST /v1/embeddings` | Embedding provider | ✅ Initial support |
| `POST /v1/images/generations` | Image generation provider | ✅ Initial support |
| `POST /v1/images/edits` | Image generation/edit provider | 🔜 Planned (part of ImageGenerationProvider edit capability) |
| `GET/POST /v1/search` | Web search provider (`registerWebSearchProvider`) | ✅ Initial support |
| `POST /v1/audio/speech` | Speech provider (`registerSpeechProvider`) | 🔜 Planned |
| `POST /v1/audio/transcriptions` | Realtime transcription provider (`registerRealtimeTranscriptionProvider`) | 🔜 Planned |
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
2. Project reasoning controls only from returned capability metadata. Normalize supported effort tiers conservatively; map an explicit off selection to `reasoning_effort: "none"`; do not infer temperature support or arbitrary provider-specific flags.
3. Keep embedding model handling explicit: filter `GET /v1/models` to embedding-capable rows, preserve ids exactly, include dimensionality in runtime/cache identity when OpenClaw provides it, and fail clearly when no embedding model is configured.
4. Keep image generation explicit and generation-only for the first cut: filter `GET /v1/models` to image-capable rows, preserve ids exactly, pass size/count through to `/v1/images/generations`, and reject reference images until edits are implemented.
5. ~~Add web search support~~ ✅ Done: map OpenClaw's `registerWebSearchProvider` contract to OmniRoute's `GET/POST /v1/search`, preserve auth/base URL behavior, and keep response projection inside this plugin.
6. Add image edits: extend the existing `ImageGenerationProvider` to support the `edit` capability, mapping to OmniRoute's `/v1/images/edits`.
7. Add speech (TTS): register via `registerSpeechProvider`, mapping to OmniRoute's `POST /v1/audio/speech`.
8. Add transcription (STT): register via `registerRealtimeTranscriptionProvider`, mapping to OmniRoute's `POST /v1/audio/transcriptions`.
9. ~~Add video generation~~ ✅ Done: register via `registerVideoGenerationProvider`, mapping to OmniRoute's `POST /v1/videos/generations`.
10. Add music generation: register via `registerMusicGenerationProvider`, mapping to OmniRoute's `POST /v1/music/generations`.

### Upstream OpenClaw PRs needed (no plugin surface yet)

10. Propose `registerRerankProvider` SDK surface for `/v1/rerank`.
11. Propose `registerModerationProvider` SDK surface for `/v1/moderations`.
12. Propose file/batch provider surfaces for `/v1/files` and `/v1/batches`.
13. Propose Responses API, completions, and messages provider surfaces for `/v1/responses`, `/v1/completions`, `/v1/messages`.

## Compatibility Notes

- OmniRoute accepts standard bearer API keys and also URL token compatibility modes, but this plugin should prefer bearer auth through OpenClaw's provider credential handling.
- `auto` is not special to this plugin. It is available only when the authenticated OmniRoute catalog advertises it, just like every other model or combo.
- Embeddings deliberately do not default to `auto`. The selected model and requested dimensionality are part of vector index identity; routing an embedding request to a model with different dimensions can invalidate existing indexes or fail at query time.
- Image generation deliberately does not default to `auto`. The selected model must be image-capable, and the first implementation supports text-to-image only.
- OmniRoute's `/v1/models` includes chat, embedding, image, rerank, audio, moderation, video, music, and combo rows. The current text provider filters that source to chat-capable rows, the embedding provider filters it to embedding-capable rows, and the image generation provider filters it to image-capable rows; future capability providers must filter the same source by their own endpoint capability.
- Base URL overrides should continue to work for local, remote, Docker, and cloud-hosted OmniRoute instances.
- Live discovery should be auth-gated and cached by normalized base URL, auth profile, and a non-reversible fingerprint of the effective discovery credential. There is no static model fallback for offline picker surfaces.
- The current `defineSingleProviderPluginEntry` helper remains appropriate while companion capability providers can register through its `register` hook. Full OmniRoute endpoint support may still need `definePluginEntry` when a future capability requires custom registration flow.
