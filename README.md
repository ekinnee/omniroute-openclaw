# OmniRoute Provider Plugin for OpenClaw

Registers [OmniRoute](https://github.com/diegosouzapw/OmniRoute) — a multi-provider model routing proxy — as a first-class text inference provider in OpenClaw. Routes through **40+ models across 7 providers** with automatic fallback, live model discovery, and OpenAI-compatible transport.

## Quick Start

```bash
# Install from ClawHub
openclaw plugins install clawhub:@ekinnee/omniroute-provider

# Set your OmniRoute API key
export OMNIROUTE_API_KEY="your-key-here"

# Verify it works
openclaw models list | grep omniroute
```

OmniRoute appears as a model provider immediately. Select `omniroute/auto` to let OmniRoute handle downstream routing, or pick any chat model discovered from OmniRoute's live catalog.

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

## How It Works

1. **Live model discovery** — On startup, the plugin fetches `GET /v1/models` from your OmniRoute gateway and registers every chat/text model it finds as `omniroute/<model-id>`.
2. **Static fallback** — The `omniroute/auto` model is always available, even when OmniRoute is offline or unauthenticated, so your configs don't break during setup.
3. **OpenAI-compatible transport** — All requests use standard OpenAI chat completions format (`POST /v1/chat/completions`) with streaming usage support.

## Roadmap

The plugin currently exposes OmniRoute as an OpenAI-compatible chat provider. The longer-term goal is to cover OmniRoute's full published API surface as OpenClaw plugin capabilities mature.

| Capability | Status |
|---|---|
| Chat completions (`/v1/chat/completions`) | ✅ Initial support |
| Live model catalog (`GET /v1/models`) | ✅ Initial support |
| Embeddings (`/v1/embeddings`) | 🔜 Planned |
| Image generation (`/v1/images/generations`) | 🔜 Planned |
| Speech (`/v1/audio/speech`) | 🔜 Planned |
| Transcription (`/v1/audio/transcriptions`) | 🔍 Investigating |
| Web search (`/v1/search`) | 🔜 Planned |
| Video / music generation | 🔜 Planned |
| Files, batches, rerank, moderation | ⏳ Tracking upstream |

## Development

```bash
git clone https://github.com/ekinnee/omniroute-openclaw
cd omniroute-openclaw
pnpm install
pnpm test
```

## License

MIT
