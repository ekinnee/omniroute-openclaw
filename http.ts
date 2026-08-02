// Narrow guarded HTTP helpers for OmniRoute's OpenAI-compatible endpoints.
import {
  fetchWithSsrFGuard,
  mergeSsrFPolicies,
  ssrfPolicyFromHttpBaseUrlAllowedHostname,
  ssrfPolicyFromPrivateNetworkOptIn,
  type SsrFPolicy,
} from "openclaw/plugin-sdk/ssrf-runtime";

type ProviderRequest = {
  headers?: Record<string, unknown>;
  allowPrivateNetwork?: unknown;
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

function readRequestHeaders(request: ProviderRequest | undefined): Record<string, string> {
  if (!request?.headers || typeof request.headers !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(request.headers).filter(
      ([key, value]) => key.trim() && typeof value === "string" && value.trim(),
    ) as Array<[string, string]>,
  );
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
} {
  const baseUrl = normalizeBaseUrl(params.baseUrl, params.defaultBaseUrl);
  const request = readRequest(params.request);
  const headers = new Headers(params.defaultHeaders);
  for (const [key, value] of Object.entries(readRequestHeaders(request))) {
    headers.set(key, value);
  }

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
  };
}

export async function postOmniRouteJson(params: {
  url: string;
  headers: Headers;
  body: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  ssrfPolicy?: SsrFPolicy;
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
