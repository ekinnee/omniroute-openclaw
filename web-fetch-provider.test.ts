import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  resolveOmniRouteApiKey: vi.fn(),
}));

vi.mock("./auth.js", () => authMock);

import { createOmniRouteWebFetchProvider } from "./web-fetch-provider.js";

const baseConfig = {
  models: {
    providers: {
      omniroute: {
        baseUrl: "https://omniroute.example/v1",
      },
    },
  },
};

function createTool(params?: {
  config?: unknown;
  fetchConfig?: Record<string, unknown>;
}) {
  return createOmniRouteWebFetchProvider().createTool({
    config: params?.config ?? baseConfig,
    fetchConfig: params?.fetchConfig ?? { provider: "omniroute" },
  } as never)!;
}

function mockFetchResponse(payload: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("OmniRoute web fetch provider", () => {
  afterEach(() => {
    authMock.resolveOmniRouteApiKey.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("declares the shared provider credential contract", () => {
    const provider = createOmniRouteWebFetchProvider();
    const sharedConfig = {
      models: { providers: { omniroute: { apiKey: "shared-key" } } },
    };
    const explicitFetchConfig = {
      ...sharedConfig,
      tools: { web: { fetch: { apiKey: "fetch-key" } } },
    };

    expect(provider.envVars).toEqual(["OMNIROUTE_API_KEY"]);
    expect(provider.getConfiguredCredentialValue?.(sharedConfig as never)).toBe("shared-key");
    expect(provider.getConfiguredCredentialValue?.(explicitFetchConfig as never)).toBeUndefined();
  });

  it("maps markdown results and requests the overlapping OmniRoute fields", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("request-key");
    const fetchMock = mockFetchResponse({
      provider: "jina-reader",
      url: "https://example.com/article",
      content: "# Example\n\nReadable content.",
      links: ["https://example.com/ignored"],
      metadata: { title: "Example", description: "Ignored by OpenClaw", truncated: true },
      screenshot_url: "https://example.com/ignored.png",
    });
    const tool = createTool();

    await expect(tool.execute({
      url: "https://example.com/article",
      extractMode: "markdown",
      maxChars: 5,
    })).resolves.toEqual({
      text: "# Example\n\nReadable content.",
      finalUrl: "https://example.com/article",
      contentType: "text/markdown",
      status: 200,
      title: "Example",
      extractor: "jina-reader",
      truncated: true,
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toEqual({
      url: "https://example.com/article",
      format: "markdown",
      include_metadata: true,
    });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer request-key",
    );
  });

  it("projects markdown to plain text while leaving maxChars to OpenClaw", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("request-key");
    mockFetchResponse({
      url: "https://example.com/",
      content: "# Heading\n\nParagraph with **emphasis**.",
      metadata: null,
    });
    const tool = createTool();

    const result = await tool.execute({
      url: "https://example.com",
      extractMode: "text",
      maxChars: 1,
    });

    expect(result).toMatchObject({
      finalUrl: "https://example.com/",
      contentType: "text/plain",
      status: 200,
    });
    expect(result.text).toContain("Heading");
    expect(result.text).not.toContain("# Heading");
  });

  it("accepts an empty page body when OmniRoute returns one", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("request-key");
    mockFetchResponse({ content: "", metadata: null });

    await expect(createTool().execute({ url: "https://example.com" })).resolves.toMatchObject({
      text: "",
      finalUrl: "https://example.com/",
      contentType: "text/markdown",
    });
  });

  it("rejects blocked target hostnames before making a request", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("request-key");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(createTool().execute({ url: "http://127.0.0.1/private" })).rejects.toThrow(
      "Blocked hostname or private/internal/special-use IP address",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves bounded structured provider errors", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("request-key");
    mockFetchResponse({
      error: { message: "upstream provider rejected the URL\nplease retry" },
    }, 422);

    await expect(createTool().execute({ url: "https://example.com" })).rejects.toThrow(
      "OmniRoute web fetch failed: HTTP 422: upstream provider rejected the URL please retry",
    );
  });

  it("uses an explicit web-fetch key ahead of shared auth", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("shared-key");
    const fetchMock = mockFetchResponse({ content: "content" });
    const tool = createTool({ fetchConfig: { provider: "omniroute", apiKey: "fetch-key" } });

    await tool.execute({ url: "https://example.com" });

    expect(authMock.resolveOmniRouteApiKey).not.toHaveBeenCalled();
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer fetch-key",
    );
  });
});
