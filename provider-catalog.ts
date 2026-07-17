// OmniRoute provider catalog for the bundled OpenAI-compatible proxy plugin.
import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-model-shared";
import type { ProviderCatalogContext } from "openclaw/plugin-sdk/provider-catalog-shared";
import { getCachedLiveCatalogValue } from "openclaw/plugin-sdk/provider-catalog-shared";
import {
  OMNIROUTE_BASE_URL_ENV_VAR,
  buildOmniRouteDefaultModel,
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_DEFAULT_MODEL_ID,
} from "./models.js";

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
  context_length?: unknown;
  contextWindow?: unknown;
  max_output_tokens?: unknown;
  maxOutputTokens?: unknown;
  input_modalities?: unknown;
  capabilities?: unknown;
};

const CHAT_MODEL_TYPES = new Set(["chat", "text", "llm", "language"]);

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

function normalizeInputModalities(entry: OmniRouteModelEntry): Array<"text" | "image"> {
  const input = Array.isArray(entry.input_modalities) ? entry.input_modalities : [];
  const hasImageInput =
    input.some((value) => typeof value === "string" && value.toLowerCase() === "image") ||
    hasCapability(entry, "vision") ||
    hasCapability(entry, "attachment");
  return hasImageInput ? ["text", "image"] : ["text"];
}

function isChatModelEntry(entry: OmniRouteModelEntry): boolean {
  if (typeof entry.type !== "string" || entry.type.length === 0) {
    return true;
  }
  return CHAT_MODEL_TYPES.has(entry.type.toLowerCase());
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
    contextWindow: readPositiveNumber(entry.context_length, entry.contextWindow) ?? 128_000,
    maxTokens: readPositiveNumber(entry.max_output_tokens, entry.maxOutputTokens) ?? 16_384,
    compat: {
      supportsUsageInStreaming: true,
      supportsTools: hasCapability(entry, "tool_calling") || undefined,
    },
  };
}

function ensureDefaultModel(models: ModelProviderConfig["models"]): ModelProviderConfig["models"] {
  if (models.some((model) => model.id === OMNIROUTE_DEFAULT_MODEL_ID)) {
    return models;
  }
  return [buildOmniRouteDefaultModel(), ...models];
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

  return ensureDefaultModel(models);
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
  } catch {
    return {
      ...buildOmniRouteProvider(baseUrl),
      baseUrl,
    };
  }
}
