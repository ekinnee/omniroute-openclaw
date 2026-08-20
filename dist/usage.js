import { OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_BASE_URL_ENV_VAR, OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_LABEL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
const MAX_USAGE_RESPONSE_CHARS = 32_768;
function normalizeBaseUrl(value) {
    return typeof value === "string" && value.trim()
        ? value.trim().replace(/\/+$/, "")
        : OMNIROUTE_DEFAULT_BASE_URL;
}
function resolveUsageBaseUrl(ctx) {
    const configuredBaseUrl = normalizeBaseUrl(ctx.config.models?.providers?.[OMNIROUTE_PROVIDER_ID]?.baseUrl);
    if (configuredBaseUrl !== OMNIROUTE_DEFAULT_BASE_URL) {
        return configuredBaseUrl;
    }
    return normalizeBaseUrl(ctx.env[OMNIROUTE_BASE_URL_ENV_VAR] ?? configuredBaseUrl);
}
export function omniRouteUsageUrl(baseUrl) {
    const url = new URL(normalizeBaseUrl(baseUrl));
    url.pathname = `${url.pathname.replace(/\/v1$/, "").replace(/\/$/, "")}/api/usage/om-usage`;
    url.search = "";
    url.hash = "";
    return url.toString();
}
function errorSnapshot(message) {
    return {
        provider: OMNIROUTE_PROVIDER_ID,
        displayName: OMNIROUTE_LABEL,
        windows: [],
        error: message,
    };
}
function parseUsageWindows(text) {
    const providerQuota = text.match(/(?:^|\n)Provider quota\n([\s\S]*)$/u)?.[1] ?? "";
    const windows = [];
    const windowPattern = /(?:^|\n)(Session|Weekly)\n(\d{1,3})% left(?:\n|$)/gu;
    for (const match of providerQuota.matchAll(windowPattern)) {
        const remaining = Number(match[2]);
        if (!Number.isFinite(remaining))
            continue;
        windows.push({
            label: match[1],
            usedPercent: Math.max(0, Math.min(100, 100 - remaining)),
        });
    }
    return windows;
}
function normalizeUsageSummary(text) {
    const summary = text.trim().replace(/\n{3,}/gu, "\n\n");
    return summary && summary.length <= MAX_USAGE_RESPONSE_CHARS ? summary : undefined;
}
export async function fetchOmniRouteUsage(ctx) {
    let response;
    try {
        response = await ctx.fetchFn(omniRouteUsageUrl(resolveUsageBaseUrl(ctx)), {
            headers: {
                Accept: "text/plain",
                Authorization: `Bearer ${ctx.token}`,
            },
            signal: AbortSignal.timeout(ctx.timeoutMs),
        });
    }
    catch {
        return errorSnapshot("OmniRoute usage endpoint is unavailable");
    }
    if (!response.ok) {
        if (response.status === 401)
            return errorSnapshot("OmniRoute usage authentication failed");
        if (response.status === 403) {
            return errorSnapshot("Usage visibility is disabled for this OmniRoute API key");
        }
        return errorSnapshot(`OmniRoute usage endpoint returned HTTP ${response.status}`);
    }
    const text = await response.text();
    if (text.length > MAX_USAGE_RESPONSE_CHARS) {
        return errorSnapshot("OmniRoute usage response is too large");
    }
    const summary = normalizeUsageSummary(text);
    return {
        provider: OMNIROUTE_PROVIDER_ID,
        displayName: OMNIROUTE_LABEL,
        windows: parseUsageWindows(text),
        ...(summary ? { summary } : { error: "OmniRoute returned no usage data" }),
    };
}
export function resolveOmniRouteUsageAuth(ctx) {
    const apiKey = ctx.resolveApiKeyFromConfigAndStore({
        providerIds: [OMNIROUTE_PROVIDER_ID],
        envDirect: [ctx.env[OMNIROUTE_API_KEY_ENV_VAR]],
    });
    return apiKey ? { token: apiKey } : null;
}
//# sourceMappingURL=usage.js.map