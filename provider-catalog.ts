import { createHash } from "node:crypto";
import type {
  ProviderCatalogContext,
  ProviderCatalogResult,
  UnifiedModelCatalogEntry,
  UnifiedModelCatalogProviderContext,
} from "openclaw/plugin-sdk/plugin-entry";
import {
  type OmniRouteModelDefinition,
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";
import { resolveOmniRouteApiKey } from "./auth.js";
import { redactOmniRouteBaseUrl, resolveOmniRouteBaseUrl } from "./base-url.js";
import {
  assertOmniRouteOk,
  getOmniRouteJson,
  OMNIROUTE_JSON_READ_OPTIONS,
  readOmniRouteJson,
  resolveOmniRouteHttpRequestConfig,
} from "./http.js";
import {
  isCatalogChatEntry,
  isCatalogEmbeddingEntry,
  isCatalogImageEntry,
  isCatalogMusicEntry,
  isCatalogVideoEntry,
  normalizeCatalogStringArray,
} from "./catalog-vocabulary.js";

type OmniRouteProviderConfig = {
  baseUrl: string;
  api: "openai-completions";
  models: OmniRouteModelDefinition[];
  apiKey?: string;
};

type LiveCatalogCacheEntry = {
  expiresAt: number;
  value: Promise<OmniRouteModelEntry[]>;
};

type ResolvedOmniRouteHttpRequest = ReturnType<typeof resolveOmniRouteHttpRequestConfig>;

const liveCatalogCache = new Map<string, LiveCatalogCacheEntry>();
const LIVE_CATALOG_TTL_MS = 30_000;
const LIVE_CATALOG_TIMEOUT_MS = 5_000;

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
  load: () => Promise<OmniRouteModelEntry[]>;
  shouldCache?: (value: OmniRouteModelEntry[]) => boolean;
}): Promise<OmniRouteModelEntry[]> {
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
  media_capabilities?: unknown;
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

type OmniRouteMediaCatalogKind =
  | "image_generation"
  | "video_generation"
  | "music_generation";

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
  const efforts = normalizeCatalogStringArray(value);
  return [...new Set(efforts.filter((effort) => SUPPORTED_EFFORT_VALUES.has(effort)))];
}

function resolveReasoningCapabilities(entry: OmniRouteModelEntry): {
  reasoning: boolean;
  supportedEfforts: string[];
} {
  const capabilities = isRecord(entry.capabilities) ? entry.capabilities : undefined;
  const explicitThinking =
    readCapabilityBoolean(entry, "supportsThinking") ??
    readCapabilityBoolean(entry, "thinking");
  const hasEffortTiers =
    capabilities !== undefined && Object.prototype.hasOwnProperty.call(capabilities, "effort_tiers");
  const explicitEfforts = hasEffortTiers
    ? normalizeReasoningEfforts(capabilities.effort_tiers)
    : [];
  // A thinking selector requires advertised effort_tiers. supportsThinking
  // without tiers still marks the model as reasoning-capable.
  const controllable =
    explicitThinking === false ? false : explicitThinking === true || explicitEfforts.length > 0;
  const supportedEfforts = hasEffortTiers && controllable ? explicitEfforts : [];
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

function fingerprintLiveCatalogRequest(request: ResolvedOmniRouteHttpRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        headers: Array.from(request.headers.entries()).sort(
          ([leftName, leftValue], [rightName, rightValue]) =>
            leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue),
        ),
        ssrfPolicy: request.ssrfPolicy,
        dispatcherPolicy: request.dispatcherPolicy,
      }),
    )
    .digest("hex");
}

function resolveOmniRouteCatalogHttpRequest(params: {
  baseUrl: string;
  apiKey?: string;
  request?: unknown;
}): ResolvedOmniRouteHttpRequest {
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
  const input = normalizeCatalogStringArray(entry.input_modalities);
  const hasImageInput =
    input.includes("image") ||
    hasCapability(entry, "vision") ||
    hasCapability(entry, "attachment");
  return hasImageInput ? ["text", "image"] : ["text"];
}

function buildOmniRouteModelFromCatalogEntry(entry: OmniRouteModelEntry) {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!id || !isCatalogChatEntry(entry)) {
    return null;
  }

  const reasoningCapabilities = resolveReasoningCapabilities(entry);
  const hasReasoningControls = reasoningCapabilities.supportedEfforts.length > 0;
  const contextWindow = readPositiveNumber(
    entry.context_length,
    entry.max_input_tokens,
    entry.contextWindow,
  );
  const maxTokens = readPositiveNumber(entry.max_output_tokens, entry.maxOutputTokens);
  // OpenClaw supplies guessed limits for incomplete rows. Keep them audit-only.
  if (contextWindow === undefined || maxTokens === undefined) {
    return null;
  }

  return {
    id,
    name:
      (typeof entry.name === "string" && entry.name.trim()) ||
      (typeof entry.root === "string" && entry.root.trim()) ||
      id,
    reasoning: reasoningCapabilities.reasoning,
    input: normalizeInputModalities(entry),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens,
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
      supportsTools: readCapabilityBoolean(entry, "tool_calling"),
    },
  };
}

export function buildOmniRouteEmbeddingModelFromCatalogEntry(
  entry: OmniRouteModelEntry,
): OmniRouteEmbeddingModel | null {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!id || !isCatalogEmbeddingEntry(entry)) {
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
  if (!id || !isCatalogImageEntry(entry)) {
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

function buildOmniRouteModelsFromEntries<T extends { id: string }>(
  entries: readonly OmniRouteModelEntry[],
  builder: (entry: OmniRouteModelEntry) => T | null,
): T[] {
  const seen = new Set<string>();
  const models: T[] = [];
  for (const entry of entries) {
    const model = builder(entry);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }

  return models;
}

function readOmniRouteModelEntries(payload: OmniRouteModelListResponse): OmniRouteModelEntry[] {
  if (!Array.isArray(payload.data)) {
    throw new Error("OmniRoute model catalog response did not include a data array");
  }
  return payload.data.filter(isRecord);
}

function buildOmniRouteMediaCatalogEntry(
  entry: OmniRouteModelEntry,
  kind: OmniRouteMediaCatalogKind,
): UnifiedModelCatalogEntry | null {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!id) {
    return null;
  }

  const matches =
    (kind === "image_generation" && isCatalogImageEntry(entry)) ||
    (kind === "video_generation" && isCatalogVideoEntry(entry)) ||
    (kind === "music_generation" && isCatalogMusicEntry(entry));
  if (!matches) {
    return null;
  }

  const label =
    (typeof entry.name === "string" && entry.name.trim()) ||
    (typeof entry.root === "string" && entry.root.trim());
  return {
    kind,
    provider: OMNIROUTE_PROVIDER_ID,
    model: id,
    ...(label ? { label } : {}),
    source: "live",
    ...(entry.media_capabilities !== undefined
      ? { capabilities: entry.media_capabilities }
      : entry.capabilities !== undefined
        ? { capabilities: entry.capabilities }
        : {}),
  };
}

function projectOmniRouteMediaCatalog(
  entries: readonly OmniRouteModelEntry[],
  kinds: readonly OmniRouteMediaCatalogKind[],
): UnifiedModelCatalogEntry[] {
  const seen = new Set<string>();
  const rows: UnifiedModelCatalogEntry[] = [];
  for (const kind of kinds) {
    for (const entry of entries) {
      const row = buildOmniRouteMediaCatalogEntry(entry, kind);
      const key = `${kind}:${row?.model ?? ""}`;
      if (!row || seen.has(key)) {
        continue;
      }
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

async function fetchOmniRouteModelEntries(params: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
  request?: unknown;
  http?: ResolvedOmniRouteHttpRequest;
  timeoutMs?: number;
}, errorLabel: string): Promise<OmniRouteModelEntry[]> {
  const http = params.http ?? resolveOmniRouteCatalogHttpRequest(params);
  const { response, release } = await getOmniRouteJson({
    url: `${http.baseUrl}/models`,
    headers: http.headers,
    signal: params.signal,
    timeoutMs: params.timeoutMs ?? LIVE_CATALOG_TIMEOUT_MS,
    ssrfPolicy: http.ssrfPolicy,
    dispatcherPolicy: http.dispatcherPolicy,
  });
  try {
    await assertOmniRouteOk(response, `OmniRoute ${errorLabel} model catalog`);
    return readOmniRouteModelEntries(
      (await readOmniRouteJson(
        response,
        `OmniRoute ${errorLabel} model catalog`,
        OMNIROUTE_JSON_READ_OPTIONS.catalog,
      )) as OmniRouteModelListResponse,
    );
  } finally {
    await release();
  }
}

async function fetchOmniRouteModels<T extends { id: string }>(
  params: {
    baseUrl: string;
    apiKey?: string;
    signal?: AbortSignal;
    request?: unknown;
    http?: ResolvedOmniRouteHttpRequest;
  },
  builder: (entry: OmniRouteModelEntry) => T | null,
  errorLabel: string,
): Promise<T[]> {
  return buildOmniRouteModelsFromEntries(
    await fetchOmniRouteModelEntries(params, errorLabel),
    builder,
  );
}

export async function fetchOmniRouteChatModels(params: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
  request?: unknown;
}): Promise<OmniRouteModelDefinition[]> {
  return fetchOmniRouteModels(params, buildOmniRouteModelFromCatalogEntry, "chat");
}

export async function fetchOmniRouteEmbeddingModels(params: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
  request?: unknown;
}): Promise<OmniRouteEmbeddingModel[]> {
  return fetchOmniRouteModels(params, buildOmniRouteEmbeddingModelFromCatalogEntry, "embedding");
}

export async function fetchOmniRouteImageModels(params: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
  request?: unknown;
}): Promise<OmniRouteImageModel[]> {
  return fetchOmniRouteModels(params, buildOmniRouteImageModelFromCatalogEntry, "image");
}

type OmniRouteCatalogCredentials = {
  runtimeApiKey: string;
  discoveryApiKey: string;
};

function redactLiveDiscoveryError(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/giu, redactOmniRouteBaseUrl)
    : "unknown error";
}

export function resolveOmniRouteCatalogCredentials(params: {
  auth: ReturnType<ProviderCatalogContext["resolveProviderAuth"]>;
  config: ProviderCatalogContext["config"];
  agentDir?: string;
  workspaceDir?: string;
  resolveConcreteApiKey?: typeof resolveOmniRouteApiKey;
  resolveConfiguredApiKey?: ProviderCatalogContext["resolveProviderApiKey"];
}): OmniRouteCatalogCredentials | null | Promise<OmniRouteCatalogCredentials | null> {
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

  // The auth resolver preserves provenance and can report no configured key;
  // fall back to the host's configured-key resolver when it does.
  const resolvedApiKey = params.resolveConfiguredApiKey?.("omniroute");
  const fallbackRuntimeApiKey = params.auth.apiKey ?? resolvedApiKey?.apiKey;
  const fallbackDiscoveryApiKey =
    params.auth.discoveryApiKey ?? resolvedApiKey?.discoveryApiKey ?? fallbackRuntimeApiKey;
  return fallbackRuntimeApiKey && fallbackDiscoveryApiKey
    ? { runtimeApiKey: fallbackRuntimeApiKey, discoveryApiKey: fallbackDiscoveryApiKey }
    : null;
}

type OmniRouteLiveCatalogContext = ProviderCatalogContext &
  Pick<UnifiedModelCatalogProviderContext, "signal" | "timeoutMs">;

function liveCatalogCacheKey(params: {
  baseUrl: string;
  auth: ReturnType<ProviderCatalogContext["resolveProviderAuth"]>;
  discoveryApiKey: string;
  http: ResolvedOmniRouteHttpRequest;
}): string {
  return JSON.stringify([
    "omniroute",
    params.baseUrl,
    params.auth.mode,
    params.auth.source,
    params.auth.profileId ?? "none",
    fingerprintCredential(params.discoveryApiKey),
    fingerprintLiveCatalogRequest(params.http),
  ]);
}

function shouldCacheLiveCatalogEntries(entries: readonly OmniRouteModelEntry[]): boolean {
  return entries.some(
    (entry) =>
      Boolean(buildOmniRouteModelFromCatalogEntry(entry)) ||
      Boolean(buildOmniRouteEmbeddingModelFromCatalogEntry(entry)) ||
      projectOmniRouteMediaCatalog([entry], [
        "image_generation",
        "video_generation",
        "music_generation",
      ]).length > 0,
  );
}

function awaitLiveCatalogValue<T>(
  value: Promise<T>,
  params: Pick<UnifiedModelCatalogProviderContext, "signal" | "timeoutMs">,
): Promise<T> {
  const timeoutMs =
    typeof params.timeoutMs === "number" && params.timeoutMs > 0 ? params.timeoutMs : undefined;
  if (!params.signal && timeoutMs === undefined) {
    return value;
  }

  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      params.signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(params.signal?.reason ?? new Error("OmniRoute live catalog request aborted"));
    };
    if (params.signal?.aborted) {
      onAbort();
      return;
    }
    params.signal?.addEventListener("abort", onAbort, { once: true });
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("OmniRoute live catalog request timed out"));
      }, timeoutMs);
    }
    void value.then(
      (resolved) => {
        cleanup();
        resolve(resolved);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

async function resolveOmniRouteLiveCatalog(
  ctx: OmniRouteLiveCatalogContext,
): Promise<{
  baseUrl: string;
  runtimeApiKey: string;
  entries: OmniRouteModelEntry[];
} | null> {
  const baseUrl = resolveOmniRouteBaseUrl({ config: ctx.config, env: ctx.env });
  const request = ctx.config.models?.providers?.omniroute?.request;
  const auth = ctx.resolveProviderAuth("omniroute");
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

  const http = resolveOmniRouteCatalogHttpRequest({
    baseUrl,
    apiKey: credentials.discoveryApiKey,
    request,
  });
  const entries = await awaitLiveCatalogValue(
    getCachedLiveCatalogValue({
      key: liveCatalogCacheKey({
        baseUrl,
        auth,
        discoveryApiKey: credentials.discoveryApiKey,
        http,
      }),
      load: () =>
        fetchOmniRouteModelEntries(
          {
            baseUrl,
            apiKey: credentials.discoveryApiKey,
            http,
          },
          "live",
        ),
      shouldCache: shouldCacheLiveCatalogEntries,
    }),
    ctx,
  );
  return {
    baseUrl,
    runtimeApiKey: credentials.runtimeApiKey,
    entries,
  };
}

export async function buildLiveOmniRouteProvider(
  ctx: ProviderCatalogContext,
): Promise<OmniRouteProviderConfig | null> {
  try {
    const liveCatalog = await resolveOmniRouteLiveCatalog(ctx);
    if (!liveCatalog) {
      return null;
    }
    const models = buildOmniRouteModelsFromEntries(
      liveCatalog.entries,
      buildOmniRouteModelFromCatalogEntry,
    );
    if (models.length === 0) {
      return null;
    }
    return {
      baseUrl: liveCatalog.baseUrl,
      api: "openai-completions",
      apiKey: liveCatalog.runtimeApiKey,
      models,
    };
  } catch (err) {
    const baseUrl = resolveOmniRouteBaseUrl({ config: ctx.config, env: ctx.env });
    console.warn(
      `[omniroute] Live model discovery failed (${redactOmniRouteBaseUrl(baseUrl)}): ${
        redactLiveDiscoveryError(err)
      }`,
    );
    return null;
  }
}

export async function buildOmniRouteCatalog(
  ctx: ProviderCatalogContext,
): Promise<ProviderCatalogResult> {
  const provider = await buildLiveOmniRouteProvider(ctx);
  if (!provider) {
    return null;
  }
  return {
    provider,
  };
}

export async function buildOmniRouteMediaCatalog(
  ctx: UnifiedModelCatalogProviderContext,
): Promise<readonly UnifiedModelCatalogEntry[] | null> {
  try {
    const liveCatalog = await resolveOmniRouteLiveCatalog(ctx);
    if (!liveCatalog) {
      return null;
    }
    const rows = projectOmniRouteMediaCatalog(liveCatalog.entries, [
      "image_generation",
      "video_generation",
      "music_generation",
    ]);
    return rows.length > 0 ? rows : null;
  } catch (err) {
    const baseUrl = resolveOmniRouteBaseUrl({ config: ctx.config, env: ctx.env });
    console.warn(
      `[omniroute] Live media model discovery failed (${redactOmniRouteBaseUrl(baseUrl)}): ${
        redactLiveDiscoveryError(err)
      }`,
    );
    return null;
  }
}
