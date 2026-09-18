// OmniRoute live catalog discovery tests.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

function mockCatalogContext(overrides?: {
  baseUrl?: string;
  apiKey?: string;
  discoveryApiKey?: string;
  resolvedApiKey?: string;
  resolvedDiscoveryApiKey?: string;
  envBaseUrl?: string;
  authMode?: string;
  authSource?: string;
  profileId?: string;
  request?: unknown;
}) {
  const apiKey = overrides?.apiKey;
  const discoveryApiKey = overrides?.discoveryApiKey ?? apiKey;
  return {
    config: {
      models: {
        providers: {
          omniroute: {
            baseUrl: overrides?.baseUrl,
            request: overrides?.request,
          },
        },
      },
    },
    env: {
      OMNIROUTE_BASE_URL: overrides?.envBaseUrl,
    },
    resolveProviderApiKey: () => ({
      apiKey: overrides?.resolvedApiKey ?? apiKey,
      discoveryApiKey: overrides?.resolvedDiscoveryApiKey ?? discoveryApiKey,
    }),
    resolveProviderAuth: () => ({
      apiKey,
      discoveryApiKey,
      mode: overrides?.authMode ?? "api_key",
      source: overrides?.authSource ?? (apiKey ? "env" : "none"),
      profileId: overrides?.profileId,
    }),
  } as never;
}

function mockCatalogResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OmniRoute provider catalog", () => {

  beforeAll(async () => {
    // Cold SDK loading belongs to setup, not the first behavior test's deadline.
    await import("./provider-catalog.js");
  }, 30_000);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("forwards AbortSignal to fetch for chat model discovery", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), {
            once: true,
          });
        }),
    );

    const discovery = fetchOmniRouteChatModels({
      baseUrl: "http://localhost:20128/v1",
      apiKey: "secret-key",
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(requestSignal).toBeInstanceOf(AbortSignal));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
    controller.abort();
    await expect(discovery).rejects.toBeDefined();
  });

  it("maps live OmniRoute chat models and filters non-chat models", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          {
            id: "auto",
            object: "model",
            owned_by: "combo",
            root: "auto",
            context_length: 128_000,
            max_output_tokens: 16_384,
            capabilities: { tool_calling: true, reasoning: true, thinking: true },
          },
          {
            id: "if/kimi-k2",
            object: "model",
            name: "Kimi K2",
            type: "chat",
            context_length: 262_144,
            max_output_tokens: 32_768,
            input_modalities: ["text", "image"],
            capabilities: { tool_calling: true, reasoning: true },
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "nebius/Qwen/Qwen3-Embedding-8B",
            type: "embedding",
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "openai/dall-e-3",
            type: "image",
          },
        ],
      }),
    );

    const models = await fetchOmniRouteChatModels({
      baseUrl: "http://localhost:20128/v1/",
      apiKey: "secret-key",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toMatch(
      /^Bearer /,
    );
    expect(models.map((model) => model.id)).toEqual(["auto", "if/kimi-k2"]);
    expect(models[1]).toMatchObject({
      name: "Kimi K2",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 262_144,
      maxTokens: 32_768,
      compat: {
        supportsUsageInStreaming: true,
        supportsTools: true,
      },
    });
    expect(models[0]).toMatchObject({
      id: "auto",
      reasoning: true,
      contextWindow: 128_000,
      maxTokens: 16_384,
    });
    expect(models[0].compat?.supportsReasoningEffort).not.toBe(true);
    expect(models[0].compat?.supportedReasoningEfforts).toBeUndefined();
    expect(models[0].thinkingLevelMap).toEqual({
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    });
  });

  it.each([
    { advertised: false, expected: false },
    { advertised: true, expected: true },
    { advertised: undefined, expected: undefined },
    { advertised: "false", expected: undefined },
  ])("preserves tool support $advertised through the completions transport", async ({ advertised, expected }) => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    const { buildOpenAICompletionsParams } = await import(
      "openclaw/plugin-sdk/provider-transport-runtime"
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [{
          id: "provider/tool-support",
          type: "chat",
          context_length: 8192,
          max_output_tokens: 1024,
          capabilities: { tool_calling: advertised },
        }],
      }),
    );
    const [catalogModel] = await fetchOmniRouteChatModels({
      baseUrl: "http://localhost:20128/v1",
    });
    const payload = buildOpenAICompletionsParams({
      ...catalogModel,
      provider: "omniroute",
      api: "openai-completions",
      baseUrl: "http://localhost:20128/v1",
    }, {
      messages: [{ role: "user", content: "hello", timestamp: 0 }],
      tools: [{
        name: "fixture_tool",
        description: "A fixture tool",
        parameters: { type: "object", properties: {} },
      }],
    }, {});

    expect(catalogModel.compat?.supportsTools).toBe(expected);
    if (expected === false) {
      expect(payload.tools).toBeUndefined();
    } else {
      expect(payload.tools).toEqual([
        expect.objectContaining({ function: expect.objectContaining({ name: "fixture_tool" }) }),
      ]);
    }
  });

  it("does not treat auto or reasoning-only models as controllable thinking models", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          { context_length: 42_000, max_output_tokens: 3_000, id: "auto", type: "chat" },
          { context_length: 42_000, max_output_tokens: 3_000, id: "provider/reasoning-only", type: "chat", capabilities: { reasoning: true } },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "provider/thinking-disabled",
            type: "chat",
            capabilities: {
              reasoning: true,
              thinking: false,
              supportsThinking: false,
              effort_tiers: ["none", "low", "high"],
            },
          },
        ],
      }),
    );

    const models = await fetchOmniRouteChatModels({ baseUrl: "http://localhost:20128/v1" });

    expect(models).toMatchObject([
      { id: "auto", reasoning: false },
      { id: "provider/reasoning-only", reasoning: true },
      { id: "provider/thinking-disabled", reasoning: true },
    ]);
    for (const model of models) {
      expect(model.compat?.supportsReasoningEffort).not.toBe(true);
      expect(model.compat?.supportedReasoningEfforts).toBeUndefined();
      if (model.reasoning) {
        expect(model.thinkingLevelMap).toEqual({
          off: null,
          minimal: null,
          low: null,
          medium: null,
          high: null,
          xhigh: null,
          max: null,
        });
      } else {
        expect(model.thinkingLevelMap).toBeUndefined();
      }
    }
  });

  it("uses explicit thinking effort tiers exactly and does not invent a selector without them", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "provider/explicit-tiers",
            type: "chat",
            capabilities: {
              reasoning: true,
              supportsThinking: true,
              effort_tiers: [" HIGH ", "none", "MAX", "ultra", "high", "invalid", 42],
            },
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "provider/canonical-thinking",
            type: "chat",
            capabilities: { supportsThinking: true },
          },
        ],
      }),
    );

    const models = await fetchOmniRouteChatModels({ baseUrl: "http://localhost:20128/v1" });

    expect(models[0]).toMatchObject({
      id: "provider/explicit-tiers",
      reasoning: true,
      compat: {
        supportsReasoningEffort: true,
      },
      thinkingLevelMap: { off: "none", high: "high", max: "max", xhigh: null },
    });
    expect([...models[0].compat!.supportedReasoningEfforts!].sort()).toEqual([
      "high",
      "max",
      "none",
    ]);
    expect(models[0].compat!.supportedReasoningEfforts).not.toContain("ultra");
    expect(models[1]).toMatchObject({
      id: "provider/canonical-thinking",
      reasoning: true,
    });
    expect(models[1].compat?.supportsReasoningEffort).not.toBe(true);
    expect(models[1].compat?.supportedReasoningEfforts).toBeUndefined();
    expect(models[1].thinkingLevelMap).toEqual({
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    });
    expect(models[1]).toMatchObject({ contextWindow: 42_000, maxTokens: 3_000 });
  });

  it("excludes omitted chat limits while retaining catalog-audit missing fields", async () => {
    const payload = {
      data: [
        {
          id: "provider/canonical-thinking",
          type: "chat",
          capabilities: { supportsThinking: true },
        },
        {
          id: "provider/sized-chat",
          type: "chat",
          context_length: 42_000,
          max_output_tokens: 3_000,
        },
      ],
    };
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    const { buildOmniRouteCatalogAuditReport } = await import("./catalog-audit.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockCatalogResponse(payload));

    const models = await fetchOmniRouteChatModels({ baseUrl: "http://localhost:20128/v1" });
    const report = buildOmniRouteCatalogAuditReport({
      baseUrl: "http://localhost:20128/v1",
      payload,
    });

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "provider/sized-chat",
      contextWindow: 42_000,
      maxTokens: 3_000,
    });

    const unknownLimits = report.models.find((model) => model.id === "provider/canonical-thinking");
    const sized = report.models.find((model) => model.id === "provider/sized-chat");
    expect(unknownLimits?.missing).toEqual(
      expect.arrayContaining(["context_window", "max_output_tokens", "capabilities.effort_tiers"]),
    );
    expect(sized?.missing).not.toContain("context_window");
    expect(sized?.missing).not.toContain("max_output_tokens");
  });

  it("projects and admits only a fetched model's exact reasoning subset end to end", async () => {
    const [{ fetchOmniRouteChatModels }, plugin, { buildOpenAICompletionsParams }] =
      await Promise.all([
        import("./provider-catalog.js"),
        import("./index.js"),
        import("openclaw/plugin-sdk/provider-transport-runtime"),
      ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          {
            id: "provider/subset-thinking",
            type: "chat",
            context_length: 42_000,
            max_output_tokens: 3_000,
            input_modalities: ["text", "image"],
            capabilities: {
              reasoning: true,
              supportsThinking: true,
              effort_tiers: ["none", "low", "medium", "xhigh"],
              tool_calling: true,
              vision: true,
            },
          },
        ],
      }),
    );

    const [model] = await fetchOmniRouteChatModels({ baseUrl: "http://localhost:20128/v1" });

    expect(model).toMatchObject({
      id: "provider/subset-thinking",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 42_000,
      maxTokens: 3_000,
      compat: {
        supportsReasoningEffort: true,
        supportedReasoningEfforts: ["none", "low", "medium", "xhigh"],
        supportsUsageInStreaming: true,
        supportsTools: true,
      },
      thinkingLevelMap: {
        off: "none",
        minimal: null,
        low: "low",
        medium: "medium",
        high: null,
        xhigh: "xhigh",
        max: null,
      },
    });

    const registerProvider = vi.fn();
    plugin.default.register({
      registerProvider,
      registerEmbeddingProvider: vi.fn(),
      registerImageGenerationProvider: vi.fn(),
      registerWebSearchProvider: vi.fn(),
      registerVideoGenerationProvider: vi.fn(),
    } as never);
    const resolveThinkingProfile = registerProvider.mock.calls[0]?.[0].resolveThinkingProfile;
    expect(resolveThinkingProfile).toBeTypeOf("function");

    const { id: modelId, ...modelContext } = model;
    const profile = resolveThinkingProfile({
      provider: "omniroute",
      modelId,
      ...modelContext,
    });
    expect(profile).toEqual({
      levels: [{ id: "off" }, { id: "low" }, { id: "medium" }, { id: "xhigh" }],
    });
    expect(profile.levels).not.toContainEqual({ id: "high" });

    const transportModel = {
      ...model,
      provider: "omniroute",
      api: "openai-completions",
      baseUrl: "http://localhost:20128/v1",
    };
    const context = { messages: [{ role: "user", content: "hello" }] };
    const emittedEfforts = profile.levels.map(({ id }: { id: keyof typeof model.thinkingLevelMap }) => {
      const reasoningEffort = model.thinkingLevelMap?.[id];
      expect(reasoningEffort).not.toBeNull();
      return buildOpenAICompletionsParams(transportModel as never, context as never, {
        reasoningEffort,
      } as never).reasoning_effort;
    });
    expect(emittedEfforts).toEqual(["none", "low", "medium", "xhigh"]);
    expect(emittedEfforts).not.toContain("high");
  }, 15_000);

  it("does not fall back when effort tiers are present but unusable", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "provider/empty-tiers",
            type: "chat",
            capabilities: { reasoning: true, supportsThinking: true, effort_tiers: [] },
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "provider/malformed-tiers",
            type: "chat",
            capabilities: { reasoning: true, supportsThinking: true, effort_tiers: "high" },
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "provider/unknown-tiers",
            type: "chat",
            capabilities: {
              reasoning: true,
              supportsThinking: true,
              effort_tiers: ["ultra", "invalid", 42],
            },
          },
        ],
      }),
    );

    const models = await fetchOmniRouteChatModels({ baseUrl: "http://localhost:20128/v1" });

    expect(models.map((model) => model.id)).toEqual([
      "provider/empty-tiers",
      "provider/malformed-tiers",
      "provider/unknown-tiers",
    ]);
    for (const model of models) {
      expect(model.reasoning).toBe(true);
      expect(model.compat?.supportsReasoningEffort).toBeUndefined();
      expect(model.compat?.supportedReasoningEfforts).toBeUndefined();
      expect(model.thinkingLevelMap).toEqual({
        off: null,
        minimal: null,
        low: null,
        medium: null,
        high: null,
        xhigh: null,
        max: null,
      });
    }
  });

  it("projects off and supported tiers through the installed OpenClaw completions transport", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    const { buildOpenAICompletionsParams: buildParams } = await import(
      "openclaw/plugin-sdk/provider-transport-runtime"
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "provider/reasoning-wire",
            type: "chat",
            capabilities: {
              reasoning: true,
              supportsThinking: true,
              effort_tiers: ["none", "low", "medium", "high", "xhigh", "max"],
            },
          },
        ],
      }),
    );
    const [projectedModel] = await fetchOmniRouteChatModels({
      baseUrl: "http://localhost:20128/v1",
    });
    expect(buildParams).toBeTypeOf("function");

    const model = {
      ...projectedModel,
      provider: "omniroute",
      api: "openai-completions",
      baseUrl: "http://localhost:20128/v1",
    };
    const context = { messages: [{ role: "user", content: "hello" }] };

    // OpenClaw owns the session/default level; its bare completions fallback is high.
    expect(buildParams(model, context, {}).reasoning_effort).toBe("high");
    expect(buildParams(model, context, { reasoningEffort: "none" }).reasoning_effort).toBe(
      "none",
    );
    expect(buildParams(model, context, { reasoningEffort: "off" }).reasoning_effort).toBe(
      "none",
    );
    for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
      expect(buildParams(model, context, { reasoningEffort: effort }).reasoning_effort).toBe(
        effort,
      );
    }
  });

  it("uses OmniRoute supported_endpoints as the live chat catalog source of truth", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          {
            max_output_tokens: 3_000,
            id: "auto/best-coding",
            object: "model",
            owned_by: "combo",
            root: "auto/best-coding",
            max_input_tokens: 200_000,
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "openrouter/google/gemini-pro",
            object: "model",
            owned_by: "openrouter",
            root: "google/gemini-pro",
            supported_endpoints: ["chat", "images"],
            type: "image",
            output_modalities: ["text", "image"],
            capabilities: { vision: true },
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "openai/gpt-4.1",
            object: "model",
            supported_endpoints: ["/v1/chat/completions"],
            type: "image",
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "openai/gpt-4o-mini",
            object: "model",
            supported_endpoints: ["/api/v1/chat/completions"],
            type: "image",
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "hf/diffusion-model",
            object: "model",
            owned_by: "huggingface",
            supported_endpoints: ["images"],
            type: "image",
            output_modalities: ["image"],
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "nebius/Qwen/Qwen3-Embedding-8B",
            object: "model",
            owned_by: "nebius",
            supported_endpoints: ["embeddings"],
          },
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "audio/speech-only",
            object: "model",
            type: "audio",
          },
        ],
      }),
    );

    const models = await fetchOmniRouteChatModels({
      baseUrl: "http://localhost:20128/v1",
    });

    expect(models.map((model) => model.id)).toEqual([
      "auto/best-coding",
      "openrouter/google/gemini-pro",
      "openai/gpt-4.1",
      "openai/gpt-4o-mini",
    ]);
    expect(models[0]).toMatchObject({
      id: "auto/best-coding",
      contextWindow: 200_000,
      reasoning: false,
    });
    expect(models[0].maxTokens).toBe(3_000);
    expect(models[1]).toMatchObject({
      id: "openrouter/google/gemini-pro",
      input: ["text", "image"],
    });
    expect(models[2]).toMatchObject({ id: "openai/gpt-4.1" });
  });

  it("does not synthesize auto when live OmniRoute discovery succeeds without it", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          {
            context_length: 42_000,
            max_output_tokens: 3_000,
            id: "if/kimi-k2",
            object: "model",
            owned_by: "inference.net",
          },
        ],
      }),
    );

    const models = await fetchOmniRouteChatModels({
      baseUrl: "http://localhost:20128/v1",
    });

    expect(models.map((model) => model.id)).toEqual(["if/kimi-k2"]);
  });

  it("does not fabricate a static auto model when live discovery fails", async () => {
    const { buildOmniRouteCatalog } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("secret-key should not be read into errors", { status: 401 }),
    );

    const catalog = await buildOmniRouteCatalog(
      mockCatalogContext({
        baseUrl: "http://omniroute.example/v1",
        apiKey: "secret-key",
      }),
    );

    expect(catalog).toBeNull();
  });

  it("applies configured request headers and alternate auth to live catalog discovery", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/guarded", type: "chat" }] }),
    );

    const provider = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        baseUrl: "https://guarded-discovery.example/v1",
        apiKey: "discovery-key",
        request: {
          allowPrivateNetwork: true,
          headers: { "X-Trace": "catalog-trace" },
          auth: {
            mode: "header",
            headerName: "X-Gateway-Token",
            prefix: "Token ",
            value: "request-secret",
          },
        },
      }),
    );

    expect(provider?.models).toMatchObject([{ id: "provider/guarded" }]);
    const request = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(request?.headers);
    expect(request).toMatchObject({ method: "GET", redirect: "manual" });
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("X-Trace")).toBe("catalog-trace");
    expect(headers.get("X-Gateway-Token")).toBe("Token request-secret");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("does not reach a private discovery endpoint when its configured policy denies it", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      buildLiveOmniRouteProvider(
        mockCatalogContext({
          baseUrl: "http://10.0.0.5:1234/v1",
          apiKey: "private-discovery-key",
          request: { allowPrivateNetwork: false },
        }),
      ),
    ).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Blocked hostname"));
  });

  it("bounds oversized live catalog responses before parsing them", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array(4 * 1024 * 1024 + 1), { status: 200 }),
    );

    await expect(
      buildLiveOmniRouteProvider(
        mockCatalogContext({
          baseUrl: "https://oversized-discovery.example/v1",
          apiKey: "oversized-discovery-key",
        }),
      ),
    ).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("response exceeded 4194304 bytes (4194305 bytes received)"),
    );
  });

  it("bounds JSON responses when callers use the shared default", async () => {
    const { readOmniRouteJson } = await import("./http.js");
    const body = JSON.stringify({ data: "x".repeat(9 * 1024 * 1024) });

    await expect(
      readOmniRouteJson(new Response(body), "OmniRoute provider response"),
    ).rejects.toThrow("response exceeded");
  });

  it("cancels a stalled bounded JSON body", async () => {
    const { readOmniRouteJson } = await import("./http.js");
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start: () => undefined,
      cancel: () => {
        cancelled = true;
      },
    });

    await expect(
      readOmniRouteJson(new Response(body), "OmniRoute live model catalog", {
        maxBytes: 64,
        chunkTimeoutMs: 1,
      }),
    ).rejects.toThrow("response stalled: no data received for 1ms");
    expect(cancelled).toBe(true);
  });

  it("redacts configured and reflected URLs from discovery failure logs", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    const sensitiveUrl = "https://user:secret@gateway.example/v1?token=secret#fragment";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error(`request failed at ${sensitiveUrl}`),
    );

    await expect(
      buildLiveOmniRouteProvider(
        mockCatalogContext({ baseUrl: sensitiveUrl, apiKey: "discovery-secret" }),
      ),
    ).resolves.toBeNull();

    const rendered = String(warnSpy.mock.calls[0]?.[0]);
    expect(rendered).toContain("https://gateway.example/v1");
    expect(rendered).not.toContain("user");
    expect(rendered).not.toContain("secret");
    expect(rendered).not.toContain("token");
    expect(rendered).not.toContain("fragment");
  });

  it("isolates the live catalog cache by auth profile and effective discovery credential", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/key-one", type: "chat" }] }))
      .mockResolvedValueOnce(mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/key-two", type: "chat" }] }))
      .mockResolvedValueOnce(
        mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/profile-two", type: "chat" }] }),
      );
    const baseUrl = "http://credential-isolation.example/v1";

    const first = await buildLiveOmniRouteProvider(
      mockCatalogContext({ baseUrl, apiKey: "key-one", profileId: "omniroute:one" }),
    );
    const credentialChanged = await buildLiveOmniRouteProvider(
      mockCatalogContext({ baseUrl, apiKey: "key-two", profileId: "omniroute:one" }),
    );
    const profileChanged = await buildLiveOmniRouteProvider(
      mockCatalogContext({ baseUrl, apiKey: "key-two", profileId: "omniroute:two" }),
    );

    expect(first?.models.map((model) => model.id)).toEqual(["provider/key-one"]);
    expect(credentialChanged?.models.map((model) => model.id)).toEqual(["provider/key-two"]);
    expect(profileChanged?.models.map((model) => model.id)).toEqual(["provider/profile-two"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("isolates the live catalog cache by effective request policy", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/request-one", type: "chat" }] }))
      .mockResolvedValueOnce(mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/request-two", type: "chat" }] }))
      .mockResolvedValueOnce(
        mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/request-private", type: "chat" }] }),
      );
    const baseUrl = "https://request-policy-cache.example/v1";
    const first = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        baseUrl,
        apiKey: "shared-discovery-key",
        request: {
          auth: {
            mode: "header",
            headerName: "X-Gateway-Token",
            value: "request-token-one",
          },
        },
      }),
    );
    const authChanged = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        baseUrl,
        apiKey: "shared-discovery-key",
        request: {
          auth: {
            mode: "header",
            headerName: "X-Gateway-Token",
            value: "request-token-two",
          },
        },
      }),
    );
    const privateNetworkPolicyChanged = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        baseUrl,
        apiKey: "shared-discovery-key",
        request: {
          allowPrivateNetwork: true,
          auth: {
            mode: "header",
            headerName: "X-Gateway-Token",
            value: "request-token-two",
          },
        },
      }),
    );

    expect(first?.models.map((model) => model.id)).toEqual(["provider/request-one"]);
    expect(authChanged?.models.map((model) => model.id)).toEqual(["provider/request-two"]);
    expect(privateNetworkPolicyChanged?.models.map((model) => model.id)).toEqual([
      "provider/request-private",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses the discovery credential for catalog fetches without replacing the runtime credential", async () => {
    const { buildOmniRouteCatalog } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/discovery-key", type: "chat" }] }),
    );
    const context = mockCatalogContext({
      baseUrl: "http://discovery-key.example/v1",
      apiKey: "runtime-credential-marker",
      discoveryApiKey: "discovery-secret",
      profileId: "omniroute:discovery",
    });

    const catalog = await buildOmniRouteCatalog(context);

    expect(catalog).toMatchObject({
      provider: {
        baseUrl: "http://discovery-key.example/v1",
        apiKey: "runtime-credential-marker",
        models: [{ id: "provider/discovery-key" }],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://discovery-key.example/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer discovery-secret",
    );
  });

  it("honors configured auth profile order for both catalog discovery and runtime", async () => {
    const { resolveOmniRouteCatalogCredentials } = await import("./provider-catalog.js");
    const resolveConcreteApiKey = vi.fn().mockResolvedValue("ordered-profile-b");

    const credentials = await resolveOmniRouteCatalogCredentials({
      auth: {
        apiKey: "stored-profile-a",
        discoveryApiKey: "stored-profile-a",
        mode: "api_key",
        source: "profile",
        profileId: "omniroute:a",
      },
      config: {},
      resolveConcreteApiKey,
    });

    expect(credentials).toEqual({
      runtimeApiKey: "ordered-profile-b",
      discoveryApiKey: "ordered-profile-b",
    });
    expect(resolveConcreteApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ cfg: {} }),
    );
  });

  it("uses the provider API-key resolver when auth has no configured credential", async () => {
    const { buildOmniRouteCatalog } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/configured-key", type: "chat" }] }),
    );

    const catalog = await buildOmniRouteCatalog(
      mockCatalogContext({
        baseUrl: "http://configured-key.example/v1",
        resolvedApiKey: "runtime-credential-marker",
        resolvedDiscoveryApiKey: "configured-discovery-secret",
      }),
    );

    expect(catalog).toMatchObject({
      provider: {
        apiKey: "runtime-credential-marker",
        models: [{ id: "provider/configured-key" }],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://configured-key.example/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer configured-discovery-secret",
    );
  });

  it("does not register a runtime provider from a discovery-only credential", async () => {
    const { buildOmniRouteCatalog } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const catalog = await buildOmniRouteCatalog(
      mockCatalogContext({
        baseUrl: "http://discovery-only.example/v1",
        discoveryApiKey: "discovery-secret",
      }),
    );

    expect(catalog).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not cache an empty live catalog", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockCatalogResponse({ data: [] }))
      .mockResolvedValueOnce(mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "recovered-model", type: "chat" }] }));
    const context = mockCatalogContext({
      baseUrl: "http://empty-catalog-cache.example/v1",
      apiKey: "secret-key",
    });

    await expect(buildLiveOmniRouteProvider(context)).resolves.toBeNull();
    await expect(buildLiveOmniRouteProvider(context)).resolves.toMatchObject({
      models: [{ id: "recovered-model" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let an expired request delete its cached replacement", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let rejectExpiredRequest!: (reason: Error) => void;
    const expiredResponse = new Promise<never>((_resolve, reject) => {
      rejectExpiredRequest = reject;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(expiredResponse)
      .mockResolvedValueOnce(
        mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "replacement-model", type: "chat" }] }),
      );
    const context = mockCatalogContext({
      baseUrl: "http://expired-cache-race.example/v1",
      apiKey: "secret-key",
    });

    const expiredLoad = buildLiveOmniRouteProvider(context);
    nowSpy.mockReturnValue(31_001);
    await expect(buildLiveOmniRouteProvider(context)).resolves.toMatchObject({
      models: [{ id: "replacement-model" }],
    });

    rejectExpiredRequest(new Error("expired request failed"));
    await expect(expiredLoad).resolves.toBeNull();
    await expect(buildLiveOmniRouteProvider(context)).resolves.toMatchObject({
      models: [{ id: "replacement-model" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("uses OMNIROUTE_BASE_URL when no config base URL is set", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/env-url", type: "chat" }] }),
    );

    const catalog = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        envBaseUrl: "http://env-omniroute.example/v1/",
        apiKey: "secret-key",
      }),
    );

    expect(catalog?.baseUrl).toBe("http://env-omniroute.example/v1");
  });

  it("uses OMNIROUTE_BASE_URL when config only has the default base URL", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/env-url", type: "chat" }] }),
    );

    const catalog = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        baseUrl: "http://localhost:20128/v1",
        envBaseUrl: "http://env-omniroute.example/v1",
        apiKey: "secret-key",
      }),
    );

    expect(catalog?.baseUrl).toBe("http://env-omniroute.example/v1");
  });

  it("keeps the environment-resolved base URL in the returned catalog provider", async () => {
    const { buildOmniRouteCatalog } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/env-url", type: "chat" }] }),
    );

    const catalog = await buildOmniRouteCatalog(
      mockCatalogContext({
        baseUrl: "http://localhost:20128/v1",
        envBaseUrl: "https://env-omniroute.example/v1/",
        apiKey: "secret-key",
      }),
    );

    expect(catalog).toMatchObject({
      provider: { baseUrl: "https://env-omniroute.example/v1" },
    });
  });

  it("prefers config base URL over OMNIROUTE_BASE_URL", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({ data: [{ context_length: 42_000, max_output_tokens: 3_000, id: "provider/config-url", type: "chat" }] }),
    );

    const catalog = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        baseUrl: "http://config-omniroute.example/v1",
        envBaseUrl: "http://env-omniroute.example/v1",
        apiKey: "secret-key",
      }),
    );

    expect(catalog?.baseUrl).toBe("http://config-omniroute.example/v1");
  });

  it("applies the shared base URL precedence rule", async () => {
    const { resolveOmniRouteBaseUrl } = await import("./base-url.js");

    expect(
      resolveOmniRouteBaseUrl({
        config: { models: { providers: { omniroute: { baseUrl: "http://localhost:20128/v1" } } } },
        env: { OMNIROUTE_BASE_URL: "https://environment.example/v1/" },
      }),
    ).toBe("https://environment.example/v1");
    expect(
      resolveOmniRouteBaseUrl({
        config: { models: { providers: { omniroute: { baseUrl: "https://configured.example/v1/" } } } },
        env: { OMNIROUTE_BASE_URL: "https://environment.example/v1" },
      }),
    ).toBe("https://configured.example/v1");
    expect(
      resolveOmniRouteBaseUrl({
        config: { models: { providers: { omniroute: { baseUrl: "https://configured.example/v1" } } } },
        env: { OMNIROUTE_BASE_URL: "https://environment.example/v1" },
        overrideBaseUrl: "https://memory.example/v1/",
      }),
    ).toBe("https://memory.example/v1");
  });
});
