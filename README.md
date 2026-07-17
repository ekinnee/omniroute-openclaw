# OmniRoute Provider Plugin for OpenClaw

Registers [OmniRoute](https://github.com/ekinnee/omniroute) as a bundled text inference provider for OpenClaw.

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

Once configured, OmniRoute appears as a model provider in OpenClaw. Select `omniroute/auto` as your model — OmniRoute handles downstream routing.

## Development

```bash
git clone https://github.com/ekinnee/omniroute-openclaw
cd omniroute-openclaw
pnpm install
pnpm test
```
