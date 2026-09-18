const CHAT_MODEL_TYPES = new Set(["chat", "text", "llm", "language"]);
const EMBEDDING_MODEL_TYPES = new Set(["embedding", "embeddings"]);
const IMAGE_MODEL_TYPES = new Set(["image", "images"]);
const VIDEO_MODEL_TYPES = new Set(["video", "videos"]);
const MUSIC_MODEL_TYPES = new Set(["music", "audio-generation", "music-generation"]);
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
const IMAGE_ENDPOINTS = new Set([
    "image",
    "images",
    "image-generation",
    "image_generation",
    "images-generations",
]);
const VIDEO_ENDPOINTS = new Set([
    "video",
    "videos",
    "video-generation",
    "video_generation",
    "/v1/videos/generations",
    "/api/v1/videos/generations",
]);
const MUSIC_ENDPOINTS = new Set([
    "music",
    "music-generation",
    "music_generation",
    "/v1/music/generations",
    "/api/v1/music/generations",
]);
export function normalizeCatalogStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}
export function normalizeCatalogType(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}
export function isCatalogChatEntry(entry) {
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
export function isCatalogEmbeddingEntry(entry) {
    const endpoints = normalizeCatalogStringArray(entry.supported_endpoints);
    if (endpoints.length > 0) {
        return endpoints.some((endpoint) => EMBEDDING_ENDPOINTS.has(endpoint));
    }
    return EMBEDDING_MODEL_TYPES.has(normalizeCatalogType(entry.type));
}
export function isCatalogImageEntry(entry) {
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
function isCatalogOutputEntry(entry, outputModalitiesToMatch, endpoints, types) {
    const outputModalities = normalizeCatalogStringArray(entry.output_modalities);
    if (outputModalities.length > 0 &&
        !outputModalities.some((modality) => outputModalitiesToMatch.includes(modality))) {
        return false;
    }
    const supportedEndpoints = normalizeCatalogStringArray(entry.supported_endpoints);
    if (supportedEndpoints.length > 0) {
        return supportedEndpoints.some((endpoint) => endpoints.has(endpoint));
    }
    return types.has(normalizeCatalogType(entry.type));
}
export function isCatalogVideoEntry(entry) {
    return isCatalogOutputEntry(entry, ["video"], VIDEO_ENDPOINTS, VIDEO_MODEL_TYPES);
}
export function isCatalogMusicEntry(entry) {
    return isCatalogOutputEntry(entry, ["music", "audio"], MUSIC_ENDPOINTS, MUSIC_MODEL_TYPES);
}
//# sourceMappingURL=catalog-vocabulary.js.map