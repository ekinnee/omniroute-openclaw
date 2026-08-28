import { createHash } from "node:crypto";
import { OMNIROUTE_DEFAULT_BASE_URL, } from "./models.js";
import { resolveOmniRouteApiKey } from "./auth.js";
import { redactOmniRouteBaseUrl, resolveOmniRouteBaseUrl } from "./base-url.js";
import { assertOmniRouteOk, getOmniRouteJson, OMNIROUTE_JSON_READ_OPTIONS, readOmniRouteJson, resolveOmniRouteHttpRequestConfig, } from "./http.js";
const liveCatalogCache = new Map();
const LIVE_CATALOG_TTL_MS = 30_000;
const LIVE_CATALOG_TIMEOUT_MS = 5_000;
function deleteLiveCatalogCacheEntryIfCurrent(key, entry) {
    if (liveCatalogCache.get(key) === entry) {
        liveCatalogCache.delete(key);
    }
}
function pruneExpiredLiveCatalogCacheEntries(now) {
    for (const [key, entry] of liveCatalogCache) {
        if (entry.expiresAt <= now) {
            deleteLiveCatalogCacheEntryIfCurrent(key, entry);
        }
    }
}
function getCachedLiveCatalogValue(params) {
    const now = Date.now();
    pruneExpiredLiveCatalogCacheEntries(now);
    const existing = liveCatalogCache.get(params.key);
    if (existing && existing.expiresAt > now) {
        return existing.value;
    }
    const value = params.load();
    const entry = { expiresAt: now + LIVE_CATALOG_TTL_MS, value };
    liveCatalogCache.set(params.key, entry);
    void value.then((resolved) => {
        if (params.shouldCache && !params.shouldCache(resolved)) {
            deleteLiveCatalogCacheEntryIfCurrent(params.key, entry);
        }
    }, () => deleteLiveCatalogCacheEntryIfCurrent(params.key, entry));
    return value;
}
const CHAT_MODEL_TYPES = new Set(["chat", "text", "llm", "language"]);
const EMBEDDING_MODEL_TYPES = new Set(["embedding", "embeddings"]);
const IMAGE_MODEL_TYPES = new Set(["image", "images"]);
const NON_CHAT_MODEL_TYPES = new Set([
    "embedding",
    "image",
    "rerank",
    "audio",
    "moderation",
    "video",
    "music",
]);
const CHAT_ENDPOINTS = new Set([
    "chat",
    "chat-completions",
    "chat_completions",
    "/v1/chat/completions",
    "/api/v1/chat/completions",
]);
const EMBEDDING_ENDPOINTS = new Set(["embedding", "embeddings"]);
const IMAGE_ENDPOINTS = new Set(["image", "images", "image-generation", "image_generation"]);
const OMNIROUTE_CANONICAL_EFFORTS = ["none", "low", "medium", "high", "xhigh"];
const OPENCLAW_THINKING_LEVELS = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
];
const SUPPORTED_EFFORT_VALUES = new Set([
    ...OMNIROUTE_CANONICAL_EFFORTS,
    "minimal",
    "max",
]);
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
function hasCapability(entry, key) {
    if (!isRecord(entry.capabilities)) {
        return false;
    }
    return entry.capabilities[key] === true;
}
function readCapabilityBoolean(entry, key) {
    if (!isRecord(entry.capabilities)) {
        return undefined;
    }
    const value = entry.capabilities[key];
    return typeof value === "boolean" ? value : undefined;
}
function normalizeReasoningEfforts(value) {
    const efforts = normalizeStringArray(value);
    return [...new Set(efforts.filter((effort) => SUPPORTED_EFFORT_VALUES.has(effort)))];
}
function resolveReasoningCapabilities(entry) {
    const capabilities = isRecord(entry.capabilities) ? entry.capabilities : undefined;
    const explicitThinking = readCapabilityBoolean(entry, "supportsThinking") ??
        readCapabilityBoolean(entry, "thinking");
    const hasEffortTiers = capabilities !== undefined && Object.prototype.hasOwnProperty.call(capabilities, "effort_tiers");
    const explicitEfforts = hasEffortTiers
        ? normalizeReasoningEfforts(capabilities.effort_tiers)
        : [];
    const controllable = explicitThinking === false ? false : explicitThinking === true || explicitEfforts.length > 0;
    const supportedEfforts = controllable
        ? hasEffortTiers
            ? explicitEfforts
            : [...OMNIROUTE_CANONICAL_EFFORTS]
        : [];
    return {
        reasoning: hasCapability(entry, "reasoning") || controllable,
        supportedEfforts,
    };
}
function buildThinkingLevelMap(supportedEfforts) {
    const efforts = new Set(supportedEfforts);
    // OpenClaw exposes several reasoning levels by default for reasoning models.
    // Explicit nulls keep the selector limited to capabilities OmniRoute actually advertised.
    return Object.fromEntries(OPENCLAW_THINKING_LEVELS.map((level) => {
        const providerEffort = level === "off" ? "none" : level;
        return [level, efforts.has(providerEffort) ? providerEffort : null];
    }));
}
function fingerprintCredential(apiKey) {
    return apiKey
        ? createHash("sha256").update(apiKey).digest("hex")
        : "none";
}
function fingerprintLiveCatalogRequest(request) {
    return createHash("sha256")
        .update(JSON.stringify({
        headers: Array.from(request.headers.entries()).sort(([leftName, leftValue], [rightName, rightValue]) => leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue)),
        ssrfPolicy: request.ssrfPolicy,
        dispatcherPolicy: request.dispatcherPolicy,
    }))
        .digest("hex");
}
function resolveOmniRouteCatalogHttpRequest(params) {
    return resolveOmniRouteHttpRequestConfig({
        baseUrl: params.baseUrl,
        defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
        request: params.request,
        defaultHeaders: {
            Accept: "application/json",
            ...(params.apiKey ? { Authorization: `Bearer ${params.apiKey}` } : {}),
        },
    });
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
function normalizeTrimmedStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
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
function isImageModelEntry(entry) {
    const outputModalities = normalizeStringArray(entry.output_modalities);
    if (outputModalities.length > 0 && !outputModalities.includes("image")) {
        return false;
    }
    const endpoints = normalizeStringArray(entry.supported_endpoints);
    if (endpoints.length > 0) {
        return endpoints.some((endpoint) => IMAGE_ENDPOINTS.has(endpoint));
    }
    if (typeof entry.type !== "string" || entry.type.trim().length === 0) {
        return false;
    }
    return IMAGE_MODEL_TYPES.has(entry.type.trim().toLowerCase());
}
function buildOmniRouteModelFromCatalogEntry(entry) {
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || !isChatModelEntry(entry)) {
        return null;
    }
    const reasoningCapabilities = resolveReasoningCapabilities(entry);
    const hasReasoningControls = reasoningCapabilities.supportedEfforts.length > 0;
    return {
        id,
        name: (typeof entry.name === "string" && entry.name.trim()) ||
            (typeof entry.root === "string" && entry.root.trim()) ||
            id,
        reasoning: reasoningCapabilities.reasoning,
        input: normalizeInputModalities(entry),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: readPositiveNumber(entry.context_length, entry.max_input_tokens, entry.contextWindow) ??
            128_000,
        maxTokens: readPositiveNumber(entry.max_output_tokens, entry.maxOutputTokens) ?? 16_384,
        ...(reasoningCapabilities.reasoning
            ? { thinkingLevelMap: buildThinkingLevelMap(reasoningCapabilities.supportedEfforts) }
            : {}),
        compat: {
            ...(hasReasoningControls
                ? {
                    supportsReasoningEffort: true,
                    supportedReasoningEfforts: reasoningCapabilities.supportedEfforts,
                }
                : {}),
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
export function buildOmniRouteImageModelFromCatalogEntry(entry) {
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || !isImageModelEntry(entry)) {
        return null;
    }
    return {
        id,
        name: (typeof entry.name === "string" && entry.name.trim()) ||
            (typeof entry.root === "string" && entry.root.trim()) ||
            id,
        supportedSizes: normalizeTrimmedStringArray(entry.supported_sizes),
        inputModalities: normalizeTrimmedStringArray(entry.input_modalities),
    };
}
function buildOmniRouteModels(payload, builder) {
    if (!Array.isArray(payload.data)) {
        throw new Error("OmniRoute model catalog response did not include a data array");
    }
    const seen = new Set();
    const models = [];
    for (const rawEntry of payload.data) {
        if (!isRecord(rawEntry))
            continue;
        const model = builder(rawEntry);
        if (!model || seen.has(model.id))
            continue;
        seen.add(model.id);
        models.push(model);
    }
    return models;
}
async function fetchOmniRouteModels(params, builder, errorLabel) {
    const http = params.http ?? resolveOmniRouteCatalogHttpRequest(params);
    const { response, release } = await getOmniRouteJson({
        url: `${http.baseUrl}/models`,
        headers: http.headers,
        signal: params.signal,
        timeoutMs: LIVE_CATALOG_TIMEOUT_MS,
        ssrfPolicy: http.ssrfPolicy,
        dispatcherPolicy: http.dispatcherPolicy,
    });
    try {
        await assertOmniRouteOk(response, `OmniRoute ${errorLabel} model catalog`);
        return buildOmniRouteModels((await readOmniRouteJson(response, `OmniRoute ${errorLabel} model catalog`, OMNIROUTE_JSON_READ_OPTIONS.catalog)), builder);
    }
    finally {
        await release();
    }
}
export async function fetchOmniRouteChatModels(params) {
    return fetchOmniRouteModels(params, buildOmniRouteModelFromCatalogEntry, "chat");
}
export async function fetchOmniRouteEmbeddingModels(params) {
    return fetchOmniRouteModels(params, buildOmniRouteEmbeddingModelFromCatalogEntry, "embedding");
}
export async function fetchOmniRouteImageModels(params) {
    return fetchOmniRouteModels(params, buildOmniRouteImageModelFromCatalogEntry, "image");
}
function redactLiveDiscoveryError(error) {
    return error instanceof Error
        ? error.message.replace(/[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/giu, redactOmniRouteBaseUrl)
        : "unknown error";
}
export function resolveOmniRouteCatalogCredentials(params) {
    // The host's lightweight catalog resolver currently selects profile entries
    // by store order. Resolve profile-backed auth through the full public auth
    // path so both discovery and runtime honor the configured profile order.
    if (params.auth.source === "profile") {
        return (params.resolveConcreteApiKey ?? resolveOmniRouteApiKey)({
            cfg: params.config,
            agentDir: params.agentDir,
            workspaceDir: params.workspaceDir,
        }).then((concreteApiKey) => concreteApiKey
            ? { runtimeApiKey: concreteApiKey, discoveryApiKey: concreteApiKey }
            : null);
    }
    // The auth resolver preserves provenance and can report no configured key;
    // fall back to the host's configured-key resolver when it does.
    const resolvedApiKey = params.resolveConfiguredApiKey?.("omniroute");
    const fallbackRuntimeApiKey = params.auth.apiKey ?? resolvedApiKey?.apiKey;
    const fallbackDiscoveryApiKey = params.auth.discoveryApiKey ?? resolvedApiKey?.discoveryApiKey ?? fallbackRuntimeApiKey;
    return fallbackRuntimeApiKey && fallbackDiscoveryApiKey
        ? { runtimeApiKey: fallbackRuntimeApiKey, discoveryApiKey: fallbackDiscoveryApiKey }
        : null;
}
export async function buildLiveOmniRouteProvider(ctx) {
    const baseUrl = resolveOmniRouteBaseUrl({ config: ctx.config, env: ctx.env });
    const request = ctx.config.models?.providers?.omniroute?.request;
    const auth = ctx.resolveProviderAuth("omniroute");
    try {
        const credentialsOrPromise = resolveOmniRouteCatalogCredentials({
            auth,
            config: ctx.config,
            agentDir: ctx.agentDir,
            workspaceDir: ctx.workspaceDir,
            resolveConfiguredApiKey: ctx.resolveProviderApiKey,
        });
        const credentials = credentialsOrPromise instanceof Promise
            ? await credentialsOrPromise
            : credentialsOrPromise;
        if (!credentials) {
            return null;
        }
        const { runtimeApiKey, discoveryApiKey } = credentials;
        const http = resolveOmniRouteCatalogHttpRequest({
            baseUrl,
            apiKey: discoveryApiKey,
            request,
        });
        const models = await getCachedLiveCatalogValue({
            key: JSON.stringify([
                "omniroute",
                "chat-models",
                baseUrl,
                auth.mode,
                auth.source,
                auth.profileId ?? "none",
                fingerprintCredential(discoveryApiKey),
                fingerprintLiveCatalogRequest(http),
            ]),
            load: () => fetchOmniRouteModels({
                baseUrl,
                apiKey: discoveryApiKey,
                http,
            }, buildOmniRouteModelFromCatalogEntry, "chat"),
            shouldCache: (resolved) => resolved.length > 0,
        });
        if (models.length === 0) {
            return null;
        }
        return {
            baseUrl,
            api: "openai-completions",
            apiKey: runtimeApiKey,
            models,
        };
    }
    catch (err) {
        console.warn(`[omniroute] Live model discovery failed (${redactOmniRouteBaseUrl(baseUrl)}): ${redactLiveDiscoveryError(err)}`);
        return null;
    }
}
export async function buildOmniRouteCatalog(ctx) {
    const provider = await buildLiveOmniRouteProvider(ctx);
    if (!provider) {
        return null;
    }
    return {
        provider,
    };
}
//# sourceMappingURL=provider-catalog.js.map