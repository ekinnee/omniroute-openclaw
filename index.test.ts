// OmniRoute provider plugin tests — standalone compatible
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIN_OPENCLAW_VERSION = "2026.5.22";
const REQUIRED_OPENCLAW_SDK_EXPORTS = [
  "./plugin-sdk/embedding-providers",
  "./plugin-sdk/image-generation",
  "./plugin-sdk/provider-auth-runtime",
  "./plugin-sdk/provider-http",
] as const;

const embeddingProviderMocks = vi.hoisted(() => ({
  getEmbeddingProvider: vi.fn(),
}));
const providerAuthMocks = vi.hoisted(() => ({
  isProviderApiKeyConfigured: vi.fn(),
}));
const providerAuthRuntimeMocks = vi.hoisted(() => ({
  resolveApiKeyForProvider: vi.fn(),
}));
const providerHttpMocks = vi.hoisted(() => ({
  assertOkOrThrowHttpError: vi.fn(),
  postJsonRequest: vi.fn(),
  readProviderJsonResponse: vi.fn(),
  resolveProviderHttpRequestConfig: vi.fn(),
  sanitizeConfiguredModelProviderRequest: vi.fn((value) => value),
}));

vi.mock("openclaw/plugin-sdk/embedding-providers", () => ({
  getEmbeddingProvider: embeddingProviderMocks.getEmbeddingProvider,
}));
vi.mock("openclaw/plugin-sdk/provider-auth", () => ({
  isProviderApiKeyConfigured: providerAuthMocks.isProviderApiKeyConfigured,
}));
vi.mock("openclaw/plugin-sdk/provider-auth-runtime", () => ({
  resolveApiKeyForProvider: providerAuthRuntimeMocks.resolveApiKeyForProvider,
}));
vi.mock("openclaw/plugin-sdk/provider-http", () => ({
  assertOkOrThrowHttpError: providerHttpMocks.assertOkOrThrowHttpError,
  postJsonRequest: providerHttpMocks.postJsonRequest,
  readProviderJsonResponse: providerHttpMocks.readProviderJsonResponse,
  resolveProviderHttpRequestConfig: providerHttpMocks.resolveProviderHttpRequestConfig,
  sanitizeConfiguredModelProviderRequest: providerHttpMocks.sanitizeConfiguredModelProviderRequest,
}));

function mockCatalogContext(overrides?: { baseUrl?: string; apiKey?: string; envBaseUrl?: string }) {
  return {
    config: {
      models: {
        providers: {
          omniroute: {
            baseUrl: overrides?.baseUrl,
          },
        },
      },
    },
    env: {
      OMNIROUTE_BASE_URL: overrides?.envBaseUrl,
    },
    resolveProviderApiKey: () => ({ apiKey: overrides?.apiKey }),
    resolveProviderAuth: () => ({
      apiKey: overrides?.apiKey,
      discoveryApiKey: overrides?.apiKey,
      mode: "api_key",
      source: overrides?.apiKey ? "env" : "none",
    }),
  } as never;
}

describe("omniroute provider plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    embeddingProviderMocks.getEmbeddingProvider.mockReset();
    providerAuthMocks.isProviderApiKeyConfigured.mockReset();
    providerAuthRuntimeMocks.resolveApiKeyForProvider.mockReset();
    providerHttpMocks.assertOkOrThrowHttpError.mockReset();
    providerHttpMocks.postJsonRequest.mockReset();
    providerHttpMocks.readProviderJsonResponse.mockReset();
    providerHttpMocks.resolveProviderHttpRequestConfig.mockReset();
    providerHttpMocks.sanitizeConfiguredModelProviderRequest.mockReset();
    providerHttpMocks.sanitizeConfiguredModelProviderRequest.mockImplementation((value) => value);
  });

  it("has a valid package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
    expect(pkg.name).toBe("@ekinnee/omniroute-provider");
    expect(pkg.version).toMatch(/^0\.1\.\d+$/);
    expect(pkg.openclaw.extensions).toContain("./dist/index.js");
    expect(pkg.openclaw.compat.pluginApi).toBeDefined();
    expect(pkg.openclaw.build.openclawVersion).toBeDefined();
  });

  it("declares an OpenClaw floor that covers imported SDK subpaths", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
    const openClawPkg = JSON.parse(
      readFileSync(resolve(__dirname, "node_modules/openclaw/package.json"), "utf8"),
    );

    expect(pkg.peerDependencies.openclaw).toBe(`>=${MIN_OPENCLAW_VERSION}`);
    expect(pkg.openclaw.compat.pluginApi).toBe(`>=${MIN_OPENCLAW_VERSION}`);
    expect(pkg.openclaw.compat.minGatewayVersion).toBe(MIN_OPENCLAW_VERSION);
    for (const exportPath of REQUIRED_OPENCLAW_SDK_EXPORTS) {
      expect(openClawPkg.exports[exportPath]).toBeDefined();
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
    expect(manifest.modelCatalog.providers.omniroute).toBeDefined();
    expect(manifest.modelCatalog.providers.omniroute.api).toBe("openai-completions");
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
    expect(mod.OMNIROUTE_DEFAULT_MODEL_REF).toBe("omniroute/auto");
  });

  it("builds a provider catalog with correct shape", async () => {
    const { buildOmniRouteProvider } = await import("./provider-catalog.js");
    const catalog = buildOmniRouteProvider();
    expect(catalog.baseUrl).toBe("http://localhost:20128/v1");
    expect(catalog.api).toBe("openai-completions");
    expect(catalog.models).toHaveLength(1);
    expect(catalog.models![0].id).toBe("auto");
  });

  it("maps live OmniRoute chat models and filters non-chat models", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
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
    } as never);

    const models = await fetchOmniRouteChatModels({
      baseUrl: "http://localhost:20128/v1/",
      apiKey: "secret-key",
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:20128/v1/models", {
      headers: {
        Accept: "application/json",
        Authorization: expect.stringMatching(/^Bearer /),
      },
      signal: undefined,
    });
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
  });

  it("uses OmniRoute supported_endpoints as the live chat catalog source of truth", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
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
    } as never);

    const models = await fetchOmniRouteChatModels({
      baseUrl: "http://localhost:20128/v1",
    });

    expect(models.map((model) => model.id)).toEqual([
      "auto/best-coding",
      "openrouter/google/gemini-pro",
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
  });

  it("does not synthesize auto when live OmniRoute discovery succeeds without it", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "if/kimi-k2",
            object: "model",
            owned_by: "inference.net",
          },
        ],
      }),
    } as never);

    const models = await fetchOmniRouteChatModels({
      baseUrl: "http://localhost:20128/v1",
    });

    expect(models.map((model) => model.id)).toEqual(["if/kimi-k2"]);
  });

  it("maps live OmniRoute embedding models without defaulting to auto", async () => {
    const { fetchOmniRouteEmbeddingModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
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
    } as never);

    const models = await fetchOmniRouteEmbeddingModels({
      baseUrl: "http://localhost:20128/v1/",
      apiKey: "secret-key",
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:20128/v1/models", {
      headers: {
        Accept: "application/json",
        Authorization: expect.stringMatching(/^Bearer /),
      },
      signal: undefined,
    });
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

  it("maps live OmniRoute image models without defaulting to auto", async () => {
    const { fetchOmniRouteImageModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
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
    } as never);

    const models = await fetchOmniRouteImageModels({
      baseUrl: "http://localhost:20128/v1/",
      apiKey: "secret-key",
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:20128/v1/models", {
      headers: {
        Accept: "application/json",
        Authorization: expect.stringMatching(/^Bearer /),
      },
      signal: undefined,
    });
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

  it("falls back to the static auto model when live discovery fails", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "secret-key should not be read into errors",
    } as never);

    const catalog = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        baseUrl: "http://omniroute.example/v1",
        apiKey: "secret-key",
      }),
    );

    expect(catalog.baseUrl).toBe("http://omniroute.example/v1");
    expect(catalog.models.map((model) => model.id)).toEqual(["auto"]);
  });

  it("uses OMNIROUTE_BASE_URL when no config base URL is set", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
    } as never);

    const catalog = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        envBaseUrl: "http://env-omniroute.example/v1/",
        apiKey: "secret-key",
      }),
    );

    expect(catalog.baseUrl).toBe("http://env-omniroute.example/v1");
  });

  it("uses OMNIROUTE_BASE_URL when config only has the default base URL", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
    } as never);

    const catalog = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        baseUrl: "http://localhost:20128/v1",
        envBaseUrl: "http://env-omniroute.example/v1",
        apiKey: "secret-key",
      }),
    );

    expect(catalog.baseUrl).toBe("http://env-omniroute.example/v1");
  });

  it("prefers config base URL over OMNIROUTE_BASE_URL", async () => {
    const { buildLiveOmniRouteProvider } = await import("./provider-catalog.js");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
    } as never);

    const catalog = await buildLiveOmniRouteProvider(
      mockCatalogContext({
        baseUrl: "http://config-omniroute.example/v1",
        envBaseUrl: "http://env-omniroute.example/v1",
        apiKey: "secret-key",
      }),
    );

    expect(catalog.baseUrl).toBe("http://config-omniroute.example/v1");
  });

  it("applies config without errors", async () => {
    const { applyOmniRouteConfig } = await import("./onboard.js");
    const config = applyOmniRouteConfig({} as never);
    expect(config).toBeDefined();
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

    plugin.default.register({
      registerProvider,
      registerModelCatalogProvider,
      registerEmbeddingProvider,
      registerImageGenerationProvider,
    } as never);

    expect(registerProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "omniroute",
        label: "OmniRoute",
      }),
    );
    expect(registerModelCatalogProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "omniroute",
        kinds: ["text"],
      }),
    );
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

  it("delegates OmniRoute embedding requests through the OpenAI-compatible adapter", async () => {
    const create = vi.fn(async (options) => ({
      provider: {
        id: "openai-compatible",
        model: options.model,
        dimensions: options.dimensions,
        embed: vi.fn(async () => [0.1, 0.2]),
        embedBatch: vi.fn(async () => [[0.1, 0.2]]),
      },
      runtime: {
        id: "openai-compatible",
        cacheKeyData: {
          provider: options.provider,
          model: options.model,
          dimensions: options.dimensions,
        },
      },
    }));
    embeddingProviderMocks.getEmbeddingProvider.mockReturnValue({
      id: "openai-compatible",
      create,
    });
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");
    const config = {
      models: {
        providers: {
          omniroute: {
            api: "openai-completions",
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

    expect(embeddingProviderMocks.getEmbeddingProvider).toHaveBeenCalledWith(
      "openai-compatible",
      config,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        config,
        provider: "omniroute",
        model: "nebius/Qwen/Qwen3-Embedding-8B",
        dimensions: 4096,
      }),
    );
    expect(result.provider).toMatchObject({
      id: "omniroute",
      model: "nebius/Qwen/Qwen3-Embedding-8B",
      dimensions: 4096,
    });
    expect(result.runtime).toMatchObject({
      id: "omniroute",
      cacheKeyData: {
        provider: "omniroute",
        model: "nebius/Qwen/Qwen3-Embedding-8B",
        dimensions: 4096,
      },
    });
  });

  it("requires an explicit OmniRoute embedding model", async () => {
    embeddingProviderMocks.getEmbeddingProvider.mockReturnValue({
      id: "openai-compatible",
      create: vi.fn(),
    });
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");

    await expect(
      omniRouteEmbeddingProviderAdapter.create({
        config: {} as never,
        model: " ",
      }),
    ).rejects.toThrow(/explicit embedding model/);
  });

  it("builds fallback embedding index identity from model, base URL, and dimensions", async () => {
    embeddingProviderMocks.getEmbeddingProvider.mockReturnValue({
      id: "openai-compatible",
      create: vi.fn(),
    });
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

  it("generates OmniRoute images with an explicit model", async () => {
    providerAuthRuntimeMocks.resolveApiKeyForProvider.mockResolvedValue({ apiKey: "secret-key" });
    providerHttpMocks.resolveProviderHttpRequestConfig.mockReturnValue({
      baseUrl: "http://localhost:20128/v1",
      allowPrivateNetwork: true,
      headers: new Headers({ Authorization: "Bearer secret-key" }),
      dispatcherPolicy: undefined,
    });
    const release = vi.fn();
    const response = { ok: true } as never;
    providerHttpMocks.postJsonRequest.mockResolvedValue({ response, release });
    providerHttpMocks.readProviderJsonResponse.mockResolvedValue({
      data: [
        {
          b64_json: Buffer.from("generated image").toString("base64"),
        },
      ],
    });
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
    expect(providerAuthRuntimeMocks.resolveApiKeyForProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "omniroute",
        agentDir: "/tmp/agent",
      }),
    );
    expect(providerHttpMocks.sanitizeConfiguredModelProviderRequest).toHaveBeenCalledWith({
      allowPrivateNetwork: true,
    });
    expect(providerHttpMocks.resolveProviderHttpRequestConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://localhost:20128/v1",
        defaultBaseUrl: "http://localhost:20128/v1",
        defaultHeaders: {
          Authorization: "Bearer secret-key",
        },
        provider: "omniroute",
        capability: "image",
        transport: "http",
      }),
    );
    expect(providerHttpMocks.postJsonRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://localhost:20128/v1/images/generations",
        body: {
          model: "openai/gpt-image-2",
          prompt: "a schematic city",
          n: 4,
          size: "1536x1024",
          response_format: "b64_json",
        },
        fetchFn: fetch,
        allowPrivateNetwork: true,
      }),
    );
    expect(providerHttpMocks.assertOkOrThrowHttpError).toHaveBeenCalledWith(
      response,
      "OmniRoute image generation failed",
    );
    expect(release).toHaveBeenCalledOnce();
    expect(result.model).toBe("openai/gpt-image-2");
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      mimeType: "image/png",
      fileName: "omniroute-image-1.png",
    });
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
    providerAuthRuntimeMocks.resolveApiKeyForProvider.mockResolvedValue({ apiKey: "secret-key" });
    providerHttpMocks.resolveProviderHttpRequestConfig.mockReturnValue({
      baseUrl: "http://localhost:20128/v1",
      allowPrivateNetwork: undefined,
      headers: new Headers(),
      dispatcherPolicy: undefined,
    });
    providerHttpMocks.postJsonRequest.mockResolvedValue({
      response: { ok: true } as never,
      release: vi.fn(),
    });
    providerHttpMocks.readProviderJsonResponse.mockResolvedValue({ data: [] });
    const { buildOmniRouteImageGenerationProvider } = await import(
      "./image-generation-provider.js"
    );
    const provider = buildOmniRouteImageGenerationProvider();

    await expect(
      provider.generateImage({
        provider: "omniroute",
        model: "openai/gpt-image-2",
        prompt: "test",
        cfg: {} as never,
      }),
    ).rejects.toThrow(/missing image data/);
  });
});
