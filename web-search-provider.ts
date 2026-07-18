// OmniRoute web search provider registration.
import type { WebSearchProviderPlugin } from "openclaw/plugin-sdk/provider-web-search";
import {
  assertOkOrThrowHttpError,
  postJsonRequest,
  readProviderJsonResponse,
  resolveProviderHttpRequestConfig,
  sanitizeConfiguredModelProviderRequest,
} from "openclaw/plugin-sdk/provider-http";
import {
  OMNIROUTE_API_KEY_ENV_VAR,
  OMNIROUTE_BASE_URL_ENV_VAR,
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_LABEL,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

const MAX_SEARCH_COUNT = 10;
const DEFAULT_SEARCH_COUNT = 5;

function resolveSearchCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.min(Math.trunc(value), MAX_SEARCH_COUNT);
  }
  return DEFAULT_SEARCH_COUNT;
}

function resolveFreshness(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["day", "week", "month", "year"].includes(normalized)) {
    return normalized;
  }
  return undefined;
}

export function createOmniRouteWebSearchProvider(): WebSearchProviderPlugin {
  return {
    id: OMNIROUTE_PROVIDER_ID,
    label: OMNIROUTE_LABEL,
    hint: "Search the web using OmniRoute's multi-provider search endpoint. Supports freshness filtering and region-specific results.",
    envVars: [OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_BASE_URL_ENV_VAR],
    placeholder: "Search the web via OmniRoute",
    signupUrl: "",
    credentialPath: `models.providers.${OMNIROUTE_PROVIDER_ID}.apiKey`,
    getCredentialValue: (searchConfig) => {
      const cfg = searchConfig as Record<string, unknown> | undefined;
      return cfg?.apiKey;
    },
    setCredentialValue: (searchConfigTarget, value) => {
      const target = searchConfigTarget as Record<string, unknown>;
      target.apiKey = value;
    },
    createTool: (ctx) => {
      // Resolve API key from search config or env
      const searchConfig = ctx.searchConfig as Record<string, unknown> | undefined;
      const apiKey =
        (searchConfig?.apiKey as string) ??
        process.env[OMNIROUTE_API_KEY_ENV_VAR] ??
        "";

      // Resolve base URL from provider config
      const providerConfig = ctx.config?.models?.providers?.[OMNIROUTE_PROVIDER_ID];
      const configuredBaseUrl = providerConfig?.baseUrl;
      const baseUrl = typeof configuredBaseUrl === "string" && configuredBaseUrl.trim()
        ? configuredBaseUrl.trim().replace(/\/+$/, "")
        : OMNIROUTE_DEFAULT_BASE_URL;

      const { baseUrl: resolvedBaseUrl, allowPrivateNetwork, headers, dispatcherPolicy } =
        resolveProviderHttpRequestConfig({
          baseUrl,
          defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
          request: sanitizeConfiguredModelProviderRequest(providerConfig?.request),
          defaultHeaders: {
            Authorization: `Bearer ${apiKey}`,
          },
          provider: OMNIROUTE_PROVIDER_ID,
          capability: "other",
          transport: "http",
        });

      return {
        description:
          "Search the web using OmniRoute's multi-provider search endpoint. " +
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
              description:
                "Filter by time: 'day' (24h), 'week', 'month', or 'year'.",
              enum: ["day", "week", "month", "year"],
            },
            country: {
              type: "string",
              description:
                "2-letter country code for region-specific results (e.g., 'DE', 'US').",
            },
            language: {
              type: "string",
              description:
                "ISO 639-1 language code for results (e.g., 'en', 'de', 'fr').",
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

          const count = resolveSearchCount(args.count);
          const freshness = resolveFreshness(typeof args.freshness === "string" ? args.freshness : undefined);

          const requestHeaders = new Headers(headers);
          if (!requestHeaders.has("Content-Type")) {
            requestHeaders.set("Content-Type", "application/json");
          }

          const body: Record<string, unknown> = {
            model: "auto",
            query,
            max_results: count,
          };
          if (freshness) {
            body.freshness = freshness;
          }

          const request = await postJsonRequest({
            url: `${resolvedBaseUrl.replace(/\/+$/, "")}/search`,
            headers: requestHeaders,
            body,
            timeoutMs: 30_000,
            fetchFn: fetch,
            allowPrivateNetwork,
            dispatcherPolicy,
          });

          const { response, release } = request;
          try {
            await assertOkOrThrowHttpError(response, "OmniRoute web search failed");
            const payload = (await readProviderJsonResponse(
              response,
              "omniroute.web-search",
            )) as Record<string, unknown>;

            const rawResults = payload.results;
            const results = Array.isArray(rawResults) ? (rawResults as Array<Record<string, unknown>>) : [];
            if (results.length === 0) {
              return { results: [] };
            }

            return {
              results: results.map((r) => ({
                title: String(r.title ?? ""),
                url: String(r.url ?? ""),
                snippet: String(r.snippet ?? ""),
                content: r.content ? String(r.content) : undefined,
                publishedAt: r.published_at ? String(r.published_at) : undefined,
              })),
            };
          } finally {
            await release();
          }
        },
      };
    },
  };
}
