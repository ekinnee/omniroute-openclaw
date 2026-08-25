export declare function normalizeOmniRouteBaseUrl(value: unknown): string;
/** Removes credentials, query strings, and fragments before an endpoint is rendered. */
export declare function redactOmniRouteBaseUrl(value: string): string;
export declare function resolveOmniRouteBaseUrl(params: {
    config?: unknown;
    env?: Record<string, string | undefined>;
    overrideBaseUrl?: unknown;
}): string;
//# sourceMappingURL=base-url.d.ts.map