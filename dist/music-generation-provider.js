// OmniRoute music generation provider using public SDK registration contracts.
import { generatedMusicAssetFromBase64 } from "openclaw/plugin-sdk/music-generation";
import { isOmniRouteConfigured, resolveOmniRouteApiKey } from "./auth.js";
import { assertOmniRouteOk, downloadOmniRouteMusicAsset, OMNIROUTE_JSON_READ_OPTIONS, postOmniRouteJson, readOmniRouteJson, resolveOmniRouteHttpRequestConfig, } from "./http.js";
import { OMNIROUTE_DEFAULT_BASE_URL, OMNIROUTE_LABEL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
import { resolveOmniRouteBaseUrl } from "./base-url.js";
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_TRACK_COUNT = 8;
const MAX_TOTAL_TRACK_BYTES = 32 * 1024 * 1024;
function requireMusicModel(model) {
    const normalized = model.trim();
    if (!normalized) {
        throw new Error("OmniRoute music generation requires an explicit music model. Set the music generation model to a model advertised by OmniRoute's /v1/models endpoint.");
    }
    return normalized;
}
function resolveConfiguredBaseUrl(req) {
    return resolveOmniRouteBaseUrl({ config: req.cfg });
}
function resolveMusicMimeType(item) {
    if (typeof item.mime_type === "string" && item.mime_type.trim()) {
        const mimeType = item.mime_type.split(";", 1)[0]?.trim().toLowerCase();
        switch (mimeType) {
            case "audio/mpeg":
            case "audio/mp3":
                return "audio/mpeg";
            case "audio/wav":
            case "audio/x-wav":
                return "audio/wav";
            default:
                throw new Error(mimeType?.startsWith("audio/")
                    ? `OmniRoute music generation response returned unsupported audio MIME type: ${mimeType}`
                    : "OmniRoute music generation response returned a non-audio MIME type");
        }
    }
    if (typeof item.format !== "string") {
        return undefined;
    }
    switch (item.format.trim().toLowerCase()) {
        case "mp3":
        case "mpeg":
            return "audio/mpeg";
        case "wav":
        case "wave":
            return "audio/wav";
        default:
            throw new Error(`OmniRoute music generation response returned unsupported format: ${item.format}`);
    }
}
function assertMusicBytes(buffer, mimeType) {
    const isWav = buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WAVE";
    const isMp3 = buffer.length >= 3 && (buffer.subarray(0, 3).toString("ascii") === "ID3" ||
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0));
    if ((mimeType === "audio/wav" && !isWav) || (mimeType === "audio/mpeg" && !isMp3)) {
        throw new Error(`OmniRoute music generation response bytes do not match ${mimeType}`);
    }
}
function resolveMusicFileName(item, index, mimeType) {
    if (typeof item.file_name === "string" && item.file_name.trim()) {
        return item.file_name.trim();
    }
    return `omniroute-music-${index + 1}.${mimeType === "audio/wav" ? "wav" : "mp3"}`;
}
async function materializeMusicItem(item, index, timeoutMs) {
    const mimeType = resolveMusicMimeType(item);
    if (typeof item.url === "string" && item.url.trim()) {
        const downloaded = await downloadOmniRouteMusicAsset({
            url: item.url.trim(),
            timeoutMs,
            mimeType,
        });
        if (downloaded.buffer.length === 0) {
            throw new Error("OmniRoute music generation response missing audio data");
        }
        const downloadedMimeType = resolveMusicMimeType({ mime_type: downloaded.mimeType });
        if (!downloadedMimeType) {
            throw new Error("OmniRoute generated music download missing an audio MIME type");
        }
        assertMusicBytes(downloaded.buffer, downloadedMimeType);
        return {
            buffer: downloaded.buffer,
            mimeType: downloadedMimeType,
            fileName: resolveMusicFileName(item, index, downloadedMimeType),
            metadata: { url: item.url.trim() },
        };
    }
    if (typeof item.b64_json !== "string" || !item.b64_json.trim()) {
        throw new Error("OmniRoute music generation response missing audio data");
    }
    if (!mimeType) {
        throw new Error("OmniRoute music generation response missing audio format");
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.b64_json.trim())) {
        throw new Error("OmniRoute music generation response contained invalid base64 audio data");
    }
    const asset = generatedMusicAssetFromBase64({
        base64: item.b64_json,
        mimeType,
        index,
        fileName: resolveMusicFileName(item, index, mimeType),
    });
    if (asset.buffer.length === 0) {
        throw new Error("OmniRoute music generation response missing audio data");
    }
    assertMusicBytes(asset.buffer, mimeType);
    return asset;
}
async function parseMusicResponse(payload, timeoutMs) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
        throw new Error("OmniRoute music generation response missing audio data");
    }
    const items = payload.data.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new Error("OmniRoute music generation response malformed");
        }
        return entry;
    });
    if (items.length === 0) {
        throw new Error("OmniRoute music generation response missing audio data");
    }
    if (items.length > MAX_TRACK_COUNT) {
        throw new Error(`OmniRoute music generation response returned too many tracks (maximum ${MAX_TRACK_COUNT})`);
    }
    const tracks = [];
    let totalBytes = 0;
    for (const [index, item] of items.entries()) {
        const track = await materializeMusicItem(item, index, timeoutMs);
        totalBytes += track.buffer.length;
        if (totalBytes > MAX_TOTAL_TRACK_BYTES) {
            throw new Error(`OmniRoute music generation response exceeded ${MAX_TOTAL_TRACK_BYTES} total audio bytes`);
        }
        tracks.push(track);
    }
    return tracks;
}
export function buildOmniRouteMusicGenerationProvider() {
    return {
        id: OMNIROUTE_PROVIDER_ID,
        label: OMNIROUTE_LABEL,
        isConfigured: ({ cfg, agentDir }) => isOmniRouteConfigured({ cfg, agentDir }),
        capabilities: {
            generate: {},
            edit: {
                enabled: false,
            },
        },
        async generateMusic(req) {
            if (req.inputImages?.length) {
                throw new Error("OmniRoute music generation does not support input images");
            }
            const model = requireMusicModel(req.model);
            const apiKey = await resolveOmniRouteApiKey({
                cfg: req.cfg,
                agentDir: req.agentDir,
                store: req.authStore,
            });
            if (!apiKey) {
                throw new Error("OmniRoute API key missing");
            }
            const providerConfig = req.cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID];
            const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
            const http = resolveOmniRouteHttpRequestConfig({
                baseUrl: resolveConfiguredBaseUrl(req),
                defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
                request: providerConfig?.request,
                defaultHeaders: {
                    Accept: "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
            });
            const request = await postOmniRouteJson({
                url: `${http.baseUrl}/music/generations`,
                headers: http.headers,
                body: {
                    model,
                    prompt: req.prompt,
                    n: 1,
                },
                timeoutMs,
                ssrfPolicy: http.ssrfPolicy,
                dispatcherPolicy: http.dispatcherPolicy,
            });
            try {
                await assertOmniRouteOk(request.response, "OmniRoute music generation failed");
                const tracks = await parseMusicResponse(await readOmniRouteJson(request.response, "omniroute.music-generation", OMNIROUTE_JSON_READ_OPTIONS.musicGeneration), timeoutMs);
                return { tracks, model };
            }
            finally {
                await request.release();
            }
        },
    };
}
//# sourceMappingURL=music-generation-provider.js.map