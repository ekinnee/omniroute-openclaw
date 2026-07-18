# OmniRoute Provider Plugin for OpenClaw

Registers [OmniRoute](https://github.com/diegosouzapw/OmniRoute) — a multi-provider model routing proxy — as a first-class text inference, embedding, and image generation provider in OpenClaw. Routes through **40+ models across 7 providers** with automatic fallback, live model discovery, and OpenAI-compatible transport.

## Quick Start

```bash
# Install from ClawHub
openclaw plugins install clawhub:@ekinnee/omniroute-provider

# Set your OmniRoute API key
export OMNIROUTE_API_KEY="your-key-here"

# Verify it works
openclaw models list | grep omniroute
```

OmniRoute appears as a model provider immediately. Select `omniroute/auto` when OmniRoute advertises it, or pick any chat-capable model discovered from OmniRoute's live catalog.

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
Configure an explicit embedding model from OmniRoute's `GET /v1/models` response:

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
Configure an explicit image model from OmniRoute's `GET /v1/models` response:

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

## How It Works

1. **Live model discovery** — On startup, the plugin fetches `GET /v1/models` from your OmniRoute gateway and registers chat-capable rows as `omniroute/<model-id>`. Successful live discovery treats OmniRoute's catalog as the source of truth.
2. **Static fallback** — The `omniroute/auto` model is available when OmniRoute is offline or unauthenticated, so setup can proceed without a running gateway. When live discovery succeeds, `auto` is shown only if OmniRoute returns it.
3. **OpenAI-compatible transport** — Text requests use standard OpenAI chat completions format (`POST /v1/chat/completions`) with streaming usage support.
4. **Explicit embeddings** — Embedding requests use OmniRoute's OpenAI-compatible `POST /v1/embeddings` endpoint, but require a configured embedding model instead of falling back to `auto`.
5. **Explicit image generation** — Image requests use OmniRoute's OpenAI-compatible `POST /v1/images/generations` endpoint with a configured image model.

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
| Web search (`/v1/search`) | 🔜 Next planned |
| Speech (`/v1/audio/speech`) | 🔜 Planned |
| Transcription (`/v1/audio/transcriptions`) | 🔜 Planned |
| Video generation (`/v1/videos/generations`) | 🔜 Planned |
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
