# OmniRoute Support Roadmap

This plugin should eventually expose every OmniRoute capability that has a stable OpenClaw plugin integration point. OmniRoute publishes one OpenAI-compatible gateway at `http://localhost:20128/v1`, plus additional compatibility endpoints for Anthropic, Gemini, Ollama, search, media, files, batches, and provider-specific routes.

OpenClaw's provider plugin guidance says provider plugins own model catalogs, auth, dynamic model resolution, transport/config normalization, tool-schema cleanup, usage reporting, and related provider behavior. The SDK also exposes registration points for embeddings, speech, realtime transcription, image generation, music generation, video generation, web fetch, and web search.

## Current Scope

- Provider id: `omniroute`
- Default base URL: `http://localhost:20128/v1`
- Auth: API key through `OMNIROUTE_API_KEY`
- Text model API: `openai-completions`
- Default model: `omniroute/auto`
- Live chat model discovery: `GET /v1/models`

The text provider uses OmniRoute's live model catalog when available, filters the response to chat/text-like rows, and keeps `auto` as the static fallback. Non-chat endpoints are still future work.

## Target Capability Map

| OmniRoute endpoint | OpenClaw capability | Status |
| --- | --- | --- |
| `GET /v1/models` | Live chat model/combo catalog | Initial support |
| `POST /v1/chat/completions` | OpenAI-compatible chat provider | Initial support |
| `POST /v1/responses` | Text provider stream/transport support | Planned after chat catalog |
| `POST /v1/embeddings` | Embedding provider | Planned |
| `POST /v1/images/generations` | Image generation provider | Planned |
| `POST /v1/images/edits` | Image generation/edit provider | Planned if OpenClaw edit requests map cleanly |
| `POST /v1/audio/speech` | Speech provider | Planned |
| `POST /v1/audio/transcriptions` | Realtime transcription or future batch STT provider | Investigate |
| `POST /v1/rerank` | No obvious public registration point yet | Track upstream OpenClaw |
| `POST /v1/moderations` | No obvious public registration point yet | Track upstream OpenClaw |
| `GET/POST /v1/search` | Web search provider | Planned |
| `POST /v1/videos/generations` | Video generation provider | Planned |
| `POST /v1/music/generations` | Music generation provider | Planned |
| `/v1/files`, `/v1/batches` | File and batch APIs | Track upstream OpenClaw |
| `/v1/providers/{provider}/...` | Provider-specific routing | Consider after live catalog |

## Implementation Order

1. Add `resolveDynamicModel` so manually configured OmniRoute model ids work before or beyond live catalog discovery.
2. Add `registerModelCatalogProvider` rows for text and media-generation picker/help surfaces. Keep endpoint calls and OmniRoute response projection inside this plugin.
3. Preserve OmniRoute model ids exactly as returned by the gateway, including provider-prefixed ids and combos, and expose them under OpenClaw model refs like `omniroute/<model-id>`.
4. Add capability-specific registrations for embeddings, image generation, speech, video generation, music generation, and search using exported OpenClaw SDK helpers.
5. Track endpoints without clear OpenClaw plugin capability surfaces rather than creating custom ad hoc transports.

## Compatibility Notes

- OmniRoute accepts standard bearer API keys and also URL token compatibility modes, but this plugin should prefer bearer auth through OpenClaw's provider credential handling.
- OmniRoute documents `auto` as a smart-routing model. It should remain the default even after live model discovery.
- OmniRoute's `/v1/models` includes chat, embedding, image models, and combos. The current text provider filters to chat/text-like rows; future capability providers must filter the same source by their own endpoint capability.
- Base URL overrides should continue to work for local, remote, Docker, and cloud-hosted OmniRoute instances.
- Live discovery should be auth-gated and cached. Static catalog paths must remain network-free so setup, documentation, tests, and offline picker surfaces work without a running OmniRoute server.
- The current `defineSingleProviderPluginEntry` helper is appropriate for the initial text-only plugin. Full OmniRoute endpoint support will probably need `definePluginEntry` so the plugin can register several capability providers in one entry.
