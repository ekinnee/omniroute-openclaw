import { afterEach, describe, expect, it, vi } from "vitest";
import {
  auditOmniRouteCatalog,
  buildOmniRouteCatalogAuditReport,
  formatOmniRouteCatalogAuditReport,
  redactOmniRouteAuditUrl,
  resolveOmniRouteAuditBaseUrl,
} from "./catalog-audit.js";
import {
  parseOmniRouteCatalogAuditArgs,
  runOmniRouteCatalogAuditCli,
} from "./catalog-audit-cli.js";

describe("OmniRoute catalog audit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reports only advertised fields and explicitly identifies absent metadata", () => {
    const report = buildOmniRouteCatalogAuditReport({
      baseUrl: "https://user:secret@gateway.example/v1?token=secret#fragment",
      payload: {
        data: [
          {
            id: "combo/auto",
            name: "Auto",
            supported_endpoints: ["chat"],
            capabilities: { tool_calling: true, effort_tiers: ["low", "medium"] },
          },
          { id: "   " },
          "not-a-model",
        ],
      },
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      baseUrl: "https://gateway.example/v1",
      totalRows: 3,
      invalidRows: 2,
      duplicateIds: [],
      modelCount: 1,
      models: [
        {
          id: "combo/auto",
          name: "Auto",
          catalogClass: "chat",
          advertised: { supported_endpoints: ["chat"] },
          capabilities: { tool_calling: true, effort_tiers: ["low", "medium"] },
        },
      ],
    });
    expect(report.models[0]?.advertised).not.toHaveProperty("context_length");
    expect(report.models[0]?.missing).toContain("context_window");
    expect(report.models[0]?.missing).not.toContain("capabilities.reasoning");
  });

  it("uses configured base URL unless it is the default, then permits the environment override", () => {
    expect(
      resolveOmniRouteAuditBaseUrl({
        config: { models: { providers: { omniroute: { baseUrl: "https://configured.example/v1/" } } } },
        env: { OMNIROUTE_BASE_URL: "https://environment.example/v1" },
      }),
    ).toBe("https://configured.example/v1");
    expect(
      resolveOmniRouteAuditBaseUrl({
        config: { models: { providers: { omniroute: { baseUrl: "http://localhost:20128/v1" } } } },
        env: { OMNIROUTE_BASE_URL: "https://environment.example/v1/" },
      }),
    ).toBe("https://environment.example/v1");
  });

  it("redacts endpoint credentials even when URL parsing fails", () => {
    expect(redactOmniRouteAuditUrl("https://user:secret@gateway.example/v1?api_key=secret")).toBe(
      "https://gateway.example/v1",
    );
    expect(redactOmniRouteAuditUrl("not a url")).toBe("[invalid base URL]");
  });

  it("formats a human-readable report without filling in missing values", () => {
    const rendered = formatOmniRouteCatalogAuditReport(
      buildOmniRouteCatalogAuditReport({
        baseUrl: "https://gateway.example/v1",
        payload: { data: [{ id: "combo/auto" }] },
      }),
    );
    expect(rendered).toContain("OmniRoute catalog audit: 1 model");
    expect(rendered).toContain("Advertised: none");
    expect(rendered).toContain("Missing advertised metadata: context_window");
    expect(rendered).not.toContain("128000");

    const withValues = formatOmniRouteCatalogAuditReport(
      buildOmniRouteCatalogAuditReport({
        baseUrl: "https://gateway.example/v1",
        payload: {
          data: [{ id: "model", context_length: 262_144, capabilities: { thinking: true } }],
        },
      }),
    );
    expect(withValues).toContain("context_length=262144");
    expect(withValues).toContain("capabilities.thinking=true");
  });

  it("uses resolved auth for the guarded GET without leaking it into the report", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "provider/reasoning-model",
              type: "chat",
              context_length: 262_144,
              max_output_tokens: 32_768,
              input_modalities: ["text"],
              capabilities: {
                supportsThinking: true,
                effort_tiers: ["none", "low", "high"],
                tool_calling: true,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const report = await auditOmniRouteCatalog({
      config: {} as never,
      agentDir: "/tmp/omniroute-audit-agent",
      env: { OMNIROUTE_API_KEY: "audit-secret-key" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer audit-secret-key");
    expect(report.models[0]?.missing).toEqual([]);
    expect(JSON.stringify(report)).not.toContain("audit-secret-key");
  });

  it("parses --json and renders the same safe report as JSON", async () => {
    const writes: string[] = [];
    const report = buildOmniRouteCatalogAuditReport({
      baseUrl: "https://gateway.example/v1",
      payload: { data: [{ id: "combo/auto", context_length: 131_072 }] },
    });

    expect(parseOmniRouteCatalogAuditArgs(["--json", "--agent", "research"])).toEqual({
      json: true,
      help: false,
      agentId: "research",
    });
    await runOmniRouteCatalogAuditCli(["--json"], {
      config: {} as never,
      agentDir: "/tmp/omniroute-audit-agent",
      stdout: { write: (value) => writes.push(value) },
      loadAudit: async () => report,
    });

    expect(JSON.parse(writes.join(""))).toEqual(report);
  });

  it("rejects unsupported options before making an audit request", () => {
    expect(() => parseOmniRouteCatalogAuditArgs(["--delete-everything"])).toThrow(
      "Unknown catalog audit option",
    );
  });

  it("requires a value for --agent", () => {
    expect(() => parseOmniRouteCatalogAuditArgs(["--agent"])).toThrow(
      "--agent requires an agent id",
    );
    expect(() => parseOmniRouteCatalogAuditArgs(["--agent", "--json"])).toThrow(
      "--agent requires an agent id",
    );
  });

  it("rejects a malformed catalog and reports duplicate ids", () => {
    expect(() =>
      buildOmniRouteCatalogAuditReport({
        baseUrl: "https://gateway.example/v1",
        payload: {},
      }),
    ).toThrow("data array");

    const report = buildOmniRouteCatalogAuditReport({
      baseUrl: "https://gateway.example/v1",
      payload: { data: [{ id: "same" }, { id: "same" }] },
    });
    expect(report.duplicateIds).toEqual(["same"]);
  });
});
