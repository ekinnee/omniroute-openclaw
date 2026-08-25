import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
declare const ADVERTISED_MODEL_FIELDS: readonly ["type", "supported_endpoints", "input_modalities", "output_modalities", "context_length", "max_input_tokens", "contextWindow", "max_output_tokens", "maxOutputTokens", "dimensions", "embedding_dimensions", "output_dimensions", "supported_sizes"];
declare const ADVERTISED_CAPABILITY_FIELDS: readonly ["reasoning", "supportsThinking", "thinking", "effort_tiers", "tool_calling", "vision", "attachment"];
export type OmniRouteCatalogAuditModel = {
    id: string;
    name?: string;
    root?: string;
    catalogClass: "chat" | "embedding" | "image" | "other";
    advertised: Partial<Record<(typeof ADVERTISED_MODEL_FIELDS)[number], unknown>>;
    capabilities: Partial<Record<(typeof ADVERTISED_CAPABILITY_FIELDS)[number], unknown>>;
    missing: string[];
};
export type OmniRouteCatalogAuditReport = {
    schemaVersion: 1;
    baseUrl: string;
    totalRows: number;
    invalidRows: number;
    duplicateIds: string[];
    modelCount: number;
    models: OmniRouteCatalogAuditModel[];
};
/** Uses the shared provider endpoint precedence without mutating configuration. */
export declare function resolveOmniRouteAuditBaseUrl(params: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
}): string;
/** Removes credentials, query strings, and fragments before an endpoint is rendered. */
export declare function redactOmniRouteAuditUrl(value: string): string;
export declare function buildOmniRouteCatalogAuditReport(params: {
    baseUrl: string;
    payload: unknown;
}): OmniRouteCatalogAuditReport;
/** GET the live catalog using the same credential and guarded transport path as provider requests. */
export declare function auditOmniRouteCatalog(params?: {
    config?: OpenClawConfig;
    agentDir?: string;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
}): Promise<OmniRouteCatalogAuditReport>;
export declare function formatOmniRouteCatalogAuditReport(report: OmniRouteCatalogAuditReport): string;
export {};
//# sourceMappingURL=catalog-audit.d.ts.map