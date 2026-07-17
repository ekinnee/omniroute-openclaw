// OmniRoute setup helpers for API-key onboarding.
import { applyAgentDefaultModelPrimary, applyProviderConfigWithModelCatalogPreset, } from "openclaw/plugin-sdk/provider-onboard";
import { buildOmniRouteDefaultModel, OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_DEFAULT_MODEL_REF, OMNIROUTE_PROVIDER_ID, } from "./models.js";
export function applyOmniRouteProviderConfig(cfg) {
    const next = applyProviderConfigWithModelCatalogPreset(cfg, {
        providerId: OMNIROUTE_PROVIDER_ID,
        api: "openai-completions",
        baseUrl: OMNIROUTE_DEFAULT_BASE_URL,
        catalogModels: [buildOmniRouteDefaultModel()],
        aliases: [{ modelRef: OMNIROUTE_DEFAULT_MODEL_REF, alias: "OmniRoute" }],
    });
    return next;
}
export function applyOmniRouteConfig(cfg) {
    return applyAgentDefaultModelPrimary(applyOmniRouteProviderConfig(cfg), OMNIROUTE_DEFAULT_MODEL_REF);
}
//# sourceMappingURL=onboard.js.map