import { OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_LABEL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
import { normalizeOmniRouteBaseUrl, resolveOmniRouteBaseUrl, } from "./base-url.js";
import { readOmniRouteText } from "./http.js";
const MAX_USAGE_RESPONSE_CHARS = 32_768;
function resolveUsageBaseUrl(ctx) {
    return resolveOmniRouteBaseUrl({ config: ctx.config, env: ctx.env });
}
export function omniRouteUsageUrl(baseUrl) {
    const url = new URL(normalizeOmniRouteBaseUrl(baseUrl));
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
function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value : undefined;
}
function quotaNumber(value) {
    if (typeof value !== "number" && !(typeof value === "string" && value.trim()))
        return undefined;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
}
function rawUsedPercent(quota) {
    const used = quotaNumber(quota.used);
    const total = quotaNumber(quota.total);
    const remaining = quotaNumber(quota.remainingPercentage) ?? quotaNumber(quota.remaining);
    const percent = quotaNumber(quota.usedPercentage) ??
        (used !== undefined && total !== undefined && total > 0 ? used / total * 100 : undefined) ??
        (quota.total === undefined && used !== undefined && used <= 100 ? used : undefined) ??
        (remaining !== undefined && remaining <= 100 ? 100 - remaining : undefined);
    return percent !== undefined && Number.isFinite(percent) ? Math.min(100, percent) : undefined;
}
function parseJsonUsage(value) {
    const payload = record(value);
    if (payload?.allowed === false)
        return errorSnapshot("OmniRoute usage request was refused");
    if (payload?.allowed !== true)
        return errorSnapshot("OmniRoute returned invalid usage data");
    // The gateway selects the applicable connection. Never fill gaps from providers[].
    const quotas = record(record(payload.provider)?.quotas);
    const windows = [];
    for (const [label, value] of Object.entries(quotas ?? {})) {
        const quota = record(value);
        if (!label.trim() || !quota || quota.unlimited === true)
            continue;
        const usedPercent = rawUsedPercent(quota);
        if (usedPercent === undefined)
            continue;
        const resetAt = typeof quota.resetAt === "string" ? Date.parse(quota.resetAt) : NaN;
        windows.push({ label, usedPercent, ...(Number.isFinite(resetAt) ? { resetAt } : {}) });
    }
    return windows.length ? {
        provider: OMNIROUTE_PROVIDER_ID,
        displayName: OMNIROUTE_LABEL,
        windows,
        summary: "Raw provider quota consumption",
    } : errorSnapshot("OmniRoute returned no usage data");
}
export async function fetchOmniRouteUsage(ctx) {
    let response;
    try {
        const url = new URL(omniRouteUsageUrl(resolveUsageBaseUrl(ctx)));
        url.searchParams.set("format", "json");
        response = await ctx.fetchFn(url.toString(), {
            headers: {
                Accept: "application/json",
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
    let text;
    try {
        text = await readOmniRouteText(response, "OmniRoute usage", {
            maxBytes: MAX_USAGE_RESPONSE_CHARS,
            chunkTimeoutMs: ctx.timeoutMs,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("response exceeded")) {
            return errorSnapshot("OmniRoute usage response is too large");
        }
        return errorSnapshot("OmniRoute usage endpoint is unavailable");
    }
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const legacy = (!mediaType || mediaType === "text/plain") &&
        !["{", "["].includes(text.trimStart()[0]) && /(?:^|\n)Provider quota(?:\r?\n|$)/u.test(text);
    if (!legacy) {
        if (!text.trim())
            return errorSnapshot("OmniRoute returned no usage data");
        try {
            return parseJsonUsage(JSON.parse(text));
        }
        catch {
            return errorSnapshot("OmniRoute returned invalid usage data");
        }
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