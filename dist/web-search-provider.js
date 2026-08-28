import { assertOmniRouteOk, OMNIROUTE_JSON_READ_OPTIONS, postOmniRouteJson, readOmniRouteJson, resolveOmniRouteHttpRequestConfig, } from "./http.js";
import { OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_BASE_URL_ENV_VAR, OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_LABEL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
import { resolveOmniRouteBaseUrl } from "./base-url.js";
import { resolveOmniRouteApiKey } from "./auth.js";
const MAX_SEARCH_COUNT = 10;
const DEFAULT_SEARCH_COUNT = 5;
function resolveSearchCount(value) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
        return Math.min(Math.trunc(value), MAX_SEARCH_COUNT);
    }
    return DEFAULT_SEARCH_COUNT;
}
function resolveFreshness(value) {
    if (!value)
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (["day", "week", "month", "year"].includes(normalized)) {
        return normalized;
    }
    return undefined;
}
function readStringCredential(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function isMissingOmniRouteAuthError(error) {
    if (!error || typeof error !== "object")
        return false;
    const authError = error;
    return authError.provider === OMNIROUTE_PROVIDER_ID &&
        (authError.code === "missing-provider-auth" || authError.code === "missing-api-key");
}
async function resolveWebSearchApiKey(params) {
    const searchApiKey = readStringCredential(params.searchConfig?.apiKey);
    const providerApiKey = readStringCredential(params.providerApiKey);
    const explicitSearchApiKey = searchApiKey && searchApiKey !== providerApiKey
        ? searchApiKey
        : undefined;
    if (explicitSearchApiKey) {
        return explicitSearchApiKey;
    }
    try {
        const resolved = await resolveOmniRouteApiKey({
            cfg: params.config,
            agentDir: params.agentDir,
        });
        if (resolved) {
            return resolved;
        }
    }
    catch (error) {
        if (!isMissingOmniRouteAuthError(error)) {
            throw error;
        }
        // Preserve the provider's documented environment fallback and a stable
        // non-secret missing-credential response when host auth is unavailable.
    }
    return readStringCredential(process.env[OMNIROUTE_API_KEY_ENV_VAR]);
}
export function createOmniRouteWebSearchProvider() {
    return {
        id: OMNIROUTE_PROVIDER_ID,
        label: OMNIROUTE_LABEL,
        hint: "Search the web using OmniRoute's multi-provider search endpoint. Supports freshness filtering and region-specific results.",
        envVars: [OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_BASE_URL_ENV_VAR],
        authProviderId: OMNIROUTE_PROVIDER_ID,
        placeholder: "Search the web via OmniRoute",
        signupUrl: "",
        credentialPath: `models.providers.${OMNIROUTE_PROVIDER_ID}.apiKey`,
        getCredentialValue: (searchConfig) => searchConfig?.apiKey,
        getConfiguredCredentialValue: (config) => {
            const searchConfig = config?.tools?.web?.search;
            if (searchConfig && typeof searchConfig === "object" && Object.hasOwn(searchConfig, "apiKey")) {
                return undefined;
            }
            return config?.models?.providers?.[OMNIROUTE_PROVIDER_ID]?.apiKey;
        },
        setCredentialValue: (searchConfigTarget, value) => {
            searchConfigTarget.apiKey = value;
        },
        createTool: (ctx) => {
            const providerConfig = ctx.config?.models?.providers?.[OMNIROUTE_PROVIDER_ID];
            const baseUrl = resolveOmniRouteBaseUrl({ config: ctx.config });
            return {
                description: "Search the web using OmniRoute's multi-provider search endpoint. " +
                    "Returns titles, URLs, and snippets for each result. " +
                    "Supports freshness filtering (day/week/month/year) and region-specific results via country and language parameters.",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Search query string.",
                        },
                        count: {
                            type: "integer",
                            description: "Number of results to return (1-10). Default: 5.",
                            minimum: 1,
                            maximum: 10,
                        },
                        freshness: {
                            type: "string",
                            description: "Filter by time: 'day' (24h), 'week', 'month', or 'year'.",
                            enum: ["day", "week", "month", "year"],
                        },
                        country: {
                            type: "string",
                            description: "2-letter country code for region-specific results (e.g., 'DE', 'US').",
                        },
                        language: {
                            type: "string",
                            description: "ISO 639-1 language code for results (e.g., 'en', 'de', 'fr').",
                        },
                    },
                    required: ["query"],
                },
                execute: async (args, executionContext) => {
                    const query = String(args.query ?? "").trim();
                    if (!query) {
                        return { error: "Search query is required." };
                    }
                    const apiKey = await resolveWebSearchApiKey({
                        config: ctx.config,
                        agentDir: ctx.agentDir,
                        searchConfig: ctx.searchConfig,
                        providerApiKey: providerConfig?.apiKey,
                    });
                    if (!apiKey) {
                        return { error: "OmniRoute API key is not configured." };
                    }
                    const http = resolveOmniRouteHttpRequestConfig({
                        baseUrl,
                        defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
                        request: providerConfig?.request,
                        defaultHeaders: {
                            Accept: "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        },
                    });
                    const headers = new Headers(http.headers);
                    if (!headers.has("Content-Type")) {
                        headers.set("Content-Type", "application/json");
                    }
                    const body = {
                        model: "auto",
                        query,
                        max_results: resolveSearchCount(args.count),
                    };
                    const freshness = resolveFreshness(typeof args.freshness === "string" ? args.freshness : undefined);
                    if (freshness) {
                        body.time_range = freshness;
                    }
                    if (typeof args.country === "string" && args.country.trim()) {
                        body.country = args.country.trim();
                    }
                    if (typeof args.language === "string" && args.language.trim()) {
                        body.language = args.language.trim();
                    }
                    const request = await postOmniRouteJson({
                        url: `${http.baseUrl}/search`,
                        headers,
                        body,
                        timeoutMs: 30_000,
                        signal: executionContext?.signal,
                        ssrfPolicy: http.ssrfPolicy,
                        dispatcherPolicy: http.dispatcherPolicy,
                    });
                    try {
                        await assertOmniRouteOk(request.response, "OmniRoute web search failed");
                        const payload = await readOmniRouteJson(request.response, "omniroute.web-search", OMNIROUTE_JSON_READ_OPTIONS.webSearch);
                        const rawResults = payload && typeof payload === "object" && Array.isArray(payload.results)
                            ? payload.results
                            : [];
                        return {
                            results: rawResults.map((result) => {
                                const item = result && typeof result === "object"
                                    ? result
                                    : {};
                                return {
                                    title: String(item.title ?? ""),
                                    url: String(item.url ?? ""),
                                    snippet: String(item.snippet ?? ""),
                                    ...(typeof item.published_at === "string" && item.published_at
                                        ? { published: item.published_at }
                                        : {}),
                                };
                            }),
                        };
                    }
                    finally {
                        await request.release();
                    }
                },
            };
        },
    };
}
//# sourceMappingURL=web-search-provider.js.map