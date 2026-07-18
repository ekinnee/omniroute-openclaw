import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-model-shared";
import type { ProviderCatalogContext } from "openclaw/plugin-sdk/provider-catalog-shared";
export declare function buildOmniRouteProvider(baseUrl?: string): ModelProviderConfig;
type OmniRouteModelEntry = {
    id?: unknown;
    name?: unknown;
    root?: unknown;
    type?: unknown;
    supported_endpoints?: unknown;
    output_modalities?: unknown;
    context_length?: unknown;
    max_input_tokens?: unknown;
    contextWindow?: unknown;
    max_output_tokens?: unknown;
    maxOutputTokens?: unknown;
    dimensions?: unknown;
    embedding_dimensions?: unknown;
    output_dimensions?: unknown;
    input_modalities?: unknown;
    supported_sizes?: unknown;
    capabilities?: unknown;
};
export type OmniRouteEmbeddingModel = {
    id: string;
    name: string;
    maxInputTokens?: number;
    dimensions?: number;
};
export type OmniRouteImageModel = {
    id: string;
    name: string;
    supportedSizes: string[];
    inputModalities: string[];
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
export declare function buildOmniRouteEmbeddingModelFromCatalogEntry(entry: OmniRouteModelEntry): OmniRouteEmbeddingModel | null;
export declare function buildOmniRouteImageModelFromCatalogEntry(entry: OmniRouteModelEntry): OmniRouteImageModel | null;
export declare function fetchOmniRouteChatModels(params: {
    baseUrl: string;
    apiKey?: string;
    signal?: AbortSignal;
}): Promise<ModelProviderConfig["models"]>;
export declare function fetchOmniRouteEmbeddingModels(params: {
    baseUrl: string;
    apiKey?: string;
    signal?: AbortSignal;
}): Promise<OmniRouteEmbeddingModel[]>;
export declare function fetchOmniRouteImageModels(params: {
    baseUrl: string;
    apiKey?: string;
    signal?: AbortSignal;
}): Promise<OmniRouteImageModel[]>;
export declare function buildLiveOmniRouteProvider(ctx: ProviderCatalogContext): Promise<ModelProviderConfig>;
export {};
//# sourceMappingURL=provider-catalog.d.ts.map