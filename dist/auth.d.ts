import { resolveApiKeyForProvider, type AuthProfileStore } from "openclaw/plugin-sdk/agent-runtime";
type ConfiguredParams = {
    cfg?: unknown;
    agentDir?: string;
};
export declare function isOmniRouteConfigured(params: ConfiguredParams): boolean;
export declare function isOmniRouteConfiguredAsync(params: ConfiguredParams): Promise<boolean>;
export declare function resolveOmniRouteApiKey(params: {
    cfg?: Parameters<typeof resolveApiKeyForProvider>[0]["cfg"];
    agentDir?: string;
    workspaceDir?: string;
    store?: AuthProfileStore;
}): Promise<string | undefined>;
export {};
//# sourceMappingURL=auth.d.ts.map