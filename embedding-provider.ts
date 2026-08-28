// OmniRoute embedding provider registration using only public SDK contracts.
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input-runtime";
import {
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";
import { resolveOmniRouteApiKey } from "./auth.js";
import { resolveOmniRouteBaseUrl } from "./base-url.js";
import {
  assertOmniRouteOk,
  OMNIROUTE_JSON_READ_OPTIONS,
  postOmniRouteJson,
  readOmniRouteJson,
  resolveOmniRouteHttpRequestConfig,
} from "./http.js";

type EmbeddingProviderAdapter = Parameters<OpenClawPluginApi["registerEmbeddingProvider"]>[0];
type EmbeddingProviderCreateOptions = Parameters<EmbeddingProviderAdapter["create"]>[0];
type EmbeddingProviderCreateResult = Awaited<ReturnType<EmbeddingProviderAdapter["create"]>>;
type EmbeddingProvider = NonNullable<EmbeddingProviderCreateResult["provider"]>;
type EmbeddingInput = Parameters<EmbeddingProvider["embed"]>[0];
type EmbeddingCallOptions = NonNullable<Parameters<EmbeddingProvider["embed"]>[1]>;

function requireEmbeddingModel(model: string): string {
  const normalized = model.trim();
  if (!normalized) {
    throw new Error(
      "OmniRoute embeddings require an explicit embedding model. Set agents.*.memorySearch.model to a model advertised by OmniRoute's /v1/models endpoint.",
    );
  }
  return normalized;
}

function readProviderConfig(options: EmbeddingProviderCreateOptions) {
  return options.config.models?.providers?.[OMNIROUTE_PROVIDER_ID];
}

function readBaseUrl(options: EmbeddingProviderCreateOptions): string {
  return resolveOmniRouteBaseUrl({
    config: options.config,
    overrideBaseUrl: options.remote?.baseUrl,
  });
}

function readRemoteApiKey(options: EmbeddingProviderCreateOptions): string | undefined {
  return normalizeResolvedSecretInputString({
    value: options.remote?.apiKey,
    path: "agents.*.memorySearch.remote.apiKey",
  });
}

function buildCacheKeyData(options: EmbeddingProviderCreateOptions): Record<string, unknown> {
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

function normalizeEmbeddingInput(input: EmbeddingInput): string {
  if (typeof input === "string") {
    return input;
  }
  if (!input.parts || input.parts.length === 0) {
    return input.text;
  }
  const textParts: string[] = [];
  for (const part of input.parts) {
    if (part.type !== "text") {
      throw new Error("OmniRoute embeddings do not support inline-data input parts");
    }
    textParts.push(part.text);
  }
  return textParts.join("");
}

function resolveEmbeddingInputType(
  options: EmbeddingProviderCreateOptions,
  requested: EmbeddingCallOptions["inputType"] | undefined,
): string | undefined {
  if (requested === "query") {
    return options.queryInputType ?? options.inputType;
  }
  if (requested === "document") {
    return options.documentInputType ?? options.inputType;
  }
  return options.inputType;
}

function parseEmbeddingVectors(payload: unknown, expectedCount: number): number[][] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("OmniRoute embeddings response missing data");
  }
  const data: Array<{ index: number; embedding: number[] }> = (payload as { data: unknown[] }).data
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error(`OmniRoute embeddings response item ${index} malformed`);
      }
      const embedding = (item as { embedding?: unknown }).embedding;
      if (!Array.isArray(embedding) || !embedding.every((value) => typeof value === "number")) {
        throw new Error(`OmniRoute embeddings response item ${index} missing embedding`);
      }
      return {
        index: typeof (item as { index?: unknown }).index === "number"
          ? (item as { index: number }).index
          : index,
        embedding,
      };
    });
  if (data.length !== expectedCount) {
    throw new Error(
      `OmniRoute embeddings response returned ${data.length} vectors for ${expectedCount} inputs`,
    );
  }
  const vectors = new Map<number, number[]>();
  for (const item of data) {
    if (!Number.isSafeInteger(item.index) || item.index < 0 || item.index >= expectedCount) {
      throw new Error(`OmniRoute embeddings response has invalid index ${item.index}`);
    }
    if (vectors.has(item.index)) {
      throw new Error(`OmniRoute embeddings response has duplicate vector index ${item.index}`);
    }
    vectors.set(item.index, item.embedding);
  }
  return Array.from({ length: expectedCount }, (_, index) => {
    const embedding = vectors.get(index);
    if (!embedding) {
      throw new Error(`OmniRoute embeddings response missing vector index ${index}`);
    }
    return embedding;
  });
}

async function requestEmbeddings(
  options: EmbeddingProviderCreateOptions,
  inputs: EmbeddingInput[],
  callOptions?: EmbeddingCallOptions,
): Promise<number[][]> {
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

  const body: Record<string, unknown> = {
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
    return parseEmbeddingVectors(
      await readOmniRouteJson(
        request.response,
        "omniroute.embeddings",
        OMNIROUTE_JSON_READ_OPTIONS.embeddings,
      ),
      inputs.length,
    );
  } finally {
    await request.release();
  }
}

async function createOmniRouteEmbeddingProvider(
  options: EmbeddingProviderCreateOptions,
): Promise<EmbeddingProviderCreateResult> {
  const model = requireEmbeddingModel(options.model);
  const provider: EmbeddingProvider = {
    id: OMNIROUTE_PROVIDER_ID,
    model,
    ...(typeof options.dimensions === "number" ? { dimensions: options.dimensions } : {}),
    embed: async (input, callOptions) =>
      (await requestEmbeddings(options, [input], callOptions))[0] ?? [],
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

export const omniRouteEmbeddingProviderAdapter: EmbeddingProviderAdapter = {
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
