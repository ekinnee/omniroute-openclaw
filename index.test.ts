// OmniRoute provider plugin tests — standalone compatible
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("omniroute provider plugin", () => {
  it("has a valid package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
    expect(pkg.name).toBe("@ekinnee/omniroute-provider");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.openclaw.extensions).toContain("./index.ts");
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
