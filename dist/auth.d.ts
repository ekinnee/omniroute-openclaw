import { resolveApiKeyForProvider, type AuthProfileStore } from "openclaw/plugin-sdk/agent-runtime";
export declare function isOmniRouteConfigured(params: {
    cfg?: unknown;
    agentDir?: string;
}): boolean;
export declare function resolveOmniRouteApiKey(params: {
    cfg?: Parameters<typeof resolveApiKeyForProvider>[0]["cfg"];
    agentDir?: string;
    workspaceDir?: string;
    store?: AuthProfileStore;
}): Promise<string | undefined>;
//# sourceMappingURL=auth.d.ts.map