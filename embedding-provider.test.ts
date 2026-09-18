// OmniRoute embedding catalog and provider tests.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

function mockCatalogResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OmniRoute embedding provider", () => {

  beforeAll(async () => {
    // Cold SDK loading belongs to setup, not the first behavior test's deadline.
    await import("./provider-catalog.js");
  }, 30_000);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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
});
