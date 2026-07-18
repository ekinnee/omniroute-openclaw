import { getCachedLiveCatalogValue } from "openclaw/plugin-sdk/provider-catalog-shared";
import { OMNIROUTE_BASE_URL_ENV_VAR, buildOmniRouteDefaultModel, OMNIROUTE_DEFAULT_BASE_URL, } from "./models.js";
export function buildOmniRouteProvider(baseUrl = OMNIROUTE_DEFAULT_BASE_URL) {
    return {
        baseUrl: normalizeBaseUrl(baseUrl),
        api: "openai-completions",
        models: [buildOmniRouteDefaultModel()],
    };
}
const CHAT_MODEL_TYPES = new Set(["chat", "text", "llm", "language"]);
const EMBEDDING_MODEL_TYPES = new Set(["embedding", "embeddings"]);
const NON_CHAT_MODEL_TYPES = new Set([
    "embedding",
    "image",
    "rerank",
    "audio",
    "moderation",
    "video",
    "music",
]);
const CHAT_ENDPOINTS = new Set(["chat", "chat-completions", "chat_completions"]);
const EMBEDDING_ENDPOINTS = new Set(["embedding", "embeddings"]);
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function readPositiveNumber(...values) {
    for (const value of values) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return undefined;
}
function normalizeBaseUrl(value) {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim().replace(/\/+$/, "")
        : OMNIROUTE_DEFAULT_BASE_URL;
}
function resolveConfiguredBaseUrl(ctx) {
    const config = ctx.config;
    const provider = config.models?.providers?.omniroute;
    const configuredBaseUrl = normalizeBaseUrl(provider?.baseUrl);
    const envBaseUrl = ctx.env[OMNIROUTE_BASE_URL_ENV_VAR];
    if (configuredBaseUrl !== OMNIROUTE_DEFAULT_BASE_URL) {
        return configuredBaseUrl;
    }
    return normalizeBaseUrl(envBaseUrl ?? configuredBaseUrl);
}
function hasCapability(entry, key) {
    if (!isRecord(entry.capabilities)) {
        return false;
    }
    return entry.capabilities[key] === true;
}
function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}
function normalizeInputModalities(entry) {
    const input = normalizeStringArray(entry.input_modalities);
    const hasImageInput = input.includes("image") ||
        hasCapability(entry, "vision") ||
        hasCapability(entry, "attachment");
    return hasImageInput ? ["text", "image"] : ["text"];
}
function isChatModelEntry(entry) {
    const outputModalities = normalizeStringArray(entry.output_modalities);
    if (outputModalities.length > 0 && !outputModalities.includes("text")) {
        return false;
    }
    const endpoints = normalizeStringArray(entry.supported_endpoints);
    if (endpoints.length > 0) {
        return endpoints.some((endpoint) => CHAT_ENDPOINTS.has(endpoint));
    }
    if (typeof entry.type !== "string" || entry.type.trim().length === 0) {
        return true;
    }
    const type = entry.type.trim().toLowerCase();
    if (NON_CHAT_MODEL_TYPES.has(type)) {
        return false;
    }
    return CHAT_MODEL_TYPES.has(type);
}
function isEmbeddingModelEntry(entry) {
    const endpoints = normalizeStringArray(entry.supported_endpoints);
    if (endpoints.length > 0) {
        return endpoints.some((endpoint) => EMBEDDING_ENDPOINTS.has(endpoint));
    }
    if (typeof entry.type !== "string" || entry.type.trim().length === 0) {
        return false;
    }
    return EMBEDDING_MODEL_TYPES.has(entry.type.trim().toLowerCase());
}
export function buildOmniRouteModelFromCatalogEntry(entry) {
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || !isChatModelEntry(entry)) {
        return null;
    }
    return {
        id,
        name: (typeof entry.name === "string" && entry.name.trim()) ||
            (typeof entry.root === "string" && entry.root.trim()) ||
            id,
        reasoning: hasCapability(entry, "reasoning") || hasCapability(entry, "thinking") || id.startsWith("auto"),
        input: normalizeInputModalities(entry),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: readPositiveNumber(entry.context_length, entry.max_input_tokens, entry.contextWindow) ??
            128_000,
        maxTokens: readPositiveNumber(entry.max_output_tokens, entry.maxOutputTokens) ?? 16_384,
        compat: {
            supportsUsageInStreaming: true,
            supportsTools: hasCapability(entry, "tool_calling") || undefined,
        },
    };
}
export function buildOmniRouteEmbeddingModelFromCatalogEntry(entry) {
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || !isEmbeddingModelEntry(entry)) {
        return null;
    }
    const maxInputTokens = readPositiveNumber(entry.max_input_tokens, entry.context_length, entry.contextWindow);
    const dimensions = readPositiveNumber(entry.dimensions, entry.embedding_dimensions, entry.output_dimensions);
    return {
        id,
        name: (typeof entry.name === "string" && entry.name.trim()) ||
            (typeof entry.root === "string" && entry.root.trim()) ||
            id,
        ...(maxInputTokens ? { maxInputTokens } : {}),
        ...(dimensions ? { dimensions } : {}),
    };
}
export async function fetchOmniRouteChatModels(params) {
    const headers = {
        Accept: "application/json",
    };
    if (params.apiKey) {
        headers.Authorization = `Bearer ${params.apiKey}`;
    }
    const response = await fetch(`${normalizeBaseUrl(params.baseUrl)}/models`, {
        headers,
        signal: params.signal,
    });
    if (!response.ok) {
        throw new Error(`OmniRoute model catalog request failed with HTTP ${response.status}`);
    }
    const payload = (await response.json());
    if (!Array.isArray(payload.data)) {
        throw new Error("OmniRoute model catalog response did not include a data array");
    }
    const seen = new Set();
    const models = [];
    for (const rawEntry of payload.data) {
        if (!isRecord(rawEntry)) {
            continue;
        }
        const model = buildOmniRouteModelFromCatalogEntry(rawEntry);
        if (!model || seen.has(model.id)) {
            continue;
        }
        seen.add(model.id);
        models.push(model);
    }
    return models;
}
export async function fetchOmniRouteEmbeddingModels(params) {
    const headers = {
        Accept: "application/json",
    };
    if (params.apiKey) {
        headers.Authorization = `Bearer ${params.apiKey}`;
    }
    const response = await fetch(`${normalizeBaseUrl(params.baseUrl)}/models`, {
        headers,
        signal: params.signal,
    });
    if (!response.ok) {
        throw new Error(`OmniRoute embedding model catalog request failed with HTTP ${response.status}`);
    }
    const payload = (await response.json());
    if (!Array.isArray(payload.data)) {
        throw new Error("OmniRoute model catalog response did not include a data array");
    }
    const seen = new Set();
    const models = [];
    for (const rawEntry of payload.data) {
        if (!isRecord(rawEntry)) {
            continue;
        }
        const model = buildOmniRouteEmbeddingModelFromCatalogEntry(rawEntry);
        if (!model || seen.has(model.id)) {
            continue;
        }
        seen.add(model.id);
        models.push(model);
    }
    return models;
}
export async function buildLiveOmniRouteProvider(ctx) {
    const baseUrl = resolveConfiguredBaseUrl(ctx);
    const auth = ctx.resolveProviderAuth("omniroute");
    const apiKey = auth.discoveryApiKey ?? auth.apiKey;
    try {
        return {
            baseUrl,
            api: "openai-completions",
            models: await getCachedLiveCatalogValue({
                keyParts: ["omniroute", "chat-models", baseUrl, auth.mode, auth.source, Boolean(apiKey)],
                load: () => fetchOmniRouteChatModels({
                    baseUrl,
                    apiKey,
                }),
                shouldCache: (models) => models.length > 0,
            }),
        };
    }
    catch {
        return {
            ...buildOmniRouteProvider(baseUrl),
            baseUrl,
        };
    }
}
//# sourceMappingURL=provider-catalog.js.map