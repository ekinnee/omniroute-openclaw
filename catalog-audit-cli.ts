import {
  auditOmniRouteCatalog,
  formatOmniRouteCatalogAuditReport,
  type OmniRouteCatalogAuditReport,
} from "./catalog-audit.js";
import { resolveAgentDir, resolveDefaultAgentDir } from "openclaw/plugin-sdk/agent-runtime";
import { loadConfig } from "openclaw/plugin-sdk/config-runtime";

type Writable = { write: (text: string) => unknown };

export type OmniRouteCatalogAuditCliOptions = {
  config?: NonNullable<Parameters<typeof auditOmniRouteCatalog>[0]>["config"];
  agentDir?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: Writable;
  stderr?: Writable;
  loadAudit?: (params: Parameters<typeof auditOmniRouteCatalog>[0]) => Promise<OmniRouteCatalogAuditReport>;
};

export function parseOmniRouteCatalogAuditArgs(argv: readonly string[]): {
  json: boolean;
  help: boolean;
  agentId?: string;
} {
  let json = false;
  let help = false;
  let agentId: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--agent") {
      const value = argv[index + 1]?.trim();
      if (!value || value.startsWith("-")) {
        throw new Error("--agent requires an agent id");
      }
      agentId = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown catalog audit option: ${argument}`);
  }
  return { json, help, ...(agentId ? { agentId } : {}) };
}

export const OMNIROUTE_CATALOG_AUDIT_USAGE = [
  "Usage: omniroute-catalog-audit [--agent <id>] [--json]",
  "",
  "Reads the authenticated OmniRoute /models catalog and reports only advertised metadata.",
  "",
  "Options:",
  "  --agent <id>  Resolve credentials for a configured OpenClaw agent",
  "  --json        Emit machine-readable JSON",
  "  -h, --help    Show this help",
].join("\n");

/**
 * Standalone command implementation. A package bin can call this without needing
 * the native plugin-CLI API that is unavailable at the supported 2026.7.1 floor.
 */
export async function runOmniRouteCatalogAuditCli(
  argv: readonly string[],
  options: OmniRouteCatalogAuditCliOptions = {},
): Promise<void> {
  const parsed = parseOmniRouteCatalogAuditArgs(argv);
  if (parsed.help) {
    (options.stdout ?? process.stdout).write(`${OMNIROUTE_CATALOG_AUDIT_USAGE}\n`);
    return;
  }
  const config = options.config ?? loadConfig();
  const env = options.env ?? process.env;
  const agentDir = options.agentDir ?? (
    parsed.agentId
      ? resolveAgentDir(config, parsed.agentId, env)
      : resolveDefaultAgentDir(config, env)
  );
  const loadAudit = options.loadAudit ?? auditOmniRouteCatalog;
  const report = await loadAudit({
    config,
    agentDir,
    env,
  });
  const output = parsed.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatOmniRouteCatalogAuditReport(report)}\n`;
  (options.stdout ?? process.stdout).write(output);
}

/** Entry point for the future package `bin` declaration. It only reads config and performs GET. */
export async function runOmniRouteCatalogAuditExecutable(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  await runOmniRouteCatalogAuditCli(argv);
}
