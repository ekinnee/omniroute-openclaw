import { isOmniRouteConfigured, resolveOmniRouteApiKey } from "./auth.js";
import { assertOmniRouteOk, postOmniRouteJson, readOmniRouteJson, resolveOmniRouteHttpRequestConfig, } from "./http.js";
import { OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_LABEL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
import { resolveOmniRouteBaseUrl } from "./base-url.js";
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
    return resolveOmniRouteBaseUrl({ config: req.cfg });
}
function parseVideoResponse(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
        throw new Error("OmniRoute video generation response missing video data");
    }
    return payload.data.map((entry) => {
        if (!entry || typeof entry !== "object") {
            throw new Error("OmniRoute video generation response malformed");
        }
        const item = entry;
        if (typeof item.url !== "string" || !item.url.trim()) {
            throw new Error("OmniRoute video generation response missing video URL");
        }
        return {
            url: item.url,
            mimeType: typeof item.mime_type === "string" && item.mime_type.trim()
                ? item.mime_type
                : "video/mp4",
            ...(typeof item.file_name === "string" && item.file_name.trim()
                ? { fileName: item.file_name }
                : {}),
        };
    });
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
        isConfigured: ({ cfg, agentDir }) => isOmniRouteConfigured({ cfg, agentDir }),
        async generateVideo(req) {
            const model = requireVideoModel(req.model);
            const apiKey = await resolveOmniRouteApiKey({
                cfg: req.cfg,
                agentDir: req.agentDir,
                store: req.authStore,
            });
            if (!apiKey) {
                throw new Error("OmniRoute API key missing");
            }
            const providerConfig = req.cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID];
            const http = resolveOmniRouteHttpRequestConfig({
                baseUrl: resolveConfiguredBaseUrl(req),
                defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
                request: providerConfig?.request,
                defaultHeaders: {
                    Accept: "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
            });
            const headers = new Headers(http.headers);
            if (!headers.has("Content-Type")) {
                headers.set("Content-Type", "application/json");
            }
            const request = await postOmniRouteJson({
                url: `${http.baseUrl}/videos/generations`,
                headers,
                body: {
                    model,
                    prompt: req.prompt,
                    n: MAX_VIDEO_COUNT,
                },
                timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
                ssrfPolicy: http.ssrfPolicy,
                dispatcherPolicy: http.dispatcherPolicy,
            });
            try {
                await assertOmniRouteOk(request.response, "OmniRoute video generation failed");
                const videos = parseVideoResponse(await readOmniRouteJson(request.response, "omniroute.video-generation"));
                if (videos.length === 0) {
                    throw new Error("OmniRoute video generation response missing video data");
                }
                return { videos, model };
            }
            finally {
                await request.release();
            }
        },
    };
}
//# sourceMappingURL=video-generation-provider.js.map