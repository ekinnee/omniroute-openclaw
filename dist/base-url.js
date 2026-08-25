// Shared OmniRoute endpoint precedence for every plugin-owned capability.
import { OMNIROUTE_BASE_URL_ENV_VAR, OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
function readConfiguredBaseUrl(config) {
    return config?.models?.providers?.[OMNIROUTE_PROVIDER_ID]?.baseUrl;
}
export function normalizeOmniRouteBaseUrl(value) {
    return typeof value === "string" && value.trim()
        ? value.trim().replace(/\/+$/, "")
        : OMNIROUTE_DEFAULT_BASE_URL;
}
export function resolveOmniRouteBaseUrl(params) {
    // Memory search's remote endpoint is deliberately more specific than the
    // provider-wide endpoint. Preserve its current override semantics first.
    if (params.overrideBaseUrl !== undefined && params.overrideBaseUrl !== null) {
        return normalizeOmniRouteBaseUrl(params.overrideBaseUrl);
    }
    const configuredBaseUrl = normalizeOmniRouteBaseUrl(readConfiguredBaseUrl(params.config));
    if (configuredBaseUrl !== OMNIROUTE_DEFAULT_BASE_URL) {
        return configuredBaseUrl;
    }
    return normalizeOmniRouteBaseUrl((params.env ?? process.env)[OMNIROUTE_BASE_URL_ENV_VAR] ?? configuredBaseUrl);
}
//# sourceMappingURL=base-url.js.map