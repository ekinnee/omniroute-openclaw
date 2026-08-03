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
        tls.rejectUnauthorized = false;
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
        ssrfPolicy: mergeSsrFPolicies(ssrfPolicyFromHttpBaseUrlAllowedHostname(baseUrl), ssrfPolicyFromPrivateNetworkOptIn(request?.allowPrivateNetwork === true ? true : undefined), params.ssrfPolicy),
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
export async function readOmniRouteJson(response, operation) {
    try {
        return await response.json();
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