// Narrow guarded HTTP helpers for OmniRoute's OpenAI-compatible endpoints.
import { fetchWithSsrFGuard, mergeSsrFPolicies, ssrfPolicyFromHttpBaseUrlAllowedHostname, ssrfPolicyFromPrivateNetworkOptIn, } from "openclaw/plugin-sdk/ssrf-runtime";
import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input-runtime";
function readRequest(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    return value;
}
function normalizeBaseUrl(value, fallback) {
    const candidate = value.trim() || fallback.trim();
    return candidate.replace(/\/+$/, "");
}
function resolveSecretInput(value, path) {
    return normalizeResolvedSecretInputString({ value, path });
}
function readRequestHeaders(request) {
    if (!request?.headers || typeof request.headers !== "object") {
        return {};
    }
    const headers = {};
    for (const [key, value] of Object.entries(request.headers)) {
        const normalizedKey = key.trim();
        const normalizedValue = resolveSecretInput(value, `models.providers.omniroute.request.headers.${key}`);
        if (normalizedKey && normalizedValue) {
            headers[normalizedKey] = normalizedValue;
        }
    }
    return headers;
}
function readTls(value, path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const raw = value;
    const tls = {};
    for (const key of ["ca", "cert", "key", "passphrase"]) {
        const resolved = resolveSecretInput(raw[key], `${path}.${key}`);
        if (resolved) {
            tls[key] = resolved;
        }
    }
    if (typeof raw.serverName === "string" && raw.serverName.trim()) {
        tls.servername = raw.serverName.trim();
    }
    if (raw.insecureSkipVerify === true) {
        throw new Error("Provider transport overrides do not allow insecureSkipVerify");
    }
    else if (raw.insecureSkipVerify === false) {
        tls.rejectUnauthorized = true;
    }
    return Object.keys(tls).length > 0 ? tls : undefined;
}
function readDispatcherPolicy(request) {
    const targetTls = readTls(request?.tls, "models.providers.omniroute.request.tls");
    const proxy = request?.proxy;
    if (!proxy || typeof proxy !== "object" || Array.isArray(proxy)) {
        return targetTls ? { mode: "direct", connect: targetTls } : undefined;
    }
    const proxyTls = readTls(proxy.tls, "models.providers.omniroute.request.proxy.tls");
    if (proxy.mode === "env-proxy") {
        return {
            mode: "env-proxy",
            ...(targetTls ? { connect: targetTls } : {}),
            ...(proxyTls ? { proxyTls } : {}),
        };
    }
    if (proxy.mode === "explicit-proxy" && typeof proxy.url === "string" && proxy.url.trim()) {
        return {
            mode: "explicit-proxy",
            proxyUrl: proxy.url.trim(),
            ...(proxyTls ? { proxyTls } : {}),
        };
    }
    return targetTls ? { mode: "direct", connect: targetTls } : undefined;
}
function applyRequestAuth(headers, request) {
    const auth = request?.auth;
    if (!auth || typeof auth !== "object" || Array.isArray(auth)) {
        return;
    }
    if (auth.mode === "authorization-bearer") {
        const token = resolveSecretInput(auth.token, "models.providers.omniroute.request.auth.token");
        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }
        return;
    }
    if (auth.mode === "header") {
        const name = typeof auth.headerName === "string" ? auth.headerName.trim() : "";
        const value = resolveSecretInput(auth.value, "models.providers.omniroute.request.auth.value");
        const prefix = typeof auth.prefix === "string" ? auth.prefix : "";
        if (name && value) {
            headers.delete("Authorization");
            headers.set(name, `${prefix}${value}`);
        }
    }
}
export function resolveOmniRouteHttpRequestConfig(params) {
    const baseUrl = normalizeBaseUrl(params.baseUrl, params.defaultBaseUrl);
    const request = readRequest(params.request);
    const headers = new Headers(params.defaultHeaders);
    for (const [key, value] of Object.entries(readRequestHeaders(request))) {
        headers.set(key, value);
    }
    applyRequestAuth(headers, request);
    return {
        baseUrl,
        headers,
        ssrfPolicy: mergeSsrFPolicies(request?.allowPrivateNetwork === false
            ? undefined
            : ssrfPolicyFromHttpBaseUrlAllowedHostname(baseUrl), ssrfPolicyFromPrivateNetworkOptIn(request?.allowPrivateNetwork === true ? true : undefined), params.ssrfPolicy),
        dispatcherPolicy: readDispatcherPolicy(request),
    };
}
export async function postOmniRouteJson(params) {
    const { response, release } = await fetchWithSsrFGuard({
        url: params.url,
        init: {
            method: "POST",
            headers: params.headers,
            body: JSON.stringify(params.body),
        },
        timeoutMs: params.timeoutMs,
        signal: params.signal,
        policy: params.ssrfPolicy,
        dispatcherPolicy: params.dispatcherPolicy,
        auditContext: "omniroute.provider",
    });
    return { response, release };
}
export async function getOmniRouteJson(params) {
    const { response, release } = await fetchWithSsrFGuard({
        url: params.url,
        init: {
            method: "GET",
            headers: params.headers,
        },
        timeoutMs: params.timeoutMs,
        signal: params.signal,
        policy: params.ssrfPolicy,
        dispatcherPolicy: params.dispatcherPolicy,
        auditContext: "omniroute.catalog",
    });
    return { response, release };
}
const MEBIBYTE = 1024 * 1024;
const DEFAULT_OMNIROUTE_JSON_READ_OPTIONS = {
    maxBytes: 8 * MEBIBYTE,
    chunkTimeoutMs: 30_000,
};
export const OMNIROUTE_JSON_READ_OPTIONS = {
    catalog: {
        maxBytes: 4 * MEBIBYTE,
        chunkTimeoutMs: 5_000,
    },
    catalogAudit: {
        maxBytes: 4 * MEBIBYTE,
        chunkTimeoutMs: 5_000,
    },
    embeddings: {
        maxBytes: 16 * MEBIBYTE,
        chunkTimeoutMs: 30_000,
    },
    imageGeneration: {
        maxBytes: 32 * MEBIBYTE,
        chunkTimeoutMs: 30_000,
    },
    videoGeneration: {
        // A default 16 MiB video expands to about 21.4 MiB in base64, plus JSON.
        maxBytes: 24 * MEBIBYTE,
        chunkTimeoutMs: 30_000,
    },
    webSearch: {
        maxBytes: 4 * MEBIBYTE,
        chunkTimeoutMs: 30_000,
    },
};
async function readOmniRouteJsonBytes(response, operation, maxBytes, chunkTimeoutMs) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
        throw new RangeError(`OmniRoute JSON maxBytes must be a non-negative safe integer: ${maxBytes}`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
        return new Uint8Array();
    }
    const chunks = [];
    let size = 0;
    const readChunk = () => {
        if (chunkTimeoutMs === undefined) {
            return reader.read();
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const error = new Error(`${operation} response stalled: no data received for ${chunkTimeoutMs}ms`);
                void reader.cancel(error).catch(() => undefined);
                reject(error);
            }, chunkTimeoutMs);
            void reader.read().then((result) => {
                clearTimeout(timeout);
                resolve(result);
            }, (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    };
    try {
        for (;;) {
            const { done, value } = await readChunk();
            if (done) {
                break;
            }
            size += value?.byteLength ?? 0;
            if (size > maxBytes) {
                void reader.cancel().catch(() => undefined);
                throw new Error(`${operation} response exceeded ${maxBytes} bytes (${size} bytes received)`);
            }
            if (value?.byteLength) {
                chunks.push(value);
            }
        }
    }
    finally {
        try {
            reader.releaseLock();
        }
        catch { }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
export async function readOmniRouteJson(response, operation, options = DEFAULT_OMNIROUTE_JSON_READ_OPTIONS) {
    // All provider responses must stay bounded. Endpoint-specific callers can
    // raise the default for known larger payloads, but never opt out of a limit.
    const bytes = await readOmniRouteJsonBytes(response, operation, options.maxBytes ?? DEFAULT_OMNIROUTE_JSON_READ_OPTIONS.maxBytes, options.chunkTimeoutMs ?? DEFAULT_OMNIROUTE_JSON_READ_OPTIONS.chunkTimeoutMs);
    try {
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    }
    catch {
        throw new Error(`${operation} returned invalid JSON`);
    }
}
export async function assertOmniRouteOk(response, operation) {
    if (!response.ok) {
        throw new Error(`${operation}: HTTP ${response.status}`);
    }
}
//# sourceMappingURL=http.js.map