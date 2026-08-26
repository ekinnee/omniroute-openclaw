# v2.1.3 Host Canary Proof

This is the sanitized repository copy of the bounded, non-production host
canary for the exact release candidate.

## Frozen inputs

- Candidate commit: `efc9a87981e77ff39b4d6bdcc394c204b9fcb2e6`
- Packed candidate: `@ekinnee/omniroute-provider@2.1.3`
- Packed candidate SHA-256:
  `119922eb5b66547c91d88369e45986ff80571fdd6822abb685ef166cdc54da1d`
- Packaged host: `openclaw@2026.7.1`
- Node: `v24.19.0`
- Transport fixture: loopback-only fake OmniRoute HTTP server

No production OpenClaw state, installed plugin, service, OmniRoute credential,
or external upstream endpoint was used.

## Installation and registration

The exact `2.1.3` packed plugin was installed by the packaged host's
`plugins install npm-pack:<tarball>` path. Runtime inspection reported the
plugin enabled, activated, imported, and loaded. The registration contract
reported five capabilities with provider IDs for chat, embeddings, image,
video, and web search all set to `omniroute`. Diagnostics were empty, and
`openclaw plugins doctor` returned `No plugin issues detected.`

## Public host paths

The loopback fixture advertised `canary-chat`. Both public Gateway paths
returned provider `omniroute`, API `openai-completions`, `reasoning: true`,
`available: true`, and supported reasoning efforts `low`, `medium`, and
`high`:

- `models.list` with `view: all`;
- `chat.metadata`.

`chat.send` accepted `thinking: "high"` and produced an authorized streaming
`POST /chat/completions` for `canary-chat`. OpenClaw `2026.7.1` did not emit a
separate `reasoning_effort` or `reasoningEffort` field in this downstream
OpenAI-completions body, so this proof claims host admission and routing, not
stronger downstream effort translation.

## Local capability paths

The following calls all reached the loopback fixture with authorization and
the expected model/request shape:

| Host capability | Fixture path | Model | Result |
| --- | --- | --- | --- |
| embedding create | `POST /embeddings` | `canary-embedding` | embedding `[0.1, 0.2, 0.3]`, dimensions `3` |
| image generate | `POST /images/generations` | `canary-image` | valid 1x1 PNG fixture output |
| video generate | `POST /videos/generations` plus fixture download | `canary-video` | 12-byte loopback fixture output |
| web search | `POST /search` | `auto` | query `host canary 2.1.3`, limit `1` |

The sanitized assertion result was:

```text
HOST_FIXTURE_ASSERTIONS=PASS
/chat/completions authorized=true model=canary-chat
/embeddings authorized=true model=canary-embedding
/images/generations authorized=true model=canary-image
/videos/generations authorized=true model=canary-video
/search authorized=true model=auto
```

## Verdict and limits

**PASS for the release-plan host gate.** The exact packed candidate loaded in a
disposable packaged OpenClaw host, exposed catalog metadata, routed chat, and
exercised embedding, image, video, and web-search paths without external
network access.

This canary does not prove live OmniRoute traffic, real ChatGPT
authentication, production configuration, or downstream reasoning-effort
semantics beyond the host behavior recorded above.
