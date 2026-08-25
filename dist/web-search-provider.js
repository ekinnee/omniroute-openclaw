import { assertOmniRouteOk, postOmniRouteJson, readOmniRouteJson, resolveOmniRouteHttpRequestConfig, } from "./http.js";
import { OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_BASE_URL_ENV_VAR, OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_LABEL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
import { resolveOmniRouteBaseUrl } from "./base-url.js";
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
export function createOmniRouteWebSearchProvider() {
    return {
        id: OMNIROUTE_PROVIDER_ID,
        label: OMNIROUTE_LABEL,
        hint: "Search the web using OmniRoute's multi-provider search endpoint. Supports freshness filtering and region-specific results.",
        envVars: [OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_BASE_URL_ENV_VAR],
        placeholder: "Search the web via OmniRoute",
        signupUrl: "",
        credentialPath: `models.providers.${OMNIROUTE_PROVIDER_ID}.apiKey`,
        getCredentialValue: (searchConfig) => searchConfig?.apiKey,
        setCredentialValue: (searchConfigTarget, value) => {
            searchConfigTarget.apiKey = value;
        },
        createTool: (ctx) => {
            const searchConfig = ctx.searchConfig;
            const apiKey = (typeof searchConfig?.apiKey === "string" ? searchConfig.apiKey : undefined) ??
                process.env[OMNIROUTE_API_KEY_ENV_VAR] ??
                "";
            const providerConfig = ctx.config?.models?.providers?.[OMNIROUTE_PROVIDER_ID];
            const baseUrl = resolveOmniRouteBaseUrl({ config: ctx.config });
            const http = resolveOmniRouteHttpRequestConfig({
                baseUrl,
                defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
                request: providerConfig?.request,
                defaultHeaders: {
                    Accept: "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
            });
            return {
                description: "Search the web using OmniRoute's multi-provider search endpoint. " +
                    "Returns titles, URLs, snippets, and content for each result. " +
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
                execute: async (args) => {
                    const query = String(args.query ?? "").trim();
                    if (!query) {
                        return { error: "Search query is required." };
                    }
                    if (!apiKey) {
                        return { error: "OmniRoute API key is not configured." };
                    }
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
                        body.freshness = freshness;
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
                        ssrfPolicy: http.ssrfPolicy,
                        dispatcherPolicy: http.dispatcherPolicy,
                    });
                    try {
                        await assertOmniRouteOk(request.response, "OmniRoute web search failed");
                        const payload = await readOmniRouteJson(request.response, "omniroute.web-search");
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
                                    content: item.content ? String(item.content) : undefined,
                                    publishedAt: item.published_at ? String(item.published_at) : undefined,
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