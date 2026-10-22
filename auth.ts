// Public-SDK-compatible OmniRoute credential resolution.
import {
  resolveApiKeyForProvider,
  type AuthProfileStore,
} from "openclaw/plugin-sdk/agent-runtime";
import * as providerAuth from "openclaw/plugin-sdk/provider-auth";
import {
  OMNIROUTE_API_KEY_ENV_VAR,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

function readConfiguredProviderCredential(cfg: unknown): unknown {
  const provider = (cfg as { models?: { providers?: Record<string, { apiKey?: unknown }> } } | undefined)
    ?.models?.providers?.[OMNIROUTE_PROVIDER_ID];
  return provider?.apiKey;
}

type ConfiguredParams = {
  cfg?: unknown;
  agentDir?: string;
};

// Optional public exports let the same artifact load on the supported SDK floor.
const authSdk: typeof providerAuth & {
  isProviderAuthProfileConfiguredAsync?: (
    params: Parameters<typeof providerAuth.isProviderAuthProfileConfigured>[0],
  ) => Promise<boolean>;
} = providerAuth;

function hasDirectCredential(cfg: unknown): boolean {
  return Boolean(
    providerAuth.hasConfiguredSecretInput(readConfiguredProviderCredential(cfg)) ||
      providerAuth.resolveEnvApiKey(OMNIROUTE_PROVIDER_ID)?.apiKey ||
      process.env[OMNIROUTE_API_KEY_ENV_VAR],
  );
}

export function isOmniRouteConfigured(params: ConfiguredParams): boolean {
  return hasDirectCredential(params.cfg) ||
    providerAuth.isProviderAuthProfileConfigured({
      provider: OMNIROUTE_PROVIDER_ID,
      agentDir: params.agentDir,
    });
}

export async function isOmniRouteConfiguredAsync(params: ConfiguredParams): Promise<boolean> {
  if (hasDirectCredential(params.cfg)) return true;
  // Only an absent capability selects the old path; async failures stay visible.
  const checkProfile = authSdk.isProviderAuthProfileConfiguredAsync
    ?? providerAuth.isProviderAuthProfileConfigured;
  return await checkProfile({ provider: OMNIROUTE_PROVIDER_ID, agentDir: params.agentDir });
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
