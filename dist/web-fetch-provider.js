import { markdownToText } from "openclaw/plugin-sdk/provider-web-fetch";
import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input-runtime";
import { isBlockedHostnameOrIp, SsrFBlockedError } from "openclaw/plugin-sdk/ssrf-runtime";
import { OMNIROUTE_JSON_READ_OPTIONS, postOmniRouteJson, readOmniRouteJson, resolveOmniRouteHttpRequestConfig, } from "./http.js";
import { resolveOmniRouteApiKey } from "./auth.js";
import { resolveOmniRouteBaseUrl } from "./base-url.js";
import { OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_LABEL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ERROR_DETAIL_CHARS = 512;
function readRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function readString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function readProviderConfig(config) {
    return readRecord(readRecord(readRecord(config)?.models)?.providers)?.[OMNIROUTE_PROVIDER_ID];
}
function readFetchConfig(config) {
    return readRecord(readRecord(readRecord(config)?.tools)?.web)?.fetch;
}
function isMissingOmniRouteAuthError(error) {
    const record = readRecord(error);
    return record?.provider === OMNIROUTE_PROVIDER_ID &&
        (record.code === "missing-provider-auth" || record.code === "missing-api-key");
}
async function resolveWebFetchApiKey(params) {
    const explicit = normalizeResolvedSecretInputString({
        value: params.fetchConfig?.apiKey,
        path: "tools.web.fetch.apiKey",
    });
    if (explicit)
        return explicit;
    try {
        const resolved = await resolveOmniRouteApiKey({ cfg: params.config });
        if (resolved)
            return resolved;
    }
    catch (error) {
        if (!isMissingOmniRouteAuthError(error))
            throw error;
    }
    return readString(process.env[OMNIROUTE_API_KEY_ENV_VAR]);
}
function normalizeTargetUrl(value) {
    const raw = readString(value);
    if (!raw) {
        throw new Error("OmniRoute web fetch requires a URL.");
    }
    let parsed;
    try {
        parsed = new URL(raw);
    }
    catch {
        throw new Error("OmniRoute web fetch URL must be a valid http or https URL.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("OmniRoute web fetch URL must use http or https.");
    }
    if (isBlockedHostnameOrIp(parsed.hostname)) {
        throw new SsrFBlockedError("Blocked hostname or private/internal/special-use IP address");
    }
    return parsed.toString();
}
function resolveTimeoutMs(fetchConfig) {
    const seconds = fetchConfig?.timeoutSeconds;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
        return DEFAULT_TIMEOUT_MS;
    }
    return Math.max(1_000, Math.min(Math.trunc(seconds * 1_000), 120_000));
}
function normalizeErrorDetail(value) {
    const message = readString(readRecord(value)?.message);
    if (!message)
        return undefined;
    return message
        .replace(/[\r\n\t]+/gu, " ")
        .replace(/\s{2,}/gu, " ")
        .slice(0, MAX_ERROR_DETAIL_CHARS)
        .trim();
}
async function assertWebFetchOk(response) {
    if (response.ok)
        return;
    let detail;
    try {
        const payload = await readOmniRouteJson(response, "omniroute.web-fetch.error", OMNIROUTE_JSON_READ_OPTIONS.webFetchError);
        detail = normalizeErrorDetail(readRecord(payload)?.error);
    }
    catch {
        // Preserve the HTTP status when an upstream error body is absent or invalid.
    }
    throw new Error(`OmniRoute web fetch failed: HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
}
export function createOmniRouteWebFetchProvider() {
    return {
        id: OMNIROUTE_PROVIDER_ID,
        label: OMNIROUTE_LABEL,
        hint: "Fetch and extract web content through OmniRoute's multi-provider web-fetch endpoint.",
        // OpenClaw treats web-fetch envVars as credential candidates. The base URL
        // remains supported through shared resolution, but is not a credential.
        envVars: [OMNIROUTE_API_KEY_ENV_VAR],
        placeholder: "OmniRoute API key",
        signupUrl: "",
        credentialPath: `models.providers.${OMNIROUTE_PROVIDER_ID}.apiKey`,
        getCredentialValue: (fetchConfig) => fetchConfig?.apiKey,
        getConfiguredCredentialValue: (config) => {
            const fetchConfig = readFetchConfig(config);
            if (fetchConfig && Object.hasOwn(fetchConfig, "apiKey"))
                return undefined;
            return readProviderConfig(config)?.apiKey;
        },
        setCredentialValue: (fetchConfigTarget, value) => {
            fetchConfigTarget.apiKey = value;
        },
        createTool: (ctx) => {
            const providerConfig = readProviderConfig(ctx.config);
            const fetchConfig = ctx.fetchConfig;
            const baseUrl = resolveOmniRouteBaseUrl({ config: ctx.config });
            return {
                description: "Fetch and extract a URL through OmniRoute. Returns bounded readable content " +
                    "and preserves the final URL and page title when OmniRoute supplies them.",
                parameters: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        url: {
                            type: "string",
                            description: "The HTTP or HTTPS URL to fetch and extract.",
                        },
                        extractMode: {
                            type: "string",
                            enum: ["markdown", "text"],
                            description: "Return readable content as markdown or plain text.",
                        },
                        maxChars: {
                            type: "integer",
                            minimum: 1,
                            description: "Maximum number of content characters to return.",
                        },
                    },
                    required: ["url"],
                },
                execute: async (args) => {
                    const url = normalizeTargetUrl(args.url);
                    const extractMode = args.extractMode === "text" ? "text" : "markdown";
                    const apiKey = await resolveWebFetchApiKey({ config: ctx.config, fetchConfig });
                    if (!apiKey) {
                        throw new Error("OmniRoute API key is not configured.");
                    }
                    const http = resolveOmniRouteHttpRequestConfig({
                        baseUrl,
                        defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
                        request: providerConfig?.request,
                        defaultHeaders: {
                            Accept: "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        },
                    });
                    const request = await postOmniRouteJson({
                        url: `${http.baseUrl}/web/fetch`,
                        headers: http.headers,
                        body: {
                            url,
                            // OpenClaw exposes markdown/text only. Request markdown from
                            // OmniRoute and use its public helper for plain-text projection.
                            format: "markdown",
                            // The OpenClaw contract has no metadata toggle, but it does accept
                            // a page title, so request metadata to preserve that overlap.
                            include_metadata: true,
                        },
                        timeoutMs: resolveTimeoutMs(fetchConfig),
                        ssrfPolicy: http.ssrfPolicy,
                        dispatcherPolicy: http.dispatcherPolicy,
                    });
                    try {
                        await assertWebFetchOk(request.response);
                        const payload = readRecord(await readOmniRouteJson(request.response, "omniroute.web-fetch", OMNIROUTE_JSON_READ_OPTIONS.webFetch));
                        const content = typeof payload?.content === "string" ? payload.content : undefined;
                        if (content === undefined) {
                            throw new Error("OmniRoute web fetch response missing content");
                        }
                        const rawText = extractMode === "text" ? markdownToText(content) : content;
                        const metadata = readRecord(payload?.metadata);
                        const finalUrl = payload?.url === undefined ? url : normalizeTargetUrl(payload.url);
                        const truncated = payload?.truncated === true || metadata?.truncated === true;
                        const title = readString(metadata?.title);
                        const extractor = readString(payload?.provider);
                        return {
                            text: rawText,
                            finalUrl,
                            contentType: extractMode === "text" ? "text/plain" : "text/markdown",
                            status: 200,
                            ...(title ? { title } : {}),
                            ...(extractor ? { extractor } : {}),
                            ...(truncated ? { truncated: true } : {}),
                        };
                    }
                    finally {
                        await request.release();
                    }
                },
            };
        },
    };
}
//# sourceMappingURL=web-fetch-provider.js.map