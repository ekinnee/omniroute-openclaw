# OmniRoute Provider Plugin for OpenClaw

Registers [OmniRoute](https://github.com/diegosouzapw/OmniRoute) — a multi-provider model routing proxy — as a first-class text inference, embedding, image generation, video generation, music generation, speech, batch audio transcription, web fetch, and web search provider in [OpenClaw](https://github.com/openclaw/openclaw). Install the plugin from [ClawHub](https://clawhub.ai/ekinnee/plugins/omniroute-provider). Routes through models from 236+ providers with automatic fallback, live model discovery, and OpenAI-compatible transport.

Current release: `2.2.0`. See the [changelog](CHANGELOG.md) for version history
and the [GitHub Release](https://github.com/ekinnee/omniroute-openclaw/releases/tag/v2.2.0)
for the compatibility contract and verification record.

## Quick Start

```bash
# Install from ClawHub
openclaw plugins install clawhub:@ekinnee/omniroute-provider

# If OmniRoute runs remotely, point the plugin at its reachable `/v1` endpoint.
# Skip this when OmniRoute runs on the same host at the default address.
openclaw config set models.providers.omniroute \
  '{"api":"openai-completions","baseUrl":"https://omniroute.example.com/v1","models":[]}' \
  --strict-json

# Set your OmniRoute API key
export OMNIROUTE_API_KEY="your-key-here"

# Verify it works
openclaw models list | grep omniroute
```

OmniRoute appears as a model provider after authenticated discovery. The gateway URL is `models.providers.omniroute.baseUrl`; its default, `http://localhost:20128/v1`, works only when OmniRoute runs on the same host. For discovery, chat, embeddings, image, video and music generation, speech, batch transcription, web fetch, web search, usage, and the catalog audit, an explicit non-default provider URL wins; otherwise `OMNIROUTE_BASE_URL` is used before the localhost default. Select any chat-capable model or combo returned by your OmniRoute gateway; the available list depends on that gateway's configured upstream providers and API-key permissions.

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

Set the OmniRoute gateway URL in your OpenClaw config. Include the `/v1` path; this is the canonical setting for every plugin capability.

```json5
{
  models: {
    providers: {
      omniroute: {
        api: "openai-completions",
        baseUrl: "https://omniroute.example.com/v1",
        models: [],
      },
    },
  },
}
```

The empty `models` array is intentional: OpenClaw requires it for an authored custom provider, and the plugin supplies the authenticated live models during discovery. For a LAN-hosted gateway, substitute its reachable host and port. `models.providers.omniroute.baseUrl` is the durable configuration option; `OMNIROUTE_BASE_URL` is the fallback when that setting is absent or still the public localhost default.

### Transport TLS limitation

For plugin-owned discovery, catalog audit, embeddings, image/video/music generation, speech, batch transcription, and search requests, target TLS overrides in `models.providers.omniroute.request.tls` cannot be combined with `request.proxy.mode: "explicit-proxy"`. The plugin rejects this combination before making the request because the guarded SDK transport cannot represent independent target TLS settings for an explicit proxy. Direct and `env-proxy` transport retain support for target TLS overrides. This does not change the compatibility floor or OpenClaw-owned chat transport.

### Catalog Metadata Audit

The plugin package includes a read-only catalog audit command. It loads the same OpenClaw configuration and agent-scoped OmniRoute credentials, performs `GET /v1/models`, and reports only metadata the gateway actually advertised.

```bash
# When the package executable is linked into PATH
omniroute-catalog-audit --agent main

# JSON output from a default ClawHub extension install
node "${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/extensions/omniroute/dist/catalog-audit-bin.js" \
  --agent main --json
```

The report classifies chat, embedding, image, and other rows; identifies invalid rows, duplicate IDs, and relevant missing advertised metadata; and redacts credentials and URL query strings. Missing metadata stays unknown—it is not replaced with a guessed model capability. The command makes no configuration changes and sends no inference request.

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

OmniRoute can serve OpenClaw image generation requests through `POST /v1/images/generations` and image edits through `POST /v1/images/edits`.
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

Image editing requires OmniRoute v3.8.11 or newer. For an edit, supply exactly one reference image and select an OmniRoute model that supports image editing. The plugin sends the reference image as a data URL in a JSON request to `/v1/images/edits`. Masks and multiple reference images are not currently supported.

The plugin does not default image generation or editing to `auto`; use a model that OmniRoute advertises for the requested operation.

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

The web search tool supports `query`, `count` (1-10), `freshness` (day/week/month/year), `country`, and `language` parameters. Results include titles, URLs, snippets, and publication dates when OmniRoute supplies them.

### Web Fetch

OmniRoute can serve OpenClaw web fetch requests through `POST /v1/web/fetch`.
The plugin registers itself as a web-fetch provider automatically and uses the
shared OmniRoute credential and base URL configuration.

```json5
{
  tools: {
    web: {
      fetch: {
        provider: "omniroute",
      },
    },
  },
}
```

OpenClaw supplies the target `url`, `extractMode` (`markdown` or `text`), and
host-owned `maxChars` limit. The plugin requests OmniRoute markdown, projects
plain text with OpenClaw's public helper when requested, preserves the final
URL, title, extractor, and upstream truncation signal, and leaves final content
length enforcement to OpenClaw. Private, loopback, and other special-use target
hostnames are rejected before forwarding. OmniRoute's provider-selection,
depth, selector-wait, link-list, metadata-description, and screenshot options
are not exposed because they are outside the OpenClaw 2026.7.1 web-fetch
contract.

### Text to Speech

OmniRoute can serve OpenClaw speech synthesis requests through `POST /v1/audio/speech`.
Configure a model advertised by your OmniRoute gateway in the speech provider config;
the API key and shared gateway URL continue to come from the normal OmniRoute provider
configuration or environment variables:

```json5
{
  messages: {
    tts: {
      provider: "omniroute",
      providers: {
        omniroute: {
          model: "provider/tts-model-from-omniroute",
          voice: "coral",
          responseFormat: "mp3",
        },
      },
    },
  },
}
```

Supported voices are the OpenAI-compatible voice IDs exposed by the plugin. Supported
formats are `mp3`, `opus`, and `wav`; voice notes default to `opus`, while audio files
default to `mp3`. The plugin rejects missing models, unsupported voices, unsupported
formats, and responses whose MIME type or bytes do not match the requested format.

### Batch Audio Transcription

OmniRoute can serve OpenClaw media-understanding audio transcription requests through
`POST /v1/audio/transcriptions`. Configure an explicitly selected transcription model
advertised by your OmniRoute gateway; the plugin does not invent an `auto` or fallback
model. This integration is batch REST transcription only. Realtime or duplex voice
transcription is not supported by this contract.

## How It Works

1. **Authenticated live model discovery** — The plugin fetches `GET /v1/models` from your OmniRoute gateway and registers its chat-capable rows as `omniroute/<model-id>`. That response is authoritative: model and combo IDs are preserved exactly, and the available list varies with the gateway's upstream-provider configuration and the authenticated API key.
2. **Authenticated media catalogs** — The same credential-scoped response publishes image, video, and music rows through OpenClaw's modality-specific pickers. Model IDs and advertised capability objects are preserved; classification uses explicit type, endpoint, and output-modality metadata. Audio/voice catalog rows remain deferred, while speech synthesis and batch transcription use explicitly configured models through OpenClaw's speech and media-understanding contracts.
3. **No synthetic default** — The plugin does not hardcode `auto`, any other combo, or a fallback model. A model is shown only when OmniRoute advertises it; discovery failure does not fabricate a model selection. Chat rows missing a positive context or output limit are excluded from discovery until OmniRoute advertises both; the catalog audit still shows those rows and their missing metadata.
4. **Catalog diagnostics** — The packaged `omniroute-catalog-audit` command shows the authenticated gateway's advertised metadata without filling gaps with plugin guesses. Discovery excludes rows with missing or invalid sizing; missing thinking tiers do not create controls.
5. **Reasoning controls from metadata** — A thinking selector is exposed only when the returned row advertises explicit `effort_tiers`. `supportsThinking` without those tiers still marks the model as reasoning-capable, but it does not invent `none`/`low`/`medium`/`high`/`xhigh` controls. OpenClaw's off state is sent as `reasoning_effort: "none"`; supported non-off levels are passed through using the returned effort metadata. OpenClaw continues to own the configured/session default when no level is explicitly selected—the plugin does not invent another default.
6. **OpenAI-compatible transport** — Text requests use standard OpenAI chat completions format (`POST /v1/chat/completions`) with streaming usage support.
7. **Configured embeddings** — Embedding requests use OmniRoute's OpenAI-compatible `POST /v1/embeddings` endpoint and require a configured embedding model.
8. **Configured image generation and editing** — Image generation uses `POST /v1/images/generations`. Edits send one reference image as a JSON data URL to `POST /v1/images/edits`. Both require a configured OmniRoute model that supports the requested operation.
9. **Music generation** — Music requests use `POST /v1/music/generations` with an explicitly selected model and prompt. Inline base64 and hosted URL results are materialized as bounded audio assets through guarded transport; edit and image-conditioned modes remain disabled until OmniRoute exposes a uniform contract.
10. **Speech synthesis** — Speech requests use OmniRoute's `POST /v1/audio/speech` endpoint with an explicitly configured model, supported voice, and output format.
11. **Batch audio transcription** — Audio requests use OmniRoute's multipart `POST /v1/audio/transcriptions` endpoint with an explicitly configured model. OpenClaw's public multipart helper preserves the upload filename and MIME type, while bounded response validation rejects missing transcript text.
12. **Web search** — Search requests use OmniRoute's `POST /v1/search` endpoint. The plugin registers as a web search provider automatically.
13. **Web fetch** — Fetch requests use OmniRoute's `POST /v1/web/fetch` endpoint with markdown extraction and metadata enabled. The adapter preserves the public OpenClaw result fields and does not implement a second provider fallback policy.
13. **Provider quota usage** — OpenClaw status and usage views can read OmniRoute's credential-scoped cached quota snapshot from `GET /api/usage/om-usage`. Enable usage visibility for that OmniRoute API key; a key without that permission reports an explicit unavailable status and never exposes other gateway connections.

Temperature suppression and arbitrary provider-specific request flags are not inferred from catalog rows. They require future transport-level support and validation.

## Roadmap

The plugin currently exposes OmniRoute as OpenAI-compatible chat, embedding,
image-generation, video-generation, music-generation, speech, batch audio transcription,
web-fetch, and web-search providers. The longer-term
goal is to cover OmniRoute's full published API surface as OpenClaw plugin
capabilities mature.

### Implementable in Plugin (OpenClaw SDK surface exists)

| Capability | Status |
|---|---|
| Chat completions (`/v1/chat/completions`) | ✅ Initial support |
| Live model catalog (`GET /v1/models`) | ✅ Initial support |
| Modality-specific model catalogs (`GET /v1/models`) | ✅ Initial support — publish authenticated image, video, and music rows; audio/voice catalog rows remain deferred |
| Embeddings (`/v1/embeddings`) | ✅ Initial support |
| Async embedding batches (`/v1/files` + `/v1/batches`) | ⏳ OpenClaw contract merged in [#129625](https://github.com/openclaw/openclaw/pull/129625); implement after it ships in a stable release ([tracking issue #58](https://github.com/ekinnee/omniroute-openclaw/issues/58)) |
| Image generation (`/v1/images/generations`) | ✅ Initial support |
| Image edits (`/v1/images/edits`) | ✅ Supported with OmniRoute v3.8.11+ — one reference image with an edit-capable model; no masks or multiple references |
| Web search (`/v1/search`) | ✅ Initial support |
| Speech (`/v1/audio/speech`) | ✅ Initial support — explicit model, supported voice, and bounded standard output formats |
| Batch transcription (`/v1/audio/transcriptions`) | ✅ Initial support — explicit model, multipart upload, and bounded transcript validation; not realtime transcription |
| Web fetch (`/v1/web/fetch`) | ✅ Initial support — maps the public URL, extract mode, max-character, title, final-URL, extractor, and truncation fields; richer OmniRoute fetch options remain deferred |
| Video generation (`/v1/videos/generations`) | ✅ Initial support |
| Music generation (`/v1/music/generations`) | ✅ Initial support — prompt generation with inline or hosted audio; edits deferred |

### Needs a broader OpenClaw SDK surface

| OmniRoute Endpoint | Notes |
|---|---|
| `/v1/responses` | OpenAI Responses API — no OpenClaw provider surface |
| `/v1/completions` | Legacy completions — no OpenClaw provider surface |
| `/v1/messages` | Anthropic-compatible — no OpenClaw provider surface |
| `/v1/rerank` | Cohere-compatible rerank — no OpenClaw provider surface |
| `/v1/moderations` | OpenAI-compatible moderation — no OpenClaw provider surface |
| `/v1/batches`, `/v1/files` | OpenClaw `main` now exposes an embedding-specific asynchronous batch runtime. Generic file and non-embedding batch operations still have no plugin surface. |

## Development

```bash
git clone https://github.com/ekinnee/omniroute-openclaw
cd omniroute-openclaw
pnpm install
pnpm test
```

## License

MIT
