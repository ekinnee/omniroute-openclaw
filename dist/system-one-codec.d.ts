type Json = null | boolean | number | string | readonly Json[] | {
    readonly [key: string]: Json;
};
type Entry = string | null | readonly Json[] | {
    readonly [key: string]: Json;
};
type Question = {
    readonly type: "noul";
    readonly instructions?: Entry;
    readonly criteria?: {
        readonly true?: Entry;
        readonly false?: Entry;
    } | null;
} | {
    readonly type: "choice";
    readonly instructions?: Entry;
    readonly criteria: Readonly<Record<string, Entry>>;
} | {
    readonly type: "score";
    readonly instructions?: Entry;
    readonly criteria: readonly Entry[];
};
export type SystemOneRequest = {
    readonly model: string;
    readonly state: Entry;
    readonly questions: Readonly<Record<string, Question>>;
};
export type SystemOneResult = {
    readonly model: string;
    readonly answers: Readonly<Record<string, {
        readonly type: "boolean";
        readonly probabilityTrue: number;
    } | {
        readonly type: "choice";
        readonly choice: string;
        readonly probabilities: Readonly<Record<string, number>>;
        readonly confidence?: number;
    } | {
        readonly type: "score";
        readonly score: number;
        readonly probabilities: readonly number[];
        readonly confidence?: number;
    }>>;
    readonly usage?: {
        readonly inputTokens?: number;
        readonly outputTokens?: number;
    };
};
export declare class SystemOneCodecError extends Error {
    readonly reason: "unsupported-input" | "invalid-response";
    constructor(reason: "unsupported-input" | "invalid-response");
}
/** Accept the V1-shaped JSON subset. Host registration and broader V2 input are separate work. */
export declare function encodeSystemOneRequest(batch: unknown, model: string): SystemOneRequest;
/** Validate fields consumed by the host; ignore unconsumed vendor extensions. */
export declare function decodeSystemOneResponse(value: unknown, request: SystemOneRequest): SystemOneResult;
export {};
//# sourceMappingURL=system-one-codec.d.ts.map