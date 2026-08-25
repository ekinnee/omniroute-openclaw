// Shared OmniRoute endpoint precedence for every plugin-owned capability.
import {
  OMNIROUTE_BASE_URL_ENV_VAR,
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

function readConfiguredBaseUrl(config: unknown): unknown {
  return (config as {
    models?: { providers?: Record<string, { baseUrl?: unknown } | undefined> };
  } | undefined)?.models?.providers?.[OMNIROUTE_PROVIDER_ID]?.baseUrl;
}

export function normalizeOmniRouteBaseUrl(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\/+$/, "")
    : OMNIROUTE_DEFAULT_BASE_URL;
}

/** Removes credentials, query strings, and fragments before an endpoint is rendered. */
export function redactOmniRouteBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "[invalid base URL]";
  }
}

export function resolveOmniRouteBaseUrl(params: {
  config?: unknown;
  env?: Record<string, string | undefined>;
  overrideBaseUrl?: unknown;
}): string {
  // Memory search's remote endpoint is deliberately more specific than the
  // provider-wide endpoint. Preserve its current override semantics first.
  if (params.overrideBaseUrl !== undefined && params.overrideBaseUrl !== null) {
    return normalizeOmniRouteBaseUrl(params.overrideBaseUrl);
  }

  const configuredBaseUrl = normalizeOmniRouteBaseUrl(readConfiguredBaseUrl(params.config));
  if (configuredBaseUrl !== OMNIROUTE_DEFAULT_BASE_URL) {
    return configuredBaseUrl;
  }
  return normalizeOmniRouteBaseUrl(
    (params.env ?? process.env)[OMNIROUTE_BASE_URL_ENV_VAR] ?? configuredBaseUrl,
  );
}
