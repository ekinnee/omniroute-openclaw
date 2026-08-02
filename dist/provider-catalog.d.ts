import type { ProviderCatalogContext, ProviderCatalogResult } from "openclaw/plugin-sdk/plugin-entry";
import { type OmniRouteModelDefinition } from "./models.js";
type OmniRouteProviderConfig = {
    baseUrl: string;
    api: "openai-completions";
    models: OmniRouteModelDefinition[];
    apiKey?: string;
};
export declare function buildOmniRouteProvider(baseUrl?: string): OmniRouteProviderConfig;
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
export declare function buildOmniRouteEmbeddingModelFromCatalogEntry(entry: OmniRouteModelEntry): OmniRouteEmbeddingModel | null;
export declare function buildOmniRouteImageModelFromCatalogEntry(entry: OmniRouteModelEntry): OmniRouteImageModel | null;
export declare function fetchOmniRouteChatModels(params: {
    baseUrl: string;
    apiKey?: string;
    signal?: AbortSignal;
}): Promise<OmniRouteModelDefinition[]>;
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
export declare function buildLiveOmniRouteProvider(ctx: ProviderCatalogContext): Promise<OmniRouteProviderConfig>;
export declare function buildOmniRouteCatalog(ctx: ProviderCatalogContext, live: boolean): Promise<ProviderCatalogResult>;
export {};
//# sourceMappingURL=provider-catalog.d.ts.map