// OmniRoute provider plugin tests — standalone compatible
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function mockCatalogContext(overrides?: { baseUrl?: string; apiKey?: string }) {
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
    env: {},
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
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.openclaw.extensions).toContain("./dist/index.js");
    expect(pkg.openclaw.compat.pluginApi).toBeDefined();
    expect(pkg.openclaw.build.openclawVersion).toBeDefined();
  });

  it("has a valid manifest", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, "openclaw.plugin.json"), "utf8"),
    );
    expect(manifest.id).toBe("omniroute");
    expect(manifest.providers).toContain("omniroute");
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
        Authorization: "Bearer secret-key",
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
});
