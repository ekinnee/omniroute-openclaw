import { createHash } from "node:crypto";
import type {
  ProviderCatalogContext,
  ProviderCatalogResult,
} from "openclaw/plugin-sdk/plugin-entry";
import {
  OMNIROUTE_BASE_URL_ENV_VAR,
  type OmniRouteModelDefinition,
  OMNIROUTE_DEFAULT_BASE_URL,
} from "./models.js";
import { resolveOmniRouteApiKey } from "./auth.js";

type OmniRouteProviderConfig = {
  baseUrl: string;
  api: "openai-completions";
  models: OmniRouteModelDefinition[];
  apiKey?: string;
};

type LiveCatalogCacheEntry = {
  expiresAt: number;
  value: Promise<OmniRouteModelDefinition[]>;
};

const liveCatalogCache = new Map<string, LiveCatalogCacheEntry>();
const LIVE_CATALOG_TTL_MS = 30_000;

function deleteLiveCatalogCacheEntryIfCurrent(
  key: string,
  entry: LiveCatalogCacheEntry,
): void {
  if (liveCatalogCache.get(key) === entry) {
    liveCatalogCache.delete(key);
  }
}

function pruneExpiredLiveCatalogCacheEntries(now: number): void {
  for (const [key, entry] of liveCatalogCache) {
    if (entry.expiresAt <= now) {
      deleteLiveCatalogCacheEntryIfCurrent(key, entry);
    }
  }
}

function getCachedLiveCatalogValue(params: {
  key: string;
  load: () => Promise<OmniRouteModelDefinition[]>;
  shouldCache?: (value: OmniRouteModelDefinition[]) => boolean;
}): Promise<OmniRouteModelDefinition[]> {
  const now = Date.now();
  pruneExpiredLiveCatalogCacheEntries(now);
  const existing = liveCatalogCache.get(params.key);
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }
  const value = params.load();
  const entry = { expiresAt: now + LIVE_CATALOG_TTL_MS, value };
  liveCatalogCache.set(params.key, entry);
  void value.then(
    (resolved) => {
      if (params.shouldCache && !params.shouldCache(resolved)) {
        deleteLiveCatalogCacheEntryIfCurrent(params.key, entry);
      }
    },
    () => deleteLiveCatalogCacheEntryIfCurrent(params.key, entry),
  );
  return value;
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
const OMNIROUTE_CANONICAL_EFFORTS = ["none", "low", "medium", "high", "xhigh"] as const;
const OPENCLAW_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
const SUPPORTED_EFFORT_VALUES = new Set<string>([
  ...OMNIROUTE_CANONICAL_EFFORTS,
  "minimal",
  "max",
]);

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

function readCapabilityBoolean(
  entry: OmniRouteModelEntry,
  key: string,
): boolean | undefined {
  if (!isRecord(entry.capabilities)) {
    return undefined;
  }
  const value = entry.capabilities[key];
  return typeof value === "boolean" ? value : undefined;
}

function normalizeReasoningEfforts(value: unknown): string[] {
  const efforts = normalizeStringArray(value);
  return [...new Set(efforts.filter((effort) => SUPPORTED_EFFORT_VALUES.has(effort)))];
}

function resolveReasoningCapabilities(entry: OmniRouteModelEntry): {
  reasoning: boolean;
  supportedEfforts: string[];
} {
  const explicitThinking =
    readCapabilityBoolean(entry, "supportsThinking") ??
    readCapabilityBoolean(entry, "thinking");
  const explicitEfforts = isRecord(entry.capabilities)
    ? normalizeReasoningEfforts(entry.capabilities.effort_tiers)
    : [];
  const controllable =
    explicitThinking === false ? false : explicitThinking === true || explicitEfforts.length > 0;
  const supportedEfforts = controllable
    ? explicitEfforts.length > 0
      ? explicitEfforts
      : [...OMNIROUTE_CANONICAL_EFFORTS]
    : [];
  return {
    reasoning: hasCapability(entry, "reasoning") || controllable,
    supportedEfforts,
  };
}

function buildThinkingLevelMap(
  supportedEfforts: readonly string[],
): OmniRouteModelDefinition["thinkingLevelMap"] {
  const efforts = new Set(supportedEfforts);
  // OpenClaw exposes several reasoning levels by default for reasoning models.
  // Explicit nulls keep the selector limited to capabilities OmniRoute actually advertised.
  return Object.fromEntries(
    OPENCLAW_THINKING_LEVELS.map((level) => {
      const providerEffort = level === "off" ? "none" : level;
      return [level, efforts.has(providerEffort) ? providerEffort : null];
    }),
  ) as NonNullable<OmniRouteModelDefinition["thinkingLevelMap"]>;
}

function fingerprintCredential(apiKey: string | undefined): string {
  return apiKey
    ? createHash("sha256").update(apiKey).digest("hex")
    : "none";
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

function buildOmniRouteModelFromCatalogEntry(entry: OmniRouteModelEntry) {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!id || !isChatModelEntry(entry)) {
    return null;
  }

  const reasoningCapabilities = resolveReasoningCapabilities(entry);
  const hasReasoningControls = reasoningCapabilities.supportedEfforts.length > 0;

  return {
    id,
    name:
      (typeof entry.name === "string" && entry.name.trim()) ||
      (typeof entry.root === "string" && entry.root.trim()) ||
      id,
    reasoning: reasoningCapabilities.reasoning,
    input: normalizeInputModalities(entry),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow:
      readPositiveNumber(entry.context_length, entry.max_input_tokens, entry.contextWindow) ??
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

// Generic fetch helper
async function fetchOmniRouteModels<T extends { id: string }>(
  params: { baseUrl: string; apiKey?: string; signal?: AbortSignal },
  builder: (entry: OmniRouteModelEntry) => T | null,
  errorLabel: string,
): Promise<T[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const response = await fetch(`${normalizeBaseUrl(params.baseUrl)}/models`, {
    headers,
    signal: params.signal,
  });

  if (!response.ok) {
    throw new Error(`OmniRoute ${errorLabel} model catalog request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as OmniRouteModelListResponse;
  if (!Array.isArray(payload.data)) {
    throw new Error("OmniRoute model catalog response did not include a data array");
  }

  const seen = new Set<string>();
  const models: T[] = [];
  for (const rawEntry of payload.data) {
    if (!isRecord(rawEntry)) continue;
    const model = builder(rawEntry);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }

  return models;
}

// Simplified functions using generic helper
export async function fetchOmniRouteChatModels(params: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<OmniRouteModelDefinition[]> {
  return fetchOmniRouteModels(params, buildOmniRouteModelFromCatalogEntry, "chat");
}

export async function fetchOmniRouteEmbeddingModels(params: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<OmniRouteEmbeddingModel[]> {
  return fetchOmniRouteModels(params, buildOmniRouteEmbeddingModelFromCatalogEntry, "embedding");
}

export async function fetchOmniRouteImageModels(params: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<OmniRouteImageModel[]> {
  return fetchOmniRouteModels(params, buildOmniRouteImageModelFromCatalogEntry, "image");
}

type OmniRouteCatalogCredentials = {
  runtimeApiKey: string;
  discoveryApiKey: string;
};

export function resolveOmniRouteCatalogCredentials(params: {
  auth: ReturnType<ProviderCatalogContext["resolveProviderAuth"]>;
  config: ProviderCatalogContext["config"];
  agentDir?: string;
  workspaceDir?: string;
  resolveConcreteApiKey?: typeof resolveOmniRouteApiKey;
}): OmniRouteCatalogCredentials | null | Promise<OmniRouteCatalogCredentials | null> {
  const runtimeApiKey = params.auth.apiKey;
  const discoveryApiKey = params.auth.discoveryApiKey ?? runtimeApiKey;

  // The host's lightweight catalog resolver currently selects profile entries
  // by store order. Resolve profile-backed auth through the full public auth
  // path so both discovery and runtime honor the configured profile order.
  if (params.auth.source === "profile") {
    return (params.resolveConcreteApiKey ?? resolveOmniRouteApiKey)({
      cfg: params.config,
      agentDir: params.agentDir,
      workspaceDir: params.workspaceDir,
    }).then((concreteApiKey) =>
      concreteApiKey
        ? { runtimeApiKey: concreteApiKey, discoveryApiKey: concreteApiKey }
        : null,
    );
  }

  return runtimeApiKey && discoveryApiKey
    ? { runtimeApiKey, discoveryApiKey }
    : null;
}

export async function buildLiveOmniRouteProvider(
  ctx: ProviderCatalogContext,
): Promise<OmniRouteProviderConfig | null> {
  const baseUrl = resolveConfiguredBaseUrl(ctx);
  const auth = ctx.resolveProviderAuth("omniroute");
  try {
    const credentialsOrPromise = resolveOmniRouteCatalogCredentials({
      auth,
      config: ctx.config,
      agentDir: ctx.agentDir,
      workspaceDir: ctx.workspaceDir,
    });
    const credentials = credentialsOrPromise instanceof Promise
      ? await credentialsOrPromise
      : credentialsOrPromise;
    if (!credentials) {
      return null;
    }
    const { runtimeApiKey, discoveryApiKey } = credentials;
    const models = await getCachedLiveCatalogValue({
      key: JSON.stringify([
        "omniroute",
        "chat-models",
        baseUrl,
        auth.mode,
        auth.source,
        auth.profileId ?? "none",
        fingerprintCredential(discoveryApiKey),
      ]),
      load: () =>
        fetchOmniRouteChatModels({
          baseUrl,
          apiKey: discoveryApiKey,
        }),
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
  } catch (err) {
    console.warn(
      `[omniroute] Live model discovery failed (${baseUrl}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

export async function buildOmniRouteCatalog(
  ctx: ProviderCatalogContext,
): Promise<ProviderCatalogResult> {
  const configuredProvider = ctx.config.models?.providers?.omniroute;
  const configuredBaseUrl =
    typeof configuredProvider?.baseUrl === "string" && configuredProvider.baseUrl.trim()
      ? configuredProvider.baseUrl.trim().replace(/\/+$/, "")
      : undefined;
  const provider = await buildLiveOmniRouteProvider(ctx);
  if (!provider) {
    return null;
  }
  return {
    provider: {
      ...provider,
      ...(configuredBaseUrl ? { baseUrl: configuredBaseUrl } : {}),
    },
  };
}
