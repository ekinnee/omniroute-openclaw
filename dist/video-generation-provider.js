import { isProviderApiKeyConfigured } from "openclaw/plugin-sdk/provider-auth";
import { resolveApiKeyForProvider } from "openclaw/plugin-sdk/provider-auth-runtime";
import { assertOkOrThrowHttpError, postJsonRequest, readProviderJsonResponse, resolveProviderHttpRequestConfig, sanitizeConfiguredModelProviderRequest, } from "openclaw/plugin-sdk/provider-http";
import { OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_LABEL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
const MAX_VIDEO_COUNT = 1;
const DEFAULT_TIMEOUT_MS = 300_000;
function requireVideoModel(model) {
    const normalized = model.trim();
    if (!normalized) {
        throw new Error("OmniRoute video generation requires an explicit video model. Set the video generation model to a model advertised by OmniRoute's /v1/models endpoint.");
    }
    return normalized;
}
function resolveConfiguredBaseUrl(req) {
    const configured = req.cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID]?.baseUrl;
    return typeof configured === "string" && configured.trim()
        ? configured.trim().replace(/\/+$/, "")
        : OMNIROUTE_DEFAULT_BASE_URL;
}
export function buildOmniRouteVideoGenerationProvider() {
    return {
        id: OMNIROUTE_PROVIDER_ID,
        label: OMNIROUTE_LABEL,
        capabilities: {
            generate: {
                maxVideos: MAX_VIDEO_COUNT,
                maxInputImages: 0,
                maxInputVideos: 0,
                maxInputAudios: 0,
            },
            imageToVideo: {
                enabled: false,
                maxVideos: 0,
                maxInputImages: 0,
                maxInputVideos: 0,
                maxInputAudios: 0,
            },
            videoToVideo: {
                enabled: false,
                maxVideos: 0,
                maxInputImages: 0,
                maxInputVideos: 0,
                maxInputAudios: 0,
            },
        },
        isConfigured: ({ agentDir }) => isProviderApiKeyConfigured({
            provider: OMNIROUTE_PROVIDER_ID,
            agentDir,
        }),
        async generateVideo(req) {
            const model = requireVideoModel(req.model);
            const auth = await resolveApiKeyForProvider({
                provider: OMNIROUTE_PROVIDER_ID,
                cfg: req.cfg,
                agentDir: req.agentDir,
                store: req.authStore,
            });
            if (!auth.apiKey) {
                throw new Error("OmniRoute API key missing");
            }
            const providerConfig = req.cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID];
            const { baseUrl, allowPrivateNetwork, headers, dispatcherPolicy } = resolveProviderHttpRequestConfig({
                baseUrl: resolveConfiguredBaseUrl(req),
                defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
                request: sanitizeConfiguredModelProviderRequest(providerConfig?.request),
                defaultHeaders: {
                    Authorization: `Bearer ${auth.apiKey}`,
                },
                provider: OMNIROUTE_PROVIDER_ID,
                capability: "video",
                transport: "http",
            });
            const requestHeaders = new Headers(headers);
            if (!requestHeaders.has("Content-Type")) {
                requestHeaders.set("Content-Type", "application/json");
            }
            const request = await postJsonRequest({
                url: `${baseUrl.replace(/\/+$/, "")}/videos/generations`,
                headers: requestHeaders,
                body: {
                    model,
                    prompt: req.prompt,
                    n: MAX_VIDEO_COUNT,
                },
                timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
                fetchFn: fetch,
                allowPrivateNetwork,
                dispatcherPolicy,
            });
            const { response, release } = request;
            try {
                await assertOkOrThrowHttpError(response, "OmniRoute video generation failed");
                const payload = (await readProviderJsonResponse(response, "omniroute.video-generation"));
                const data = payload.data;
                if (!Array.isArray(data) || data.length === 0) {
                    throw new Error("OmniRoute video generation response missing video data");
                }
                const videos = data.map((item) => {
                    const url = String(item.url ?? "");
                    if (!url) {
                        throw new Error("OmniRoute video generation response missing video URL");
                    }
                    return { url, mimeType: "video/mp4" };
                });
                return { videos, model };
            }
            finally {
                await release();
            }
        },
    };
}
//# sourceMappingURL=video-generation-provider.js.map