// Preparation only: a pure System One codec, not a registered decision provider.
import { isDeepStrictEqual } from "node:util";

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type Entry = string | null | readonly Json[] | { readonly [key: string]: Json };
type Question =
  | { readonly type: "noul"; readonly instructions?: Entry; readonly criteria?: { readonly true?: Entry; readonly false?: Entry } | null }
  | { readonly type: "choice"; readonly instructions?: Entry; readonly criteria: Readonly<Record<string, Entry>> }
  | { readonly type: "score"; readonly instructions?: Entry; readonly criteria: readonly Entry[] };
export type SystemOneRequest = {
  readonly model: string;
  readonly state: Entry;
  readonly questions: Readonly<Record<string, Question>>;
};
export type SystemOneResult = {
  readonly model: string;
  readonly answers: Readonly<Record<string,
    | { readonly type: "boolean"; readonly probabilityTrue: number }
    | { readonly type: "choice"; readonly choice: string; readonly probabilities: Readonly<Record<string, number>>; readonly confidence?: number }
    | { readonly type: "score"; readonly score: number; readonly probabilities: readonly number[]; readonly confidence?: number }
  >>;
  readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number };
};

// Local resource guards, not advertised model capabilities.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_NODES = 262_144;
const MAX_DEPTH = 64;
export class SystemOneCodecError extends Error {
  constructor(readonly reason: "unsupported-input" | "invalid-response") {
    super(reason === "unsupported-input" ? "Unsupported System One input" : "Invalid System One response");
    this.name = "SystemOneCodecError";
  }
}
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid shape");
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function entry(value: unknown): value is Entry {
  return value === null || typeof value === "string" || record(value) || Array.isArray(value);
}
function probability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function allowedKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** Snapshot plain JSON without invoking getters or toJSON, or coercing non-JSON values. */
function snapshot(value: unknown): unknown {
  let nodes = 0;
  const visit = (node: unknown, depth: number): void => {
    requireValid(++nodes <= MAX_NODES && depth <= MAX_DEPTH);
    if (node === null || typeof node === "string" || typeof node === "boolean") return;
    if (typeof node === "number") { requireValid(Number.isFinite(node)); return; }
    requireValid(typeof node === "object" && node);
    const array = Array.isArray(node);
    const prototype = Object.getPrototypeOf(node);
    requireValid(array ? prototype === Array.prototype : prototype === Object.prototype || prototype === null);
    requireValid(Object.getOwnPropertySymbols(node).length === 0);
    const keys = Object.getOwnPropertyNames(node);
    if (array) {
      requireValid(node.length <= MAX_NODES && keys.length === node.length + 1);
      for (let i = 0; i < node.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(node, String(i));
        requireValid(descriptor?.enumerable && "value" in descriptor);
        visit(descriptor.value, depth + 1);
      }
    } else {
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(node, key);
        requireValid(descriptor?.enumerable && "value" in descriptor);
        visit(descriptor.value, depth + 1);
      }
    }
  };
  visit(value, 0);
  const json = JSON.stringify(value);
  requireValid(Buffer.byteLength(json, "utf8") <= MAX_BYTES);
  return JSON.parse(json);
}

/** Accept the V1-shaped JSON subset. Host registration and broader V2 input are separate work. */
export function encodeSystemOneRequest(batch: unknown, model: string): SystemOneRequest {
  try {
    requireValid(typeof model === "string" && model.trim().length > 0);
    const value = snapshot({ batch, model });
    requireValid(record(value) && record(value.batch));
    const input = value.batch;
    requireValid(exactKeys(input, ["state", "questions"]) && entry(input.state));
    requireValid(record(input.questions) && Object.keys(input.questions).length > 0);
    const questions = Object.fromEntries(Object.entries(input.questions).map(([id, question]) => {
      requireValid(record(question) && allowedKeys(question, ["type", "instructions", "criteria"]));
      requireValid(!Object.hasOwn(question, "instructions") || entry(question.instructions));
      const criteria = question.criteria;
      if (question.type === "boolean") {
        requireValid(!Object.hasOwn(question, "criteria") || criteria === null ||
          (record(criteria) && allowedKeys(criteria, ["true", "false"]) && Object.values(criteria).every(entry)));
        return [id, { ...question, type: "noul" }];
      }
      if (question.type === "choice") {
        requireValid(record(criteria) && Object.keys(criteria).length >= 2 && Object.values(criteria).every(entry));
      } else {
        requireValid(question.type === "score" && Array.isArray(criteria) && criteria.length >= 2 && criteria.every(entry));
      }
      return [id, question];
    }));
    return { model, state: input.state, questions } as SystemOneRequest;
  } catch {
    throw new SystemOneCodecError("unsupported-input");
  }
}

/** Validate fields consumed by the host; ignore unconsumed vendor extensions. */
export function decodeSystemOneResponse(value: unknown, request: SystemOneRequest): SystemOneResult {
  try {
    const result = snapshot(value);
    requireValid(record(result) && typeof result.model === "string" && result.model.trim().length > 0);
    requireValid(record(result.answers) && exactKeys(result.answers, Object.keys(request.questions)));
    const rawAnswers = result.answers;
    const answers = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
      const answer = rawAnswers[id];
      requireValid(record(answer) && answer.type === question.type);
      if (question.type === "noul") {
        requireValid(probability(answer.noul));
        return [id, { type: "boolean" as const, probabilityTrue: answer.noul }];
      }
      const labels = question.type === "score"
        ? question.criteria.map((_, index) => String(index)) : Object.keys(question.criteria);
      requireValid(record(answer.probabilities) && exactKeys(answer.probabilities, labels));
      const probabilities = answer.probabilities;
      requireValid(Object.values(probabilities).every(probability));
      requireValid(Object.values(probabilities).some((value) => (value as number) > 0));
      requireValid(!Object.hasOwn(answer, "confidence") || probability(answer.confidence));
      const confidence = Object.hasOwn(answer, "confidence") ? { confidence: answer.confidence as number } : {};
      if (question.type === "choice") {
        requireValid(typeof answer.choice === "string" && labels.includes(answer.choice));
        return [id, { type: "choice" as const, choice: answer.choice,
          probabilities: probabilities as Record<string, number>, ...confidence }];
      }
      requireValid(typeof answer.score === "number" && Number.isFinite(answer.score) &&
        answer.score >= 0 && answer.score <= labels.length - 1);
      if (Object.hasOwn(answer, "legend")) {
        requireValid(record(answer.legend) && exactKeys(answer.legend, labels));
        const legend = answer.legend;
        requireValid(labels.every((label, index) => isDeepStrictEqual(legend[label], question.criteria[index])));
      }
      return [id, { type: "score" as const, score: answer.score,
        probabilities: labels.map((label) => probabilities[label] as number), ...confidence }];
    }));
    let usage: SystemOneResult["usage"];
    if (Object.hasOwn(result, "usage")) {
      requireValid(record(result.usage));
      const source = result.usage;
      for (const key of ["input_tokens", "output_tokens"]) {
        requireValid(!Object.hasOwn(source, key) || (Number.isSafeInteger(source[key]) && (source[key] as number) >= 0));
      }
      usage = {
        ...(Object.hasOwn(source, "input_tokens") ? { inputTokens: source.input_tokens as number } : {}),
        ...(Object.hasOwn(source, "output_tokens") ? { outputTokens: source.output_tokens as number } : {}),
      };
    }
    return { model: result.model, answers, ...(usage === undefined ? {} : { usage }) };
  } catch {
    throw new SystemOneCodecError("invalid-response");
  }
}
