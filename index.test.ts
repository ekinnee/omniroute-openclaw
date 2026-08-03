// OmniRoute provider plugin tests — standalone compatible
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIN_OPENCLAW_VERSION = "2026.7.1";
const REQUIRED_OPENCLAW_SDK_EXPORTS = [
  "./plugin-sdk/agent-runtime",
  "./plugin-sdk/plugin-entry",
  "./plugin-sdk/provider-auth",
  "./plugin-sdk/secret-input-runtime",
  "./plugin-sdk/ssrf-runtime",
] as const;

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
  });

  it("has a valid package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
    expect(pkg.name).toBe("@ekinnee/omniroute-provider");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
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

  it("keeps runtime source imports on public OpenClaw SDK subpaths", () => {
    const runtimeFiles = [
      "index.ts",
      "models.ts",
      "onboard.ts",
      "provider-catalog.ts",
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

  it("forwards AbortSignal to fetch for chat model discovery", async () => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "if/kimi-k2", type: "chat" }] }),
    } as never);
    const controller = new AbortController();

    await fetchOmniRouteChatModels({
      baseUrl: "http://localhost:20128/v1",
      apiKey: "secret-key",
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/models",
      expect.objectContaining({ signal: controller.signal }),
    );
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

  it("forwards AbortSignal to fetch for embedding model discovery", async () => {
    const { fetchOmniRouteEmbeddingModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as never);
    const controller = new AbortController();

    await fetchOmniRouteEmbeddingModels({
      baseUrl: "http://localhost:20128/v1",
      apiKey: "secret-key",
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/models",
      expect.objectContaining({ signal: controller.signal }),
    );
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

  it("forwards AbortSignal to fetch for image model discovery", async () => {
    const { fetchOmniRouteImageModels } = await import("./provider-catalog.js");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as never);
    const controller = new AbortController();

    await fetchOmniRouteImageModels({
      baseUrl: "http://localhost:20128/v1",
      apiKey: "secret-key",
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/models",
      expect.objectContaining({ signal: controller.signal }),
    );
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
        staticCatalog: expect.objectContaining({ run: expect.any(Function) }),
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

  it("creates an OmniRoute embedding provider through the guarded public HTTP path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { omniRouteEmbeddingProviderAdapter } = await import("./embedding-provider.js");
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
        model: "nebius/Qwen/Qwen3-Embedding-8B",
        dimensions: 4096,
      },
    });
    expect(vector).toEqual([0.1, 0.2]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/embeddings",
      expect.objectContaining({ method: "POST" }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      model: "nebius/Qwen/Qwen3-Embedding-8B",
      input: ["hello"],
      dimensions: 4096,
    });
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
          insecureSkipVerify: true,
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
