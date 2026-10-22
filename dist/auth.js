// Public-SDK-compatible OmniRoute credential resolution.
import { resolveApiKeyForProvider, } from "openclaw/plugin-sdk/agent-runtime";
import * as providerAuth from "openclaw/plugin-sdk/provider-auth";
import { OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_PROVIDER_ID, } from "./models.js";
function readConfiguredProviderCredential(cfg) {
    const provider = cfg
        ?.models?.providers?.[OMNIROUTE_PROVIDER_ID];
    return provider?.apiKey;
}
// Optional public exports let the same artifact load on the supported SDK floor.
const authSdk = providerAuth;
function hasDirectCredential(cfg) {
    return Boolean(providerAuth.hasConfiguredSecretInput(readConfiguredProviderCredential(cfg)) ||
        providerAuth.resolveEnvApiKey(OMNIROUTE_PROVIDER_ID)?.apiKey ||
        process.env[OMNIROUTE_API_KEY_ENV_VAR]);
}
export function isOmniRouteConfigured(params) {
    return hasDirectCredential(params.cfg) ||
        providerAuth.isProviderAuthProfileConfigured({
            provider: OMNIROUTE_PROVIDER_ID,
            agentDir: params.agentDir,
        });
}
export async function isOmniRouteConfiguredAsync(params) {
    if (hasDirectCredential(params.cfg))
        return true;
    // Only an absent capability selects the old path; async failures stay visible.
    const checkProfile = authSdk.isProviderAuthProfileConfiguredAsync
        ?? providerAuth.isProviderAuthProfileConfigured;
    return await checkProfile({ provider: OMNIROUTE_PROVIDER_ID, agentDir: params.agentDir });
}
export async function resolveOmniRouteApiKey(params) {
    const resolved = await resolveApiKeyForProvider({
        provider: OMNIROUTE_PROVIDER_ID,
        cfg: params.cfg,
        agentDir: params.agentDir,
        workspaceDir: params.workspaceDir,
        store: params.store,
    });
    return resolved.apiKey;
}
//# sourceMappingURL=auth.js.map