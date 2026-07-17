# OmniRoute Provider Plugin for OpenClaw

Registers [OmniRoute](https://github.com/diegosouzapw/OmniRoute) as a text inference provider for OpenClaw.

## Install

```bash
openclaw plugins install clawhub:@ekinnee/omniroute-provider
```

## Configuration

Set the `OMNIROUTE_API_KEY` environment variable or configure through the OpenClaw onboarding flow.

Optionally set a custom base URL:

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

## Usage

Once configured, OmniRoute appears as a model provider in OpenClaw. Select `omniroute/auto` to let OmniRoute handle downstream routing, or choose one of the chat models discovered from OmniRoute's `GET /v1/models` endpoint.

The plugin keeps `omniroute/auto` available as a static fallback when OmniRoute is offline, unauthenticated, or unable to return a live model catalog.

## Roadmap

The plugin currently exposes OmniRoute as an OpenAI-compatible chat provider with live chat model discovery. The longer-term goal is to cover OmniRoute's broader published API surface:

- OpenAI-compatible chat completions via `POST /v1/chat/completions`.
- OpenAI Responses support through OpenClaw's provider stream/transport hooks.
- Embeddings via `POST /v1/embeddings`.
- Image generation and edits via `POST /v1/images/generations` and `POST /v1/images/edits`.
- Speech, transcription, video, music, rerank, moderation, search, files, batches, and provider-specific routes as OpenClaw plugin APIs support those capability classes.

See [OmniRoute support roadmap](./OMNIROUTE_SUPPORT.md) for the working plan.

## Development

```bash
git clone https://github.com/ekinnee/omniroute-openclaw
cd omniroute-openclaw
pnpm install
pnpm test
```
