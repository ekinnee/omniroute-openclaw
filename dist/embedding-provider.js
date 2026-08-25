import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input-runtime";
import { OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
import { resolveOmniRouteApiKey } from "./auth.js";
import { resolveOmniRouteBaseUrl } from "./base-url.js";
import { assertOmniRouteOk, postOmniRouteJson, readOmniRouteJson, resolveOmniRouteHttpRequestConfig, } from "./http.js";
function requireEmbeddingModel(model) {
    const normalized = model.trim();
    if (!normalized) {
        throw new Error("OmniRoute embeddings require an explicit embedding model. Set agents.*.memorySearch.model to a model advertised by OmniRoute's /v1/models endpoint.");
    }
    return normalized;
}
function readProviderConfig(options) {
    return options.config.models?.providers?.[OMNIROUTE_PROVIDER_ID];
}
function readBaseUrl(options) {
    return resolveOmniRouteBaseUrl({
        config: options.config,
        overrideBaseUrl: options.remote?.baseUrl,
    });
}
function readRemoteApiKey(options) {
    return normalizeResolvedSecretInputString({
        value: options.remote?.apiKey,
        path: "agents.*.memorySearch.remote.apiKey",
    });
}
function buildCacheKeyData(options) {
    const baseUrl = readBaseUrl(options);
    return {
        provider: OMNIROUTE_PROVIDER_ID,
        baseUrl,
        model: options.model,
        ...(typeof options.dimensions === "number" ? { dimensions: options.dimensions } : {}),
        ...(options.inputType ? { inputType: options.inputType } : {}),
        ...(options.queryInputType ? { queryInputType: options.queryInputType } : {}),
        ...(options.documentInputType ? { documentInputType: options.documentInputType } : {}),
    };
}
function normalizeEmbeddingInput(input) {
    if (typeof input === "string") {
        return input;
    }
    if (!input.parts || input.parts.length === 0) {
        return input.text;
    }
    const textParts = [];
    for (const part of input.parts) {
        if (part.type !== "text") {
            throw new Error("OmniRoute embeddings do not support inline-data input parts");
        }
        textParts.push(part.text);
    }
    return textParts.join("");
}
function resolveEmbeddingInputType(options, requested) {
    if (requested === "query") {
        return options.queryInputType ?? options.inputType;
    }
    if (requested === "document") {
        return options.documentInputType ?? options.inputType;
    }
    return options.inputType;
}
function parseEmbeddingVectors(payload, expectedCount) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
        throw new Error("OmniRoute embeddings response missing data");
    }
    const data = payload.data
        .map((item, index) => {
        if (!item || typeof item !== "object") {
            throw new Error(`OmniRoute embeddings response item ${index} malformed`);
        }
        const embedding = item.embedding;
        if (!Array.isArray(embedding) || !embedding.every((value) => typeof value === "number")) {
            throw new Error(`OmniRoute embeddings response item ${index} missing embedding`);
        }
        return {
            index: typeof item.index === "number"
                ? item.index
                : index,
            embedding,
        };
    })
        .sort((left, right) => left.index - right.index);
    if (data.length !== expectedCount) {
        throw new Error(`OmniRoute embeddings response returned ${data.length} vectors for ${expectedCount} inputs`);
    }
    return data.map((item) => item.embedding);
}
async function requestEmbeddings(options, inputs, callOptions) {
    const apiKey = readRemoteApiKey(options) ?? (await resolveOmniRouteApiKey({
        cfg: options.config,
        agentDir: options.agentDir,
    }));
    if (!apiKey) {
        throw new Error("OmniRoute API key missing");
    }
    const providerConfig = readProviderConfig(options);
    const http = resolveOmniRouteHttpRequestConfig({
        baseUrl: readBaseUrl(options),
        defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
        request: providerConfig?.request,
        defaultHeaders: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
    });
    const headers = new Headers(http.headers);
    for (const [key, value] of Object.entries(options.remote?.headers ?? {})) {
        if (key.trim().toLowerCase() === "authorization") {
            continue;
        }
        headers.set(key, value);
    }
    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const body = {
        model: requireEmbeddingModel(options.model),
        input: inputs.map(normalizeEmbeddingInput),
    };
    if (typeof options.dimensions === "number") {
        body.dimensions = options.dimensions;
    }
    const inputType = resolveEmbeddingInputType(options, callOptions?.inputType);
    if (inputType) {
        body.input_type = inputType;
    }
    const request = await postOmniRouteJson({
        url: `${http.baseUrl}/embeddings`,
        headers,
        body,
        signal: callOptions?.signal,
        timeoutMs: inputs.length > 1 ? 600_000 : undefined,
        ssrfPolicy: http.ssrfPolicy,
        dispatcherPolicy: http.dispatcherPolicy,
    });
    try {
        await assertOmniRouteOk(request.response, "OmniRoute embeddings failed");
        return parseEmbeddingVectors(await readOmniRouteJson(request.response, "omniroute.embeddings"), inputs.length);
    }
    finally {
        await request.release();
    }
}
async function createOmniRouteEmbeddingProvider(options) {
    const model = requireEmbeddingModel(options.model);
    const provider = {
        id: OMNIROUTE_PROVIDER_ID,
        model,
        ...(typeof options.dimensions === "number" ? { dimensions: options.dimensions } : {}),
        embed: async (input, callOptions) => (await requestEmbeddings(options, [input], callOptions))[0] ?? [],
        embedBatch: async (inputs, callOptions) => {
            if (inputs.length === 0) {
                return [];
            }
            return await requestEmbeddings(options, inputs, callOptions);
        },
    };
    return {
        provider,
        runtime: {
            id: OMNIROUTE_PROVIDER_ID,
            cacheKeyData: buildCacheKeyData({ ...options, model }),
            inlineBatchTimeoutMs: 600_000,
        },
    };
}
export const omniRouteEmbeddingProviderAdapter = {
    id: OMNIROUTE_PROVIDER_ID,
    transport: "remote",
    authProviderId: OMNIROUTE_PROVIDER_ID,
    resolveIndexIdentity: (options) => ({
        model: requireEmbeddingModel(options.model),
        cacheKeyData: buildCacheKeyData({
            ...options,
            model: requireEmbeddingModel(options.model),
        }),
    }),
    create: createOmniRouteEmbeddingProvider,
};
//# sourceMappingURL=embedding-provider.js.map