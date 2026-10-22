import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const EXPECTED_COMPATIBILITY_FLOOR = "2026.7.1";
const EXPECTED_PEER_RANGE = `>=${EXPECTED_COMPATIBILITY_FLOOR}-0`;
const PLUGIN_PACKAGE_NAME = "@ekinnee/omniroute-provider";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertArrayIncludes(actual, expected, label) {
  if (!Array.isArray(actual) || !actual.includes(expected)) {
    fail(`${label}: expected an array containing ${expected}`);
  }
}

function assertPackageCompatibilityMetadata(packageJson, expectedBuildVersion) {
  const peerRange = packageJson.peerDependencies?.openclaw;
  assertEqual(
    peerRange,
    EXPECTED_PEER_RANGE,
    "peerDependencies.openclaw",
  );

  const compatibility = packageJson.openclaw?.compat;
  assertEqual(
    compatibility?.pluginApi,
    peerRange,
    "openclaw.compat.pluginApi",
  );
  assertEqual(
    compatibility?.minGatewayVersion,
    EXPECTED_COMPATIBILITY_FLOOR,
    "openclaw.compat.minGatewayVersion",
  );

  const build = packageJson.openclaw?.build;
  assertEqual(
    build?.openclawVersion,
    expectedBuildVersion,
    "openclaw.build.openclawVersion",
  );
  assertEqual(
    build?.pluginSdkVersion,
    expectedBuildVersion,
    "openclaw.build.pluginSdkVersion",
  );
}

function assertPluginManifest(packageRoot) {
  const manifest = readJson(resolve(packageRoot, "openclaw.plugin.json"));
  const providerId = "omniroute";
  assertEqual(manifest.id, providerId, "manifest id");
  assertArrayIncludes(manifest.providers, providerId, "manifest providers");

  for (const contract of [
    "embeddingProviders",
    "imageGenerationProviders",
    "usageProviders",
    "speechProviders",
    "mediaUnderstandingProviders",
    "videoGenerationProviders",
    "musicGenerationProviders",
    "webFetchProviders",
    "webSearchProviders",
  ]) {
    assertArrayIncludes(manifest.contracts?.[contract], providerId, `manifest ${contract}`);
  }

  const setupProvider = manifest.setup?.providers?.find(({ id }) => id === providerId);
  if (!setupProvider) {
    fail("manifest setup does not declare the omniroute provider");
  }
  assertArrayIncludes(setupProvider.authMethods, "api-key", "manifest auth methods");
  for (const envVar of ["OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"]) {
    assertArrayIncludes(setupProvider.envVars, envVar, "manifest provider env vars");
  }
}

function resolveLockfileOpenClawVersion(lockfile) {
  const match = lockfile.match(
    /^\s{6}openclaw:\s*\n\s{8}specifier:\s*([^\n]+)\n\s{8}version:\s*([^\s]+)\s*$/m,
  );
  if (!match) {
    fail("Could not resolve the OpenClaw importer entry from pnpm-lock.yaml");
  }
  return { specifier: match[1].replace(/^['"]|['"]$/g, ""), version: match[2] };
}

function runSourceContract() {
  const repositoryRoot = resolve(process.cwd());
  const packageJson = readJson(resolve(repositoryRoot, "package.json"));
  const lockfile = readFileSync(resolve(repositoryRoot, "pnpm-lock.yaml"), "utf8");
  const lockfileOpenClaw = resolveLockfileOpenClawVersion(lockfile);

  assertPackageCompatibilityMetadata(packageJson, lockfileOpenClaw.version);
  assertPluginManifest(repositoryRoot);
  assertEqual(
    lockfileOpenClaw.specifier,
    EXPECTED_PEER_RANGE,
    "pnpm-lock.yaml OpenClaw specifier",
  );
  assertEqual(
    lockfileOpenClaw.version,
    EXPECTED_COMPATIBILITY_FLOOR,
    "pnpm-lock.yaml OpenClaw resolution",
  );

  console.log(
    JSON.stringify({
      mode: "source-contract",
      packageVersion: packageJson.version,
      compatibilityFloor: EXPECTED_COMPATIBILITY_FLOOR,
      buildVersion: lockfileOpenClaw.version,
    }),
  );
}

async function runInstalledArtifact() {
  // Set selectors before importing the SDK; never inspect the runner's real auth.
  const fixtureRoot = mkdtempSync(join(tmpdir(), "omniroute-readiness-"));
  process.once("exit", () => rmSync(fixtureRoot, { recursive: true, force: true }));
  process.env.OPENCLAW_STATE_DIR = fixtureRoot;
  process.env.OPENCLAW_CONFIG_PATH = join(fixtureRoot, "openclaw.json");
  delete process.env.OMNIROUTE_API_KEY;
  delete process.env.OMNIROUTE_BASE_URL;
  const warnings = [];
  process.on("warning", (warning) => warnings.push(warning));
  const projectRoot = resolve(process.cwd());
  const requireFromProject = createRequire(resolve(projectRoot, "package.json"));
  const pluginPackagePath = requireFromProject.resolve(`${PLUGIN_PACKAGE_NAME}/package.json`);
  const pluginPackage = readJson(pluginPackagePath);
  const expectedBuildVersion =
    process.env.OPENCLAW_BUILD_VERSION ?? EXPECTED_COMPATIBILITY_FLOOR;
  assertPackageCompatibilityMetadata(pluginPackage, expectedBuildVersion);
  assertPluginManifest(dirname(pluginPackagePath));

  const openClawEntryPath = requireFromProject.resolve("openclaw");
  const openClawPackage = readJson(resolve(dirname(openClawEntryPath), "../package.json"));
  assertEqual(
    openClawPackage.version,
    process.env.OPENCLAW_EXPECTED_VERSION,
    "installed OpenClaw version",
  );

  const pluginEntryPath = requireFromProject.resolve(`${PLUGIN_PACKAGE_NAME}/dist/index.js`);
  const plugin = (await import(pluginEntryPath)).default;
  if (!plugin || typeof plugin.register !== "function") {
    fail("Packaged plugin does not expose a register function");
  }

  const registered = {
    provider: 0,
    modelCatalog: 0,
    embedding: 0,
    image: 0,
    speech: 0,
    mediaUnderstanding: 0,
    video: 0,
    music: 0,
    webFetch: 0,
    webSearch: 0,
  };
  const registrations = {
    provider: [],
    modelCatalog: [],
    embedding: [],
    image: [],
    speech: [],
    mediaUnderstanding: [],
    video: [],
    music: [],
    webFetch: [],
    webSearch: [],
  };

  await plugin.register({
    registerProvider: (provider) => {
      registered.provider++;
      registrations.provider.push(provider);
    },
    registerModelCatalogProvider: (provider) => {
      registered.modelCatalog++;
      registrations.modelCatalog.push(provider);
    },
    registerEmbeddingProvider: (provider) => {
      registered.embedding++;
      registrations.embedding.push(provider);
    },
    registerImageGenerationProvider: (provider) => {
      registered.image++;
      registrations.image.push(provider);
    },
    registerSpeechProvider: (provider) => {
      registered.speech++;
      registrations.speech.push(provider);
    },
    registerMediaUnderstandingProvider: (provider) => {
      registered.mediaUnderstanding++;
      registrations.mediaUnderstanding.push(provider);
    },
    registerVideoGenerationProvider: (provider) => {
      registered.video++;
      registrations.video.push(provider);
    },
    registerMusicGenerationProvider: (provider) => {
      registered.music++;
      registrations.music.push(provider);
    },
    registerWebFetchProvider: (provider) => {
      registered.webFetch++;
      registrations.webFetch.push(provider);
    },
    registerWebSearchProvider: (provider) => {
      registered.webSearch++;
      registrations.webSearch.push(provider);
    },
  });

  for (const [capability, count] of Object.entries(registered)) {
    assertEqual(count, 1, `${capability} registration count`);
  }
  for (const capability of Object.keys(registered)) {
    if (capability === "modelCatalog") {
      assertEqual(
        registrations[capability][0]?.provider,
        "omniroute",
        `${capability} registration provider`,
      );
      continue;
    }
    assertEqual(
      registrations[capability][0]?.id,
      "omniroute",
      `${capability} registration id`,
    );
  }
  if (typeof registrations.provider[0]?.catalog?.run !== "function") {
    fail("OmniRoute provider does not expose catalog.run");
  }

  const readiness = {};
  for (const capability of ["image", "video", "music", "speech"]) {
    const provider = registrations[capability][0];
    const context = {
      cfg: {}, agentDir: join(fixtureRoot, "agent"),
      providerConfig: { model: "fixture/model" },
    };
    assertEqual(typeof provider.isConfiguredAsync, "function", `${capability} async hook`);
    assertEqual(await provider.isConfiguredAsync(context), false, `${capability} absent auth`);
    const configuredContext = {
      ...context,
      cfg: { models: { providers: { omniroute: { apiKey: "fixture-key" } } } },
    };
    assertEqual(await provider.isConfiguredAsync(configuredContext), true, `${capability} configured auth`);
    assertEqual(provider.isConfigured(configuredContext), true, `${capability} legacy boolean`);
    readiness[capability] = { absent: false, configured: true, legacy: true };
  }
  // Node delivers emitWarning asynchronously. Async readiness must avoid the
  // deprecated provider/auth paths on hosts that supply the replacements.
  await new Promise((resolve) => setImmediate(resolve));
  const authSdk = await import(requireFromProject.resolve("openclaw/plugin-sdk/provider-auth"));
  if (typeof authSdk.isProviderAuthProfileConfiguredAsync === "function") {
    assertEqual(warnings.filter((warning) =>
      ["DEP_PLUGIN_SDK", "DEP_SESSION_PERSISTENCE"].includes(warning.code),
    ).length, 0, "async readiness deprecation warnings");
  }

  console.log(
    JSON.stringify({
      mode: "installed-artifact",
      packageVersion: pluginPackage.version,
      openClawVersion: openClawPackage.version,
      registrations: registered,
      registrationIds: Object.fromEntries(
        Object.entries(registrations).map(([capability, values]) => [
          capability,
          capability === "modelCatalog" ? values[0].provider : values[0].id,
        ]),
      ),
      providerId: registrations.provider[0].id,
      catalogRun: true,
      readiness,
    }),
  );
}

const mode = process.argv[2];
if (mode === "--source-contract") {
  runSourceContract();
} else if (mode === "--installed-artifact") {
  await runInstalledArtifact();
} else {
  fail("Usage: upstream-compatibility-probe.mjs --source-contract|--installed-artifact");
}
