// Public-SDK-compatible OmniRoute credential resolution.
import {
  isProviderAuthProfileConfigured,
  resolveEnvApiKey,
  resolveProviderAuthProfileApiKey,
} from "openclaw/plugin-sdk/provider-auth";
import {
  OMNIROUTE_API_KEY_ENV_VAR,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

function readConfiguredApiKey(cfg: unknown): string | undefined {
  const provider = (cfg as { models?: { providers?: Record<string, { apiKey?: unknown }> } } | undefined)
    ?.models?.providers?.[OMNIROUTE_PROVIDER_ID];
  return typeof provider?.apiKey === "string" && provider.apiKey.trim()
    ? provider.apiKey.trim()
    : undefined;
}

export function isOmniRouteConfigured(params: {
  cfg?: unknown;
  agentDir?: string;
}): boolean {
  return Boolean(
    readConfiguredApiKey(params.cfg) ||
      resolveEnvApiKey(OMNIROUTE_PROVIDER_ID)?.apiKey ||
      process.env[OMNIROUTE_API_KEY_ENV_VAR] ||
      isProviderAuthProfileConfigured({
        provider: OMNIROUTE_PROVIDER_ID,
        agentDir: params.agentDir,
      }),
  );
}

export async function resolveOmniRouteApiKey(params: {
  cfg?: Parameters<typeof resolveProviderAuthProfileApiKey>[0]["cfg"];
  agentDir?: string;
}): Promise<string | undefined> {
  const configured = readConfiguredApiKey(params.cfg);
  if (configured) {
    return configured;
  }

  const environment = resolveEnvApiKey(OMNIROUTE_PROVIDER_ID)?.apiKey;
  if (environment) {
    return environment;
  }

  return await resolveProviderAuthProfileApiKey({
    provider: OMNIROUTE_PROVIDER_ID,
    cfg: params.cfg,
    agentDir: params.agentDir,
  });
}
