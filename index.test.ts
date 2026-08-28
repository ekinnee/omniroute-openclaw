// OmniRoute provider plugin tests — standalone compatible
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIN_OPENCLAW_VERSION = "2026.7.1";
const OPENCLAW_PEER_RANGE = `>=${MIN_OPENCLAW_VERSION}-0`;
const REQUIRED_OPENCLAW_SDK_EXPORTS = [
  "./plugin-sdk/agent-runtime",
  "./plugin-sdk/config-runtime",
  "./plugin-sdk/plugin-entry",
  "./plugin-sdk/provider-auth",
  "./plugin-sdk/secret-input-runtime",
  "./plugin-sdk/ssrf-runtime",
  "./plugin-sdk/provider-transport-runtime",
  "./plugin-sdk/provider-usage",
] as const;

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

describe("omniroute provider plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("has a valid package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
    expect(pkg.name).toBe("@ekinnee/omniroute-provider");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.openclaw.extensions).toContain("./dist/index.js");
    expect(pkg.bin["omniroute-catalog-audit"]).toBe("./dist/catalog-audit-bin.js");
    expect(pkg.openclaw.compat.pluginApi).toBeDefined();
    expect(pkg.openclaw.build.openclawVersion).toBeDefined();
  });

  it("declares an OpenClaw floor that covers imported SDK subpaths", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
    const openClawPkg = JSON.parse(
      readFileSync(resolve(__dirname, "node_modules/openclaw/package.json"), "utf8"),
    );

    expect(pkg.peerDependencies.openclaw).toBe(OPENCLAW_PEER_RANGE);
    expect(pkg.openclaw.compat.pluginApi).toBe(OPENCLAW_PEER_RANGE);
    expect(pkg.openclaw.compat.minGatewayVersion).toBe(MIN_OPENCLAW_VERSION);
    for (const exportPath of REQUIRED_OPENCLAW_SDK_EXPORTS) {
      expect(openClawPkg.exports[exportPath]).toBeDefined();
    }
  });

  it("keeps runtime source imports on public OpenClaw SDK subpaths", () => {
    const runtimeFiles = [
      "index.ts",
      "models.ts",
      "base-url.ts",
      "onboard.ts",
      "provider-catalog.ts",
      "catalog-audit.ts",
      "catalog-audit-cli.ts",
      "catalog-audit-bin.ts",
      "usage.ts",
      "provider-compat.ts",
      "embedding-provider.ts",
      "image-generation-provider.ts",
      "video-generation-provider.ts",
      "web-search-provider.ts",
      "auth.ts",
      "http.ts",
    ];
    const privateSubpaths = [
      "embedding-providers",
      "image-generation",
      "provider-auth-runtime",
      "provider-catalog-shared",
      "provider-entry",
      "provider-http",
      "provider-model-shared",
      "provider-onboard",
      "provider-tools",
      "provider-web-search",
      "video-generation",
    ];
    const source = runtimeFiles
      .map((file) => readFileSync(resolve(__dirname, file), "utf8"))
      .join("\n");
    for (const privateSubpath of privateSubpaths) {
      expect(source).not.toContain(`openclaw/plugin-sdk/${privateSubpath}`);
    }
  });

  it("has a valid manifest", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, "openclaw.plugin.json"), "utf8"),
    );
    expect(manifest.id).toBe("omniroute");
    expect(manifest.providers).toContain("omniroute");
    expect(manifest.contracts.embeddingProviders).toEqual(["omniroute"]);
    expect(manifest.contracts.imageGenerationProviders).toEqual(["omniroute"]);
    expect(manifest.contracts.usageProviders).toEqual(["omniroute"]);
    expect(manifest.modelCatalog.providers).toBeUndefined();
    expect(manifest.modelCatalog.discovery).toEqual({ omniroute: "runtime" });
  });

  it("has a valid entry point", () => {
    expect(existsSync(resolve(__dirname, "index.ts"))).toBe(true);
  });

  it("exports constants from models.ts", async () => {
    const mod = await import("./models.js");
    expect(mod.OMNIROUTE_PROVIDER_ID).toBe("omniroute");
    expect(mod.OMNIROUTE_API_KEY_ENV_VAR).toBe("OMNIROUTE_API_KEY");
    expect(mod.OMNIROUTE_BASE_URL_ENV_VAR).toBe("OMNIROUTE_BASE_URL");
    expect(mod.OMNIROUTE_DEFAULT_BASE_URL).toBe("http://localhost:20128/v1");
    expect("OMNIROUTE_DEFAULT_MODEL_REF" in mod).toBe(false);
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
            id: "nebius/Qwen/Qwen3-Embedding-8B",
            type: "embedding",
          },
          {
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
      compat: {
        supportsReasoningEffort: true,
        supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh"],
      },
      thinkingLevelMap: { off: "none", low: "low", xhigh: "xhigh", max: null },
    });
  });

  it("does not treat auto or reasoning-only models as controllable thinking models", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          { id: "auto", type: "chat" },
          { id: "provider/reasoning-only", type: "chat", capabilities: { reasoning: true } },
          {
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

  it("uses explicit thinking effort tiers exactly and canonical tiers only for controllable thinking", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          {
            id: "provider/explicit-tiers",
            type: "chat",
            capabilities: {
              reasoning: true,
              supportsThinking: true,
              effort_tiers: [" HIGH ", "none", "MAX", "ultra", "high", "invalid", 42],
            },
          },
          {
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
      compat: {
        supportsReasoningEffort: true,
        supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh"],
      },
    });
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
            id: "provider/empty-tiers",
            type: "chat",
            capabilities: { reasoning: true, supportsThinking: true, effort_tiers: [] },
          },
          {
            id: "provider/malformed-tiers",
            type: "chat",
            capabilities: { reasoning: true, supportsThinking: true, effort_tiers: "high" },
          },
          {
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
            id: "auto/best-coding",
            object: "model",
            owned_by: "combo",
            root: "auto/best-coding",
            max_input_tokens: 200_000,
          },
          {
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
            id: "openai/gpt-4.1",
            object: "model",
            supported_endpoints: ["/v1/chat/completions"],
            type: "image",
          },
          {
            id: "hf/diffusion-model",
            object: "model",
            owned_by: "huggingface",
            supported_endpoints: ["images"],
            type: "image",
            output_modalities: ["image"],
          },
          {
            id: "nebius/Qwen/Qwen3-Embedding-8B",
            object: "model",
            owned_by: "nebius",
            supported_endpoints: ["embeddings"],
          },
          {
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
    ]);
    expect(models[0]).toMatchObject({
      id: "auto/best-coding",
      contextWindow: 200_000,
      reasoning: false,
    });
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

  it("forwards AbortSignal to fetch for embedding model discovery", async () => {
    const { fetchOmniRouteEmbeddingModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({ data: [] }),
    );
    const controller = new AbortController();

    await fetchOmniRouteEmbeddingModels({
      baseUrl: "http://localhost:20128/v1",
      apiKey: "secret-key",
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps live OmniRoute embedding models without defaulting to auto", async () => {
    const { fetchOmniRouteEmbeddingModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          {
            id: "auto",
            object: "model",
            owned_by: "combo",
          },
          {
            id: "nebius/Qwen/Qwen3-Embedding-8B",
            name: "Qwen3 Embedding 8B",
            supported_endpoints: ["embeddings"],
            max_input_tokens: 32_768,
            dimensions: 4096,
          },
          {
            id: "openai/text-embedding-3-small",
            type: "embedding",
            embedding_dimensions: 1536,
          },
          {
            id: "combo/search-and-chat",
            type: "chat",
            supported_endpoints: ["chat", "embeddings"],
          },
          {
            id: "openai/dall-e-3",
            type: "image",
            supported_endpoints: ["images"],
          },
          {
            id: "nebius/Qwen/Qwen3-Embedding-8B",
            type: "embedding",
          },
        ],
      }),
    );

    const models = await fetchOmniRouteEmbeddingModels({
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
    expect(models).toEqual([
      {
        id: "nebius/Qwen/Qwen3-Embedding-8B",
        name: "Qwen3 Embedding 8B",
        maxInputTokens: 32_768,
        dimensions: 4096,
      },
      {
        id: "openai/text-embedding-3-small",
        name: "openai/text-embedding-3-small",
        dimensions: 1536,
      },
      {
        id: "combo/search-and-chat",
        name: "combo/search-and-chat",
      },
    ]);
  });

  it("forwards AbortSignal to fetch for image model discovery", async () => {
    const { fetchOmniRouteImageModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({ data: [] }),
    );
    const controller = new AbortController();

    await fetchOmniRouteImageModels({
      baseUrl: "http://localhost:20128/v1",
      apiKey: "secret-key",
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps live OmniRoute image models without defaulting to auto", async () => {
    const { fetchOmniRouteImageModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockCatalogResponse({
        data: [
          {
            id: "auto",
            object: "model",
            owned_by: "combo",
          },
          {
            id: "openai/gpt-image-2",
            name: "GPT Image 2",
            type: "image",
            supported_sizes: ["1024x1024", "1536x1024"],
            input_modalities: ["text"],
            output_modalities: ["image"],
          },
          {
            id: "black-forest-labs/flux-kontext-pro",
            supported_endpoints: ["images"],
            input_modalities: ["text", "image"],
          },
          {
            id: "if/kimi-k2",
            type: "chat",
          },
          {
            id: "weird/text-output",
            supported_endpoints: ["images"],
            output_modalities: ["text"],
          },
          {
            id: "openai/gpt-image-2",
            type: "image",
          },
        ],
      }),
    );

    const models = await fetchOmniRouteImageModels({
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
    expect(models).toEqual([
      {
        id: "openai/gpt-image-2",
        name: "GPT Image 2",
        supportedSizes: ["1024x1024", "1536x1024"],
        inputModalities: ["text"],
      },
      {
        id: "black-forest-labs/flux-kontext-pro",
        name: "black-forest-labs/flux-kontext-pro",
        supportedSizes: [],
        inputModalities: ["text", "image"],
      },
    ]);
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
      mockCatalogResponse({ data: [{ id: "provider/guarded", type: "chat" }] }),
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
      .mockResolvedValueOnce(mockCatalogResponse({ data: [{ id: "provider/key-one", type: "chat" }] }))
      .mockResolvedValueOnce(mockCatalogResponse({ data: [{ id: "provider/key-two", type: "chat" }] }))
      .mockResolvedValueOnce(
        mockCatalogResponse({ data: [{ id: "provider/profile-two", type: "chat" }] }),
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
      .mockResolvedValueOnce(mockCatalogResponse({ data: [{ id: "provider/request-one", type: "chat" }] }))
      .mockResolvedValueOnce(mockCatalogResponse({ data: [{ id: "provider/request-two", type: "chat" }] }))
      .mockResolvedValueOnce(
        mockCatalogResponse({ data: [{ id: "provider/request-private", type: "chat" }] }),
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
      mockCatalogResponse({ data: [{ id: "provider/discovery-key", type: "chat" }] }),
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
      mockCatalogResponse({ data: [{ id: "provider/configured-key", type: "chat" }] }),
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
      .mockResolvedValueOnce(mockCatalogResponse({ data: [{ id: "recovered-model", type: "chat" }] }));
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
        mockCatalogResponse({ data: [{ id: "replacement-model", type: "chat" }] }),
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
      mockCatalogResponse({ data: [{ id: "provider/env-url", type: "chat" }] }),
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
      mockCatalogResponse({ data: [{ id: "provider/env-url", type: "chat" }] }),
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
      mockCatalogResponse({ data: [{ id: "provider/env-url", type: "chat" }] }),
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
      mockCatalogResponse({ data: [{ id: "provider/config-url", type: "chat" }] }),
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

  it("applies config without errors", async () => {
    const { applyOmniRouteConfig } = await import("./onboard.js");
    const config = applyOmniRouteConfig({} as never);
    expect(config).toMatchObject({
      models: {
        mode: "merge",
        providers: {
          omniroute: {
            api: "openai-completions",
            baseUrl: "http://localhost:20128/v1",
            models: [],
          },
        },
      },
    });
    expect(config.models?.providers?.omniroute?.models).toEqual([]);
    expect(config.agents?.defaults?.model).toBeUndefined();
    expect(config.agents?.defaults?.models).toBeUndefined();
  });

  it("preserves existing OmniRoute models and base URL during onboarding", async () => {
    const { applyOmniRouteConfig } = await import("./onboard.js");
    const existingModels = [
      {
        id: "auto/best-coding",
        name: "Existing combo",
        reasoning: false,
        input: ["text"],
      },
    ];
    const config = applyOmniRouteConfig({
      models: {
        providers: {
          omniroute: {
            api: "openai-completions",
            baseUrl: "https://existing.example/v1",
            models: existingModels,
          },
        },
      },
    } as never);

    expect(config.models?.providers?.omniroute).toMatchObject({
      baseUrl: "https://existing.example/v1",
      models: existingModels,
    });
    expect(config.models?.providers?.omniroute?.models).toHaveLength(1);
  });

  it("preserves an existing primary model during onboarding", async () => {
    const { applyOmniRouteConfig } = await import("./onboard.js");
    const config = applyOmniRouteConfig({
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-5",
            fallbacks: ["openai/gpt-4.1"],
          },
        },
      },
    } as never);

    expect(config.agents?.defaults?.model).toEqual({
      primary: "openai/gpt-5",
      fallbacks: ["openai/gpt-4.1"],
    });
    expect(config.agents?.defaults?.models?.["omniroute/auto"]).toBeUndefined();
  });

  it("has a valid plugin entry", async () => {
    const plugin = await import("./index.js");
    expect(plugin.default).toBeDefined();
    expect(plugin.default.id).toBe("omniroute");
    expect(typeof plugin.default.register).toBe("function");
  });

  it("registers the OmniRoute embedding provider", async () => {
    const plugin = await import("./index.js");
    const registerProvider = vi.fn();
    const registerModelCatalogProvider = vi.fn();
    const registerEmbeddingProvider = vi.fn();
    const registerImageGenerationProvider = vi.fn();
    const registerWebSearchProvider = vi.fn();
    const registerVideoGenerationProvider = vi.fn();

    plugin.default.register({
      registerProvider,
      registerModelCatalogProvider,
      registerEmbeddingProvider,
      registerImageGenerationProvider,
      registerWebSearchProvider,
      registerVideoGenerationProvider,
    } as never);

    expect(registerProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "omniroute",
        label: "OmniRoute",
        buildReplayPolicy: expect.any(Function),
      }),
    );
    expect(registerModelCatalogProvider).not.toHaveBeenCalled();
    expect(registerProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: expect.objectContaining({ run: expect.any(Function) }),
      }),
    );
    expect(registerProvider.mock.calls[0]?.[0]).not.toHaveProperty("staticCatalog");
    expect(registerProvider.mock.calls[0]?.[0].auth?.[0]).not.toHaveProperty("defaultModel");
    expect(registerProvider.mock.calls[0]?.[0]).toMatchObject({
      resolveUsageAuth: expect.any(Function),
      fetchUsageSnapshot: expect.any(Function),
    });
    const resolveThinkingProfile = registerProvider.mock.calls[0]?.[0].resolveThinkingProfile;
    expect(resolveThinkingProfile).toBeTypeOf("function");
    expect(
      resolveThinkingProfile({
        provider: "omniroute",
        modelId: "provider/high-max-only",
        reasoning: true,
        compat: { supportedReasoningEfforts: ["high", "max"] },
      }),
    ).toEqual({ levels: [{ id: "high" }, { id: "max" }] });
    expect(
      resolveThinkingProfile({
        provider: "omniroute",
        modelId: "provider/fixed-reasoning",
        reasoning: true,
        compat: {},
      }),
    ).toEqual({ levels: [{ id: "off" }], defaultLevel: "off" });
    expect(registerEmbeddingProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "omniroute",
        transport: "remote",
        authProviderId: "omniroute",
      }),
    );
    const imageProvider = registerImageGenerationProvider.mock.calls[0]?.[0];
    expect(imageProvider).toMatchObject({
      id: "omniroute",
      label: "OmniRoute",
    });
    expect(imageProvider).not.toHaveProperty("defaultModel");
  });

  it("uses OMNIROUTE_BASE_URL for embeddings when provider config has the default URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");
    vi.stubEnv("OMNIROUTE_BASE_URL", "https://env-omniroute.example/v1/");
    const config = {
      models: {
        providers: {
          omniroute: {
            api: "openai-completions",
            apiKey: "secret-key",
            baseUrl: "http://localhost:20128/v1",
          },
        },
      },
    };

    const result = await omniRouteEmbeddingProviderAdapter.create({
      config: config as never,
      provider: "other",
      model: "  nebius/Qwen/Qwen3-Embedding-8B  ",
      dimensions: 4096,
    });
    const vector = await result.provider?.embed("hello");

    expect(result.provider).toMatchObject({
      id: "omniroute",
      model: "nebius/Qwen/Qwen3-Embedding-8B",
      dimensions: 4096,
    });
    expect(result.runtime).toMatchObject({
      id: "omniroute",
      cacheKeyData: {
        provider: "omniroute",
        baseUrl: "https://env-omniroute.example/v1",
        model: "nebius/Qwen/Qwen3-Embedding-8B",
        dimensions: 4096,
      },
    });
    expect(vector).toEqual([0.1, 0.2]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://env-omniroute.example/v1/embeddings",
      expect.objectContaining({ method: "POST" }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      model: "nebius/Qwen/Qwen3-Embedding-8B",
      input: ["hello"],
      dimensions: 4096,
    });
  });

  it("keeps the resolved embedding credential ahead of remote headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");
    const result = await omniRouteEmbeddingProviderAdapter.create({
      config: {
        models: {
          providers: {
            omniroute: { apiKey: "resolved-key" },
          },
        },
      } as never,
      remote: {
        apiKey: "resolved-key",
        headers: { Authorization: "Bearer ignored" },
      },
      model: "embedding-model",
    });

    await result.provider?.embed("hello");

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).get("Authorization")).toBe("Bearer resolved-key");
  });

  it("resolves provider profile credentials instead of sending profile ids", async () => {
    const { resolveOmniRouteApiKey } = await import("./auth.js");
    const apiKey = await resolveOmniRouteApiKey({
      cfg: {
        auth: {
          profiles: {
            "omniroute:default": { provider: "omniroute", mode: "api_key" },
          },
        },
        models: {
          providers: {
            omniroute: { apiKey: "omniroute:default" },
          },
        },
      } as never,
      store: {
        version: 1,
        profiles: {
          "omniroute:default": {
            type: "api_key",
            provider: "omniroute",
            key: "resolved-secret",
          },
        },
      } as never,
    });

    expect(apiKey).toBe("resolved-secret");
  });

  it("resolves the configured profile order instead of profile store insertion order", async () => {
    const { resolveOmniRouteApiKey } = await import("./auth.js");
    const apiKey = await resolveOmniRouteApiKey({
      cfg: {
        auth: {
          order: { omniroute: ["omniroute:b", "omniroute:a"] },
        },
      } as never,
      store: {
        version: 1,
        profiles: {
          "omniroute:a": {
            type: "api_key",
            provider: "omniroute",
            key: "stored-first-a",
          },
          "omniroute:b": {
            type: "api_key",
            provider: "omniroute",
            key: "ordered-first-b",
          },
        },
      } as never,
    });

    expect(apiKey).toBe("ordered-first-b");
  });

  it("preserves configured request auth, headers, TLS, and proxy policy", async () => {
    const { resolveOmniRouteHttpRequestConfig } = await import("./http.js");
    const resolved = resolveOmniRouteHttpRequestConfig({
      baseUrl: "https://gateway.example/v1",
      defaultBaseUrl: "http://localhost:20128/v1",
      request: {
        headers: { "X-Trace": "trace-value" },
        auth: {
          mode: "header",
          headerName: "X-Gateway-Token",
          prefix: "Token ",
          value: "request-secret",
        },
        tls: {
          ca: "target-ca",
          cert: "target-cert",
          key: "target-key",
          serverName: "gateway.example",
          insecureSkipVerify: false,
        },
        proxy: {
          mode: "explicit-proxy",
          url: "http://proxy.example:8080",
          tls: { ca: "proxy-ca" },
        },
      },
      defaultHeaders: { Authorization: "Bearer default" },
    });

    expect(resolved.headers.get("X-Trace")).toBe("trace-value");
    expect(resolved.headers.get("X-Gateway-Token")).toBe("Token request-secret");
    expect(resolved.headers.get("Authorization")).toBeNull();
    expect(resolved.dispatcherPolicy).toEqual({
      mode: "explicit-proxy",
      proxyUrl: "http://proxy.example:8080",
      proxyTls: { ca: "proxy-ca" },
    });
  });

  it("rejects insecure TLS overrides", async () => {
    const { resolveOmniRouteHttpRequestConfig } = await import("./http.js");

    expect(() =>
      resolveOmniRouteHttpRequestConfig({
        baseUrl: "https://gateway.example/v1",
        defaultBaseUrl: "http://localhost:20128/v1",
        request: { tls: { insecureSkipVerify: true } },
      }),
    ).toThrow("Provider transport overrides do not allow insecureSkipVerify");
  });

  it("honors explicit private-network denial for the configured base URL", async () => {
    const { resolveOmniRouteHttpRequestConfig } = await import("./http.js");
    const resolved = resolveOmniRouteHttpRequestConfig({
      baseUrl: "http://10.0.0.5:1234/v1",
      defaultBaseUrl: "http://localhost:20128/v1",
      request: { allowPrivateNetwork: false },
    });

    expect(resolved.ssrfPolicy?.allowedHostnames).toBeUndefined();
    expect(resolved.ssrfPolicy?.allowPrivateNetwork).toBeUndefined();
  });

  it("forwards per-call embedding types and text parts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");
    const result = await omniRouteEmbeddingProviderAdapter.create({
      config: {
        models: {
          providers: {
            omniroute: {
              apiKey: "secret-key",
              baseUrl: "http://localhost:20128/v1",
            },
          },
        },
      } as never,
      model: "embedding-model",
      inputType: "generic",
      queryInputType: "query-vector",
      documentInputType: "document-vector",
    });

    await result.provider?.embed(
      {
        text: "ignored fallback",
        parts: [
          { type: "text", text: "hello" },
          { type: "text", text: " world" },
        ],
      },
      { inputType: "query" },
    );
    await result.provider?.embedBatch(["document"], { inputType: "document" });

    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(firstBody).toMatchObject({ input: ["hello world"], input_type: "query-vector" });
    expect(secondBody).toMatchObject({ input: ["document"], input_type: "document-vector" });
  });

  it.each([
    {
      name: "duplicate vector indices",
      data: [
        { index: 0, embedding: [0.1] },
        { index: 0, embedding: [0.2] },
      ],
      error: /duplicate vector index 0/,
    },
    {
      name: "out-of-range vector indices",
      data: [
        { index: 0, embedding: [0.1] },
        { index: 2, embedding: [0.2] },
      ],
      error: /invalid index 2/,
    },
  ])("rejects embedding responses with $name", async ({ data, error }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");
    const result = await omniRouteEmbeddingProviderAdapter.create({
      config: {
        models: {
          providers: { omniroute: { apiKey: "secret-key" } },
        },
      } as never,
      model: "embedding-model",
    });

    expect(result.provider).toBeDefined();
    await expect(result.provider!.embedBatch(["first", "second"])).rejects.toThrow(error);
  });

  it("returns empty embedding batches without contacting OmniRoute", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");
    const result = await omniRouteEmbeddingProviderAdapter.create({
      config: {
        models: {
          providers: { omniroute: { apiKey: "secret-key" } },
        },
      } as never,
      model: "embedding-model",
    });

    await expect(result.provider?.embedBatch([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not silently fall back when an embedding SecretInput override is unresolved", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");
    const result = await omniRouteEmbeddingProviderAdapter.create({
      config: {
        models: {
          providers: { omniroute: { apiKey: "provider-secret" } },
        },
      } as never,
      remote: {
        apiKey: { source: "env", provider: "default", id: "OMNIROUTE_OVERRIDE_KEY" },
      } as never,
      model: "embedding-model",
    });

    await expect(result.provider?.embed("hello")).rejects.toThrow(/unresolved SecretRef/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires an explicit OmniRoute embedding model", async () => {
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");

    await expect(
      omniRouteEmbeddingProviderAdapter.create({
        config: {} as never,
        model: " ",
      }),
    ).rejects.toThrow(/explicit embedding model/);
  });

  it("builds fallback embedding index identity from model, base URL, and dimensions", async () => {
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");

    expect(
      omniRouteEmbeddingProviderAdapter.resolveIndexIdentity?.({
        config: {
          models: {
            providers: {
              omniroute: {
                baseUrl: "http://localhost:20128/v1/",
              },
            },
          },
        } as never,
        model: "openai/text-embedding-3-small",
        dimensions: 1536,
      }),
    ).toEqual({
      model: "openai/text-embedding-3-small",
      cacheKeyData: {
        provider: "omniroute",
        baseUrl: "http://localhost:20128/v1",
        model: "openai/text-embedding-3-small",
        dimensions: 1536,
      },
    });
  });

  it("keeps a per-memory embedding base URL ahead of OMNIROUTE_BASE_URL", async () => {
    vi.stubEnv("OMNIROUTE_BASE_URL", "https://env-omniroute.example/v1");
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");

    expect(
      omniRouteEmbeddingProviderAdapter.resolveIndexIdentity?.({
        config: {
          models: {
            providers: {
              omniroute: { baseUrl: "http://localhost:20128/v1" },
            },
          },
        } as never,
        remote: { baseUrl: "https://memory-omniroute.example/v1/" },
        model: "openai/text-embedding-3-small",
        dimensions: 1536,
      }),
    ).toMatchObject({
      cacheKeyData: { baseUrl: "https://memory-omniroute.example/v1" },
    });
  });

  it("generates OmniRoute images with an explicit model", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("generated image").toString("base64") }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { buildOmniRouteImageGenerationProvider } = await import(
      "./image-generation-provider.js"
    );
    const provider = buildOmniRouteImageGenerationProvider();

    const result = await provider.generateImage({
      provider: "omniroute",
      model: "openai/gpt-image-2",
      prompt: "a schematic city",
      count: 9,
      size: "1536x1024",
      cfg: {
        models: {
          providers: {
            omniroute: {
              apiKey: "secret-key",
              baseUrl: "http://localhost:20128/v1/",
              request: { allowPrivateNetwork: true },
            },
          },
        },
      } as never,
      agentDir: "/tmp/agent",
    });

    expect(provider.defaultModel).toBeUndefined();
    expect(provider.capabilities.edit.enabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/images/generations",
      expect.objectContaining({ method: "POST" }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toEqual({
      model: "openai/gpt-image-2",
      prompt: "a schematic city",
      n: 4,
      size: "1536x1024",
      response_format: "b64_json",
    });
    expect(result.model).toBe("openai/gpt-image-2");
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      mimeType: "image/png",
      fileName: "omniroute-image-1.png",
    });
  });

  it("uses OMNIROUTE_BASE_URL for image generation when provider config has the default URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("generated image").toString("base64") }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubEnv("OMNIROUTE_BASE_URL", "https://env-omniroute.example/v1/");
    const { buildOmniRouteImageGenerationProvider } = await import(
      "./image-generation-provider.js"
    );

    await buildOmniRouteImageGenerationProvider().generateImage({
      provider: "omniroute",
      model: "openai/gpt-image-2",
      prompt: "a schematic city",
      cfg: {
        models: {
          providers: {
            omniroute: {
              apiKey: "secret-key",
              baseUrl: "http://localhost:20128/v1",
            },
          },
        },
      } as never,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://env-omniroute.example/v1/images/generations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses OMNIROUTE_BASE_URL for video generation when provider config has the default URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ url: "https://cdn.example/video.mp4" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubEnv("OMNIROUTE_BASE_URL", "https://env-omniroute.example/v1/");
    const { buildOmniRouteVideoGenerationProvider } = await import(
      "./video-generation-provider.js"
    );

    await buildOmniRouteVideoGenerationProvider().generateVideo({
      provider: "omniroute",
      model: "video-model",
      prompt: "a city at night",
      cfg: {
        models: {
          providers: {
            omniroute: {
              apiKey: "secret-key",
              baseUrl: "http://localhost:20128/v1",
            },
          },
        },
      } as never,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://env-omniroute.example/v1/videos/generations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses OMNIROUTE_BASE_URL for web search when provider config has the default URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubEnv("OMNIROUTE_BASE_URL", "https://env-omniroute.example/v1/");
    const { createOmniRouteWebSearchProvider } = await import("./web-search-provider.js");
    const provider = createOmniRouteWebSearchProvider();
    const tool = provider.createTool({
      config: {
        models: {
          providers: {
            omniroute: { baseUrl: "http://localhost:20128/v1" },
          },
        },
      },
      searchConfig: { apiKey: "secret-key" },
    } as never);

    await tool.execute({ query: "OmniRoute" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://env-omniroute.example/v1/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requires an explicit OmniRoute image model", async () => {
    const { buildOmniRouteImageGenerationProvider } = await import(
      "./image-generation-provider.js"
    );
    const provider = buildOmniRouteImageGenerationProvider();

    await expect(
      provider.generateImage({
        provider: "omniroute",
        model: " ",
        prompt: "test",
        cfg: {} as never,
      }),
    ).rejects.toThrow(/explicit image model/);
  });

  it("rejects OmniRoute image reference inputs until edits are supported", async () => {
    const { buildOmniRouteImageGenerationProvider } = await import(
      "./image-generation-provider.js"
    );
    const provider = buildOmniRouteImageGenerationProvider();

    await expect(
      provider.generateImage({
        provider: "omniroute",
        model: "openai/gpt-image-2",
        prompt: "edit this",
        inputImages: [{ buffer: Buffer.from("image"), mimeType: "image/png" }],
        cfg: {} as never,
      }),
    ).rejects.toThrow(/reference images are not supported yet/);
  });

  it("fails clearly on empty OmniRoute image responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { buildOmniRouteImageGenerationProvider } = await import(
      "./image-generation-provider.js"
    );
    const provider = buildOmniRouteImageGenerationProvider();

    await expect(
      provider.generateImage({
        provider: "omniroute",
        model: "openai/gpt-image-2",
        prompt: "test",
        cfg: {
          models: {
            providers: {
              omniroute: { apiKey: "secret-key" },
            },
          },
        } as never,
      }),
    ).rejects.toThrow(/missing image data/);
  });
});
