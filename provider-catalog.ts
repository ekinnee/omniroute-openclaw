// OmniRoute provider catalog for the bundled OpenAI-compatible proxy plugin.
import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-model-shared";
import type { ProviderCatalogContext } from "openclaw/plugin-sdk/provider-catalog-shared";
import { getCachedLiveCatalogValue } from "openclaw/plugin-sdk/provider-catalog-shared";
import { createSubsystemLogger } from "openclaw/plugin-sdk/core";
import {
  OMNIROUTE_BASE_URL_ENV_VAR,
  buildOmniRouteDefaultModel,
  OMNIROUTE_DEFAULT_BASE_URL,
} from "./models.js";

const log = createSubsystemLogger("omniroute");

export function buildOmniRouteProvider(baseUrl = OMNIROUTE_DEFAULT_BASE_URL): ModelProviderConfig {
  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    api: "openai-completions",
    models: [buildOmniRouteDefaultModel()],
  };
}

type OmniRouteModelListResponse = {
  data?: unknown;
};

type OmniRouteModelEntry = {
  id?: unknown;
  name?: unknown;
  root?: unknown;
  type?: unknown;
  supported_endpoints?: unknown;
  output_modalities?: unknown;
  context_length?: unknown;
  max_input_tokens?: unknown;
  contextWindow?: unknown;
  max_output_tokens?: unknown;
  maxOutputTokens?: unknown;
  dimensions?: unknown;
  embedding_dimensions?: unknown;
  output_dimensions?: unknown;
  input_modalities?: unknown;
  supported_sizes?: unknown;
  capabilities?: unknown;
};

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
const CHAT_ENDPOINTS = new Set(["chat", "chat-completions", "chat_completions"]);
const EMBEDDING_ENDPOINTS = new Set(["embedding", "embeddings"]);
const IMAGE_ENDPOINTS = new Set(["image", "images", "image-generation", "image_generation"]);

export type OmniRouteEmbeddingModel = {
  id: string;
  name: string;
  maxInputTokens?: number;
  dimensions?: number;
};

export type OmniRouteImageModel = {
  id: string;
  name: string;
  supportedSizes: string[];
  inputModalities: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPositiveNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

function normalizeBaseUrl(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().replace(/\/+$/, "")
    : OMNIROUTE_DEFAULT_BASE_URL;
}

function resolveConfiguredBaseUrl(ctx: ProviderCatalogContext): string {
  const config = ctx.config;
  const provider = config.models?.providers?.omniroute;
  const configuredBaseUrl = normalizeBaseUrl(provider?.baseUrl);
  const envBaseUrl = ctx.env[OMNIROUTE_BASE_URL_ENV_VAR];

  if (configuredBaseUrl !== OMNIROUTE_DEFAULT_BASE_URL) {
    return configuredBaseUrl;
  }
  return normalizeBaseUrl(envBaseUrl ?? configuredBaseUrl);
}

function hasCapability(entry: OmniRouteModelEntry, key: string): boolean {
  if (!isRecord(entry.capabilities)) {
    return false;
  }
  return entry.capabilities[key] === true;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeTrimmedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeInputModalities(entry: OmniRouteModelEntry): Array<"text" | "image"> {
  const input = normalizeStringArray(entry.input_modalities);
  const hasImageInput =
    input.includes("image") ||
    hasCapability(entry, "vision") ||
    hasCapability(entry, "attachment");
  return hasImageInput ? ["text", "image"] : ["text"];
}

function isChatModelEntry(entry: OmniRouteModelEntry): boolean {
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

function isEmbeddingModelEntry(entry: OmniRouteModelEntry): boolean {
  const endpoints = normalizeStringArray(entry.supported_endpoints);
  if (endpoints.length > 0) {
    return endpoints.some((endpoint) => EMBEDDING_ENDPOINTS.has(endpoint));
  }

  if (typeof entry.type !== "string" || entry.type.trim().length === 0) {
    return false;
  }
  return EMBEDDING_MODEL_TYPES.has(entry.type.trim().toLowerCase());
}

function isImageModelEntry(entry: OmniRouteModelEntry): boolean {
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

export function buildOmniRouteModelFromCatalogEntry(entry: OmniRouteModelEntry) {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!id || !isChatModelEntry(entry)) {
    return null;
  }

  return {
    id,
    name:
      (typeof entry.name === "string" && entry.name.trim()) ||
      (typeof entry.root === "string" && entry.root.trim()) ||
      id,
    reasoning: hasCapability(entry, "reasoning") || hasCapability(entry, "thinking") || id.startsWith("auto"),
    input: normalizeInputModalities(entry),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow:
      readPositiveNumber(entry.context_length, entry.max_input_tokens, entry.contextWindow) ??
      128_000,
    maxTokens: readPositiveNumber(entry.max_output_tokens, entry.maxOutputTokens) ?? 16_384,
    compat: {
      supportsUsageInStreaming: true,
      supportsTools: hasCapability(entry, "tool_calling") || undefined,
    },
  };
}

export function buildOmniRouteEmbeddingModelFromCatalogEntry(
  entry: OmniRouteModelEntry,
): OmniRouteEmbeddingModel | null {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!id || !isEmbeddingModelEntry(entry)) {
    return null;
  }

  const maxInputTokens = readPositiveNumber(
    entry.max_input_tokens,
    entry.context_length,
    entry.contextWindow,
  );
  const dimensions = readPositiveNumber(
    entry.dimensions,
    entry.embedding_dimensions,
    entry.output_dimensions,
  );

  return {
    id,
    name:
      (typeof entry.name === "string" && entry.name.trim()) ||
      (typeof entry.root === "string" && entry.root.trim()) ||
      id,
    ...(maxInputTokens ? { maxInputTokens } : {}),
    ...(dimensions ? { dimensions } : {}),
  };
}

export function buildOmniRouteImageModelFromCatalogEntry(
  entry: OmniRouteModelEntry,
): OmniRouteImageModel | null {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!id || !isImageModelEntry(entry)) {
    return null;
  }

  return {
    id,
    name:
      (typeof entry.name === "string" && entry.name.trim()) ||
      (typeof entry.root === "string" && entry.root.trim()) ||
      id,
    supportedSizes: normalizeTrimmedStringArray(entry.supported_sizes),
    inputModalities: normalizeTrimmedStringArray(entry.input_modalities),
  };
}

export async function fetchOmniRouteChatModels(params: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<ModelProviderConfig["models"]> {
  const headers: Record<string, string> = {
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

  const payload = (await response.json()) as OmniRouteModelListResponse;
  if (!Array.isArray(payload.data)) {
    throw new Error("OmniRoute model catalog response did not include a data array");
  }

  const seen = new Set<string>();
  const models: ModelProviderConfig["models"] = [];
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

export async function fetchOmniRouteEmbeddingModels(params: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<OmniRouteEmbeddingModel[]> {
  const headers: Record<string, string> = {
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

  const payload = (await response.json()) as OmniRouteModelListResponse;
  if (!Array.isArray(payload.data)) {
    throw new Error("OmniRoute model catalog response did not include a data array");
  }

  const seen = new Set<string>();
  const models: OmniRouteEmbeddingModel[] = [];
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

export async function fetchOmniRouteImageModels(params: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<OmniRouteImageModel[]> {
  const headers: Record<string, string> = {
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
    throw new Error(`OmniRoute image model catalog request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as OmniRouteModelListResponse;
  if (!Array.isArray(payload.data)) {
    throw new Error("OmniRoute model catalog response did not include a data array");
  }

  const seen = new Set<string>();
  const models: OmniRouteImageModel[] = [];
  for (const rawEntry of payload.data) {
    if (!isRecord(rawEntry)) {
      continue;
    }
    const model = buildOmniRouteImageModelFromCatalogEntry(rawEntry);
    if (!model || seen.has(model.id)) {
      continue;
    }
    seen.add(model.id);
    models.push(model);
  }

  return models;
}

export async function buildLiveOmniRouteProvider(
  ctx: ProviderCatalogContext,
): Promise<ModelProviderConfig> {
  const baseUrl = resolveConfiguredBaseUrl(ctx);
  const auth = ctx.resolveProviderAuth("omniroute");
  const apiKey = auth.discoveryApiKey ?? auth.apiKey;

  try {
    return {
      baseUrl,
      api: "openai-completions",
      models: await getCachedLiveCatalogValue({
        keyParts: ["omniroute", "chat-models", baseUrl, auth.mode, auth.source, Boolean(apiKey)],
        load: () =>
          fetchOmniRouteChatModels({
            baseUrl,
            apiKey,
          }),
        shouldCache: (models) => models.length > 0,
      }),
    };
  } catch (err) {
    log.warn(
      `Live model discovery failed, falling back to static catalog`,
      { baseUrl, error: err instanceof Error ? err.message : String(err) },
    );
    return {
      ...buildOmniRouteProvider(baseUrl),
      baseUrl,
    };
  }
}
