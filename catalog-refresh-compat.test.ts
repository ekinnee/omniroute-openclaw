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

const textModel = { id: "fixture/new-model", type: "chat", context_length: 872_000, max_output_tokens: 128_000 };

describe("catalog refresh compatibility", () => {
  beforeAll(async () => {
    await import("./provider-catalog.js");
  }, 30_000);
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["HTTP 503", () => new Response("unavailable", { status: 503 })],
    ["HTTP 401", () => new Response("private response", { status: 401 })],
    ["invalid JSON", () => new Response("{")],
    ["missing data", () => Response.json({ unexpected: [] })],
  ])("reports %s to the host without rejecting its catalog hook", async (_label, response) => {
    const { buildOmniRouteCatalog } = await import("./provider-catalog.js");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response());
    await expect(buildOmniRouteCatalog(context())).resolves.toEqual({
      providers: {}, outcomes: [{ provider: "omniroute", status: "unavailable" }],
    });
  });

  it("retries a failed refresh and does not reuse another credential's rows", async () => {
    const { buildOmniRouteCatalog } = await import("./provider-catalog.js");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_900_000_000_000);
    const ctx = context();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ data: [{ ...textModel, supported_endpoints: ["chat"] }] }))
      .mockRejectedValueOnce(new Error("connection failed"))
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ data: [{ ...textModel, id: "fixture/recovered", supported_endpoints: ["chat"] }] }));
    expect(await buildOmniRouteCatalog(ctx)).toMatchObject({ provider: { models: [{ id: textModel.id }] } });
    clock.mockReturnValue(1_900_000_031_000);
    expect(await buildOmniRouteCatalog(ctx)).toEqual({
      providers: {}, outcomes: [{ provider: "omniroute", status: "unavailable" }],
    });
    expect(await buildOmniRouteCatalog(context())).toBeNull();
    expect(await buildOmniRouteCatalog(ctx)).toMatchObject({ provider: { models: [{ id: "fixture/recovered" }] } });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("keeps missing auth and valid empty listings distinct from discovery failures", async () => {
    const { buildOmniRouteCatalog } = await import("./provider-catalog.js");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: [] }));
    expect(await buildOmniRouteCatalog(context(""))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await buildOmniRouteCatalog(context())).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
