export type OmniRouteCatalogEntry = {
    type?: unknown;
    supported_endpoints?: unknown;
    output_modalities?: unknown;
};
export declare function normalizeCatalogStringArray(value: unknown): string[];
export declare function normalizeCatalogType(value: unknown): string;
export declare function isCatalogChatEntry(entry: OmniRouteCatalogEntry): boolean;
export declare function isCatalogEmbeddingEntry(entry: OmniRouteCatalogEntry): boolean;
export declare function isCatalogImageEntry(entry: OmniRouteCatalogEntry): boolean;
//# sourceMappingURL=catalog-vocabulary.d.ts.map