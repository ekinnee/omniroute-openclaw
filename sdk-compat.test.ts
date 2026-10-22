import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  asyncAuth: true,
  asyncConfig: true,
  profile: vi.fn(),
  profileAsync: vi.fn(),
  envKey: vi.fn(),
  config: vi.fn(),
  configAsync: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("openclaw/plugin-sdk/provider-auth", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  resolveEnvApiKey: sdk.envKey,
  isProviderAuthProfileConfigured: sdk.profile,
  get isProviderAuthProfileConfiguredAsync() {
    return sdk.asyncAuth ? sdk.profileAsync : undefined;
  },
}));
vi.mock("openclaw/plugin-sdk/runtime-config-snapshot", () => ({
  getRuntimeConfig: sdk.config,
  get captureRuntimeConfigAsyncReader() {
    return sdk.asyncConfig ? sdk.capture : undefined;
  },
}));

let auth: typeof import("./auth.js");
type ReadinessContext = ReturnType<typeof context>;
let providers: [string, () => {
  isConfigured?: (ctx: ReadinessContext) => boolean;
  isConfiguredAsync?: (ctx: ReadinessContext) => Promise<boolean>;
}][];
let runAudit: typeof import("./catalog-audit-cli.js").runOmniRouteCatalogAuditCli;
const config = { models: { providers: { omniroute: { apiKey: "fixture-config-key" } } } };
const report = { schemaVersion: 1, baseUrl: "https://fixture.example/v1", totalRows: 0,
  invalidRows: 0, duplicateIds: [], modelCount: 0, models: [] } as const;

beforeAll(async () => {
  auth = await import("./auth.js");
  const image = await import("./image-generation-provider.js");
  const video = await import("./video-generation-provider.js");
  const music = await import("./music-generation-provider.js");
  const speech = await import("./speech-provider.js");
  providers = [
    ["image", image.buildOmniRouteImageGenerationProvider],
    ["video", video.buildOmniRouteVideoGenerationProvider],
    ["music", music.buildOmniRouteMusicGenerationProvider],
    ["speech", speech.buildOmniRouteSpeechProvider],
  ];
  runAudit = (await import("./catalog-audit-cli.js")).runOmniRouteCatalogAuditCli;
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
  sdk.asyncAuth = sdk.asyncConfig = true;
  sdk.profile.mockReturnValue(false);
  sdk.profileAsync.mockResolvedValue(false);
  sdk.envKey.mockReturnValue(undefined);
  sdk.config.mockReturnValue({});
  sdk.configAsync.mockResolvedValue({});
  sdk.capture.mockReturnValue(sdk.configAsync);
  vi.stubEnv("OMNIROUTE_API_KEY", "");
});
afterEach(() => { vi.unstubAllEnvs(); });

function context() {
  return { cfg: {}, agentDir: "/tmp/fixture-agent", providerConfig: { model: "fixture/tts" } };
}

describe("SDK readiness compatibility", () => {
  it.each([false, true])("awaits a delayed profile result (%s) on all four providers", async (ready) => {
    for (const [name, build] of providers) {
      let finish!: (value: boolean) => void;
      sdk.profileAsync.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
      const provider = build();
      expect(provider.isConfiguredAsync, name).toBeTypeOf("function");
      const pending = provider.isConfiguredAsync!(context());
      let settled = false;
      void pending.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled, name).toBe(false);
      finish(ready);
      expect(await pending, name).toBe(ready);
      expect(sdk.profileAsync).toHaveBeenLastCalledWith({
        provider: "omniroute", agentDir: name === "speech" ? undefined : "/tmp/fixture-agent",
      });
    }
    expect(sdk.profile).not.toHaveBeenCalled();
  });

  it("preserves direct config, SecretRef and environment short circuits", async () => {
    const secretRef = { source: "env", provider: "default", id: "FIXTURE_SECRET" };
    for (const apiKey of ["fixture-config-key", secretRef]) {
      expect(await auth.isOmniRouteConfiguredAsync({ cfg: {
        models: { providers: { omniroute: { apiKey } } },
      } })).toBe(true);
    }
    sdk.envKey.mockReturnValueOnce({ apiKey: "fixture-sdk-env-key" });
    expect(await auth.isOmniRouteConfiguredAsync({})).toBe(true);
    vi.stubEnv("OMNIROUTE_API_KEY", "fixture-env-key");
    expect(await auth.isOmniRouteConfiguredAsync({})).toBe(true);
    expect(sdk.profileAsync).not.toHaveBeenCalled();
    expect(sdk.profile).not.toHaveBeenCalled();
  });

  it("retains immediate sync hooks and falls back only when the async export is absent", async () => {
    sdk.asyncAuth = false;
    for (const ready of [false, true]) {
      sdk.profile.mockReturnValue(ready);
      for (const [name, build] of providers) {
        const provider = build();
        expect(provider.isConfigured!(context()), name).toBe(ready);
        expect(await provider.isConfiguredAsync!(context()), name).toBe(ready);
      }
    }
    expect(sdk.profileAsync).not.toHaveBeenCalled();
  });

  it("does not retry rejected async auth through the deprecated API", async () => {
    const error = new Error("fixture async auth failure");
    sdk.profileAsync.mockRejectedValue(error);
    for (const [, build] of providers) {
      await expect(build().isConfiguredAsync!(context())).rejects.toBe(error);
    }
    expect(sdk.profile).not.toHaveBeenCalled();
  });

  it("preserves speech's model requirement and explicit-key short circuit", async () => {
    const speech = providers.find(([name]) => name === "speech")![1]();
    expect(await speech.isConfiguredAsync!({ cfg: config, providerConfig: {} })).toBe(false);
    expect(await speech.isConfiguredAsync!({ cfg: {}, providerConfig: {
      modelId: "fixture/tts", apiKey: "fixture-speech-key",
    } })).toBe(true);
    expect(sdk.profileAsync).not.toHaveBeenCalled();
    expect(sdk.profile).not.toHaveBeenCalled();
  });
});

describe("SDK cold audit compatibility", () => {
  function options() {
    return { agentDir: "/tmp/fixture-agent", stdout: { write: vi.fn() },
      loadAudit: vi.fn().mockResolvedValue(report) };
  }

  it("awaits cold async config before starting the audit", async () => {
    let finish!: (value: unknown) => void;
    sdk.configAsync.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const opts = options();
    const pending = runAudit(["--json"], opts);
    expect(sdk.capture).toHaveBeenCalledExactlyOnceWith();
    expect(opts.loadAudit).not.toHaveBeenCalled();
    finish(config);
    await pending;
    expect(opts.loadAudit).toHaveBeenCalledWith(expect.objectContaining({ config }));
    expect(sdk.config).not.toHaveBeenCalled();
  });

  it("uses the old reader when the async export is absent", async () => {
    sdk.asyncConfig = false;
    sdk.config.mockReturnValue(config);
    const opts = options();
    await runAudit([], opts);
    expect(sdk.config).toHaveBeenCalledExactlyOnceWith();
    expect(opts.loadAudit).toHaveBeenCalledWith(expect.objectContaining({ config }));
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("bypasses all config preparation for injected config, help, and invalid args", async () => {
    const opts = options();
    await runAudit([], { ...opts, config: {} });
    await runAudit(["--help"], opts);
    await expect(runAudit(["--invalid"], opts)).rejects.toThrow("Unknown catalog audit option");
    expect(sdk.config).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.configAsync).not.toHaveBeenCalled();
  });

  it("propagates async preparation failures without sync fallback or audit", async () => {
    const error = new Error("fixture async config failure");
    sdk.configAsync.mockRejectedValueOnce(error);
    const opts = options();
    await expect(runAudit([], opts)).rejects.toBe(error);
    expect(sdk.config).not.toHaveBeenCalled();
    expect(opts.loadAudit).not.toHaveBeenCalled();
  });
});
