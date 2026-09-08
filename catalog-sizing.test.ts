import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOmniRouteCatalog, fetchOmniRouteChatModels } from "./provider-catalog.js";
import { buildOmniRouteCatalogAuditReport } from "./catalog-audit.js";

const response = (data: unknown[]) => new Response(JSON.stringify({ data }), {
  headers: { "Content-Type": "application/json" },
});
const context = (baseUrl: string) => ({
  config: { models: { providers: { omniroute: { baseUrl } } } },
  env: {},
  resolveProviderAuth: () => ({ apiKey: "fixture-key", mode: "api_key", source: "env" }),
} as never);

afterEach(() => vi.restoreAllMocks());

describe("chat catalog sizing admission", () => {
  it("publishes only fully sized rows while the audit retains incomplete rows", async () => {
    const data = [
      { id: "missing-both", capabilities: { supportsThinking: true } },
      { id: "missing-output", context_length: 42000 },
      { id: "missing-context", max_output_tokens: 3000 },
      { id: "sized", context_length: 42000, max_output_tokens: 3000 },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => response(data));
    const catalog = await buildOmniRouteCatalog(context("http://localhost:20128/sizing-mixed/v1"));
    expect(catalog?.provider.models).toEqual([
      expect.objectContaining({ id: "sized", contextWindow: 42000, maxTokens: 3000 }),
    ]);
    const audit = buildOmniRouteCatalogAuditReport({ baseUrl: "http://localhost:20128/v1", payload: { data } });
    expect(audit.models.map(row => row.id)).toEqual(data.map(row => row.id));
    expect(audit.models[0].missing).toEqual(expect.arrayContaining(["context_window", "max_output_tokens"]));
    expect(audit.models[1].missing).toContain("max_output_tokens");
    expect(audit.models[2].missing).toContain("context_window");
  });

  it("does not cache an entirely incomplete catalog and recovers on the next discovery", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response([{ id: "corrected" }]))
      .mockResolvedValueOnce(response([{ id: "corrected", context_length: 42000, max_output_tokens: 3000 }]));
    const ctx = context("http://localhost:20128/sizing-retry/v1");
    await expect(buildOmniRouteCatalog(ctx)).resolves.toBeNull();
    await expect(buildOmniRouteCatalog(ctx)).resolves.toMatchObject({ provider: { models: [
      { id: "corrected", contextWindow: 42000, maxTokens: 3000 },
    ] } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid limits and preserves valid aliases without letting a rejected duplicate hide a valid row", async () => {
    const invalid = [0, -1, "42000", null];
    const data = invalid.flatMap((value, index) => [
      { id: `bad-context-${index}`, context_length: value, max_output_tokens: 3000 },
      { id: `bad-output-${index}`, context_length: 42000, max_output_tokens: value },
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response([
      ...data, { id: "duplicate" },
      { id: "duplicate", max_input_tokens: 42000, maxOutputTokens: 3000 },
      { id: "camel", contextWindow: 50000, maxOutputTokens: 4000 },
    ]));
    await expect(fetchOmniRouteChatModels({ baseUrl: "http://localhost:20128/v1" })).resolves.toEqual([
      expect.objectContaining({ id: "duplicate", contextWindow: 42000, maxTokens: 3000 }),
      expect.objectContaining({ id: "camel", contextWindow: 50000, maxTokens: 4000 }),
    ]);
  });
});
