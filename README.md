# OmniRoute Provider Plugin for OpenClaw

Registers [OmniRoute](https://github.com/diegosouzapw/OmniRoute) — a multi-provider model routing proxy — as a first-class text inference, embedding, image generation, video generation, and web search provider in OpenClaw. Routes through models from 236+ providers with automatic fallback, live model discovery, and OpenAI-compatible transport.

## Quick Start

```bash
# Install from ClawHub
openclaw plugins install clawhub:@ekinnee/omniroute-provider

# Set your OmniRoute API key
export OMNIROUTE_API_KEY="your-key-here"

# Verify it works
openclaw models list | grep omniroute
```

OmniRoute appears as a model provider after authenticated discovery. Select any chat-capable model or combo returned by your OmniRoute gateway; the available list depends on that gateway's configured upstream providers and API-key permissions.

## Upgrading to 2.0.0

Version 2 removes the plugin's synthetic `omniroute/auto` catalog entry and automatic default-model selection. Existing provider configuration is preserved, but it is not rewritten to choose a replacement model.

After upgrading, authenticate to OmniRoute and run `openclaw models list` to refresh the live catalog. Select an advertised `omniroute/<model-id>` or `omniroute/<combo-id>` for each primary, fallback, or manually configured `omniroute/auto` reference. You can keep `omniroute/auto` only when your authenticated OmniRoute gateway actually returns `auto`; different users can receive different catalogs. Fresh onboarding configures the provider and authentication only, without selecting a model.

## Configuration

### Environment

| Variable | Required | Default | Description |
|---|---|---|---|
| `OMNIROUTE_API_KEY` | Yes | — | API key for your OmniRoute gateway |
| `OMNIROUTE_BASE_URL` | No | `http://localhost:20128/v1` | Custom base URL |

### OpenClaw Config

Override the base URL in your OpenClaw config:

```json5
{
  models: {
    providers: {
      omniroute: {
        baseUrl: "http://localhost:20128/v1",
      },
    },
  },
}
```

This is useful for Docker, remote, or cloud-hosted OmniRoute instances.

### Embeddings

OmniRoute can also serve OpenClaw embedding requests through `POST /v1/embeddings`.
Configure a specific embedding model from OmniRoute's `GET /v1/models` response:

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        provider: "omniroute",
        model: "provider/embedding-model-from-omniroute",
      },
    },
  },
}
```

The plugin does not default embeddings to `auto`. Embedding model and dimensionality are part of the vector index identity, so changing either can invalidate an existing index or make queries fail.

### Image Generation

OmniRoute can serve OpenClaw image generation requests through `POST /v1/images/generations`.
Configure a specific image model from OmniRoute's `GET /v1/models` response:

```json5
{
  agents: {
    defaults: {
      imageGenerationModel: {
        primary: "omniroute/provider/image-model-from-omniroute",
      },
    },
  },
}
```

The initial image support is text-to-image only. Image edits and reference images remain planned. The plugin does not default image generation to `auto`; use an image-capable model that OmniRoute advertises.

### Web Search

OmniRoute can serve OpenClaw web search requests through `POST /v1/search`.
The plugin registers itself as a web search provider automatically — no additional configuration needed.

```json5
{
  tools: {
    web: {
      search: {
        provider: "omniroute",
      },
    },
  },
}
```

The web search tool supports `query`, `count` (1-10), `freshness` (day/week/month/year), `country`, and `language` parameters. Results include titles, URLs, snippets, and full page content when available.

## How It Works

1. **Authenticated live model discovery** — The plugin fetches `GET /v1/models` from your OmniRoute gateway and registers its chat-capable rows as `omniroute/<model-id>`. That response is authoritative: model and combo IDs are preserved exactly, and the available list varies with the gateway's upstream-provider configuration and the authenticated API key.
2. **No synthetic default** — The plugin does not hardcode `auto`, any other combo, or a fallback model. A model is shown only when OmniRoute advertises it; discovery failure does not fabricate a model selection.
3. **Reasoning controls from metadata** — Thinking/reasoning choices are exposed only when the returned row's capability metadata supports them. OpenClaw's off state is sent as `reasoning_effort: "none"`; supported non-off levels are passed through using the returned effort metadata. OpenClaw continues to own the configured/session default when no level is explicitly selected—the plugin does not invent another default.
4. **OpenAI-compatible transport** — Text requests use standard OpenAI chat completions format (`POST /v1/chat/completions`) with streaming usage support.
5. **Configured embeddings** — Embedding requests use OmniRoute's OpenAI-compatible `POST /v1/embeddings` endpoint and require a configured embedding model.
6. **Configured image generation** — Image requests use OmniRoute's OpenAI-compatible `POST /v1/images/generations` endpoint with a configured image model.
7. **Web search** — Search requests use OmniRoute's `POST /v1/search` endpoint. The plugin registers as a web search provider automatically.

Temperature suppression and arbitrary provider-specific request flags are not inferred from catalog rows. They require future transport-level support and validation.

## Roadmap

The plugin currently exposes OmniRoute as an OpenAI-compatible chat provider. The longer-term goal is to cover OmniRoute's full published API surface as OpenClaw plugin capabilities mature.

### Implementable in Plugin (OpenClaw SDK surface exists)

| Capability | Status |
|---|---|
| Chat completions (`/v1/chat/completions`) | ✅ Initial support |
| Live model catalog (`GET /v1/models`) | ✅ Initial support |
| Embeddings (`/v1/embeddings`) | ✅ Initial support |
| Image generation (`/v1/images/generations`) | ✅ Initial support |
| Image edits (`/v1/images/edits`) | 🔜 Planned (part of ImageGenerationProvider) |
| Web search (`/v1/search`) | ✅ Initial support |
| Speech (`/v1/audio/speech`) | 🔜 Planned |
| Transcription (`/v1/audio/transcriptions`) | 🔜 Planned |
| Video generation (`/v1/videos/generations`) | ✅ Initial support |
| Music generation (`/v1/music/generations`) | 🔜 Planned |

### Needs OpenClaw SDK PR (no plugin surface yet)

| OmniRoute Endpoint | Notes |
|---|---|
| `/v1/responses` | OpenAI Responses API — no OpenClaw provider surface |
| `/v1/completions` | Legacy completions — no OpenClaw provider surface |
| `/v1/messages` | Anthropic-compatible — no OpenClaw provider surface |
| `/v1/rerank` | Cohere-compatible rerank — no OpenClaw provider surface |
| `/v1/moderations` | OpenAI-compatible moderation — no OpenClaw provider surface |
| `/v1/batches` | Batch processing — no OpenClaw provider surface |
| `/v1/files` | File uploads — no OpenClaw provider surface |

## Development

```bash
git clone https://github.com/ekinnee/omniroute-openclaw
cd omniroute-openclaw
pnpm install
pnpm test
```

## License

MIT
