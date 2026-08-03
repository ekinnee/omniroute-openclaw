// Narrow guarded HTTP helpers for OmniRoute's OpenAI-compatible endpoints.
import {
  fetchWithSsrFGuard,
  mergeSsrFPolicies,
  ssrfPolicyFromHttpBaseUrlAllowedHostname,
  ssrfPolicyFromPrivateNetworkOptIn,
  type SsrFPolicy,
} from "openclaw/plugin-sdk/ssrf-runtime";
import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input-runtime";

type ProviderRequest = {
  headers?: Record<string, unknown>;
  allowPrivateNetwork?: unknown;
  auth?: Record<string, unknown>;
  proxy?: Record<string, unknown>;
  tls?: Record<string, unknown>;
};

type DispatcherPolicy =
  | { mode: "direct"; connect?: Record<string, unknown> }
  | {
      mode: "env-proxy";
      connect?: Record<string, unknown>;
      proxyTls?: Record<string, unknown>;
    }
  | {
      mode: "explicit-proxy";
      proxyUrl: string;
      proxyTls?: Record<string, unknown>;
    };

function readRequest(value: unknown): ProviderRequest | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as ProviderRequest;
}

function normalizeBaseUrl(value: string, fallback: string): string {
  const candidate = value.trim() || fallback.trim();
  return candidate.replace(/\/+$/, "");
}

function resolveSecretInput(value: unknown, path: string): string | undefined {
  return normalizeResolvedSecretInputString({ value, path });
}

function readRequestHeaders(request: ProviderRequest | undefined): Record<string, string> {
  if (!request?.headers || typeof request.headers !== "object") {
    return {};
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    const normalizedKey = key.trim();
    const normalizedValue = resolveSecretInput(value, `models.providers.omniroute.request.headers.${key}`);
    if (normalizedKey && normalizedValue) {
      headers[normalizedKey] = normalizedValue;
    }
  }
  return headers;
}

function readTls(value: unknown, path: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const tls: Record<string, unknown> = {};
  for (const key of ["ca", "cert", "key", "passphrase"] as const) {
    const resolved = resolveSecretInput(raw[key], `${path}.${key}`);
    if (resolved) {
      tls[key] = resolved;
    }
  }
  if (typeof raw.serverName === "string" && raw.serverName.trim()) {
    tls.servername = raw.serverName.trim();
  }
  if (raw.insecureSkipVerify === true) {
    tls.rejectUnauthorized = false;
  } else if (raw.insecureSkipVerify === false) {
    tls.rejectUnauthorized = true;
  }
  return Object.keys(tls).length > 0 ? tls : undefined;
}

function readDispatcherPolicy(request: ProviderRequest | undefined): DispatcherPolicy | undefined {
  const targetTls = readTls(request?.tls, "models.providers.omniroute.request.tls");
  const proxy = request?.proxy;
  if (!proxy || typeof proxy !== "object" || Array.isArray(proxy)) {
    return targetTls ? { mode: "direct", connect: targetTls } : undefined;
  }

  const proxyTls = readTls(
    proxy.tls,
    "models.providers.omniroute.request.proxy.tls",
  );
  if (proxy.mode === "env-proxy") {
    return {
      mode: "env-proxy",
      ...(targetTls ? { connect: targetTls } : {}),
      ...(proxyTls ? { proxyTls } : {}),
    };
  }
  if (proxy.mode === "explicit-proxy" && typeof proxy.url === "string" && proxy.url.trim()) {
    return {
      mode: "explicit-proxy",
      proxyUrl: proxy.url.trim(),
      ...(proxyTls ? { proxyTls } : {}),
    };
  }
  return targetTls ? { mode: "direct", connect: targetTls } : undefined;
}

function applyRequestAuth(headers: Headers, request: ProviderRequest | undefined): void {
  const auth = request?.auth;
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) {
    return;
  }
  if (auth.mode === "authorization-bearer") {
    const token = resolveSecretInput(auth.token, "models.providers.omniroute.request.auth.token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return;
  }
  if (auth.mode === "header") {
    const name = typeof auth.headerName === "string" ? auth.headerName.trim() : "";
    const value = resolveSecretInput(auth.value, "models.providers.omniroute.request.auth.value");
    const prefix = typeof auth.prefix === "string" ? auth.prefix : "";
    if (name && value) {
      headers.delete("Authorization");
      headers.set(name, `${prefix}${value}`);
    }
  }
}

export function resolveOmniRouteHttpRequestConfig(params: {
  baseUrl: string;
  defaultBaseUrl: string;
  request?: unknown;
  defaultHeaders?: Record<string, string>;
  ssrfPolicy?: SsrFPolicy;
}): {
  baseUrl: string;
  headers: Headers;
  ssrfPolicy?: SsrFPolicy;
  dispatcherPolicy?: DispatcherPolicy;
} {
  const baseUrl = normalizeBaseUrl(params.baseUrl, params.defaultBaseUrl);
  const request = readRequest(params.request);
  const headers = new Headers(params.defaultHeaders);
  for (const [key, value] of Object.entries(readRequestHeaders(request))) {
    headers.set(key, value);
  }
  applyRequestAuth(headers, request);

  return {
    baseUrl,
    headers,
    ssrfPolicy: mergeSsrFPolicies(
      ssrfPolicyFromHttpBaseUrlAllowedHostname(baseUrl),
      ssrfPolicyFromPrivateNetworkOptIn(
        request?.allowPrivateNetwork === true ? true : undefined,
      ),
      params.ssrfPolicy,
    ),
    dispatcherPolicy: readDispatcherPolicy(request),
  };
}

export async function postOmniRouteJson(params: {
  url: string;
  headers: Headers;
  body: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  ssrfPolicy?: SsrFPolicy;
  dispatcherPolicy?: DispatcherPolicy;
}): Promise<{ response: Response; release: () => Promise<void> }> {
  const { response, release } = await fetchWithSsrFGuard({
    url: params.url,
    init: {
      method: "POST",
      headers: params.headers,
      body: JSON.stringify(params.body),
    },
    timeoutMs: params.timeoutMs,
    signal: params.signal,
    policy: params.ssrfPolicy,
    dispatcherPolicy: params.dispatcherPolicy,
    auditContext: "omniroute.provider",
  });
  return { response, release };
}

export async function getOmniRouteJson(params: {
  url: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  ssrfPolicy?: SsrFPolicy;
  dispatcherPolicy?: DispatcherPolicy;
}): Promise<{ response: Response; release: () => Promise<void> }> {
  const { response, release } = await fetchWithSsrFGuard({
    url: params.url,
    init: {
      method: "GET",
      headers: params.headers,
    },
    timeoutMs: params.timeoutMs,
    signal: params.signal,
    policy: params.ssrfPolicy,
    dispatcherPolicy: params.dispatcherPolicy,
    auditContext: "omniroute.catalog",
  });
  return { response, release };
}

export async function readOmniRouteJson(response: Response, operation: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`${operation} returned invalid JSON`);
  }
}

export async function assertOmniRouteOk(response: Response, operation: string): Promise<void> {
  if (!response.ok) {
    throw new Error(`${operation}: HTTP ${response.status}`);
  }
}
