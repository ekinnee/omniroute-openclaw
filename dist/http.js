// Narrow guarded HTTP helpers for OmniRoute's OpenAI-compatible endpoints.
import { fetchWithSsrFGuard, mergeSsrFPolicies, ssrfPolicyFromHttpBaseUrlAllowedHostname, ssrfPolicyFromPrivateNetworkOptIn, } from "openclaw/plugin-sdk/ssrf-runtime";
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
function readRequestHeaders(request) {
    if (!request?.headers || typeof request.headers !== "object") {
        return {};
    }
    return Object.fromEntries(Object.entries(request.headers).filter(([key, value]) => key.trim() && typeof value === "string" && value.trim()));
}
export function resolveOmniRouteHttpRequestConfig(params) {
    const baseUrl = normalizeBaseUrl(params.baseUrl, params.defaultBaseUrl);
    const request = readRequest(params.request);
    const headers = new Headers(params.defaultHeaders);
    for (const [key, value] of Object.entries(readRequestHeaders(request))) {
        headers.set(key, value);
    }
    return {
        baseUrl,
        headers,
        ssrfPolicy: mergeSsrFPolicies(ssrfPolicyFromHttpBaseUrlAllowedHostname(baseUrl), ssrfPolicyFromPrivateNetworkOptIn(request?.allowPrivateNetwork === true ? true : undefined), params.ssrfPolicy),
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