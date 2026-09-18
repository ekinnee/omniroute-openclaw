export type OmniRouteCatalogEntry = {
  type?: unknown;
  supported_endpoints?: unknown;
  output_modalities?: unknown;
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
const CHAT_ENDPOINTS = new Set([
  "chat",
  "chat-completions",
  "chat_completions",
  "/v1/chat/completions",
  "/api/v1/chat/completions",
]);
const EMBEDDING_ENDPOINTS = new Set(["embedding", "embeddings"]);
const IMAGE_ENDPOINTS = new Set(["image", "images", "image-generation", "image_generation"]);

export function normalizeCatalogStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeCatalogType(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isCatalogChatEntry(entry: OmniRouteCatalogEntry): boolean {
  const outputModalities = normalizeCatalogStringArray(entry.output_modalities);
  if (outputModalities.length > 0 && !outputModalities.includes("text")) {
    return false;
  }

  const endpoints = normalizeCatalogStringArray(entry.supported_endpoints);
  if (endpoints.length > 0) {
    return endpoints.some((endpoint) => CHAT_ENDPOINTS.has(endpoint));
  }

  const type = normalizeCatalogType(entry.type);
  if (!type) {
    return true;
  }
  if (NON_CHAT_MODEL_TYPES.has(type)) {
    return false;
  }
  return CHAT_MODEL_TYPES.has(type);
}

export function isCatalogEmbeddingEntry(entry: OmniRouteCatalogEntry): boolean {
  const endpoints = normalizeCatalogStringArray(entry.supported_endpoints);
  if (endpoints.length > 0) {
    return endpoints.some((endpoint) => EMBEDDING_ENDPOINTS.has(endpoint));
  }
  return EMBEDDING_MODEL_TYPES.has(normalizeCatalogType(entry.type));
}

export function isCatalogImageEntry(entry: OmniRouteCatalogEntry): boolean {
  const outputModalities = normalizeCatalogStringArray(entry.output_modalities);
  if (outputModalities.length > 0 && !outputModalities.includes("image")) {
    return false;
  }

  const endpoints = normalizeCatalogStringArray(entry.supported_endpoints);
  if (endpoints.length > 0) {
    return endpoints.some((endpoint) => IMAGE_ENDPOINTS.has(endpoint));
  }
  return IMAGE_MODEL_TYPES.has(normalizeCatalogType(entry.type));
}
