// OmniRoute plugin entry, onboarding, and cross-capability integration tests.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

function mockCatalogResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("omniroute plugin entry and integration", () => {

  beforeAll(async () => {
    // Cold SDK loading belongs to setup, not the first behavior test's deadline.
    await import("./provider-catalog.js");
  }, 30_000);

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
    expect(pkg.keywords).toEqual([
      "omniroute",
      "model-routing",
      "multi-provider",
      "openai-compatible",
      "inference",
      "embeddings",
      "image-generation",
      "video-generation",
      "web-search",
    ]);
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
    expect(manifest).not.toHaveProperty("tags");
    expect(manifest.categories).toEqual(["models", "media", "web"]);
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
    expect(registerModelCatalogProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "omniroute",
        kinds: ["image_generation", "video_generation", "music_generation"],
        liveCatalog: expect.any(Function),
      }),
    );
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

  it.each(["direct", "env-proxy"])("preserves configured auth, headers, and target TLS with %s transport", async (mode) => {
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
        proxy: mode === "env-proxy" ? {
          mode,
          tls: { ca: "proxy-ca" },
        } : undefined,
      },
      defaultHeaders: { Authorization: "Bearer default" },
    });

    expect(resolved.headers.get("X-Trace")).toBe("trace-value");
    expect(resolved.headers.get("X-Gateway-Token")).toBe("Token request-secret");
    expect(resolved.headers.get("Authorization")).toBeNull();
    expect(resolved.dispatcherPolicy).toEqual({
      mode,
      connect: {
        ca: "target-ca",
        cert: "target-cert",
        key: "target-key",
        servername: "gateway.example",
        rejectUnauthorized: true,
      },
      ...(mode === "env-proxy" ? { proxyTls: { ca: "proxy-ca" } } : {}),
    });
  });

  it.each([undefined, {}])("preserves explicit proxy policy without effective target TLS (%j)", async (tls) => {
    const { resolveOmniRouteHttpRequestConfig } = await import("./http.js");
    const resolved = resolveOmniRouteHttpRequestConfig({
      baseUrl: "https://gateway.example/v1",
      defaultBaseUrl: "http://localhost:20128/v1",
      request: {
        tls,
        proxy: {
          mode: "explicit-proxy",
          url: "http://proxy.example:8080",
          tls: { ca: "proxy-ca" },
        },
      },
    });
    expect(resolved.dispatcherPolicy).toEqual({
      mode: "explicit-proxy",
      proxyUrl: "http://proxy.example:8080",
      proxyTls: { ca: "proxy-ca" },
    });
  });

  it.each([
    { ca: "target-ca" },
    { cert: "target-cert" },
    { key: "target-key" },
    { passphrase: "target-passphrase" },
    { serverName: "gateway.example" },
    { insecureSkipVerify: false },
  ])("rejects target TLS with an explicit proxy before catalog fetch (%j)", async (tls) => {
    const { fetchOmniRouteChatModels } = await import("./provider-catalog.js");
    const { resolveOmniRouteHttpRequestConfig } = await import("./http.js");
    const request = {
      tls,
      proxy: { mode: "explicit-proxy", url: "http://proxy.example:8080" },
    };
    const message = "models.providers.omniroute.request.tls is not supported with request.proxy.mode=explicit-proxy";
    expect(() => resolveOmniRouteHttpRequestConfig({
      baseUrl: "https://gateway.example/v1",
      defaultBaseUrl: "http://localhost:20128/v1",
      request,
    })).toThrow(message);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockCatalogResponse({ data: [] }));
    await expect(fetchOmniRouteChatModels({
      baseUrl: "https://gateway.example/v1",
      request,
    })).rejects.toThrow(message);
    expect(fetchMock).not.toHaveBeenCalled();
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

});
