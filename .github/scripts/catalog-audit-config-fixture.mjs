import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const report = {
  schemaVersion: 1, baseUrl: "https://fixture.example/v1", totalRows: 0,
  invalidRows: 0, duplicateIds: [], modelCount: 0, models: [],
};

if (process.argv[2] === "--child") {
  // The parent sets process selectors before this fresh process imports any SDK.
  const [entryPath, scenario, fixtureRoot, agentSchema] = process.argv.slice(3);
  const { runOmniRouteCatalogAuditCli } = await import(pathToFileURL(entryPath).href);
  const json = scenario !== "default-text";
  const named = scenario === "named-json";
  const expectedAgent = named ? "research" : "primary";
  let calls = 0;
  const writes = [];
  await runOmniRouteCatalogAuditCli([
    ...(json ? ["--json"] : []), ...(named ? ["--agent", expectedAgent] : []),
  ], {
    // Deliberately disagree with process.env: this override must not select config.
    env: { ...process.env, OPENCLAW_CONFIG_PATH: join(fixtureRoot, "not-the-config.json") },
    stdout: { write: (value) => writes.push(value) },
    loadAudit: async ({ config, agentDir, env }) => {
      calls++;
      assert.equal(config.models.providers.omniroute.apiKey, "fixture-api-key");
      assert.equal(config.models.providers.omniroute.baseUrl, report.baseUrl);
      assert.equal(agentDir, join(fixtureRoot, expectedAgent));
      assert.equal(env.OPENCLAW_CONFIG_PATH, join(fixtureRoot, "not-the-config.json"));
      return report;
    },
  });
  assert.equal(calls, 1);
  const output = writes.join("");
  if (json) assert.deepEqual(JSON.parse(output), report);
  else assert.match(output, /^OmniRoute catalog audit: 0 models\nBase URL: https:\/\/fixture.example\/v1\n/);
  console.log(JSON.stringify({ scenario, agentSchema, configLoaded: true, agent: expectedAgent, json }));
} else {
  const agentSchema = process.argv[2];
  assert.ok(["list", "entries"].includes(agentSchema), "Specify the target SDK agent schema: list or entries");
  const requireFromInstall = createRequire(resolve(process.cwd(), "package.json"));
  const entryPath = requireFromInstall.resolve("@ekinnee/omniroute-provider/dist/catalog-audit-cli.js");
  const fixtureRoot = mkdtempSync(join(tmpdir(), "omniroute-config-fixture-"));
  try {
    for (const name of ["state", "workspace", "primary", "research"]) mkdirSync(join(fixtureRoot, name));
    const configPath = join(fixtureRoot, "openclaw.json");
    for (const scenario of ["default-text", "default-json", "named-json"]) {
      // Beta has no global default selector for multiple agents. Default cases
      // use one agent; --agent proves explicit selection with a second entry.
      const ids = scenario === "named-json" ? ["primary", "research"] : ["primary"];
      const agents = {
        defaults: { workspace: join(fixtureRoot, "workspace") },
        ...(agentSchema === "entries"
          ? { ownership: "explicit", entries: Object.fromEntries(ids.map((id) => [id, { agentDir: join(fixtureRoot, id) }])) }
          : { list: ids.map((id) => ({ id, agentDir: join(fixtureRoot, id) })) }),
      };
      writeFileSync(configPath, JSON.stringify({
        agents,
        models: { providers: { omniroute: {
          baseUrl: report.baseUrl, apiKey: "${OMNIROUTE_API_KEY}", models: [],
        } } },
      }));
      const result = spawnSync(process.execPath, [scriptPath, "--child", entryPath, scenario, fixtureRoot, agentSchema], {
        cwd: fixtureRoot,
        // An allowlist excludes inherited config selectors and real credentials.
        env: {
          PATH: dirname(process.execPath), NODE_ENV: "test",
          OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: join(fixtureRoot, "state"),
          OMNIROUTE_API_KEY: "fixture-api-key",
        },
        encoding: "utf8", timeout: 30_000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, `${scenario}: ${result.stderr}`);
      process.stdout.write(result.stdout);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}
