import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const EXPECTED_COMPATIBILITY_FLOOR = "2026.7.1";
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
    `>=${EXPECTED_COMPATIBILITY_FLOOR}`,
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
    "videoGenerationProviders",
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
    `>=${EXPECTED_COMPATIBILITY_FLOOR}`,
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
    embedding: 0,
    image: 0,
    video: 0,
    webSearch: 0,
  };
  const registrations = {
    provider: [],
    embedding: [],
    image: [],
    video: [],
    webSearch: [],
  };

  await plugin.register({
    registerProvider: (provider) => {
      registered.provider++;
      registrations.provider.push(provider);
    },
    registerEmbeddingProvider: (provider) => {
      registered.embedding++;
      registrations.embedding.push(provider);
    },
    registerImageGenerationProvider: (provider) => {
      registered.image++;
      registrations.image.push(provider);
    },
    registerVideoGenerationProvider: (provider) => {
      registered.video++;
      registrations.video.push(provider);
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
    assertEqual(
      registrations[capability][0]?.id,
      "omniroute",
      `${capability} registration id`,
    );
  }
  if (typeof registrations.provider[0]?.catalog?.run !== "function") {
    fail("OmniRoute provider does not expose catalog.run");
  }

  console.log(
    JSON.stringify({
      mode: "installed-artifact",
      packageVersion: pluginPackage.version,
      openClawVersion: openClawPackage.version,
      registrations: registered,
      registrationIds: Object.fromEntries(
        Object.entries(registrations).map(([capability, values]) => [capability, values[0].id]),
      ),
      providerId: registrations.provider[0].id,
      catalogRun: true,
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
