import { auditOmniRouteCatalog, type OmniRouteCatalogAuditReport } from "./catalog-audit.js";
type Writable = {
    write: (text: string) => unknown;
};
export type OmniRouteCatalogAuditCliOptions = {
    config?: NonNullable<Parameters<typeof auditOmniRouteCatalog>[0]>["config"];
    agentDir?: string;
    env?: NodeJS.ProcessEnv;
    stdout?: Writable;
    stderr?: Writable;
    loadAudit?: (params: Parameters<typeof auditOmniRouteCatalog>[0]) => Promise<OmniRouteCatalogAuditReport>;
};
export declare function parseOmniRouteCatalogAuditArgs(argv: readonly string[]): {
    json: boolean;
    help: boolean;
    agentId?: string;
};
export declare const OMNIROUTE_CATALOG_AUDIT_USAGE: string;
/**
 * Standalone command implementation. A package bin can call this without needing
 * the native plugin-CLI API that is unavailable at the supported 2026.7.1 floor.
 */
export declare function runOmniRouteCatalogAuditCli(argv: readonly string[], options?: OmniRouteCatalogAuditCliOptions): Promise<void>;
/** Entry point for the future package `bin` declaration. It only reads config and performs GET. */
export declare function runOmniRouteCatalogAuditExecutable(argv?: readonly string[]): Promise<void>;
export {};
//# sourceMappingURL=catalog-audit-cli.d.ts.map