import { resolveProviderAuthProfileApiKey } from "openclaw/plugin-sdk/provider-auth";
export declare function isOmniRouteConfigured(params: {
    cfg?: unknown;
    agentDir?: string;
}): boolean;
export declare function resolveOmniRouteApiKey(params: {
    cfg?: Parameters<typeof resolveProviderAuthProfileApiKey>[0]["cfg"];
    agentDir?: string;
}): Promise<string | undefined>;
//# sourceMappingURL=auth.d.ts.map