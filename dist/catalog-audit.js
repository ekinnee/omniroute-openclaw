import { resolveOmniRouteApiKey } from "./auth.js";
import { assertOmniRouteOk, getOmniRouteJson, readOmniRouteJson, resolveOmniRouteHttpRequestConfig, } from "./http.js";
import { OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
import { redactOmniRouteBaseUrl, resolveOmniRouteBaseUrl } from "./base-url.js";
const ADVERTISED_MODEL_FIELDS = [
    "type",
    "supported_endpoints",
    "input_modalities",
    "output_modalities",
    "context_length",
    "max_input_tokens",
    "contextWindow",
    "max_output_tokens",
    "maxOutputTokens",
    "dimensions",
    "embedding_dimensions",
    "output_dimensions",
    "supported_sizes",
];
const ADVERTISED_CAPABILITY_FIELDS = [
    "reasoning",
    "supportsThinking",
    "thinking",
    "effort_tiers",
    "tool_calling",
    "vision",
    "attachment",
];
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readProviderConfig(config) {
    return config?.models?.providers?.[OMNIROUTE_PROVIDER_ID];
}
/** Uses the shared provider endpoint precedence without mutating configuration. */
export function resolveOmniRouteAuditBaseUrl(params) {
    return resolveOmniRouteBaseUrl(params);
}
/** Removes credentials, query strings, and fragments before an endpoint is rendered. */
export function redactOmniRouteAuditUrl(value) {
    return redactOmniRouteBaseUrl(value);
}
function copyAdvertisedFields(entry) {
    const advertised = {};
    for (const key of ADVERTISED_MODEL_FIELDS) {
        if (key in entry) {
            advertised[key] = entry[key];
        }
    }
    return advertised;
}
function copyAdvertisedCapabilities(entry) {
    const capabilities = {};
    if (!isRecord(entry.capabilities)) {
        return capabilities;
    }
    for (const key of ADVERTISED_CAPABILITY_FIELDS) {
        if (key in entry.capabilities) {
            capabilities[key] = entry.capabilities[key];
        }
    }
    return capabilities;
}
function hasAnyKey(value, keys) {
    return keys.some((key) => key in value);
}
function classifyCatalogEntry(entry) {
    const type = typeof entry.type === "string" ? entry.type.trim().toLowerCase() : "";
    const endpoints = Array.isArray(entry.supported_endpoints)
        ? entry.supported_endpoints
            .filter((value) => typeof value === "string")
            .map((value) => value.trim().toLowerCase())
        : [];
    const outputModalities = Array.isArray(entry.output_modalities)
        ? entry.output_modalities
            .filter((value) => typeof value === "string")
            .map((value) => value.trim().toLowerCase())
        : [];
    if (type === "embedding" || type === "embeddings" || endpoints.some((value) => value === "embedding" || value === "embeddings")) {
        return "embedding";
    }
    if (type === "image" || type === "images" || outputModalities.includes("image") || endpoints.some((value) => value === "image" || value === "images" || value === "image-generation" || value === "image_generation")) {
        return "image";
    }
    if (!type || ["chat", "text", "llm", "language"].includes(type) || endpoints.some((value) => value === "chat" || value === "chat-completions" || value === "chat_completions")) {
        return "chat";
    }
    return "other";
}
function buildMissingFields(catalogClass, advertised, capabilities) {
    if (catalogClass === "chat") {
        const hasReasoningMetadata = hasAnyKey(capabilities, [
            "reasoning",
            "supportsThinking",
            "thinking",
            "effort_tiers",
        ]);
        const explicitlyControllable = capabilities.supportsThinking === true ||
            capabilities.thinking === true ||
            Array.isArray(capabilities.effort_tiers);
        return [
            ...(!hasAnyKey(advertised, ["context_length", "max_input_tokens", "contextWindow"])
                ? ["context_window"]
                : []),
            ...(!hasAnyKey(advertised, ["max_output_tokens", "maxOutputTokens"])
                ? ["max_output_tokens"]
                : []),
            ...(!("input_modalities" in advertised) ? ["input_modalities"] : []),
            ...(!hasReasoningMetadata ? ["capabilities.reasoning"] : []),
            ...(explicitlyControllable && !("effort_tiers" in capabilities)
                ? ["capabilities.effort_tiers"]
                : []),
            ...(!("tool_calling" in capabilities) ? ["capabilities.tool_calling"] : []),
        ];
    }
    if (catalogClass === "embedding") {
        return [
            ...(!hasAnyKey(advertised, ["max_input_tokens", "context_length", "contextWindow"])
                ? ["max_input_tokens"]
                : []),
            ...(!hasAnyKey(advertised, ["dimensions", "embedding_dimensions", "output_dimensions"])
                ? ["dimensions"]
                : []),
        ];
    }
    if (catalogClass === "image") {
        return [
            ...(!("input_modalities" in advertised) ? ["input_modalities"] : []),
            ...(!("supported_sizes" in advertised) ? ["supported_sizes"] : []),
        ];
    }
    return [];
}
export function buildOmniRouteCatalogAuditReport(params) {
    if (!isRecord(params.payload) || !Array.isArray(params.payload.data)) {
        throw new Error("OmniRoute model catalog response did not include a data array");
    }
    const entries = params.payload.data;
    const models = [];
    const seenIds = new Set();
    const duplicateIds = new Set();
    let invalidRows = 0;
    for (const rawEntry of entries) {
        if (!isRecord(rawEntry)) {
            invalidRows += 1;
            continue;
        }
        const id = typeof rawEntry.id === "string" ? rawEntry.id.trim() : "";
        if (!id) {
            invalidRows += 1;
            continue;
        }
        if (seenIds.has(id)) {
            duplicateIds.add(id);
        }
        seenIds.add(id);
        const advertised = copyAdvertisedFields(rawEntry);
        const capabilities = copyAdvertisedCapabilities(rawEntry);
        const catalogClass = classifyCatalogEntry(rawEntry);
        models.push({
            id,
            ...(typeof rawEntry.name === "string" && rawEntry.name.trim()
                ? { name: rawEntry.name.trim() }
                : {}),
            ...(typeof rawEntry.root === "string" && rawEntry.root.trim()
                ? { root: rawEntry.root.trim() }
                : {}),
            catalogClass,
            advertised,
            capabilities,
            missing: buildMissingFields(catalogClass, advertised, capabilities),
        });
    }
    return {
        schemaVersion: 1,
        baseUrl: redactOmniRouteAuditUrl(params.baseUrl),
        totalRows: entries.length,
        invalidRows,
        duplicateIds: [...duplicateIds],
        modelCount: models.length,
        models,
    };
}
/** GET the live catalog using the same credential and guarded transport path as provider requests. */
export async function auditOmniRouteCatalog(params = {}) {
    const baseUrl = resolveOmniRouteAuditBaseUrl(params);
    const envApiKey = (params.env ?? process.env)[OMNIROUTE_API_KEY_ENV_VAR]?.trim();
    let discoveryApiKey;
    try {
        // The standalone resolver returns concrete credential material. In the host
        // catalog context this corresponds to discoveryApiKey, while apiKey may be
        // only a redacted runtime marker such as an environment-variable name.
        discoveryApiKey = await resolveOmniRouteApiKey({
            cfg: params.config,
            agentDir: params.agentDir,
            workspaceDir: params.workspaceDir,
        });
    }
    catch (error) {
        if (!envApiKey) {
            throw error;
        }
    }
    discoveryApiKey ??= envApiKey;
    const providerConfig = readProviderConfig(params.config);
    const request = resolveOmniRouteHttpRequestConfig({
        baseUrl,
        defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
        request: providerConfig?.request,
        defaultHeaders: {
            Accept: "application/json",
            ...(discoveryApiKey ? { Authorization: `Bearer ${discoveryApiKey}` } : {}),
        },
    });
    const { response, release } = await getOmniRouteJson({
        url: `${request.baseUrl}/models`,
        headers: request.headers,
        signal: params.signal,
        ssrfPolicy: request.ssrfPolicy,
        dispatcherPolicy: request.dispatcherPolicy,
    });
    try {
        await assertOmniRouteOk(response, "OmniRoute catalog audit");
        return buildOmniRouteCatalogAuditReport({
            baseUrl: request.baseUrl,
            payload: await readOmniRouteJson(response, "OmniRoute catalog audit"),
        });
    }
    finally {
        await release();
    }
}
export function formatOmniRouteCatalogAuditReport(report) {
    const lines = [
        `OmniRoute catalog audit: ${report.modelCount} model${report.modelCount === 1 ? "" : "s"}`,
        `Base URL: ${report.baseUrl}`,
        `Rows: ${report.totalRows} total, ${report.invalidRows} invalid, ${report.duplicateIds.length} duplicate id${report.duplicateIds.length === 1 ? "" : "s"}`,
    ];
    for (const model of report.models) {
        const metadata = [
            ...Object.entries(model.advertised).map(([key, value]) => `${key}=${JSON.stringify(value)}`),
            ...Object.entries(model.capabilities).map(([key, value]) => `capabilities.${key}=${JSON.stringify(value)}`),
        ];
        lines.push(`- ${JSON.stringify(model.id)}`);
        lines.push(`  Class: ${model.catalogClass}`);
        lines.push(`  Advertised: ${metadata.length > 0 ? metadata.join(", ") : "none"}`);
        lines.push(`  Missing advertised metadata: ${model.missing.length > 0 ? model.missing.join(", ") : "none"}`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=catalog-audit.js.map