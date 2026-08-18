#!/usr/bin/env node
import { runOmniRouteCatalogAuditExecutable } from "./catalog-audit-cli.js";

void runOmniRouteCatalogAuditExecutable().catch((error: unknown) => {
  process.stderr.write(
    `OmniRoute catalog audit failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
