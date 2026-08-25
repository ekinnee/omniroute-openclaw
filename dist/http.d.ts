import { type SsrFPolicy } from "openclaw/plugin-sdk/ssrf-runtime";
type DispatcherPolicy = {
    mode: "direct";
    connect?: Record<string, unknown>;
} | {
    mode: "env-proxy";
    connect?: Record<string, unknown>;
    proxyTls?: Record<string, unknown>;
} | {
    mode: "explicit-proxy";
    proxyUrl: string;
    proxyTls?: Record<string, unknown>;
};
export declare function resolveOmniRouteHttpRequestConfig(params: {
    baseUrl: string;
    defaultBaseUrl: string;
    request?: unknown;
    defaultHeaders?: Record<string, string>;
    ssrfPolicy?: SsrFPolicy;
}): {
    baseUrl: string;
    headers: Headers;
    ssrfPolicy?: SsrFPolicy;
    dispatcherPolicy?: DispatcherPolicy;
};
export declare function postOmniRouteJson(params: {
    url: string;
    headers: Headers;
    body: unknown;
    timeoutMs?: number;
    signal?: AbortSignal;
    ssrfPolicy?: SsrFPolicy;
    dispatcherPolicy?: DispatcherPolicy;
}): Promise<{
    response: Response;
    release: () => Promise<void>;
}>;
export declare function getOmniRouteJson(params: {
    url: string;
    headers?: HeadersInit;
    signal?: AbortSignal;
    timeoutMs?: number;
    ssrfPolicy?: SsrFPolicy;
    dispatcherPolicy?: DispatcherPolicy;
}): Promise<{
    response: Response;
    release: () => Promise<void>;
}>;
export type OmniRouteJsonReadOptions = {
    maxBytes?: number;
    chunkTimeoutMs?: number;
};
export declare function readOmniRouteJson(response: Response, operation: string, options?: OmniRouteJsonReadOptions): Promise<unknown>;
export declare function assertOmniRouteOk(response: Response, operation: string): Promise<void>;
export {};
//# sourceMappingURL=http.d.ts.map