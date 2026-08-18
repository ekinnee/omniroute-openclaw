import type { ProviderCatalogContext, ProviderCatalogResult } from "openclaw/plugin-sdk/plugin-entry";
import { type OmniRouteModelDefinition } from "./models.js";
import { resolveOmniRouteApiKey } from "./auth.js";
type OmniRouteProviderConfig = {
    baseUrl: string;
    api: "openai-completions";
    models: OmniRouteModelDefinition[];
    apiKey?: string;
};
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
type OmniRouteCatalogCredentials = {
    runtimeApiKey: string;
    discoveryApiKey: string;
};
export declare function resolveOmniRouteCatalogCredentials(params: {
    auth: ReturnType<ProviderCatalogContext["resolveProviderAuth"]>;
    config: ProviderCatalogContext["config"];
    agentDir?: string;
    workspaceDir?: string;
    resolveConcreteApiKey?: typeof resolveOmniRouteApiKey;
}): OmniRouteCatalogCredentials | null | Promise<OmniRouteCatalogCredentials | null>;
export declare function buildLiveOmniRouteProvider(ctx: ProviderCatalogContext): Promise<OmniRouteProviderConfig | null>;
export declare function buildOmniRouteCatalog(ctx: ProviderCatalogContext): Promise<ProviderCatalogResult>;
export {};
//# sourceMappingURL=provider-catalog.d.ts.map