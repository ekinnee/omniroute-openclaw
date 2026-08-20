import type { ProviderFetchUsageSnapshotContext, ProviderResolveUsageAuthContext } from "openclaw/plugin-sdk/plugin-entry";
import type { ProviderUsageSnapshot } from "openclaw/plugin-sdk/provider-usage";
export declare function omniRouteUsageUrl(baseUrl: string): string;
export declare function fetchOmniRouteUsage(ctx: ProviderFetchUsageSnapshotContext): Promise<ProviderUsageSnapshot>;
export declare function resolveOmniRouteUsageAuth(ctx: ProviderResolveUsageAuthContext): {
    token: string;
} | null;
//# sourceMappingURL=usage.d.ts.map