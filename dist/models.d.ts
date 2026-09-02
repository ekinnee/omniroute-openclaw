export type OmniRouteModelDefinition = {
    id: string;
    name: string;
    reasoning: boolean;
    input: Array<"text" | "image">;
    cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
    };
    contextWindow?: number;
    maxTokens?: number;
    thinkingLevelMap?: Partial<Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", string | null>>;
    compat?: {
        supportsReasoningEffort?: boolean;
        supportedReasoningEfforts?: string[];
        supportsUsageInStreaming?: boolean;
        supportsTools?: boolean;
    };
};
export declare const OMNIROUTE_PROVIDER_ID = "omniroute";
export declare const OMNIROUTE_LABEL = "OmniRoute";
export declare const OMNIROUTE_API_KEY_ENV_VAR = "OMNIROUTE_API_KEY";
export declare const OMNIROUTE_BASE_URL_ENV_VAR = "OMNIROUTE_BASE_URL";
export declare const OMNIROUTE_DEFAULT_BASE_URL = "http://localhost:20128/v1";
//# sourceMappingURL=models.d.ts.map