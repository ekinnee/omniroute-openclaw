import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  resolveOmniRouteApiKey: vi.fn(),
}));

vi.mock("./auth.js", () => authMock);

import { createOmniRouteWebSearchProvider } from "./web-search-provider.js";

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
  searchConfig?: Record<string, unknown>;
  agentDir?: string;
}) {
  return createOmniRouteWebSearchProvider().createTool({
    config: params?.config ?? baseConfig,
    searchConfig: params?.searchConfig ?? { provider: "omniroute" },
    agentDir: params?.agentDir,
  } as never)!;
}

function mockSearchResponse() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function createAuthError(params?: {
  code?: string;
  name?: string;
  provider?: string;
}) {
  const error = new Error("auth unavailable");
  error.name = params?.name ?? "ProviderAuthError";
  return Object.assign(error, {
    code: params?.code ?? "missing-provider-auth",
    provider: params?.provider ?? "omniroute",
  });
}

describe("OmniRoute web search provider", () => {
  afterEach(() => {
    authMock.resolveOmniRouteApiKey.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("declares the shared model-provider credential contract", () => {
    const provider = createOmniRouteWebSearchProvider();
    const sharedConfig = {
      models: { providers: { omniroute: { apiKey: "shared-key" } } },
    };
    const explicitSearchConfig = {
      ...sharedConfig,
      tools: { web: { search: { apiKey: "search-key" } } },
    };

    expect(provider.authProviderId).toBe("omniroute");
    expect(provider.getConfiguredCredentialValue?.(sharedConfig as never)).toBe("shared-key");
    expect(provider.getConfiguredCredentialValue?.(explicitSearchConfig as never)).toBeUndefined();
  });

  it("uses the shared configured provider credential", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("config-key");
    const fetchMock = mockSearchResponse();
    const config = {
      models: {
        providers: {
          omniroute: {
            apiKey: "configured-provider-entry",
            baseUrl: "https://omniroute.example/v1",
          },
        },
      },
    };
    const tool = createTool({ config, agentDir: "/tmp/omniroute-agent" });

    await tool.execute({ query: "configured" });

    expect(authMock.resolveOmniRouteApiKey).toHaveBeenCalledWith({
      cfg: config,
      agentDir: "/tmp/omniroute-agent",
    });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer config-key",
    );
  });

  it("uses an agent-scoped auth-profile credential through the shared resolver", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("profile-key");
    const fetchMock = mockSearchResponse();
    const config = {
      models: {
        providers: {
          omniroute: {
            apiKey: "omniroute:default",
            baseUrl: "https://omniroute.example/v1",
          },
        },
      },
    };
    const tool = createTool({ config, agentDir: "/tmp/omniroute-agent" });

    await tool.execute({ query: "profile" });

    expect(authMock.resolveOmniRouteApiKey).toHaveBeenCalledWith({
      cfg: config,
      agentDir: "/tmp/omniroute-agent",
    });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer profile-key",
    );
  });

  it("falls back to OMNIROUTE_API_KEY when shared auth is unavailable", async () => {
    authMock.resolveOmniRouteApiKey.mockRejectedValue(createAuthError());
    vi.stubEnv("OMNIROUTE_API_KEY", "env-key");
    const fetchMock = mockSearchResponse();
    const tool = createTool();

    await tool.execute({ query: "environment" });

    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer env-key",
    );
  });

  it("does not replace a configured auth failure with OMNIROUTE_API_KEY", async () => {
    authMock.resolveOmniRouteApiKey.mockRejectedValue(new Error("profile binding is invalid"));
    vi.stubEnv("OMNIROUTE_API_KEY", "env-key");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const tool = createTool({
      config: {
        models: {
          providers: {
            omniroute: {
              apiKey: "omniroute:broken",
              baseUrl: "https://omniroute.example/v1",
            },
          },
        },
      },
    });

    await expect(tool.execute({ query: "invalid profile" })).rejects.toThrow(
      "profile binding is invalid",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not treat a non-missing provider auth error as an environment fallback", async () => {
    authMock.resolveOmniRouteApiKey.mockRejectedValue(
      createAuthError({ code: "provider-auth-failed" }),
    );
    vi.stubEnv("OMNIROUTE_API_KEY", "env-key");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const tool = createTool();

    await expect(tool.execute({ query: "authorization failure" })).rejects.toThrow(
      "auth unavailable",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not treat another provider's missing auth as an OmniRoute fallback", async () => {
    authMock.resolveOmniRouteApiKey.mockRejectedValue(
      createAuthError({ provider: "other-provider" }),
    );
    vi.stubEnv("OMNIROUTE_API_KEY", "env-key");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const tool = createTool();

    await expect(tool.execute({ query: "other provider" })).rejects.toThrow(
      "auth unavailable",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an explicit web-search key ahead of shared auth", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("shared-key");
    const fetchMock = mockSearchResponse();
    const tool = createTool({
      config: {
        ...baseConfig,
        models: {
          providers: { omniroute: { apiKey: "shared-key", baseUrl: "https://omniroute.example/v1" } },
        },
      },
      searchConfig: { provider: "omniroute", apiKey: "search-key" },
    });

    await tool.execute({ query: "explicit" });

    expect(authMock.resolveOmniRouteApiKey).not.toHaveBeenCalled();
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer search-key",
    );
  });

  it("returns a stable non-secret error without contacting OmniRoute when credentials are unavailable", async () => {
    authMock.resolveOmniRouteApiKey.mockRejectedValue(
      createAuthError({ code: "missing-api-key", name: "MissingProviderAuthError" }),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const tool = createTool();

    await expect(tool.execute({ query: "missing" })).resolves.toEqual({
      error: "OmniRoute API key is not configured.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps freshness and result fields to the OmniRoute and OpenClaw contracts", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("request-key");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          {
            title: "Recent result",
            url: "https://example.com/recent",
            snippet: "A recent result.",
            published_at: "2026-08-28T01:02:03Z",
            content: { format: "text", text: "Full page content", length: 17 },
          },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const tool = createTool();

    await expect(
      tool.execute({ query: "recent OmniRoute news", count: 3, freshness: "week" }),
    ).resolves.toEqual({
      results: [
        {
          title: "Recent result",
          url: "https://example.com/recent",
          snippet: "A recent result.",
          published: "2026-08-28T01:02:03Z",
        },
      ],
    });

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody).toMatchObject({
      query: "recent OmniRoute news",
      max_results: 3,
      time_range: "week",
    });
    expect(requestBody).not.toHaveProperty("freshness");
  });

  it("forwards cancellation to the in-flight OmniRoute request", async () => {
    authMock.resolveOmniRouteApiKey.mockResolvedValue("request-key");
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestSignal?.addEventListener(
            "abort",
            () => reject(requestSignal?.reason ?? new Error("aborted")),
            { once: true },
          );
        }),
    );
    const tool = createTool();
    const search = tool.execute({ query: "cancel" }, { signal: controller.signal });

    await vi.waitFor(() => expect(requestSignal).toBeInstanceOf(AbortSignal));
    controller.abort();

    await expect(search).rejects.toBeDefined();
    expect(requestSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
