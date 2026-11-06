import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ProviderCatalogContext } from "openclaw/plugin-sdk/plugin-entry";

let credential = 0;
function context(apiKey = `discovery-fixture-${++credential}`): ProviderCatalogContext {
  return {
    config: { models: { providers: { omniroute: { baseUrl: "http://localhost:20128/v1", models: [] } } } },
    env: {},
    resolveProviderApiKey: () => ({ apiKey }),
    resolveProviderAuth: () => ({ apiKey, mode: "api_key", source: "env" }),
  };
}

const textModel = {
  id: "fixture/new-model",
  type: "chat",
  supported_endpoints: ["responses"],
  output_modalities: ["text"],
  input_modalities: ["text", "image"],
  context_length: 872_000,
  max_output_tokens: 128_000,
  capabilities: { supportsThinking: true, effort_tiers: ["low", "high"], tool_calling: false },
};

describe("model discovery compatibility", () => {
  beforeAll(async () => {
    await import("./provider-catalog.js");
  }, 30_000);
  afterEach(() => vi.restoreAllMocks());

  it("discovers Responses-backed text with exact metadata and agrees with the audit", async () => {
    const { buildOmniRouteCatalog } = await import("./provider-catalog.js");
    const { buildOmniRouteCatalogAuditReport } = await import("./catalog-audit.js");
    const data = [
      textModel,
      { ...textModel, id: "fixture/chat", supported_endpoints: ["/v1/chat/completions"] },
      { ...textModel, id: "fixture/legacy", supported_endpoints: undefined },
      { ...textModel, id: "fixture/image", type: "image", output_modalities: ["image"] },
      { ...textModel, id: "fixture/audio", type: "audio", output_modalities: ["audio"] },
      { ...textModel, id: "fixture/decision", supported_endpoints: ["decisions"] },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data }));
    const catalog = await buildOmniRouteCatalog(context());
    expect(catalog).toMatchObject({ provider: { api: "openai-completions", models: [
      { id: textModel.id, contextWindow: 872_000, maxTokens: 128_000, input: ["text", "image"],
        compat: { supportsTools: false, supportedReasoningEfforts: ["low", "high"] } },
      { id: "fixture/chat" }, { id: "fixture/legacy" },
    ] } });
    const audit = buildOmniRouteCatalogAuditReport({ payload: { data }, baseUrl: "http://localhost:20128/v1" });
    expect(audit.models.filter((row) => row.catalogClass === "chat").map((row) => row.id))
      .toEqual([textModel.id, "fixture/chat", "fixture/legacy"]);
  });

});
