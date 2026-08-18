// Public-SDK-compatible OmniRoute credential resolution.
import {
  resolveApiKeyForProvider,
  type AuthProfileStore,
} from "openclaw/plugin-sdk/agent-runtime";
import {
  hasConfiguredSecretInput,
  isProviderAuthProfileConfigured,
  resolveEnvApiKey,
} from "openclaw/plugin-sdk/provider-auth";
import {
  OMNIROUTE_API_KEY_ENV_VAR,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

function readConfiguredProviderCredential(cfg: unknown): unknown {
  const provider = (cfg as { models?: { providers?: Record<string, { apiKey?: unknown }> } } | undefined)
    ?.models?.providers?.[OMNIROUTE_PROVIDER_ID];
  return provider?.apiKey;
}

export function isOmniRouteConfigured(params: {
  cfg?: unknown;
  agentDir?: string;
}): boolean {
  return Boolean(
    hasConfiguredSecretInput(readConfiguredProviderCredential(params.cfg)) ||
      resolveEnvApiKey(OMNIROUTE_PROVIDER_ID)?.apiKey ||
      process.env[OMNIROUTE_API_KEY_ENV_VAR] ||
      isProviderAuthProfileConfigured({
        provider: OMNIROUTE_PROVIDER_ID,
        agentDir: params.agentDir,
      }),
  );
}

export async function resolveOmniRouteApiKey(params: {
  cfg?: Parameters<typeof resolveApiKeyForProvider>[0]["cfg"];
  agentDir?: string;
  workspaceDir?: string;
  store?: AuthProfileStore;
}): Promise<string | undefined> {
  const resolved = await resolveApiKeyForProvider({
    provider: OMNIROUTE_PROVIDER_ID,
    cfg: params.cfg,
    agentDir: params.agentDir,
    workspaceDir: params.workspaceDir,
    store: params.store,
  });
  return resolved.apiKey;
}
