import { type SsrFPolicy } from "openclaw/plugin-sdk/ssrf-runtime";
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
};
export declare function postOmniRouteJson(params: {
    url: string;
    headers: Headers;
    body: unknown;
    timeoutMs?: number;
    signal?: AbortSignal;
    ssrfPolicy?: SsrFPolicy;
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
}): Promise<{
    response: Response;
    release: () => Promise<void>;
}>;
export declare function readOmniRouteJson(response: Response, operation: string): Promise<unknown>;
export declare function assertOmniRouteOk(response: Response, operation: string): Promise<void>;
//# sourceMappingURL=http.d.ts.map