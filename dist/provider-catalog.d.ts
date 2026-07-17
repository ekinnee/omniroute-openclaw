import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-model-shared";
import type { ProviderCatalogContext } from "openclaw/plugin-sdk/provider-catalog-shared";
export declare function buildOmniRouteProvider(): ModelProviderConfig;
type OmniRouteModelEntry = {
    id?: unknown;
    name?: unknown;
    root?: unknown;
    type?: unknown;
    context_length?: unknown;
    contextWindow?: unknown;
    max_output_tokens?: unknown;
    maxOutputTokens?: unknown;
    input_modalities?: unknown;
    capabilities?: unknown;
};
export declare function buildOmniRouteModelFromCatalogEntry(entry: OmniRouteModelEntry): {
    id: string;
    name: string;
    reasoning: boolean;
    input: ("image" | "text")[];
    cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
    };
    contextWindow: number;
    maxTokens: number;
    compat: {
        supportsUsageInStreaming: boolean;
        supportsTools: true | undefined;
    };
} | null;
export declare function fetchOmniRouteChatModels(params: {
    baseUrl: string;
    apiKey?: string;
    signal?: AbortSignal;
}): Promise<ModelProviderConfig["models"]>;
export declare function buildLiveOmniRouteProvider(ctx: ProviderCatalogContext): Promise<ModelProviderConfig>;
export {};
//# sourceMappingURL=provider-catalog.d.ts.map