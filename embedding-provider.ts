// OmniRoute embedding provider registration.
import {
  getEmbeddingProvider,
  type EmbeddingProviderAdapter,
  type EmbeddingProviderCreateOptions,
  type EmbeddingProviderCreateResult,
} from "openclaw/plugin-sdk/embedding-providers";
import { OMNIROUTE_PROVIDER_ID } from "./models.js";

function requireEmbeddingModel(model: string): string {
  const normalized = model.trim();
  if (!normalized) {
    throw new Error(
      "OmniRoute embeddings require an explicit embedding model. Set agents.*.memorySearch.model to a model advertised by OmniRoute's /v1/models endpoint.",
    );
  }
  return normalized;
}

function buildDelegatedOptions(options: EmbeddingProviderCreateOptions): EmbeddingProviderCreateOptions {
  return {
    ...options,
    provider: OMNIROUTE_PROVIDER_ID,
    model: requireEmbeddingModel(options.model),
  };
}

function readIdentityBaseUrl(options: EmbeddingProviderCreateOptions): string | undefined {
  const provider = options.config.models?.providers?.[OMNIROUTE_PROVIDER_ID];
  const baseUrl = options.remote?.baseUrl ?? provider?.baseUrl;
  return typeof baseUrl === "string" && baseUrl.trim()
    ? baseUrl.trim().replace(/\/+$/, "")
    : undefined;
}

function buildFallbackCacheKeyData(
  options: EmbeddingProviderCreateOptions,
): Record<string, unknown> {
  const baseUrl = readIdentityBaseUrl(options);
  return {
    provider: OMNIROUTE_PROVIDER_ID,
    ...(baseUrl ? { baseUrl } : {}),
    model: options.model,
    ...(typeof options.dimensions === "number" ? { dimensions: options.dimensions } : {}),
    ...(options.inputType ? { inputType: options.inputType } : {}),
    ...(options.queryInputType ? { queryInputType: options.queryInputType } : {}),
    ...(options.documentInputType ? { documentInputType: options.documentInputType } : {}),
  };
}

async function createOmniRouteEmbeddingProvider(
  options: EmbeddingProviderCreateOptions,
): Promise<EmbeddingProviderCreateResult> {
  const adapter = getEmbeddingProvider("openai-compatible", options.config);
  if (!adapter) {
    throw new Error("OmniRoute embeddings require OpenClaw's openai-compatible embedding provider.");
  }

  const result = await adapter.create(buildDelegatedOptions(options));
  if (!result.provider) {
    return result;
  }

  return {
    provider: {
      ...result.provider,
      id: OMNIROUTE_PROVIDER_ID,
    },
    ...(result.runtime
      ? {
          runtime: {
            ...result.runtime,
            id: OMNIROUTE_PROVIDER_ID,
          },
        }
      : {}),
  };
}

export const omniRouteEmbeddingProviderAdapter: EmbeddingProviderAdapter = {
  id: OMNIROUTE_PROVIDER_ID,
  transport: "remote",
  authProviderId: OMNIROUTE_PROVIDER_ID,
  resolveIndexIdentity: (options) => {
    const adapter = getEmbeddingProvider("openai-compatible", options.config);
    const delegatedOptions = buildDelegatedOptions(options);
    const identity = adapter?.resolveIndexIdentity?.(delegatedOptions);
    if (identity) {
      return {
        ...identity,
        cacheKeyData: {
          ...identity.cacheKeyData,
          provider: OMNIROUTE_PROVIDER_ID,
        },
      };
    }
    return {
      model: delegatedOptions.model,
      cacheKeyData: buildFallbackCacheKeyData(delegatedOptions),
    };
  },
  create: createOmniRouteEmbeddingProvider,
};
