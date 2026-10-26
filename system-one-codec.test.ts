import { describe, expect, it } from "vitest";
import { encodeSystemOneRequest, decodeSystemOneResponse } from "./system-one-codec.js";

const batch = {
  state: { ticket: "Duplicate charge" },
  questions: {
    review: { type: "boolean", criteria: { true: "Needs review", false: null } },
    route: { type: "choice", criteria: { billing: "Payments", support: null } },
    urgency: { type: "score", criteria: ["Routine", "Soon", "Urgent"] },
  },
};
function response() {
  return {
    model: "jev-resolved",
    answers: {
      review: { type: "noul", noul: 0.94 },
      route: { type: "choice", choice: "support", probabilities: { billing: 0.8, support: 0.19 }, confidence: 0 },
      urgency: { type: "score", score: 1.63, probabilities: { "2": 0.7, "0": 0.07, "1": 0.23 } },
    },
    usage: { input_tokens: 320, output_tokens: 31, cost: 0.001 },
  };
}

describe("System One preparation codec", () => {
  it("preserves exact model/state/criteria and translates only boolean to noul", () => {
    const wire = encodeSystemOneRequest(batch, "custom-prefix/jev-alias");
    expect(wire).toEqual({ ...batch, model: "custom-prefix/jev-alias", questions: {
      ...batch.questions, review: { ...batch.questions.review, type: "noul" },
    } });
    expect(batch.questions.review.type).toBe("boolean");
  });
  it("preserves resolved model, fractional score, reported choice and rounded estimates", () => {
    expect(decodeSystemOneResponse(response(), encodeSystemOneRequest(batch, "fixture/model"))).toEqual({
      model: "jev-resolved",
      answers: {
        review: { type: "boolean", probabilityTrue: 0.94 },
        route: { type: "choice", choice: "support", probabilities: { billing: 0.8, support: 0.19 }, confidence: 0 },
        urgency: { type: "score", score: 1.63, probabilities: [0.07, 0.23, 0.7] },
      },
      usage: { inputTokens: 320, outputTokens: 31 },
    });
  });
});

describe("input boundaries", () => {
  it.each([null, "text", [], { facts: [null, true, 1, "x"] }])("preserves JSON entry %j", (state) => {
    expect(encodeSystemOneRequest({ ...batch, state }, "x").state).toEqual(state);
  });
  it("snapshots caller state and questions before later asynchronous work", () => {
    const original = structuredClone(batch);
    const wire = encodeSystemOneRequest(original, "x");
    original.state.ticket = "changed";
    original.questions.urgency.criteria[0] = "changed";
    expect(wire.state).toEqual(batch.state);
    expect(wire.questions.urgency).toEqual(batch.questions.urgency);
  });
  it.each([
    ["empty model", batch, ""],
    ["whitespace model", batch, " "],
    ["missing state", { questions: batch.questions }, "x"],
    ["numeric top-level state", { ...batch, state: 1 }, "x"],
    ["empty questions", { ...batch, questions: {} }, "x"],
    ["extra field", { ...batch, ambientHistory: "secret" }, "x"],
    ["bad question type", { ...batch, questions: { q: { type: "predicate" } } }, "x"],
    ["bad boolean criteria", { ...batch, questions: { q: { type: "boolean", criteria: { yes: "yes" } } } }, "x"],
    ["single choice", { ...batch, questions: { q: { type: "choice", criteria: { a: "a" } } } }, "x"],
    ["single score level", { ...batch, questions: { q: { type: "score", criteria: ["a"] } } }, "x"],
    ["non-entry instruction", { ...batch, questions: { q: { type: "boolean", instructions: false } } }, "x"],
    ["extra question field", { ...batch, questions: { q: { type: "boolean", secret: "never echo" } } }, "x"],
  ])("rejects %s", (_name, input, model) => {
    expect(() => encodeSystemOneRequest(input, model as string)).toThrow("Unsupported System One input");
  });
  it.each([undefined, NaN, Infinity, 1n, new Date(), new Map(), () => "x", new Array(2)])("rejects non-JSON %s", (value) => {
    expect(() => encodeSystemOneRequest({ ...batch, state: { value } }, "x")).toThrow("Unsupported System One input");
  });
  it("rejects getters without invoking them", () => {
    let reads = 0;
    const state = Object.defineProperty({}, "hidden", { enumerable: true, get() { reads++; return "secret"; } });
    expect(() => encodeSystemOneRequest({ ...batch, state }, "x")).toThrow();
    expect(reads).toBe(0);
  });
  it("rejects toJSON, cycles, symbols, hidden properties, depth and byte overflow", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    let deep: unknown = null;
    for (let i = 0; i < 70; i++) deep = [deep];
    const hidden = Object.defineProperty({}, "secret", { value: "x" });
    for (const state of [{ toJSON: () => ({}) }, cycle, { [Symbol("x")]: 1 }, hidden, deep, "x".repeat(4 * 1024 * 1024)]) {
      expect(() => encodeSystemOneRequest({ ...batch, state }, "x")).toThrow("Unsupported System One input");
    }
  });
  it("preserves special keys as own data properties without prototype mutation", () => {
    const input = JSON.parse('{"state":null,"questions":{"__proto__":{"type":"choice","criteria":{"constructor":null,"__proto__":"label"}}}}');
    const wire = encodeSystemOneRequest(input, "x");
    expect(Object.keys(wire.questions)).toEqual(["__proto__"]);
    const result = decodeSystemOneResponse(JSON.parse('{"model":"x","answers":{"__proto__":{"type":"choice","choice":"__proto__","probabilities":{"constructor":0.3,"__proto__":0.7}}}}'), wire);
    expect(Object.keys(result.answers)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(result.answers)).toBe(Object.prototype);
  });
});

describe("response correspondence", () => {
  const request = () => encodeSystemOneRequest(batch, "x");
  it("keeps absent usage/confidence absent and ignores unconsumed extensions", () => {
    const { usage: _usage, ...value } = response();
    const decoded = decodeSystemOneResponse({ ...value, gateway_metadata: { source: "fixture" } }, request());
    expect(decoded).not.toHaveProperty("usage");
    expect(decoded.answers.urgency).not.toHaveProperty("confidence");
    expect(decoded).not.toHaveProperty("gateway_metadata");
  });
  it("preserves partial usage and zero counters", () => {
    expect(decodeSystemOneResponse({ ...response(), usage: { input_tokens: 0 } }, request()).usage).toEqual({ inputTokens: 0 });
  });
  it("validates a supplied score legend, without requiring one", () => {
    const value = response();
    const legend = { "2": "Urgent", "0": "Routine", "1": "Soon" };
    const withLegend = { ...value, answers: { ...value.answers, urgency: { ...value.answers.urgency, legend } } };
    expect(decodeSystemOneResponse(withLegend, request()).answers.urgency).toEqual({ type: "score", score: 1.63, probabilities: [0.07, 0.23, 0.7] });
    legend["1"] = "different rubric";
    expect(() => decodeSystemOneResponse(withLegend, request())).toThrow("Invalid System One response");
  });
  it.each([
    ["missing answer", (v: any) => { delete v.answers.review; }],
    ["extra answer", (v: any) => { v.answers.extra = v.answers.review; }],
    ["wrong answer type", (v: any) => { v.answers.review.type = "boolean"; }],
    ["wrong noul", (v: any) => { v.answers.review.noul = 1.1; }],
    ["NaN noul", (v: any) => { v.answers.review.noul = NaN; }],
    ["unknown choice", (v: any) => { v.answers.route.choice = "other"; }],
    ["missing choice probability", (v: any) => { delete v.answers.route.probabilities.billing; }],
    ["extra choice probability", (v: any) => { v.answers.route.probabilities.other = 0; }],
    ["negative probability", (v: any) => { v.answers.route.probabilities.billing = -0.1; }],
    ["string probability", (v: any) => { v.answers.route.probabilities.billing = "0.8"; }],
    ["zero distribution", (v: any) => { v.answers.route.probabilities = { billing: 0, support: 0 }; }],
    ["missing score index", (v: any) => { delete v.answers.urgency.probabilities["1"]; }],
    ["array score distribution", (v: any) => { v.answers.urgency.probabilities = [0.07, 0.23, 0.7]; }],
    ["negative score", (v: any) => { v.answers.urgency.score = -0.01; }],
    ["score beyond rubric", (v: any) => { v.answers.urgency.score = 2.01; }],
    ["null confidence", (v: any) => { v.answers.route.confidence = null; }],
    ["excess confidence", (v: any) => { v.answers.route.confidence = 1.1; }],
    ["null usage", (v: any) => { v.usage = null; }],
    ["fractional tokens", (v: any) => { v.usage.input_tokens = 1.2; }],
    ["negative tokens", (v: any) => { v.usage.output_tokens = -1; }],
    ["unsafe tokens", (v: any) => { v.usage.input_tokens = Number.MAX_SAFE_INTEGER + 1; }],
    ["missing model", (v: any) => { delete v.model; }],
    ["blank model", (v: any) => { v.model = " "; }],
  ])("rejects %s without exposing provider data", (_name, mutate) => {
    const value = response();
    mutate(value);
    expect(() => decodeSystemOneResponse(value, request())).toThrow("Invalid System One response");
  });
});
