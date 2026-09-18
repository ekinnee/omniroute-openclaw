// OmniRoute image catalog and generation/editing tests.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

function mockCatalogResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OmniRoute image generation provider", () => {

  beforeAll(async () => {
    // Cold SDK loading belongs to setup, not the first behavior test's deadline.
    await import("./provider-catalog.js");
  }, 30_000);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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

  it("treats an empty OmniRoute image input list as generation", async () => {
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
      inputImages: [],
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
    expect(provider.capabilities.edit).toEqual({
      enabled: true,
      maxCount: 1,
      maxInputImages: 1,
      supportsSize: true,
      supportsAspectRatio: false,
      supportsResolution: false,
    });
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

  it("edits one OmniRoute image through the JSON data URL contract", async () => {
    const input = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const output = Buffer.from(input);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: output.toString("base64"), mime_type: "image/png" }],
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
      prompt: "edit this",
      count: 4,
      size: "1536x1024",
      inputImages: [{ buffer: input, mimeType: "image/png", fileName: "reference.png" }],
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
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/images/edits",
      expect.objectContaining({ method: "POST" }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toEqual({
      model: "openai/gpt-image-2",
      prompt: "edit this",
      image: `data:image/png;base64,${input.toString("base64")}`,
      size: "1536x1024",
      response_format: "b64_json",
    });
    expect(result).toEqual({
      model: "openai/gpt-image-2",
      images: [{
        buffer: output,
        mimeType: "image/png",
        fileName: "omniroute-image-1.png",
      }],
    });
  });

  it.each([
    {
      name: "multiple reference images",
      inputImages: [
        { buffer: Buffer.from("one"), mimeType: "image/png" },
        { buffer: Buffer.from("two"), mimeType: "image/png" },
      ],
      error: /exactly one reference image/,
    },
    {
      name: "an empty reference image",
      inputImages: [{ buffer: Buffer.alloc(0), mimeType: "image/png" }],
      error: /non-empty reference image/,
    },
    {
      name: "a non-image reference MIME type",
      inputImages: [{ buffer: Buffer.from("not an image"), mimeType: "text/plain" }],
      error: /image\/\* reference MIME type/,
    },
  ])("rejects $name before authentication or network access", async ({ inputImages, error }) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { buildOmniRouteImageGenerationProvider } = await import(
      "./image-generation-provider.js"
    );

    await expect(
      buildOmniRouteImageGenerationProvider().generateImage({
        provider: "omniroute",
        model: "openai/gpt-image-2",
        prompt: "edit this",
        inputImages,
        cfg: {} as never,
      }),
    ).rejects.toThrow(error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("labels OmniRoute image edit HTTP failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unsupported edit", { status: 400 }),
    );
    const { buildOmniRouteImageGenerationProvider } = await import(
      "./image-generation-provider.js"
    );

    await expect(
      buildOmniRouteImageGenerationProvider().generateImage({
        provider: "omniroute",
        model: "openai/gpt-image-2",
        prompt: "edit this",
        inputImages: [{ buffer: Buffer.from("image"), mimeType: "image/png" }],
        cfg: {
          models: {
            providers: {
              omniroute: { apiKey: "secret-key" },
            },
          },
        } as never,
      }),
    ).rejects.toThrow(/OmniRoute image edit failed/);
  });

  it.each([
    { name: "malformed", payload: {}, error: /image edit response malformed/ },
    { name: "empty", payload: { data: [] }, error: /image edit response missing image data/ },
  ])("reports edit-specific errors for $name OmniRoute responses", async ({ payload, error }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { buildOmniRouteImageGenerationProvider } = await import(
      "./image-generation-provider.js"
    );

    await expect(
      buildOmniRouteImageGenerationProvider().generateImage({
        provider: "omniroute",
        model: "openai/gpt-image-2",
        prompt: "edit this",
        inputImages: [{ buffer: Buffer.from("image"), mimeType: "image/png" }],
        cfg: {
          models: {
            providers: {
              omniroute: { apiKey: "secret-key" },
            },
          },
        } as never,
      }),
    ).rejects.toThrow(error);
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
